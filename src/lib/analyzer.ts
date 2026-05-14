export type ReviewCategory = 'bugs' | 'improvements' | 'style'
export type Severity = 'high' | 'medium' | 'low'

export type Finding = {
  id: string
  category: ReviewCategory
  severity: Severity
  title: string
  detail: string
  suggestion: string
}

export type ReviewResult = {
  score: number
  summary: string
  metrics: {
    lines: number
    characters: number
    functions: number
    comments: number
  }
  findings: Finding[]
}

const severityCost: Record<Severity, number> = {
  high: 18,
  medium: 10,
  low: 5,
}

const addFinding = (
  findings: Finding[],
  finding: Omit<Finding, 'id'>,
) => {
  findings.push({
    ...finding,
    id: `${finding.category}-${findings.length + 1}`,
  })
}

const hasAny = (code: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(code))

export const analyzeSnippet = (code: string, language: string): ReviewResult => {
  const trimmedCode = code.trim()
  const lines = trimmedCode ? trimmedCode.split(/\r?\n/) : []
  const findings: Finding[] = []
  const lowerCode = trimmedCode.toLowerCase()

  if (!trimmedCode) {
    return {
      score: 0,
      summary: 'Submit a code snippet to receive review feedback.',
      metrics: {
        lines: 0,
        characters: 0,
        functions: 0,
        comments: 0,
      },
      findings: [],
    }
  }

  const functionMatches =
    trimmedCode.match(/\b(function|def|class|const|let|var)\b|=>/g) ?? []
  const commentMatches =
    trimmedCode.match(/(\/\/|#|\/\*|\*\/|<!--|-->|""")/g) ?? []
  const hasBranching = /\b(if|else|switch|case|for|while|try|catch|except)\b/.test(
    trimmedCode,
  )

  if (/\b(eval|exec)\s*\(/.test(trimmedCode)) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'high',
      title: 'Dynamic execution can create security and correctness risks',
      detail:
        'The snippet appears to execute strings as code, which can expose the application to injection bugs and unpredictable runtime behavior.',
      suggestion:
        'Replace dynamic execution with explicit parsing, whitelisted commands, or a small interpreter for the allowed operations.',
    })
  }

  if (/\b(password|secret|api[_-]?key|token)\b\s*[:=]/i.test(trimmedCode)) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'high',
      title: 'Possible hard-coded secret',
      detail:
        'Credentials or tokens should not live in source code because they can leak through logs, commits, or client bundles.',
      suggestion:
        'Move secrets to environment variables or a managed secret store, and pass only non-sensitive configuration to the app.',
    })
  }

  if (/catch\s*\([^)]*\)\s*{\s*}/.test(trimmedCode) || /except\s*:\s*(pass)?/i.test(trimmedCode)) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'medium',
      title: 'Empty error handling',
      detail:
        'Swallowing errors hides failures and makes production incidents harder to diagnose.',
      suggestion:
        'Log the error with useful context, return a clear failure state, or rethrow when the caller should handle it.',
    })
  }

  if (
    ['javascript', 'typescript'].includes(language) &&
    /\b\w+\.\w+\.\w+/.test(trimmedCode) &&
    !hasAny(trimmedCode, [/\?\./, /\bif\s*\([^)]*\b\w+\.\w+\b/, /\btypeof\b/])
  ) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'medium',
      title: 'Nested property access can throw',
      detail:
        'The snippet reads through multiple object levels without a guard. Missing input data can crash this path at runtime.',
      suggestion:
        'Use optional chaining, validate the input shape, or return a controlled fallback before reading nested fields.',
    })
  }

  if (
    ['javascript', 'typescript'].includes(language) &&
    /\.to[A-Z]\w*\(\)/.test(trimmedCode) &&
    !hasAny(trimmedCode, [/\btypeof\b/, /\?\./, /\|\|/, /\?\?/])
  ) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'medium',
      title: 'Value is used as a string without validation',
      detail:
        'A string method is called directly, so null, undefined, or non-string values will fail before the function can recover.',
      suggestion:
        'Validate or normalize the value before calling the string method, and decide what fallback should be returned.',
    })
  }

  if (
    ['javascript', 'typescript'].includes(language) &&
    /\.reduce\s*\(/.test(trimmedCode) &&
    !/\.reduce\s*\([^,]+,[^)]+\)/s.test(trimmedCode)
  ) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'medium',
      title: 'Reduce call has no initial value',
      detail:
        'Calling reduce without an initial value throws on an empty array and can produce surprising accumulator types.',
      suggestion:
        'Pass an explicit initial accumulator value that matches the intended result type.',
    })
  }

  if (
    ['javascript', 'typescript'].includes(language) &&
    /\.reduce\s*\(/.test(trimmedCode) &&
    /\+\s*\w+\.\w+/.test(trimmedCode) &&
    !hasAny(trimmedCode, [/\bNumber\s*\(/, /\?\?/, /\|\|\s*0/, /typeof\s+\w+\.\w+/])
  ) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'medium',
      title: 'Numeric aggregation assumes valid item values',
      detail:
        'The reducer adds an object property directly. Missing or non-numeric values can turn the total into NaN or string concatenation.',
      suggestion:
        'Coerce or validate the value before adding it, and use a fallback such as zero for missing numeric fields.',
    })
  }

  if (
    ['javascript', 'typescript'].includes(language) &&
    /\bfetch\s*\(/.test(trimmedCode) &&
    !/\.ok\b|status\b/.test(trimmedCode)
  ) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'medium',
      title: 'HTTP response status is not checked',
      detail:
        'A fetch call can resolve successfully for 4xx and 5xx responses, so parsing the body is not enough to detect failure.',
      suggestion:
        'Check `response.ok` or the status code before using the response payload.',
    })
  }

  if (
    ['javascript', 'typescript'].includes(language) &&
    /\basync\b[\s\S]*\bawait\b/.test(trimmedCode) &&
    !/\btry\b[\s\S]*\bcatch\b/.test(trimmedCode)
  ) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'medium',
      title: 'Async failure path is not handled locally',
      detail:
        'Awaited work can reject and skip the rest of the function if the caller does not handle the error.',
      suggestion:
        'Handle expected failures close to the operation, or document that the caller is responsible for catching them.',
    })
  }

  if (/\b(var)\b/.test(trimmedCode) && ['javascript', 'typescript'].includes(language)) {
    addFinding(findings, {
      category: 'style',
      severity: 'low',
      title: 'Prefer block-scoped declarations',
      detail:
        '`var` is function-scoped and can produce surprising behavior in loops and conditionals.',
      suggestion:
        'Use `const` by default and `let` only when reassignment is required.',
    })
  }

  if (/console\.log|print\(|System\.out\.println/.test(trimmedCode)) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'low',
      title: 'Debug output should be intentional',
      detail:
        'Raw debug statements can clutter user logs and expose internal values.',
      suggestion:
        'Use a structured logger, remove temporary statements, or gate diagnostic output behind a debug flag.',
    })
  }

  if (
    ['javascript', 'typescript'].includes(language) &&
    /\b(push|splice|sort|reverse)\s*\(/.test(trimmedCode) &&
    !/const\s+\w+\s*=\s*\[?\.\.\./.test(trimmedCode)
  ) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'low',
      title: 'Mutation may leak outside this scope',
      detail:
        'The snippet mutates an array in place. That can surprise callers when the input is shared with other code.',
      suggestion:
        'Return a new array for transformations, or make the mutation explicit in the function name and contract.',
    })
  }

  if (language === 'python' && /def\s+\w+\([^)]*=\s*(\[\]|\{\})/.test(trimmedCode)) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'high',
      title: 'Mutable default argument is shared between calls',
      detail:
        'Python evaluates default arguments once, so the same list or dictionary can be reused across separate calls.',
      suggestion:
        'Use `None` as the default and create a new list or dictionary inside the function.',
    })
  }

  if (language === 'python' && /\bopen\s*\(/.test(trimmedCode) && !/\bwith\s+open\s*\(/.test(trimmedCode)) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'medium',
      title: 'File handle is not managed with a context manager',
      detail:
        'Opening a file without `with` can leave resources open when an exception interrupts the function.',
      suggestion:
        'Use `with open(...) as file:` so the handle is closed reliably.',
    })
  }

  if (language === 'java' && /\.equals\s*\(/.test(trimmedCode) === false && /"\s*==|==\s*"/.test(trimmedCode)) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'medium',
      title: 'String comparison uses reference equality',
      detail:
        'In Java, `==` compares object references rather than string contents.',
      suggestion:
        'Use `.equals(...)` or `Objects.equals(...)` for content comparison.',
    })
  }

  if (language === 'sql' && /select\s+\*/i.test(trimmedCode)) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'medium',
      title: 'Query selects every column',
      detail:
        '`SELECT *` can fetch unnecessary data and become fragile when table schemas change.',
      suggestion:
        'Select only the columns the caller actually needs.',
    })
  }

  if (language === 'sql' && /(update|delete)\s+\w+/i.test(trimmedCode) && !/\bwhere\b/i.test(trimmedCode)) {
    addFinding(findings, {
      category: 'bugs',
      severity: 'high',
      title: 'Data-changing query has no WHERE clause',
      detail:
        'An update or delete without a filter can affect every row in the target table.',
      suggestion:
        'Add a specific `WHERE` clause and consider running the matching `SELECT` first before executing the change.',
    })
  }

  if (lines.some((line) => line.length > 100)) {
    addFinding(findings, {
      category: 'style',
      severity: 'low',
      title: 'Some lines are difficult to scan',
      detail:
        'Very long lines make code review and side-by-side diffs harder to read.',
      suggestion:
        'Break long expressions across multiple lines and use intermediate variables for important concepts.',
    })
  }

  if (lines.length > 45 && functionMatches.length < 2) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'medium',
      title: 'Large block may need decomposition',
      detail:
        'A long snippet with little functional structure can mix responsibilities and become harder to test.',
      suggestion:
        'Extract cohesive operations into named functions and keep orchestration code thin.',
    })
  }

  if (/(for|while)\s*\([^)]*\)[\s\S]*(for|while)\s*\(/.test(trimmedCode)) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'medium',
      title: 'Nested loops may become expensive',
      detail:
        'Nested iteration can be fine for small data, but it often becomes a bottleneck as input size grows.',
      suggestion:
        'Consider a map, set, index, or pre-grouped lookup to reduce repeated scanning.',
    })
  }

  if (
    (lines.length >= 8 || hasBranching) &&
    !/test|spec|assert|expect|pytest|unittest/i.test(trimmedCode)
  ) {
    addFinding(findings, {
      category: 'improvements',
      severity: 'low',
      title: 'No test signal found',
      detail:
        'The snippet does not include tests or assertions, so expected behavior is implicit.',
      suggestion:
        'Add a few focused tests for normal behavior, boundary values, and error cases.',
    })
  }

  if (commentMatches.length === 0 && lines.length > 18) {
    addFinding(findings, {
      category: 'style',
      severity: 'low',
      title: 'Important intent is not documented',
      detail:
        'The code is non-trivial, but there are no comments explaining decisions or assumptions.',
      suggestion:
        'Add short comments only where business rules, edge cases, or tradeoffs are not obvious from the code.',
    })
  }

  if (/\b(any|object|dict)\b/.test(lowerCode) && ['typescript', 'python'].includes(language)) {
    addFinding(findings, {
      category: 'style',
      severity: 'low',
      title: 'Types could be more precise',
      detail:
        'Broad types make invalid states easier to pass through the code unnoticed.',
      suggestion:
        'Model inputs and outputs with explicit interfaces, typed dictionaries, or narrower domain types.',
    })
  }

  const penalty = findings.reduce(
    (total, finding) => total + severityCost[finding.severity],
    0,
  )
  const lengthAdjustment = lines.length > 120 ? 8 : 0
  const score = Math.max(15, Math.min(100, 100 - penalty - lengthAdjustment))

  const highCount = findings.filter((finding) => finding.severity === 'high').length
  const summary =
    highCount > 0
      ? 'Review found high-priority risks that should be handled before shipping.'
      : findings.length > 0
        ? 'Review found several practical improvements across reliability, maintainability, and style.'
        : 'No obvious issues found by the local review heuristics. A deeper AI review can build on this foundation.'

  return {
    score,
    summary,
    metrics: {
      lines: lines.length,
      characters: trimmedCode.length,
      functions: functionMatches.length,
      comments: commentMatches.length,
    },
    findings,
  }
}

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

  if (/console\.log|print\(/.test(trimmedCode)) {
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

  if (!/test|spec|assert|expect|pytest|unittest/i.test(trimmedCode)) {
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

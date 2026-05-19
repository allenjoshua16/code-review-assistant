import type { ReviewCategory, ReviewResult, Severity } from './analyzer'

type AnalyzerVariant = 'rules_v1' | 'rules_v2'

type ReviewTelemetryEvent = {
  id: string
  timestamp: string
  sessionId: string
  language: string
  analyzerVariant: AnalyzerVariant
  snippetHash: string
  snippetLength: number
  findingsCount: number
  score: number
  highCount: number
  mediumCount: number
  lowCount: number
  categoryBugs: number
  categoryImprovements: number
  categoryStyle: number
  riskProbability: number
}

type RecommendationFeedbackEvent = {
  id: string
  timestamp: string
  sessionId: string
  findingId: string
  findingTitle: string
  category: ReviewCategory
  severity: Severity
  action: 'applied' | 'not_useful'
}

type LlmTraceEvent = {
  id: string
  timestamp: string
  sessionId: string
  provider: string
  model: string
  promptVersion: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  status: 'success' | 'error'
}

type ExperimentAssignment = {
  experiment: string
  variant: AnalyzerVariant
  assignedAt: string
}

const storageKeys = {
  sessionId: 'code_review_session_id',
  experiment: 'code_review_experiment_v1',
  telemetry: 'code_review_telemetry_events',
  recommendation: 'code_review_recommendation_feedback_events',
  llmTrace: 'code_review_llm_trace_events',
} as const

const nowIso = () => new Date().toISOString()

const randomId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value))
}

const cappedPush = <T>(key: string, item: T, max = 1000) => {
  const values = readJson<T[]>(key, [])
  values.push(item)
  if (values.length > max) {
    writeJson(key, values.slice(values.length - max))
    return
  }
  writeJson(key, values)
}

const hashString = (value: string) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return `h${(hash >>> 0).toString(16)}`
}

const getOrCreateSessionId = () => {
  const existing = localStorage.getItem(storageKeys.sessionId)
  if (existing) return existing
  const created = randomId()
  localStorage.setItem(storageKeys.sessionId, created)
  return created
}

const getOrCreateExperimentAssignment = (): ExperimentAssignment => {
  const existing = readJson<ExperimentAssignment | null>(storageKeys.experiment, null)
  if (existing) return existing
  const sessionId = getOrCreateSessionId()
  const hash = parseInt(hashString(sessionId).slice(1, 6), 16)
  const variant: AnalyzerVariant = hash % 2 === 0 ? 'rules_v1' : 'rules_v2'
  const assignment: ExperimentAssignment = {
    experiment: 'analyzer_ab_v1',
    variant,
    assignedAt: nowIso(),
  }
  writeJson(storageKeys.experiment, assignment)
  return assignment
}

export const getAnalyzerVariant = (): AnalyzerVariant =>
  getOrCreateExperimentAssignment().variant

export const scoreRisk = (review: ReviewResult) => {
  const highCount = review.findings.filter((item) => item.severity === 'high').length
  const mediumCount = review.findings.filter((item) => item.severity === 'medium').length
  const lowCount = review.findings.filter((item) => item.severity === 'low').length
  const x =
    2.1 * highCount +
    1.15 * mediumCount +
    0.45 * lowCount +
    Math.max(0, 65 - review.score) / 22
  const probability = 1 / (1 + Math.exp(-(-2 + x)))
  const bounded = Math.min(0.99, Math.max(0.01, probability))
  const label = bounded >= 0.7 ? 'high' : bounded >= 0.4 ? 'medium' : 'low'
  return { probability: bounded, label }
}

export const logReviewTelemetry = (
  code: string,
  language: string,
  review: ReviewResult,
  analyzerVariant: AnalyzerVariant,
) => {
  const highCount = review.findings.filter((item) => item.severity === 'high').length
  const mediumCount = review.findings.filter((item) => item.severity === 'medium').length
  const lowCount = review.findings.filter((item) => item.severity === 'low').length
  const categoryBugs = review.findings.filter((item) => item.category === 'bugs').length
  const categoryImprovements = review.findings.filter(
    (item) => item.category === 'improvements',
  ).length
  const categoryStyle = review.findings.filter((item) => item.category === 'style').length
  const risk = scoreRisk(review)

  const event: ReviewTelemetryEvent = {
    id: randomId(),
    timestamp: nowIso(),
    sessionId: getOrCreateSessionId(),
    language,
    analyzerVariant,
    snippetHash: hashString(code),
    snippetLength: code.length,
    findingsCount: review.findings.length,
    score: review.score,
    highCount,
    mediumCount,
    lowCount,
    categoryBugs,
    categoryImprovements,
    categoryStyle,
    riskProbability: Number(risk.probability.toFixed(4)),
  }
  cappedPush(storageKeys.telemetry, event)
}

export const logRecommendationFeedback = (
  finding: {
    id: string
    title: string
    category: ReviewCategory
    severity: Severity
  },
  action: 'applied' | 'not_useful',
) => {
  const event: RecommendationFeedbackEvent = {
    id: randomId(),
    timestamp: nowIso(),
    sessionId: getOrCreateSessionId(),
    findingId: finding.id,
    findingTitle: finding.title,
    category: finding.category,
    severity: finding.severity,
    action,
  }
  cappedPush(storageKeys.recommendation, event)
}

export const logLlmTrace = (event: Omit<LlmTraceEvent, 'id' | 'timestamp' | 'sessionId'>) => {
  const trace: LlmTraceEvent = {
    ...event,
    id: randomId(),
    timestamp: nowIso(),
    sessionId: getOrCreateSessionId(),
  }
  cappedPush(storageKeys.llmTrace, trace)
}

export const getAnalyticsSnapshot = () => {
  const telemetry = readJson<ReviewTelemetryEvent[]>(storageKeys.telemetry, [])
  const recommendation = readJson<RecommendationFeedbackEvent[]>(
    storageKeys.recommendation,
    [],
  )
  const llmTrace = readJson<LlmTraceEvent[]>(storageKeys.llmTrace, [])
  const assignment = getOrCreateExperimentAssignment()

  const avgScore =
    telemetry.length === 0
      ? 0
      : telemetry.reduce((sum, event) => sum + event.score, 0) / telemetry.length

  const avgRisk =
    telemetry.length === 0
      ? 0
      : telemetry.reduce((sum, event) => sum + event.riskProbability, 0) / telemetry.length

  const appliedCount = recommendation.filter((event) => event.action === 'applied').length
  const recommendationEffectiveness =
    recommendation.length === 0 ? 0 : appliedCount / recommendation.length

  const totalLatencyMs = llmTrace.reduce((sum, event) => sum + event.latencyMs, 0)
  const totalCostUsd = llmTrace.reduce((sum, event) => sum + event.costUsd, 0)
  const totalTokens = llmTrace.reduce(
    (sum, event) => sum + event.inputTokens + event.outputTokens,
    0,
  )

  return {
    assignment,
    telemetryCount: telemetry.length,
    recommendationFeedbackCount: recommendation.length,
    llmTraceCount: llmTrace.length,
    avgScore: Number(avgScore.toFixed(2)),
    avgRiskProbability: Number(avgRisk.toFixed(4)),
    recommendationEffectiveness: Number(recommendationEffectiveness.toFixed(4)),
    llmObservability: {
      totalLatencyMs,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      totalTokens,
      avgLatencyMs:
        llmTrace.length === 0 ? 0 : Number((totalLatencyMs / llmTrace.length).toFixed(1)),
    },
    recentTelemetry: telemetry.slice(-20).reverse(),
  }
}

const objectArrayToCsv = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0])
  const escapeCell = (value: unknown) => {
    const raw = String(value ?? '')
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replaceAll('"', '""')}"`
    }
    return raw
  }
  const header = columns.join(',')
  const body = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(','))
  return [header, ...body].join('\n')
}

const downloadText = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export const exportAnalyticsJson = () => {
  const payload = {
    exportedAt: nowIso(),
    sessionId: getOrCreateSessionId(),
    assignment: getOrCreateExperimentAssignment(),
    telemetry: readJson<ReviewTelemetryEvent[]>(storageKeys.telemetry, []),
    recommendationFeedback: readJson<RecommendationFeedbackEvent[]>(
      storageKeys.recommendation,
      [],
    ),
    llmTraces: readJson<LlmTraceEvent[]>(storageKeys.llmTrace, []),
  }
  downloadText(
    `code-review-analytics-${Date.now()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8',
  )
}

export const exportTelemetryCsv = () => {
  const rows = readJson<ReviewTelemetryEvent[]>(storageKeys.telemetry, [])
  downloadText(
    `code-review-telemetry-${Date.now()}.csv`,
    objectArrayToCsv(rows as unknown as Record<string, unknown>[]),
    'text/csv;charset=utf-8',
  )
}

export const exportRecommendationCsv = () => {
  const rows = readJson<RecommendationFeedbackEvent[]>(storageKeys.recommendation, [])
  downloadText(
    `code-review-recommendations-${Date.now()}.csv`,
    objectArrayToCsv(rows as unknown as Record<string, unknown>[]),
    'text/csv;charset=utf-8',
  )
}

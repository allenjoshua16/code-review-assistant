# Code Review Assistant

A React application for reviewing code snippets and returning feedback on bugs, improvements, and style.

## Current Foundation

- `src/App.tsx` contains the review workspace UI: snippet editor, language selector, score, filters, metrics, and feedback cards.
- `src/lib/analyzer.ts` contains the review engine. It is intentionally isolated so the local heuristic rules can later be replaced or enriched by an AI service.
- `src/lib/analytics.ts` contains the analytics/data-science instrumentation layer: telemetry event logging, analyzer A/B assignment, recommendation feedback tracking, risk scoring, export functions, and LLM trace observability.
- `src/App.css` and `src/index.css` define the interface system, responsive layout, and code editor styling.

## Review Flow

1. User submits a code snippet and chooses a language.
2. The analyzer returns a structured result:
   - quality score
   - short summary
   - code metrics
   - categorized findings
3. The UI displays findings by category and severity.

## Data Science and Analytics Layer

- Review telemetry pipeline:
  logs analyzer variant, language, snippet hash, severity mix, score, and modeled risk probability for each review.
- A/B testing for analyzers:
  deterministic session assignment between `rules_v1` and `rules_v2`.
- Recommendation effectiveness analytics:
  captures per-finding feedback (`applied` or `not_useful`) and computes a fix-rate metric.
- Risk scoring model:
  a lightweight logistic risk estimate based on severity distribution and score.
- Export + BI integration:
  one-click export to CSV/JSON for downstream tools such as Power BI or Tableau.
- LLM observability hooks:
  records model/provider/prompt-version style traces, including latency, token totals, and cost fields.

## Recommended Next Architecture

```text
React UI
  -> API route or backend service
    -> Prompt builder with review rubric
    -> AI model response using strict JSON schema
    -> Optional static tools such as ESLint, TypeScript, Ruff, or Semgrep
  -> Persist review history in a database
```

## AI/ML Upgrade Path

- Keep the existing `ReviewResult` shape as the model contract.
- Add a backend endpoint such as `POST /api/review`.
- Send `{ code, language, goals }` to the backend.
- Ask the model for bugs, improvements, style issues, severity, explanation, and suggested fixes.
- Validate the model response against a schema before sending it to the UI.
- Combine model feedback with static-analysis tools for higher reliability.

## Development

```bash
npm install
npm run dev
npm run test
npm run build
```

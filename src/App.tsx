import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle2,
  Code2,
  Lightbulb,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { analyzeSnippet, type ReviewCategory, type Severity } from './lib/analyzer'
import './App.css'

const sampleSnippet = `function getUserName(user) {
  var name = user.profile.name
  console.log('Loaded user', user)
  return name.toUpperCase()
}`

const categoryCopy: Record<ReviewCategory, { label: string; icon: typeof Bug }> = {
  bugs: { label: 'Bugs', icon: Bug },
  improvements: { label: 'Improvements', icon: Lightbulb },
  style: { label: 'Style', icon: Wand2 },
}

const severityRank: Record<Severity, number> = {
  high: 1,
  medium: 2,
  low: 3,
}

function App() {
  const [code, setCode] = useState(sampleSnippet)
  const [language, setLanguage] = useState('javascript')
  const [activeCategory, setActiveCategory] = useState<ReviewCategory | 'all'>('all')

  const review = useMemo(() => analyzeSnippet(code, language), [code, language])
  const filteredFindings = review.findings
    .filter((finding) => activeCategory === 'all' || finding.category === activeCategory)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  const counts = review.findings.reduce(
    (acc, finding) => {
      acc[finding.category] += 1
      return acc
    },
    { bugs: 0, improvements: 0, style: 0 } as Record<ReviewCategory, number>,
  )

  return (
    <main className="app-shell">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">
            <Sparkles size={16} />
            AI code review foundation
          </p>
          <h1>Code feedback for bugs, improvements, and style</h1>
          <p className="header-copy">
            Paste a snippet, choose the language, and get a practical review with
            severity, reasoning, and concrete next steps.
          </p>
        </div>
        <div className="score-panel" aria-label="Review score">
          <span>{review.score}</span>
          <p>quality score</p>
        </div>
      </section>

      <section className="review-grid">
        <div className="editor-pane">
          <div className="pane-toolbar">
            <div className="toolbar-title">
              <Code2 size={18} />
              <span>Snippet</span>
            </div>
            <select
              aria-label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="sql">SQL</option>
            </select>
          </div>
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            aria-label="Code snippet"
          />
        </div>

        <div className="results-pane">
          <div className="summary-strip">
            <CheckCircle2 size={20} />
            <p>{review.summary}</p>
          </div>

          <div className="metrics-grid" aria-label="Code metrics">
            <Metric label="Lines" value={review.metrics.lines} />
            <Metric label="Characters" value={review.metrics.characters} />
            <Metric label="Code signals" value={review.metrics.functions} />
            <Metric label="Comments" value={review.metrics.comments} />
          </div>

          <div className="filter-row" aria-label="Finding filters">
            <button
              className={activeCategory === 'all' ? 'active' : ''}
              type="button"
              onClick={() => setActiveCategory('all')}
            >
              All
              <span>{review.findings.length}</span>
            </button>
            {(Object.keys(categoryCopy) as ReviewCategory[]).map((category) => {
              const Icon = categoryCopy[category].icon
              return (
                <button
                  className={activeCategory === category ? 'active' : ''}
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                >
                  <Icon size={15} />
                  {categoryCopy[category].label}
                  <span>{counts[category]}</span>
                </button>
              )
            })}
          </div>

          <div className="findings-list">
            {filteredFindings.length > 0 ? (
              filteredFindings.map((finding) => {
                const Icon = categoryCopy[finding.category].icon
                return (
                  <article className="finding" key={finding.id}>
                    <div className="finding-header">
                      <div>
                        <Icon size={18} />
                        <h2>{finding.title}</h2>
                      </div>
                      <span className={`severity ${finding.severity}`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p>{finding.detail}</p>
                    <div className="suggestion">
                      <AlertTriangle size={16} />
                      <span>{finding.suggestion}</span>
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="empty-state">
                <BarChart3 size={24} />
                <p>No findings in this category.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="foundation">
        <div>
          <p className="eyebrow">Project structure</p>
          <h2>Foundation to evolve into an AI reviewer</h2>
        </div>
        <div className="foundation-grid">
          <FoundationItem
            title="Frontend workspace"
            text="React owns the editor, filters, review cards, and quality metrics."
          />
          <FoundationItem
            title="Analysis layer"
            text="The current heuristic analyzer is isolated in src/lib and can be replaced by an API-backed AI service."
          />
          <FoundationItem
            title="Next backend step"
            text="Add an endpoint that sends code, language, and review goals to a model with a strict JSON schema."
          />
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function FoundationItem({ title, text }: { title: string; text: string }) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

export default App

import { describe, expect, it } from 'vitest'
import { analyzeSnippet } from './analyzer'

const titlesFor = (code: string, language = 'javascript') =>
  analyzeSnippet(code, language).findings.map((finding) => finding.title)

describe('analyzeSnippet', () => {
  it('does not show the same generic test warning for every short snippet', () => {
    const review = analyzeSnippet(
      `function total(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}`,
      'javascript',
    )

    expect(review.findings.map((finding) => finding.title)).not.toContain(
      'No test signal found',
    )
    expect(review.findings.map((finding) => finding.title)).toContain(
      'Numeric aggregation assumes valid item values',
    )
  })

  it('returns security-specific findings for risky JavaScript', () => {
    expect(
      titlesFor(`const apiKey = 'abc123'
eval(userInput)
console.log(apiKey)`),
    ).toEqual(
      expect.arrayContaining([
        'Possible hard-coded secret',
        'Dynamic execution can create security and correctness risks',
        'Debug output should be intentional',
      ]),
    )
  })

  it('returns Python-specific findings', () => {
    expect(
      titlesFor(
        `def append_item(item, items=[]):
    items.append(item)
    return items`,
        'python',
      ),
    ).toContain('Mutable default argument is shared between calls')
  })

  it('returns SQL-specific findings', () => {
    expect(titlesFor('DELETE users', 'sql')).toContain(
      'Data-changing query has no WHERE clause',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { continueList, indent, insert, toggleLinePrefix, wrap, type Edit } from './editing'

/** "|" marks the caret, "«...»" a selection. */
function at(src: string): Edit {
  if (src.includes('«')) {
    const start = src.indexOf('«')
    const end = src.indexOf('»') - 1
    return { text: src.replace('«', '').replace('»', ''), start, end }
  }
  const pos = src.indexOf('|')
  return { text: src.replace('|', ''), start: pos, end: pos }
}

function show(e: Edit | null): string {
  if (!e) return 'null'
  return e.start === e.end
    ? e.text.slice(0, e.start) + '|' + e.text.slice(e.start)
    : e.text.slice(0, e.start) + '«' + e.text.slice(e.start, e.end) + '»' + e.text.slice(e.end)
}

describe('wrap', () => {
  it('wraps and unwraps a selection', () => {
    expect(show(wrap(at('a «bold» b'), '**'))).toBe('a **«bold»** b')
    expect(show(wrap(at('a **«bold»** b'), '**'))).toBe('a «bold» b')
  })

  it('inserts a placeholder without a selection', () => {
    expect(show(wrap(at('x |'), '[', '](url)', 'text'))).toBe('x [«text»](url)')
  })
})

describe('line prefixes', () => {
  it('adds and removes a prefix on every selected line', () => {
    expect(toggleLinePrefix(at('«one\ntwo»'), '- ').text).toBe('- one\n- two')
    expect(toggleLinePrefix(at('«- one\n- two»'), '- ').text).toBe('one\ntwo')
  })

  it('numbers lines and swaps list kinds', () => {
    expect(toggleLinePrefix(at('«a\nb\nc»'), '1. ').text).toBe('1. a\n2. b\n3. c')
    expect(toggleLinePrefix(at('- [ ] task|'), '- ').text).toBe('- task')
    expect(toggleLinePrefix(at('## Title|'), '## ').text).toBe('Title')
  })
})

describe('continueList', () => {
  it('continues bullets, tasks, numbers and quotes', () => {
    expect(show(continueList(at('- one|')))).toBe('- one\n- |')
    expect(show(continueList(at('  - [x] done|')))).toBe('  - [x] done\n  - [ ] |')
    expect(show(continueList(at('9. nine|')))).toBe('9. nine\n10. |')
    expect(show(continueList(at('> quote|')))).toBe('> quote\n> |')
  })

  it('ends the list on an empty item and ignores normal lines', () => {
    expect(show(continueList(at('- one\n- |')))).toBe('- one\n|')
    expect(continueList(at('plain|'))).toBeNull()
  })
})

describe('indent and insert', () => {
  it('indents and outdents selected lines', () => {
    expect(indent(at('«a\nb»'), false).text).toBe('  a\n  b')
    expect(indent(at('«  a\n b»'), true).text).toBe('a\nb')
  })

  it('inserts with a caret offset', () => {
    expect(show(insert(at('x|y'), '[[]]', 2))).toBe('x[[|]]y')
  })
})

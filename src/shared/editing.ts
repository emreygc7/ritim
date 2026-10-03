/**
 * Pure Markdown editing operations on (text, selection). The Notes editor
 * applies the result to its textarea; keeping them pure makes them testable.
 */
export interface Edit {
  text: string
  start: number
  end: number
}

/** Wraps the selection in `before`/`after` (e.g. ** for bold); unwraps when already wrapped. */
export function wrap(e: Edit, before: string, after = before, placeholder = ''): Edit {
  const sel = e.text.slice(e.start, e.end)
  const outerStart = e.start - before.length
  if (
    outerStart >= 0 &&
    e.text.slice(outerStart, e.start) === before &&
    e.text.slice(e.end, e.end + after.length) === after
  ) {
    const text = e.text.slice(0, outerStart) + sel + e.text.slice(e.end + after.length)
    return { text, start: outerStart, end: outerStart + sel.length }
  }
  const inner = sel || placeholder
  const text = e.text.slice(0, e.start) + before + inner + after + e.text.slice(e.end)
  const start = e.start + before.length
  return { text, start, end: start + inner.length }
}

function lineBounds(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', start - 1) + 1
  let to = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end)
  if (to === -1) to = text.length
  return [from, to]
}

const PREFIX_RE = /^(\s*)(#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+[.)] )?/

/**
 * Sets a line prefix on every selected line ("- ", "1. ", "- [ ] ", "> ", "## ").
 * If all lines already have it, removes it instead. Numbered lists are renumbered.
 */
export function toggleLinePrefix(e: Edit, prefix: string): Edit {
  const [from, to] = lineBounds(e.text, e.start, e.end)
  const lines = e.text.slice(from, to).split('\n')
  const kind = (p: string): string => (/^\d+[.)] $/.test(p) ? '1. ' : p)
  const has = lines.every((l) => kind(PREFIX_RE.exec(l)?.[2] ?? '') === kind(prefix))
  const out = lines.map((l, i) => {
    const m = PREFIX_RE.exec(l)!
    const rest = l.slice(m[0].length)
    if (has) return m[1] + rest
    const p = /^\d+[.)] $/.test(prefix) ? `${i + 1}. ` : prefix
    return m[1] + p + rest
  })
  const block = out.join('\n')
  const text = e.text.slice(0, from) + block + e.text.slice(to)
  const single = lines.length === 1
  const caret = single ? from + block.length : from
  return { text, start: caret, end: single ? caret : from + block.length }
}

/**
 * Enter inside a list, checklist, numbered list or quote continues it.
 * Enter on an empty item ends the list. Returns null when Enter should behave normally.
 */
export function continueList(e: Edit): Edit | null {
  if (e.start !== e.end) return null
  const from = e.text.lastIndexOf('\n', e.start - 1) + 1
  const line = e.text.slice(from, e.start)
  const m = /^(\s*)(> |[-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) )(.*)$/.exec(line)
  if (!m) return null
  const [, indent, marker, num, delim, content] = m
  if (!content.trim()) {
    // Empty item: drop the marker and leave the list.
    const text = e.text.slice(0, from) + indent + e.text.slice(e.start)
    const pos = from + indent.length
    return { text, start: pos, end: pos }
  }
  let next = marker
  if (num) next = `${Number(num) + 1}${delim} `
  else if (/\[[xX]\]/.test(marker)) next = marker.replace(/\[[xX]\]/, '[ ]')
  const insert = '\n' + indent + next
  const text = e.text.slice(0, e.start) + insert + e.text.slice(e.end)
  const pos = e.start + insert.length
  return { text, start: pos, end: pos }
}

/** Tab / Shift+Tab: indents or outdents the selected lines by two spaces. */
export function indent(e: Edit, outdent: boolean): Edit {
  const [from, to] = lineBounds(e.text, e.start, e.end)
  const lines = e.text.slice(from, to).split('\n')
  let firstDelta = 0
  let total = 0
  const out = lines.map((l, i) => {
    if (outdent) {
      const n = l.startsWith('  ') ? 2 : l.startsWith(' ') || l.startsWith('\t') ? 1 : 0
      if (i === 0) firstDelta = -n
      total -= n
      return l.slice(n)
    }
    if (i === 0) firstDelta = 2
    total += 2
    return '  ' + l
  })
  const text = e.text.slice(0, from) + out.join('\n') + e.text.slice(to)
  return { text, start: Math.max(from, e.start + firstDelta), end: e.end + total }
}

/** Inserts text at the caret (replacing the selection), e.g. a divider or a [[link]]. */
export function insert(e: Edit, value: string, caretOffset = value.length): Edit {
  const text = e.text.slice(0, e.start) + value + e.text.slice(e.end)
  const pos = e.start + caretOffset
  return { text, start: pos, end: pos }
}

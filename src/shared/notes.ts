import type { AppData, Note } from './types'

/** Words starting with # (letters, digits, - _ /), not inside code and not Markdown headings. */
const TAG_RE = /(?:^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu
const WIKI_RE = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g

/** Removes fenced and inline code so tags and links inside code are ignored. */
function withoutCode(md: string): string {
  return md.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')
}

/** Lower-cased, unique #tags of a note body, in order of appearance. */
export function extractTags(body: string): string[] {
  const out: string[] = []
  for (const m of withoutCode(body).matchAll(TAG_RE)) {
    const tag = m[1].replace(/[/_-]+$/, '').toLocaleLowerCase('tr')
    // Like Obsidian: a tag needs at least one letter, so "#12" is not a tag.
    if (/\p{L}/u.test(tag) && !out.includes(tag)) out.push(tag)
  }
  return out
}

/** Titles referenced with [[Title]] or [[Title|label]]. */
export function extractLinks(body: string): string[] {
  const out: string[] = []
  for (const m of withoutCode(body).matchAll(WIKI_RE)) {
    const title = m[1].trim()
    if (title && !out.some((t) => sameTitle(t, title))) out.push(title)
  }
  return out
}

export const sameTitle = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr')

/** Display title: the title, else the first non-empty line of the body. */
export function noteTitle(n: Pick<Note, 'title' | 'body'>, untitled: string): string {
  if (n.title.trim()) return n.title.trim()
  const line = n.body
    .split('\n')
    .map((l) => l.replace(/^[#>\-*\s[\]x]+/i, '').trim())
    .find(Boolean)
  return line ? line.slice(0, 80) : untitled
}

/** Plain-text preview for the list: Markdown syntax stripped. */
export function noteExcerpt(body: string, length = 140): string {
  return body
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(WIKI_RE, (_, t: string, label?: string) => label ?? t)
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s+\[[ xX]\]|[-*+]|\d+\.)\s*/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length)
}

export function countWords(body: string): number {
  return (body.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length
}

/** Checkbox progress of "- [ ]" / "- [x]" items. */
export function taskProgress(body: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const m of withoutCode(body).matchAll(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/gm)) {
    total++
    if (m[1] !== ' ') done++
  }
  return { done, total }
}

/** Toggles the n-th task checkbox (0-based, in document order outside code). */
export function toggleTask(body: string, index: number): string {
  let i = 0
  let inFence = false
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence
      if (inFence) return line
      const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\].*)$/.exec(line)
      if (!m) return line
      return i++ === index ? `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}` : line
    })
    .join('\n')
}

export const activeNotes = (data: AppData): Note[] => data.notes.filter((n) => !n.deletedAt)

export function findNoteByTitle(notes: Note[], title: string, untitled: string): Note | undefined {
  return notes.find((n) => !n.deletedAt && sameTitle(noteTitle(n, untitled), title))
}

/** Notes that link to the given note with [[its title]]. */
export function backlinks(notes: Note[], target: Note, untitled: string): Note[] {
  const title = noteTitle(target, untitled)
  return notes.filter(
    (n) => n.id !== target.id && !n.deletedAt && extractLinks(n.body).some((l) => sameTitle(l, title))
  )
}

/** Tag → number of active notes using it, most used first. */
export function tagCounts(notes: Note[]): { tag: string; count: number }[] {
  const map = new Map<string, number>()
  for (const n of notes) if (!n.deletedAt) for (const t of extractTags(n.body)) map.set(t, (map.get(t) ?? 0) + 1)
  return [...map].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'tr'))
}

export type NoteSort = 'updated' | 'created' | 'title'

/** Search key: case- and accent-insensitive; "ı" and "i" match each other (Turkish "I" lower-cases to "ı"). */
const fold = (s: string): string =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Filters and orders notes. Every word of the query must appear in the title,
 * body or tags (accent- and case-insensitive); title hits rank higher.
 * Pinned notes always come first.
 */
export function searchNotes(
  notes: Note[],
  opts: { query?: string; tag?: string | null; sort?: NoteSort; untitled: string }
): Note[] {
  const words = fold(opts.query ?? '').split(/\s+/).filter(Boolean)
  const scored: { n: Note; score: number }[] = []
  for (const n of notes) {
    const tags = extractTags(n.body)
    if (opts.tag && !tags.includes(opts.tag)) continue
    const title = fold(noteTitle(n, opts.untitled))
    const body = fold(n.body)
    let score = 0
    let ok = true
    for (const w of words) {
      const inTitle = title.includes(w)
      if (!inTitle && !body.includes(w) && !tags.some((t) => fold(t).includes(w))) {
        ok = false
        break
      }
      score += inTitle ? 3 : 1
    }
    if (ok) scored.push({ n, score })
  }
  const by = opts.sort ?? 'updated'
  return scored
    .sort(
      (a, b) =>
        Number(b.n.pinned) - Number(a.n.pinned) ||
        (words.length ? b.score - a.score : 0) ||
        (by === 'title'
          ? noteTitle(a.n, opts.untitled).localeCompare(noteTitle(b.n, opts.untitled), 'tr')
          : Date.parse(b.n[by === 'created' ? 'createdAt' : 'updatedAt']) - Date.parse(a.n[by === 'created' ? 'createdAt' : 'updatedAt']))
    )
    .map((s) => s.n)
}

/** Safe, readable file name for a note, unique within `taken` (lower-cased names). */
export function noteFileName(title: string, taken: Set<string>): string {
  const base =
    title
      .replace(/[\\/:*?"<>|#^[\]\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
      .replace(/[. ]+$/, '') || 'Untitled'
  let name = `${base}.md`
  for (let i = 2; taken.has(name.toLocaleLowerCase('tr')); i++) name = `${base} ${i}.md`
  taken.add(name.toLocaleLowerCase('tr'))
  return name
}

/** A note as a standalone Markdown file with Obsidian-style properties. */
export function noteMarkdown(n: Note, untitled: string): string {
  const tags = extractTags(n.body)
  const front = [
    '---',
    `title: "${noteTitle(n, untitled).replace(/"/g, "'")}"`,
    `created: ${n.createdAt}`,
    `updated: ${n.updatedAt}`,
    `tags: [${['ritim-note', ...tags].join(', ')}]`,
    '---',
    ''
  ]
  return front.join('\n') + n.body.replace(/\s*$/, '\n')
}

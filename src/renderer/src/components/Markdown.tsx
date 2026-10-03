import DOMPurify from 'dompurify'
import { Marked, type TokenizerAndRendererExtension } from 'marked'
import { useEffect, useMemo, useRef, type MouseEvent } from 'react'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Builds a Markdown renderer that knows which [[titles]] exist. */
function createRenderer(exists: (title: string) => boolean): Marked {
  const wiki: TokenizerAndRendererExtension = {
    name: 'wiki',
    level: 'inline',
    start: (src) => {
      const i = src.indexOf('[[')
      return i < 0 ? undefined : i
    },
    tokenizer(src) {
      const m = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(src)
      if (!m) return undefined
      return { type: 'wiki', raw: m[0], title: m[1].trim(), label: (m[2] ?? m[1]).trim() }
    },
    renderer: (token) =>
      `<a href="#" class="wikilink${exists(token.title) ? '' : ' missing'}" data-wiki="${esc(token.title)}">${esc(token.label)}</a>`
  }
  const tag: TokenizerAndRendererExtension = {
    name: 'tag',
    level: 'inline',
    // Only a # at the start or after whitespace begins a tag ("C#" or "a#b" don't).
    start: (src) => {
      const m = /(^|[\s(])#[\p{L}\p{N}]/u.exec(src)
      return m ? m.index + m[1].length : undefined
    },
    tokenizer(src) {
      const m = /^#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/u.exec(src)
      if (!m || !/\p{L}/u.test(m[1])) return undefined
      return { type: 'tag', raw: m[0], tag: m[1].replace(/[/_-]+$/, '').toLocaleLowerCase('tr') }
    },
    renderer: (token) => `<a href="#" class="md-tag" data-tag="${esc(token.tag)}">#${esc(token.tag)}</a>`
  }
  return new Marked({ gfm: true, breaks: true, extensions: [wiki, tag] })
}

interface Props {
  body: string
  /** Lower-cased titles of existing notes, to style links to missing notes */
  titles: Set<string>
  onToggleTask?: (index: number) => void
  onOpenTitle?: (title: string) => void
  onTag?: (tag: string) => void
  onExternal?: (url: string) => void
}

/** Renders a note's Markdown safely, with clickable tasks, [[links]] and #tags. */
export function Markdown({ body, titles, onToggleTask, onOpenTitle, onTag, onExternal }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => {
    const marked = createRenderer((title) => titles.has(title.toLocaleLowerCase('tr')))
    const raw = marked.parse(body, { async: false }) as string
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['data-wiki', 'data-tag'] })
  }, [body, titles])

  // GFM renders disabled checkboxes; enable them and number them in document order.
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box, i) => {
      box.disabled = !onToggleTask
      box.dataset.task = String(i)
      box.closest('li')?.classList.add('task')
    })
  }, [html, onToggleTask])

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const el = e.target as HTMLElement
    if (el instanceof HTMLInputElement && el.dataset.task) {
      e.preventDefault()
      onToggleTask?.(Number(el.dataset.task))
      return
    }
    const a = el.closest('a')
    if (!a) return
    e.preventDefault()
    if (a.dataset.wiki) onOpenTitle?.(a.dataset.wiki)
    else if (a.dataset.tag) onTag?.(a.dataset.tag)
    else if (/^https?:\/\//.test(a.getAttribute('href') ?? '')) onExternal?.(a.getAttribute('href')!)
  }

  return <div ref={ref} className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

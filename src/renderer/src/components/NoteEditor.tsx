import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { continueList, indent, insert, toggleLinePrefix, wrap, type Edit } from '@shared/editing'
import { backlinks, countWords, extractTags, noteTitle, taskProgress, toggleTask } from '@shared/notes'
import type { AppData, Note } from '@shared/types'
import { useStore } from '../store'
import { Icon } from './Icon'
import { Markdown } from './Markdown'

export type EditorMode = 'edit' | 'split' | 'preview'
const MODES: EditorMode[] = ['edit', 'split', 'preview']
const SAVE_DELAY_MS = 500

function loadMode(): EditorMode {
  try {
    const m = localStorage.getItem('ritim.notes.mode')
    if (m === 'edit' || m === 'split' || m === 'preview') return m
  } catch {
    // storage unavailable: use the default
  }
  return 'split'
}

/**
 * Applies an edit through execCommand so the browser's undo stack (Ctrl+Z)
 * keeps working; falls back to setting the value directly.
 */
function applyToTextarea(ta: HTMLTextAreaElement, next: Edit): void {
  const prev = ta.value
  let a = 0
  while (a < prev.length && a < next.text.length && prev[a] === next.text[a]) a++
  let b = 0
  while (b < prev.length - a && b < next.text.length - a && prev[prev.length - 1 - b] === next.text[next.text.length - 1 - b]) b++
  ta.focus()
  ta.setSelectionRange(a, prev.length - b)
  const ok = document.execCommand('insertText', false, next.text.slice(a, next.text.length - b))
  if (!ok) {
    ta.value = next.text
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }
  ta.setSelectionRange(next.start, next.end)
}

/** The unfinished "[[query" right before the caret, if any. */
function wikiQuery(text: string, caret: number): { from: number; query: string } | null {
  const line = text.slice(text.lastIndexOf('\n', caret - 1) + 1, caret)
  const i = line.lastIndexOf('[[')
  if (i < 0 || line.slice(i).includes(']]')) return null
  const query = line.slice(i + 2)
  return query.length <= 60 ? { from: caret - query.length - 2, query } : null
}

interface Props {
  note: Note
  readOnly: boolean
  onOpenTitle: (title: string) => void
  onTag: (tag: string) => void
}

export function NoteEditor({ note, readOnly, onOpenTitle, onTag }: Props) {
  const { data, update, t, openNote } = useStore()
  const lang = data.settings.lang
  const untitled = t('notes.untitled')
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [mode, setModeState] = useState<EditorMode>(loadMode)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [suggest, setSuggest] = useState<{ from: number; query: string; index: number } | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<{ title: string; body: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setMode = (m: EditorMode): void => {
    setModeState(m)
    try {
      localStorage.setItem('ritim.notes.mode', m)
    } catch {
      // not persisted: fine
    }
  }

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    if (!p) return
    pending.current = null
    update((d: AppData) => ({
      ...d,
      notes: d.notes.map((n) => (n.id === note.id ? { ...n, title: p.title, body: p.body, updatedAt: new Date().toISOString() } : n))
    }))
    setSaving(false)
  }, [note.id, update])

  // Autosave shortly after typing stops, and when leaving the note.
  const schedule = (next: { title: string; body: string }): void => {
    pending.current = next
    setSaving(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }
  useEffect(() => {
    // Quitting the app unloads the page without unmounting React: save what's pending first.
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flush])

  // Pick up changes made elsewhere (a task ticked in the preview, an import) when nothing is pending.
  useEffect(() => {
    if (pending.current) return
    setTitle(note.title)
    setBody(note.body)
  }, [note.title, note.body])

  const titles = useMemo(
    () => new Set(data.notes.filter((n) => !n.deletedAt).map((n) => noteTitle(n, untitled).toLocaleLowerCase('tr'))),
    [data.notes, untitled]
  )
  const suggestions = useMemo(() => {
    if (!suggest) return []
    const q = suggest.query.toLocaleLowerCase('tr')
    return data.notes
      .filter((n) => !n.deletedAt && n.id !== note.id)
      .map((n) => noteTitle(n, untitled))
      .filter((tt) => tt.toLocaleLowerCase('tr').includes(q))
      .slice(0, 6)
  }, [suggest, data.notes, note.id, untitled])

  const edit = (fn: (e: Edit) => Edit | null): boolean => {
    const el = ta.current
    if (!el || readOnly) return false
    const next = fn({ text: el.value, start: el.selectionStart, end: el.selectionEnd })
    if (!next) return false
    applyToTextarea(el, next)
    return true
  }

  const changeBody = (value: string): void => {
    setBody(value)
    schedule({ title, body: value })
    const el = ta.current
    const q = el ? wikiQuery(value, el.selectionStart) : null
    setSuggest(q ? { ...q, index: 0 } : null)
  }

  const pickSuggestion = (picked: string): void => {
    const s = suggest
    if (!s) return
    edit((e) => {
      const text = e.text.slice(0, s.from) + `[[${picked}]]` + e.text.slice(e.start).replace(/^\]\]/, '')
      const pos = s.from + picked.length + 4
      return { text, start: pos, end: pos }
    })
    setSuggest(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const mod = e.ctrlKey || e.metaKey
    if (suggest && suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setSuggest({ ...suggest, index: (suggest.index + d + suggestions.length) % suggestions.length })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickSuggestion(suggestions[suggest.index])
        return
      }
      if (e.key === 'Escape') {
        setSuggest(null)
        return
      }
    }
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      edit((x) => wrap(x, '**'))
    } else if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      edit((x) => wrap(x, '*'))
    } else if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      edit((x) => wrap(x, '[', '](https://)', t('notes.tb.link')))
    } else if (mod && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      edit((x) => toggleLinePrefix(x, '- [ ] '))
    } else if (e.key === 'Tab' && !mod) {
      e.preventDefault()
      edit((x) => indent(x, e.shiftKey))
    } else if (e.key === 'Enter' && !e.shiftKey && !mod) {
      if (edit(continueList)) e.preventDefault()
    }
  }

  // Ctrl+E cycles edit / split / preview while this note is open.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const toggle = (i: number): void => {
    const next = toggleTask(body, i)
    setBody(next)
    schedule({ title, body: next })
  }

  const patch = (p: Partial<Note>): void =>
    update((d) => ({ ...d, notes: d.notes.map((n) => (n.id === note.id ? { ...n, ...p, updatedAt: new Date().toISOString() } : n)) }))

  const tags = extractTags(body)
  const tasks = taskProgress(body)
  const links = backlinks(data.notes, { ...note, title, body }, untitled)
  const edited = new Date(note.updatedAt).toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const showEdit = !readOnly && mode !== 'preview'
  const showPreview = readOnly || mode !== 'edit'

  const tools: { label: string; text: string; run: () => void }[] = [
    { label: t('notes.tb.heading'), text: 'H', run: () => edit((x) => toggleLinePrefix(x, '## ')) },
    { label: `${t('notes.tb.bold')} (Ctrl+B)`, text: 'B', run: () => edit((x) => wrap(x, '**')) },
    { label: `${t('notes.tb.italic')} (Ctrl+I)`, text: 'I', run: () => edit((x) => wrap(x, '*')) },
    { label: t('notes.tb.strike'), text: 'S', run: () => edit((x) => wrap(x, '~~')) },
    { label: t('notes.tb.list'), text: '•', run: () => edit((x) => toggleLinePrefix(x, '- ')) },
    { label: t('notes.tb.ordered'), text: '1.', run: () => edit((x) => toggleLinePrefix(x, '1. ')) },
    { label: `${t('notes.tb.task')} (Ctrl+L)`, text: '☑', run: () => edit((x) => toggleLinePrefix(x, '- [ ] ')) },
    { label: t('notes.tb.quote'), text: '❝', run: () => edit((x) => toggleLinePrefix(x, '> ')) },
    { label: t('notes.tb.code'), text: '</>', run: () => edit((x) => (x.text.slice(x.start, x.end).includes('\n') ? wrap(x, '```\n', '\n```') : wrap(x, '`'))) },
    { label: `${t('notes.tb.link')} (Ctrl+K)`, text: '🔗', run: () => edit((x) => wrap(x, '[', '](https://)', t('notes.tb.link'))) },
    { label: t('notes.tb.wiki'), text: '[[ ]]', run: () => edit((x) => (x.start === x.end ? insert(x, '[[]]', 2) : wrap(x, '[[', ']]'))) },
    { label: t('notes.tb.hr'), text: '―', run: () => edit((x) => insert(x, '\n\n---\n\n')) }
  ]

  return (
    <div className="note-editor">
      <div className="note-head">
        <input
          className="note-title"
          value={title}
          placeholder={t('notes.titlePlaceholder')}
          readOnly={readOnly}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value)
            schedule({ title: e.target.value, body })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ta.current?.focus()
            }
          }}
        />
        {!readOnly && (
          <div className="note-actions">
            <button className={`icon-btn subtle${note.pinned ? ' on' : ''}`} title={note.pinned ? t('notes.unpin') : t('notes.pin')} aria-label={note.pinned ? t('notes.unpin') : t('notes.pin')} aria-pressed={note.pinned} onClick={() => patch({ pinned: !note.pinned })}>
              <Icon name="pin" size={16} />
            </button>
            <button
              className="icon-btn subtle"
              title={copied ? t('notes.copied') : t('notes.copy')}
              aria-label={t('notes.copy')}
              onClick={async () => {
                await window.ritim.copyText(title.trim() ? `# ${title.trim()}\n\n${body}` : body)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </button>
            <button
              className="icon-btn subtle"
              title={t('notes.delete')}
              aria-label={t('notes.delete')}
              onClick={() => {
                flush()
                patch({ deletedAt: new Date().toISOString(), pinned: false })
                openNote(null)
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="note-meta">
        {tags.map((tg) => (
          <button key={tg} className="md-tag" onClick={() => onTag(tg)}>
            #{tg}
          </button>
        ))}
        <BlockLinks note={note} readOnly={readOnly} onChange={(blockIds) => patch({ blockIds })} />
      </div>

      {!readOnly && (
        <div className="note-toolbar" role="toolbar">
          <div className="segmented small">
            {MODES.map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} title="Ctrl+E">
                {t(`notes.mode.${m}`)}
              </button>
            ))}
          </div>
          {showEdit && (
            <div className="tool-group">
              {tools.map((tool) => (
                <button key={tool.text} className="tool" title={tool.label} aria-label={tool.label} onMouseDown={(e) => e.preventDefault()} onClick={tool.run}>
                  {tool.text}
                </button>
              ))}
            </div>
          )}
          <details className="shortcuts">
            <summary title={t('notes.shortcuts')} aria-label={t('notes.shortcuts')}>
              <Icon name="keyboard" size={16} />
            </summary>
            <dl>
              {(
                [
                  ['Ctrl+N', 'notes.sc.new'],
                  ['Ctrl+F', 'notes.sc.search'],
                  ['Ctrl+E', 'notes.sc.mode'],
                  ['Ctrl+B', 'notes.sc.bold'],
                  ['Ctrl+I', 'notes.sc.italic'],
                  ['Ctrl+K', 'notes.sc.link'],
                  ['Ctrl+L', 'notes.sc.task'],
                  ['Tab / Shift+Tab', 'notes.sc.indent'],
                  ['[[', 'notes.tb.wiki']
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{t(label)}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}

      <div className={`note-panes ${showEdit && showPreview ? 'split' : ''}`}>
        {showEdit && (
          <div className="note-input">
            <textarea
              ref={ta}
              value={body}
              spellCheck={false}
              placeholder={t('notes.bodyPlaceholder')}
              onChange={(e) => changeBody(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => setSuggest(null), 150)}
              autoFocus={!body}
            />
            {suggest && suggestions.length > 0 && (
              <ul className="wiki-suggest" role="listbox">
                {suggestions.map((s, i) => (
                  <li key={s} role="option" aria-selected={i === suggest.index} className={i === suggest.index ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pickSuggestion(s)}>
                    <Icon name="notes" size={14} /> {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {showPreview && (
          <div className="note-preview">
            <Markdown
              body={body}
              titles={titles}
              onToggleTask={readOnly ? undefined : toggle}
              onOpenTitle={onOpenTitle}
              onTag={onTag}
              onExternal={(url) => void window.ritim.openExternal(url)}
            />
            {links.length > 0 && (
              <div className="backlinks">
                <span className="eyebrow">{t('notes.backlinks')}</span>
                {links.map((n) => (
                  <button key={n.id} className="link" onClick={() => openNote(n.id)}>
                    {noteTitle(n, untitled)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="note-foot">
        <span>{t('notes.words', { n: countWords(body) })}</span>
        {tasks.total > 0 && <span>{t('notes.tasks', { m: tasks.done, n: tasks.total })}</span>}
        <span className="spacer" />
        <span>{saving ? t('notes.saving') : t('notes.edited', { t: edited })}</span>
      </footer>
    </div>
  )
}

/** Chips for the blocks this note is linked to, plus a picker to add more. */
function BlockLinks({ note, readOnly, onChange }: { note: Note; readOnly: boolean; onChange: (ids: string[]) => void }) {
  const { data, t, category } = useStore()
  const label = (id: string): string | null => {
    const b = data.blocks.find((x) => x.id === id)
    if (b) return `${b.title} · ${b.start}`
    const o = data.oneOffs.find((x) => x.id === id)
    return o ? `${o.title} · ${o.date} ${o.start}` : null
  }
  const linked = note.blockIds.filter((id) => label(id))
  const color = (id: string): string =>
    category(data.blocks.find((b) => b.id === id)?.categoryId ?? data.oneOffs.find((o) => o.id === id)?.categoryId ?? '')?.color ?? '#8b8d98'

  const weekly = data.blocks.filter((b) => !b.planId && !linked.includes(b.id))
  const plans = data.plans.map((p) => ({ p, blocks: data.blocks.filter((b) => b.planId === p.id && !linked.includes(b.id)) }))
  const oneOffs = data.oneOffs.filter((o) => !linked.includes(o.id))
  const sortByTime = <T extends { start: string }>(xs: T[]): T[] => [...xs].sort((a, b) => a.start.localeCompare(b.start))

  return (
    <>
      {linked.map((id) => (
        <span key={id} className="block-chip" style={{ ['--cat' as string]: color(id) }}>
          <span className="dot" />
          {label(id)}
          {!readOnly && (
            <button aria-label={t('editor.delete')} onClick={() => onChange(note.blockIds.filter((x) => x !== id))}>
              <Icon name="x" size={12} />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <select
          className="block-picker"
          value=""
          aria-label={t('notes.linkBlock')}
          onChange={(e) => e.target.value && onChange([...note.blockIds, e.target.value])}
        >
          <option value="">{t('notes.linkBlock')}</option>
          <optgroup label={t('notes.weekly')}>
            {sortByTime(weekly).map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {b.days.map((d) => t.dayShort[d - 1]).join(' ')} · {b.start}
              </option>
            ))}
          </optgroup>
          {plans
            .filter((x) => x.blocks.length)
            .map(({ p, blocks }) => (
              <optgroup key={p.id} label={t('notes.plan', { name: p.name })}>
                {sortByTime(blocks).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} · {b.start}
                  </option>
                ))}
              </optgroup>
            ))}
          {oneOffs.length > 0 && (
            <optgroup label={t('notes.oneOffs')}>
              {oneOffs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} · {o.date} {o.start}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </>
  )
}

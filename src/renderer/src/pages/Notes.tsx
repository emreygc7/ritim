import { useEffect, useMemo, useRef, useState } from 'react'
import { newId } from '@shared/normalize'
import { extractTags, findNoteByTitle, folderAndDescendants, folderPath, noteExcerpt, noteTitle, searchNotes, tagCounts, taskProgress, type NoteSort } from '@shared/notes'
import type { Note } from '@shared/types'
import { DRAG_NOTE, FolderTree } from '../components/FolderTree'
import { Icon } from '../components/Icon'
import { NoteEditor } from '../components/NoteEditor'
import { useStore } from '../store'

/** Tray "New note" requests already handled; survives the page remounting. */
let handledNewNoteRequest = 0

function relative(iso: string, lang: string, now: number): string {
  // Clock skew between machines can put an edit slightly "in the future"; show it as now.
  const diff = Math.min(0, Date.parse(iso) - now)
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  if (abs < 60_000) return rtf.format(0, 'minute')
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  if (abs < 7 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day')
  return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
}

export function NotesPage() {
  const { data, update, t, now, noteId, openNote, newNoteRequest } = useStore()
  const lang = data.settings.lang
  const untitled = t('notes.untitled')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<NoteSort>('updated')
  const [trash, setTrash] = useState(false)
  /** Selected folder; null = all notes */
  const [folder, setFolder] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const search = useRef<HTMLInputElement>(null)

  const trashed = data.notes.filter((n) => n.deletedAt)
  const list = useMemo(() => {
    const inFolder = folder && !trash ? folderAndDescendants(data.noteFolders, folder) : null
    const pool = data.notes.filter((n) => !!n.deletedAt === trash && (!inFolder || (n.folderId !== null && inFolder.has(n.folderId))))
    return searchNotes(pool, { query, tag, sort, untitled })
  }, [data.notes, data.noteFolders, folder, trash, query, tag, sort, untitled])
  const tags = useMemo(() => tagCounts(data.notes), [data.notes])
  const selected = data.notes.find((n) => n.id === noteId) ?? null

  const create = (fields: Partial<Note> = {}): void => {
    const stamp = new Date().toISOString()
    const note: Note = {
      id: newId(),
      title: '',
      body: tag ? `#${tag}\n\n` : '',
      pinned: false,
      blockIds: [],
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      folderId: trash ? null : folder,
      ...fields
    }
    update((d) => ({ ...d, notes: [note, ...d.notes] }))
    setTrash(false)
    setQuery('')
    openNote(note.id)
  }

  // Open the first note when arriving without a selection.
  useEffect(() => {
    if (!selected && !trash && list.length) openNote(list[0].id)
  }, [selected, trash, list, openNote])

  // Runs on every render on purpose: `create` changes each render, and the module-level
  // counter makes sure each tray request creates exactly one note.
  useEffect(() => {
    if (newNoteRequest > handledNewNoteRequest) {
      handledNewNoteRequest = newNoteRequest
      create()
    }
  })

  // Ctrl+N new note, Ctrl+F search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        create()
      } else if (k === 'f') {
        e.preventDefault()
        search.current?.focus()
        search.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openTitle = (title: string): void => {
    const found = findNoteByTitle(data.notes, title, untitled)
    if (found) openNote(found.id)
    else create({ title })
  }

  const restore = (id: string): void => {
    update((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, deletedAt: null } : n)) }))
    setTrash(false)
    openNote(id)
  }

  const destroy = (id: string): void => {
    if (armed !== id) return setArmed(id)
    setArmed(null)
    update((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }))
    openNote(null)
  }

  const emptyTrash = (): void => {
    if (armed !== 'all') return setArmed('all')
    setArmed(null)
    update((d) => ({ ...d, notes: d.notes.filter((n) => !n.deletedAt) }))
    openNote(null)
  }

  return (
    <div className="notes-page">
      <aside className="notes-side">
        <div className="notes-tools">
          <div className="search-box">
            <Icon name="search" size={15} />
            <input
              ref={search}
              value={query}
              placeholder={t('notes.search')}
              aria-label={t('notes.search')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
                if (e.key === 'Enter' && list[0]) openNote(list[0].id)
              }}
            />
          </div>
          <button className="icon-btn primary-icon" onClick={() => create()} title={`${t('notes.new')} (Ctrl+N)`} aria-label={t('notes.new')}>
            <Icon name="plus" size={18} />
          </button>
        </div>

        <div className="notes-filters">
          <div className="segmented small">
            <button className={!trash ? 'on' : ''} onClick={() => setTrash(false)}>
              {t('notes.notes')}
            </button>
            <button className={trash ? 'on' : ''} onClick={() => setTrash(true)}>
              {t('notes.trash')} {trashed.length > 0 && `(${trashed.length})`}
            </button>
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as NoteSort)} aria-label="sort">
            <option value="updated">{t('notes.sort.updated')}</option>
            <option value="created">{t('notes.sort.created')}</option>
            <option value="title">{t('notes.sort.title')}</option>
          </select>
        </div>

        {!trash && <FolderTree selected={folder} onSelect={setFolder} total={data.notes.filter((n) => !n.deletedAt).length} />}

        {!trash && tags.length > 0 && (
          <div className="tag-filter">
            <button className={`chip small${tag === null ? ' on' : ''}`} onClick={() => setTag(null)}>
              {t('notes.tagsAll')}
            </button>
            {tags.map(({ tag: tg, count }) => (
              <button key={tg} className={`chip small${tag === tg ? ' on' : ''}`} onClick={() => setTag(tag === tg ? null : tg)}>
                #{tg} <span className="count">{count}</span>
              </button>
            ))}
          </div>
        )}

        {trash && (
          <div className="trash-bar">
            <span className="muted small">{t('notes.trashHint')}</span>
            {trashed.length > 0 && (
              <button className={`btn danger small${armed === 'all' ? ' armed' : ''}`} onClick={emptyTrash}>
                {armed === 'all' ? t('settings.clickAgain') : t('notes.emptyTrash')}
              </button>
            )}
          </div>
        )}

        <ul className="note-list" role="listbox" aria-label={t('nav.notes')}>
          {list.map((n) => {
            const tasks = taskProgress(n.body)
            const noteTags = extractTags(n.body).slice(0, 3)
            return (
              <li key={n.id}>
                <button
                  className={`note-item${n.id === noteId ? ' on' : ''}`}
                  role="option"
                  aria-selected={n.id === noteId}
                  draggable={!trash}
                  onDragStart={(e) => e.dataTransfer.setData(DRAG_NOTE, n.id)}
                  onClick={() => openNote(n.id)}
                >
                  <span className="note-item-title">
                    {n.pinned && <Icon name="pin" size={13} />}
                    {noteTitle(n, untitled)}
                  </span>
                  <span className="note-item-excerpt">{noteExcerpt(n.body, 110)}</span>
                  <span className="note-item-meta">
                    {relative(n.updatedAt, lang, now)}
                    {n.folderId && n.folderId !== folder && (
                      <span className="folder-mini">
                        <Icon name="folder" size={11} />
                        {folderPath(data.noteFolders, n.folderId)
                          .map((f) => f.name)
                          .join(' / ')}
                      </span>
                    )}
                    {tasks.total > 0 && <span>☑ {tasks.done}/{tasks.total}</span>}
                    {noteTags.map((tg) => (
                      <span key={tg} className="tag-mini">
                        #{tg}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {list.length === 0 && <p className="empty small">{query || tag ? t('notes.noResults') : trash ? '' : t('notes.empty')}</p>}
      </aside>

      <section className="notes-main">
        {selected ? (
          <>
            {selected.deletedAt && (
              <div className="trash-banner">
                <span>{t('notes.trashHint')}</span>
                <button className="btn" onClick={() => restore(selected.id)}>
                  <Icon name="restore" size={15} />
                  {t('notes.restore')}
                </button>
                <button className={`btn danger${armed === selected.id ? ' armed' : ''}`} onClick={() => destroy(selected.id)}>
                  {armed === selected.id ? t('settings.clickAgain') : t('notes.deleteForever')}
                </button>
              </div>
            )}
            <NoteEditor
              key={selected.id}
              note={selected}
              readOnly={!!selected.deletedAt}
              onOpenTitle={openTitle}
              onTag={(tg) => {
                setTrash(false)
                setTag(tg)
              }}
            />
          </>
        ) : (
          <div className="notes-placeholder">
            <Icon name="notes" size={40} />
            <p>{t('notes.select')}</p>
            <button className="btn primary" onClick={() => create()}>
              <Icon name="plus" size={16} />
              {t('notes.new')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

import { useEffect, useState, type DragEvent } from 'react'
import { newId } from '@shared/normalize'
import { canMoveFolder, deleteFolder, folderTree, type FolderNode } from '@shared/notes'
import { useStore } from '../store'
import { Icon } from './Icon'

/** Drag data types: a note from the list, or a folder from this tree. */
export const DRAG_NOTE = 'application/x-ritim-note'
const DRAG_FOLDER = 'application/x-ritim-folder'

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('ritim.notes.collapsed') ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

interface Props {
  /** null = all notes */
  selected: string | null
  onSelect: (id: string | null) => void
  /** Number of active notes, shown on the "All notes" row */
  total: number
}

export function FolderTree({ selected, onSelect, total }: Props) {
  const { data, update, t } = useStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const tree = folderTree(data.noteFolders, data.notes)

  useEffect(() => {
    try {
      localStorage.setItem('ritim.notes.collapsed', JSON.stringify([...collapsed]))
    } catch {
      // not persisted: fine
    }
  }, [collapsed])

  const toggle = (id: string): void =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const create = (parentId: string | null): void => {
    const id = newId()
    update((d) => ({ ...d, noteFolders: [...d.noteFolders, { id, name: t('notes.newFolder'), parentId }] }))
    if (parentId) setCollapsed((c) => new Set([...c].filter((x) => x !== parentId)))
    setRenaming(id)
    onSelect(id)
  }

  const rename = (id: string, name: string): void => {
    const clean = name.trim().slice(0, 80)
    if (clean) update((d) => ({ ...d, noteFolders: d.noteFolders.map((f) => (f.id === id ? { ...f, name: clean } : f)) }))
    setRenaming(null)
  }

  const remove = (id: string): void => {
    if (armed !== id) return setArmed(id)
    setArmed(null)
    const parent = data.noteFolders.find((f) => f.id === id)?.parentId ?? null
    update((d) => deleteFolder(d, id))
    if (selected === id) onSelect(parent)
  }

  /** Drops a note into a folder, or moves a folder under another (null = top level). */
  const onDrop = (e: DragEvent, target: string | null): void => {
    e.preventDefault()
    setDropTarget(null)
    const noteId = e.dataTransfer.getData(DRAG_NOTE)
    const folderId = e.dataTransfer.getData(DRAG_FOLDER)
    if (noteId) {
      update((d) => ({ ...d, notes: d.notes.map((n) => (n.id === noteId ? { ...n, folderId: target } : n)) }))
    } else if (folderId && folderId !== target && canMoveFolder(data.noteFolders, folderId, target)) {
      update((d) => ({ ...d, noteFolders: d.noteFolders.map((f) => (f.id === folderId ? { ...f, parentId: target } : f)) }))
    }
  }

  const dropProps = (target: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].some((ty) => ty === DRAG_NOTE || ty === DRAG_FOLDER)) return
      e.preventDefault()
      setDropTarget(target ?? 'root')
    },
    onDragLeave: () => setDropTarget((d) => (d === (target ?? 'root') ? null : d)),
    onDrop: (e: DragEvent) => onDrop(e, target)
  })

  const row = (node: FolderNode) => {
    const { folder, depth, count, children } = node
    const open = !collapsed.has(folder.id)
    return (
      <li key={folder.id}>
        <div
          className={`folder-row${selected === folder.id ? ' on' : ''}${dropTarget === folder.id ? ' drop' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable={renaming !== folder.id}
          onDragStart={(e) => e.dataTransfer.setData(DRAG_FOLDER, folder.id)}
          {...dropProps(folder.id)}
        >
          <button
            className={`folder-caret${children.length ? '' : ' empty'}${open ? ' open' : ''}`}
            aria-label={open ? 'collapse' : 'expand'}
            tabIndex={children.length ? 0 : -1}
            onClick={() => children.length && toggle(folder.id)}
          >
            <Icon name="right" size={12} />
          </button>
          {renaming === folder.id ? (
            <input
              className="folder-rename"
              defaultValue={folder.name}
              autoFocus
              onFocus={(e) => e.target.select()}
              onBlur={(e) => rename(folder.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename(folder.id, (e.target as HTMLInputElement).value)
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <button className="folder-name" onClick={() => onSelect(folder.id)} onDoubleClick={() => setRenaming(folder.id)} title={folder.name}>
              <Icon name="folder" size={14} />
              <span>{folder.name}</span>
              <span className="count">{count || ''}</span>
            </button>
          )}
          {renaming !== folder.id && (
            <span className="folder-actions">
              <button title={t('notes.newSubfolder')} aria-label={t('notes.newSubfolder')} onClick={() => create(folder.id)}>
                <Icon name="plus" size={13} />
              </button>
              <button title={t('notes.rename')} aria-label={t('notes.rename')} onClick={() => setRenaming(folder.id)}>
                <Icon name="edit" size={13} />
              </button>
              <button
                className={armed === folder.id ? 'armed' : ''}
                title={armed === folder.id ? t('notes.deleteFolderConfirm') : t('notes.deleteFolder')}
                aria-label={t('notes.deleteFolder')}
                onClick={() => remove(folder.id)}
                onBlur={() => setArmed((a) => (a === folder.id ? null : a))}
              >
                <Icon name="trash" size={13} />
              </button>
            </span>
          )}
        </div>
        {open && children.length > 0 && <ul>{children.map(row)}</ul>}
      </li>
    )
  }

  return (
    <nav className="folder-tree" aria-label={t('notes.folders')}>
      <div className="folder-head">
        <span className="eyebrow">{t('notes.folders')}</span>
        <button className="icon-btn subtle small" title={t('notes.newFolder')} aria-label={t('notes.newFolder')} onClick={() => create(selected)}>
          <Icon name="folderPlus" size={15} />
        </button>
      </div>
      <ul>
        <li>
          <div className={`folder-row${selected === null ? ' on' : ''}${dropTarget === 'root' ? ' drop' : ''}`} style={{ paddingLeft: 6 }} {...dropProps(null)}>
            <span className="folder-caret empty" />
            <button className="folder-name" onClick={() => onSelect(null)}>
              <Icon name="notes" size={14} />
              <span>{t('notes.all')}</span>
              <span className="count">{total || ''}</span>
            </button>
          </div>
        </li>
        {tree.map(row)}
      </ul>
    </nav>
  )
}

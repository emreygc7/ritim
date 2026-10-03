import { describe, expect, it } from 'vitest'
import { normalizeData } from './normalize'
import {
  backlinks,
  canMoveFolder,
  deleteFolder,
  folderAndDescendants,
  folderPath,
  folderTree,
  countWords,
  extractLinks,
  extractTags,
  noteExcerpt,
  noteFileName,
  noteMarkdown,
  noteTitle,
  searchNotes,
  tagCounts,
  taskProgress,
  toggleTask
} from './notes'
import type { Note } from './types'

const U = 'Untitled'
let n = 0
function note(p: Partial<Note>): Note {
  n++
  return {
    id: `n${n}`,
    title: '',
    body: '',
    pinned: false,
    blockIds: [],
    createdAt: `2026-10-0${n % 9 || 1}T10:00:00.000Z`,
    updatedAt: `2026-10-0${n % 9 || 1}T10:00:00.000Z`,
    deletedAt: null,
    folderId: null,
    ...p
  }
}

describe('tags and links', () => {
  it('extracts hashtags but not headings or code', () => {
    const body = '# Heading\nLearn #English and #Backend/nest today #english\n`#notatag` ```\n#alsonot\n```'
    expect(extractTags(body)).toEqual(['english', 'backend/nest'])
  })

  it('handles Turkish letters in tags', () => {
    expect(extractTags('#İngilizce #çalışma issue #12')).toEqual(['ingilizce', 'çalışma'])
  })

  it('extracts wiki links with optional labels, once per title', () => {
    expect(extractLinks('See [[Series list]] and [[series list|the list]] and [[Other]]')).toEqual(['Series list', 'Other'])
  })
})

describe('titles and previews', () => {
  it('falls back to the first line of the body', () => {
    expect(noteTitle({ title: '', body: '\n## Weekly plan\nmore' }, U)).toBe('Weekly plan')
    expect(noteTitle({ title: '  ', body: '' }, U)).toBe(U)
  })

  it('strips Markdown from the excerpt', () => {
    expect(noteExcerpt('# Title\n- [x] **done** item\n[link](https://x.y) and [[Note|label]]')).toBe(
      'Title done item link and label'
    )
  })

  it('counts words including Turkish ones', () => {
    expect(countWords("Bugün İngilizce çalıştım, it's fine")).toBe(5)
  })
})

describe('tasks', () => {
  const body = '- [ ] one\n- [x] two\n```\n- [ ] in code\n```\n* [ ] three\n> 1. [ ] quoted'

  it('counts progress outside code blocks', () => {
    expect(taskProgress(body)).toEqual({ done: 1, total: 4 })
  })

  it('toggles the n-th task, skipping code blocks', () => {
    expect(toggleTask(body, 2)).toBe('- [ ] one\n- [x] two\n```\n- [ ] in code\n```\n* [x] three\n> 1. [ ] quoted')
    expect(toggleTask(body, 3)).toContain('> 1. [x] quoted')
    expect(toggleTask(body, 1)).toContain('- [ ] two')
  })
})

describe('search', () => {
  const a = note({ title: 'Dizi listesi', body: 'Young Sheldon #english' })
  const b = note({ title: 'Backend', body: 'NestJS dizi enjeksiyonu #backend', pinned: true })
  const c = note({ title: 'Çöp', body: 'dizi', deletedAt: '2026-10-03T00:00:00.000Z' })
  const notes = [a, b, c]

  it('requires every word, ignores accents and case, ranks title hits higher', () => {
    expect(searchNotes(notes, { query: 'DIZI', untitled: U }).map((x) => x.id)).toEqual([b.id, a.id, c.id])
    expect(searchNotes(notes, { query: 'dizi sheldon', untitled: U }).map((x) => x.id)).toEqual([a.id])
    expect(searchNotes(notes, { query: 'cop', untitled: U }).map((x) => x.id)).toEqual([c.id])
    // "ı" and "i" are the same letter for search, whatever the keyboard produced
    expect(searchNotes(notes, { query: 'dızı', untitled: U }).map((x) => x.id)).toEqual([b.id, a.id, c.id])
  })

  it('filters by tag and keeps pinned notes first', () => {
    expect(searchNotes(notes, { tag: 'english', untitled: U }).map((x) => x.id)).toEqual([a.id])
    expect(searchNotes(notes, { untitled: U, sort: 'title' })[0].id).toBe(b.id)
  })

  it('counts tags of active notes only', () => {
    expect(tagCounts([...notes, note({ body: '#english', deletedAt: '2026-10-03T00:00:00.000Z' })])).toEqual([
      { tag: 'backend', count: 1 },
      { tag: 'english', count: 1 }
    ])
  })

  it('finds backlinks by title', () => {
    const target = note({ title: 'Series list' })
    const from = note({ body: 'see [[series list]]' })
    expect(backlinks([target, from, a], target, U).map((x) => x.id)).toEqual([from.id])
  })
})

describe('files', () => {
  it('makes safe, unique file names', () => {
    const taken = new Set<string>()
    expect(noteFileName('A/B: c?', taken)).toBe('A B c.md')
    expect(noteFileName('a b c', taken)).toBe('a b c 2.md')
    expect(noteFileName('   ', taken)).toBe('Untitled.md')
  })

  it('writes front matter with tags', () => {
    const md = noteMarkdown(note({ title: 'Plan "x"', body: 'text #english' }), U)
    expect(md).toContain('title: "Plan \'x\'"')
    expect(md).toContain('tags: [ritim-note, english]')
    expect(md.endsWith('text #english\n')).toBe(true)
  })
})

describe('normalize', () => {
  it('keeps valid notes, drops broken and duplicate ones', () => {
    const d = normalizeData(
      {
        notes: [
          { id: 'a', title: 'x', body: 'y', blockIds: ['b1', 'b1', 3], createdAt: '2026-10-03T10:00:00.000Z' },
          { id: 'a', title: 'dup' },
          { title: 'no id' },
          { id: 'c', deletedAt: 'not a date' }
        ]
      },
      'en'
    )
    expect(d.notes.map((x) => x.id)).toEqual(['a', 'c'])
    expect(d.notes[0]).toMatchObject({ blockIds: ['b1'], updatedAt: '2026-10-03T10:00:00.000Z', pinned: false })
    expect(d.notes[1].deletedAt).toBeNull()
  })
})

describe('folders', () => {
  const folders = [
    { id: 'en', name: 'English', parentId: null },
    { id: 'gr', name: 'Grammar', parentId: 'en' },
    { id: 'be', name: 'Backend', parentId: null }
  ]

  it('builds a sorted tree with counts that include sub-folders', () => {
    const notes = [note({ folderId: 'gr' }), note({ folderId: 'en' }), note({ folderId: 'gr', deletedAt: '2026-10-03T00:00:00.000Z' })]
    const tree = folderTree(folders, notes)
    expect(tree.map((n) => [n.folder.name, n.count])).toEqual([
      ['Backend', 0],
      ['English', 2]
    ])
    expect(tree[1].children.map((n) => [n.folder.name, n.count, n.depth])).toEqual([['Grammar', 1, 1]])
  })

  it('finds descendants and paths, and refuses moves that create cycles', () => {
    expect([...folderAndDescendants(folders, 'en')].sort()).toEqual(['en', 'gr'])
    expect(folderPath(folders, 'gr').map((f) => f.name)).toEqual(['English', 'Grammar'])
    expect(canMoveFolder(folders, 'en', 'gr')).toBe(false)
    expect(canMoveFolder(folders, 'gr', 'be')).toBe(true)
    expect(canMoveFolder(folders, 'gr', null)).toBe(true)
  })

  it('moves notes and sub-folders up when a folder is deleted', () => {
    const d = normalizeData({ noteFolders: folders, notes: [{ id: 'x', folderId: 'en' }, { id: 'y', folderId: 'gr' }] }, 'en')
    const after = deleteFolder(d, 'en')
    expect(after.noteFolders.map((f) => [f.id, f.parentId])).toEqual([
      ['gr', null],
      ['be', null]
    ])
    expect(after.notes.map((n) => n.folderId)).toEqual([null, 'gr'])
  })

  it('repairs broken folder data on load', () => {
    const d = normalizeData(
      {
        noteFolders: [
          { id: 'a', name: 'A', parentId: 'b' },
          { id: 'b', name: 'B', parentId: 'a' },
          { id: 'c', name: 'C', parentId: 'missing' }
        ],
        notes: [{ id: 'n', folderId: 'gone' }]
      },
      'en'
    )
    expect(d.noteFolders.find((f) => f.id === 'c')!.parentId).toBeNull()
    expect(d.noteFolders.some((f) => f.parentId === null && (f.id === 'a' || f.id === 'b'))).toBe(true)
    expect(d.notes[0].folderId).toBeNull()
  })
})

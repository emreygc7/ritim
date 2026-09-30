import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Page } from '@shared/api'
import { translator, type T } from '@shared/i18n'
import type { AppData, Category } from '@shared/types'

interface Ctx {
  data: AppData
  /** Apply a change and persist it. */
  update: (fn: (d: AppData) => AppData) => void
  t: T
  now: number
  page: Page
  setPage: (p: Page) => void
  dataPath: string
  canAutostart: boolean
  category: (id: string) => Category | undefined
}

const StoreContext = createContext<Ctx | null>(null)

export function useStore(): Ctx {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}

/** Ticks every 15 seconds so countdowns stay fresh. `offset` is only non-zero for screenshots. */
function useNow(offset: number): number {
  const [now, setNow] = useState(Date.now() + offset)
  useEffect(() => {
    setNow(Date.now() + offset)
    const id = setInterval(() => setNow(Date.now() + offset), 15_000)
    return () => clearInterval(id)
  }, [offset])
  return now
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<AppData | null>(null)
  const dataRef = useRef<AppData | null>(null)
  const setData = useCallback((d: AppData) => {
    dataRef.current = d
    setDataState(d)
  }, [])
  const [meta, setMeta] = useState({ dataPath: '', canAutostart: false })
  const [clockOffset, setClockOffset] = useState(0)
  const [page, setPage] = useState<Page>('today')
  const now = useNow(clockOffset)

  useEffect(() => {
    window.ritim.getInitial().then((init) => {
      setData(init.data)
      setMeta({ dataPath: init.dataPath, canAutostart: init.canAutostart })
      setClockOffset(init.clockOffsetMs)
    })
    const offData = window.ritim.onDataChanged(setData)
    const offNav = window.ritim.onNavigate(setPage)
    return () => {
      offData()
      offNav()
    }
  }, [setData])

  const update = useCallback(
    (fn: (d: AppData) => AppData) => {
      const prev = dataRef.current
      if (!prev) return
      const next = fn(prev)
      setData(next)
      window.ritim.save(next).catch((err: unknown) => console.error('Save failed:', err))
    },
    [setData]
  )

  const value = useMemo<Ctx | null>(() => {
    if (!data) return null
    const cats = new Map(data.categories.map((c) => [c.id, c]))
    return {
      data,
      update,
      t: translator(data.settings.lang),
      now,
      page,
      setPage,
      ...meta,
      category: (id: string) => cats.get(id)
    }
  }, [data, update, now, page, meta])

  useEffect(() => {
    if (data) document.documentElement.lang = data.settings.lang
  }, [data?.settings.lang])

  if (!value) return null
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

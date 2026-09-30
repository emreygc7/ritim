import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FocusTimer } from './focus'

describe('FocusTimer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('alternates focus and break, counting rounds, until stopped', () => {
    const ends: string[] = []
    const changes: unknown[] = []
    const timer = new FocusTimer({
      minutes: () => ({ focus: 25, rest: 5 }),
      onPhaseEnd: (ended, next) => ends.push(`${ended}->${next.phase}:${next.minutes}`),
      onChange: (s) => changes.push(s)
    })
    timer.start()
    expect(timer.current).toMatchObject({ phase: 'focus', cycle: 1, minutes: 25 })

    vi.advanceTimersByTime(25 * 60_000)
    expect(timer.current).toMatchObject({ phase: 'break', cycle: 1 })
    vi.advanceTimersByTime(5 * 60_000)
    expect(timer.current).toMatchObject({ phase: 'focus', cycle: 2 })
    expect(ends).toEqual(['focus->break:5', 'break->focus:25'])

    timer.stop()
    expect(timer.current).toBeNull()
    vi.advanceTimersByTime(60 * 60_000)
    expect(ends).toHaveLength(2)
    expect(changes.at(-1)).toBeNull()
  })
})

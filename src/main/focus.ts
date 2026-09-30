import type { FocusState } from '@shared/api'

/**
 * Pomodoro-style focus timer. It lives in the main process so it keeps exact
 * time and notifies even when the window is hidden (renderer timers throttle).
 * Focus and break periods alternate until stopped.
 */
export class FocusTimer {
  private state: FocusState = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly opts: {
      minutes: () => { focus: number; rest: number }
      onPhaseEnd: (ended: 'focus' | 'break', next: { phase: 'focus' | 'break'; minutes: number }) => void
      onChange: (s: FocusState) => void
    }
  ) {}

  get current(): FocusState {
    return this.state
  }

  start(): void {
    this.begin('focus', 1)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.state = null
    this.opts.onChange(this.state)
  }

  private begin(phase: 'focus' | 'break', cycle: number): void {
    if (this.timer) clearTimeout(this.timer)
    const { focus, rest } = this.opts.minutes()
    const minutes = phase === 'focus' ? focus : rest
    const endsAt = Date.now() + minutes * 60_000
    this.state = { phase, endsAt, cycle, minutes }
    this.timer = setTimeout(() => {
      const nextPhase = phase === 'focus' ? 'break' : 'focus'
      const nextMinutes = nextPhase === 'focus' ? this.opts.minutes().focus : this.opts.minutes().rest
      this.opts.onPhaseEnd(phase, { phase: nextPhase, minutes: nextMinutes })
      this.begin(nextPhase, phase === 'break' ? cycle + 1 : cycle)
    }, endsAt - Date.now())
    this.opts.onChange(this.state)
  }
}

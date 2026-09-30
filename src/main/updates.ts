import { app } from 'electron'
import { compareVersions } from '@shared/version'
import type { UpdateInfo } from '@shared/api'
import pkg from '../../package.json'

const DAY_MS = 24 * 3_600_000

/** "owner/repo" from package.json's repository field, or null while it is a placeholder. */
export function githubRepo(): string | null {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository as { url?: string } | undefined)?.url
  const m = /github(?:\.com[/:]|:)([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(repo ?? '')
  return m && !m[1].startsWith('your-') ? `${m[1]}/${m[2]}` : null
}

/**
 * Checks GitHub Releases for a newer version once a day. It only informs:
 * the user downloads the new package, which works for every install type.
 */
export class UpdateChecker {
  info: UpdateInfo = { current: app.getVersion(), latest: null, url: null, checked: false }
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly enabled: () => boolean,
    private readonly onNewVersion: (info: UpdateInfo) => void
  ) {}

  start(): void {
    void this.check()
    this.timer = setInterval(() => void this.check(), DAY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async check(): Promise<UpdateInfo> {
    const repo = githubRepo()
    if (!repo || !this.enabled()) return this.info
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000)
      })
      if (!res.ok) return this.info
      this.info = { ...this.info, checked: true }
      const rel = (await res.json()) as { tag_name?: string; html_url?: string }
      if (rel.tag_name && compareVersions(rel.tag_name, this.info.current) > 0) {
        const isNew = this.info.latest !== rel.tag_name
        this.info = { ...this.info, latest: rel.tag_name, url: rel.html_url ?? null }
        if (isNew) this.onNewVersion(this.info)
      }
    } catch (err) {
      console.error('Update check failed:', err)
    }
    return this.info
  }
}

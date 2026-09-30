import type { Page } from '@shared/api'
import { Icon, type IconName } from './components/Icon'
import { Onboarding } from './pages/Onboarding'
import { SettingsPage } from './pages/Settings'
import { StatsPage } from './pages/Stats'
import { TodayPage } from './pages/Today'
import { WeekPage } from './pages/Week'
import { useStore } from './store'

const NAV: { page: Page; icon: IconName; label: 'nav.today' | 'nav.week' | 'nav.stats' | 'nav.settings' }[] = [
  { page: 'today', icon: 'today', label: 'nav.today' },
  { page: 'week', icon: 'week', label: 'nav.week' },
  { page: 'stats', icon: 'stats', label: 'nav.stats' },
  { page: 'settings', icon: 'settings', label: 'nav.settings' }
]

export function App() {
  const { data, page, setPage, t, now } = useStore()
  const muted = !!data.settings.dndUntil && Date.parse(data.settings.dndUntil) > now

  if (!data.onboarded) return <Onboarding />

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {t('appName')}
        </div>
        {NAV.map((n) => (
          <button
            key={n.page}
            className={`nav-item${page === n.page ? ' active' : ''}`}
            onClick={() => setPage(n.page)}
            aria-current={page === n.page ? 'page' : undefined}
          >
            <Icon name={n.icon} />
            {t(n.label)}
          </button>
        ))}
        {muted && (
          <button className="nav-muted" onClick={() => setPage('settings')}>
            <Icon name="bellOff" size={16} />
            {t('settings.dndActive', {
              t: new Date(data.settings.dndUntil!).toLocaleTimeString(data.settings.lang, {
                hour: '2-digit',
                minute: '2-digit'
              })
            })}
          </button>
        )}
      </nav>
      <main className="content">
        {page === 'today' && <TodayPage />}
        {page === 'week' && <WeekPage />}
        {page === 'stats' && <StatsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

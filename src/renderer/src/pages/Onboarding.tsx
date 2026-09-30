import { useState } from 'react'
import { sampleData } from '@shared/sample'
import logo from '../assets/logo.png'
import { useStore } from '../store'

export function Onboarding() {
  const { data, update, t } = useStore()
  const [failed, setFailed] = useState(false)
  const lang = data.settings.lang

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <img className="brand-mark big" src={logo} alt="" aria-hidden="true" />
        <h1>{t('onboard.title')}</h1>
        <p>{t('onboard.body')}</p>
        <div className="onboarding-actions">
          <button className="btn primary" onClick={() => update((d) => ({ ...sampleData(lang), settings: d.settings }))}>
            {t('onboard.sample')}
          </button>
          <button className="btn" onClick={() => update((d) => ({ ...d, onboarded: true }))}>
            {t('onboard.empty')}
          </button>
          <button
            className="btn"
            onClick={async () => setFailed((await window.ritim.importData()) === 'error')}
          >
            {t('onboard.import')}
          </button>
        </div>
        {failed && <p className="error">{t('settings.importFailed')}</p>}
        <div className="lang-switch">
          {(['tr', 'en'] as const).map((l) => (
            <button
              key={l}
              className={`link${l === lang ? ' active' : ''}`}
              onClick={() => update((d) => ({ ...d, settings: { ...d.settings, lang: l } }))}
            >
              {l === 'tr' ? 'Türkçe' : 'English'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

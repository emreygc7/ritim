import { emptyData } from './normalize'
import type { AppData, Block, Category, Lang, Weekday } from './types'

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]
const EVERY_DAY: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

/** A generic, balanced example week that new users can start from and edit. */
export function sampleData(lang: Lang): AppData {
  const tr = lang === 'tr'
  const L = (t: string, e: string): string => (tr ? t : e)

  const categories: Category[] = [
    { id: 'focus', name: L('Derin çalışma', 'Deep work'), color: '#2a78d6', track: true },
    { id: 'learn', name: L('Öğrenme', 'Learning'), color: '#eb6834', track: true },
    { id: 'admin', name: L('İletişim & işler', 'Admin & email'), color: '#1baf7a', track: true },
    { id: 'health', name: L('Spor', 'Exercise'), color: '#eda100', track: true },
    { id: 'break', name: L('Mola & yemek', 'Breaks & meals'), color: '#8b8d98', track: false },
    { id: 'life', name: L('Kişisel zaman', 'Personal time'), color: '#e87ba4', track: false },
    { id: 'sleep', name: L('Uyku', 'Sleep'), color: '#4a3aa7', track: false }
  ]

  let n = 0
  const b = (title: string, categoryId: string, start: string, end: string, days: Weekday[], note?: string): Block => ({
    id: `sample-${++n}`,
    title,
    categoryId,
    start,
    end,
    days,
    reminders: null,
    ...(note ? { note } : {})
  })

  const blocks: Block[] = [
    b(L('Kahvaltı', 'Breakfast'), 'break', '07:30', '08:15', WEEKDAYS),
    b(L('Günü planla', 'Plan the day'), 'admin', '08:15', '08:30', WEEKDAYS, L('Bugünün 3 önceliğini yaz.', 'Write down the 3 priorities for today.')),
    b(L('Derin çalışma', 'Deep work'), 'focus', '08:30', '10:30', WEEKDAYS, L('Bildirimleri kapat, tek işe odaklan.', 'Notifications off, one task only.')),
    b(L('Mola', 'Break'), 'break', '10:30', '10:45', WEEKDAYS),
    b(L('Öğrenme', 'Learning'), 'learn', '10:45', '12:00', WEEKDAYS),
    b(L('Öğle yemeği', 'Lunch'), 'break', '12:00', '13:00', WEEKDAYS),
    b(L('E-posta ve toplantılar', 'Email & meetings'), 'admin', '13:00', '14:00', WEEKDAYS),
    b(L('Derin çalışma 2', 'Deep work 2'), 'focus', '14:00', '16:00', WEEKDAYS),
    b(L('Spor', 'Workout'), 'health', '17:00', '18:00', [1, 3, 5]),
    b(L('Yürüyüş', 'Walk'), 'health', '17:00', '17:45', [2, 4]),
    b(L('Kişisel zaman', 'Personal time'), 'life', '19:00', '23:00', EVERY_DAY),
    b(L('Haftalık değerlendirme', 'Weekly review'), 'admin', '18:00', '18:30', [7], L('Ne iyi gitti? Gelecek hafta neyi değiştireceğim?', 'What went well? What will I change next week?')),
    b(L('Uyku', 'Sleep'), 'sleep', '23:30', '07:30', EVERY_DAY)
  ]

  return { ...emptyData(lang), onboarded: true, categories, blocks }
}

const paths = {
  today: 'M12 7v5l3 2 M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
  week: 'M4 5h16v15H4z M4 10h16 M9 5V3 M15 5V3 M9 10v10 M15 10v10',
  stats: 'M5 20V11 M12 20V4 M19 20v-6',
  settings:
    'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  half: 'M12 3a9 9 0 1 0 0 18z M12 3a9 9 0 0 1 0 18',
  x: 'M6 6l12 12 M18 6L6 18',
  note: 'M5 4h14v16H5z M8.5 9h7 M8.5 13h7 M8.5 17h4',
  eyeOff: 'M3 3l18 18 M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a9.6 9.6 0 0 1-2.6 3.5 M6.6 6.6C4.4 8 3 10.4 3 12c0 2 4 7 9 7a9 9 0 0 0 4.4-1.2 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 7 2 7H4s2-2 2-7 M10 20a2 2 0 0 0 4 0',
  bellOff: 'M3 3l18 18 M18 13.5V9a6 6 0 0 0-9.3-5 M6.3 6.3A6 6 0 0 0 6 9c0 5-2 7-2 7h12 M10 20a2 2 0 0 0 4 0',
  flame: 'M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 1.5-4s.5 2 2 2.5C10 8 12 3 12 3z',
  notes: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h5',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M20 20l-4-4',
  pin: 'M9 4h6 M10 4v6l-3 4h10l-3-4V4 M12 14v6',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  restore: 'M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  keyboard: 'M3 6h18v12H3z M7 10h1 M11 10h1 M15 10h1 M7 14h10',
  folder: 'M3 6h6l2 2h10v11H3z',
  folderPlus: 'M3 6h6l2 2h10v11H3z M12 11v5 M9.5 13.5h5',
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13'
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  )
}

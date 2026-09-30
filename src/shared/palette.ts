/**
 * Category color presets, in fixed order. Validated for colorblind separation
 * (adjacent pairs) with the dataviz palette validator. New categories take the
 * next unused preset instead of a generated hue.
 */
export const PRESET_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#8b8d98' // neutral gray
] as const

export function nextPresetColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  return PRESET_COLORS.find((c) => !taken.has(c)) ?? PRESET_COLORS[PRESET_COLORS.length - 1]
}

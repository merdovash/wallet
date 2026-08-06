import { resolveTheme, readThemeMode } from './theme'

export interface ChartTheme {
  grid: string
  tick: string
  growthTick: string
  primaryLine: string
  growthLine: string
}

export function getChartTheme(isDark?: boolean): ChartTheme {
  const dark = isDark ?? resolveTheme(readThemeMode()) === 'dark'
  return {
    grid: dark ? '#334155' : '#e2e8f0',
    tick: dark ? '#94a3b8' : '#64748b',
    growthTick: dark ? '#34d399' : '#059669',
    primaryLine: '#2563eb',
    growthLine: dark ? '#34d399' : '#059669',
  }
}

import { resolveTheme, readThemeMode } from './theme'

export interface ChartTheme {
  grid: string
  tick: string
  growthTick: string
  primaryLine: string
  growthLine: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

export function getChartTheme(isDark?: boolean): ChartTheme {
  const dark = isDark ?? resolveTheme(readThemeMode()) === 'dark'
  return {
    grid: dark ? '#334155' : '#e2e8f0',
    tick: dark ? '#94a3b8' : '#64748b',
    growthTick: dark ? '#6ee7b7' : '#059669',
    primaryLine: dark ? '#60a5fa' : '#2563eb',
    growthLine: dark ? '#6ee7b7' : '#059669',
    tooltipBg: dark ? '#1e293b' : '#ffffff',
    tooltipBorder: dark ? '#475569' : '#e2e8f0',
    tooltipText: dark ? '#e2e8f0' : '#0f172a',
  }
}

export function chartTooltipStyles(theme: ChartTheme) {
  return {
    contentStyle: {
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      borderRadius: 8,
      color: theme.tooltipText,
    },
    labelStyle: { color: theme.tooltipText },
    itemStyle: { color: theme.tooltipText },
  }
}

import { resolveTheme, readThemeMode } from './theme'

export interface ChartTheme {
  grid: string
  tick: string
  growthTick: string
  primaryLine: string
  growthLine: string
  /** Dot face fill — white in light mode, dark slate in dark mode. */
  dotFill: string
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
    dotFill: dark ? '#0f172a' : '#ffffff',
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

/** Line chart dots: colored stroke, theme-aware face (not Recharts default white). */
export function chartDot(theme: ChartTheme, stroke: string, r = 3) {
  return { r, fill: theme.dotFill, stroke, strokeWidth: 2 }
}

export function chartActiveDot(theme: ChartTheme, stroke: string, r = 6) {
  return { r, fill: theme.dotFill, stroke, strokeWidth: 2 }
}

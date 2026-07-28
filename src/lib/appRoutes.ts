import type { AppSection } from '../types/wallet'

export const APP_SECTION_PATHS: Record<AppSection, string> = {
  dashboard: '/',
  checkins: '/checkins',
  accounts: '/accounts',
  types: '/types',
  currencies: '/currencies',
  float: '/float',
  settings: '/settings',
}

const PATH_TO_SECTION = new Map(
  (Object.entries(APP_SECTION_PATHS) as [AppSection, string][]).map(([section, path]) => [
    path,
    section,
  ]),
)

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

export function pathToSection(pathname: string): AppSection {
  return PATH_TO_SECTION.get(normalizePath(pathname)) ?? 'dashboard'
}

export function sectionToPath(section: AppSection): string {
  return APP_SECTION_PATHS[section]
}

export function isAppSectionPath(pathname: string): boolean {
  return PATH_TO_SECTION.has(normalizePath(pathname))
}

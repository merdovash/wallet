import { useCallback, useEffect, useState } from 'react'
import type { AppSection } from '../types/wallet'
import { isAppSectionPath, pathToSection, sectionToPath } from './appRoutes'

function readSectionFromLocation(): AppSection {
  return pathToSection(window.location.pathname)
}

/** Текущая вкладка синхронизирована с URL (History API). */
export function useAppSection(): [AppSection, (section: AppSection) => void] {
  const [section, setSectionState] = useState(readSectionFromLocation)

  useEffect(() => {
    const raw = window.location.pathname
    if (!isAppSectionPath(raw)) {
      window.history.replaceState(null, '', '/')
      setSectionState('dashboard')
      return
    }
    const expected = sectionToPath(pathToSection(raw))
    if (raw !== expected) {
      window.history.replaceState(null, '', expected)
    }
  }, [])

  useEffect(() => {
    const onPopState = () => setSectionState(readSectionFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const setSection = useCallback((next: AppSection) => {
    const path = sectionToPath(next)
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    setSectionState(next)
  }, [])

  return [section, setSection]
}

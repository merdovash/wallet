import { useCallback, useEffect, useState } from 'react'
import { AccountsPanel } from './components/accounts/AccountsPanel'
import { Dashboard } from './components/dashboard/Dashboard'
import { Sidebar } from './components/layout/Sidebar'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { FloatPanel } from './components/float/FloatPanel'
import { SnapshotsPanel } from './components/snapshots/SnapshotsPanel'
import { EmptyState } from './components/ui/FormControls'
import { snapshotDates } from './engine/growthEngine'
import { todayIsoDate } from './lib/format'
import { useAppSection } from './lib/useAppSection'
import { useAuthStore } from './store/authStore'
import { useRatesStore } from './store/ratesStore'
import { useWalletStore } from './store/walletStore'
import type { AppSection } from './types/wallet'

const SIDEBAR_STORAGE_KEY = 'wallet-sidebar-collapsed'

export default function App() {
  const [section, setSection] = useAppSection()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [focusAccountId, setFocusAccountId] = useState<string | null>(null)
  const user = useAuthStore((s) => s.user)
  const authInitialized = useAuthStore((s) => s.initialized)
  const initAuth = useAuthStore((s) => s.init)
  const snapshots = useWalletStore((s) => s.snapshots)
  const loadAll = useWalletStore((s) => s.loadAll)
  const clearWallet = useWalletStore((s) => s.clear)
  const walletLoaded = useWalletStore((s) => s.loaded)
  const walletLoading = useWalletStore((s) => s.loading)
  const walletError = useWalletStore((s) => s.error)
  const ensureRates = useRatesStore((s) => s.ensureRates)

  useEffect(() => {
    void initAuth()
  }, [initAuth])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!authInitialized) return
    if (user) {
      void loadAll()
    } else {
      clearWallet()
    }
  }, [authInitialized, user, loadAll, clearWallet])

  useEffect(() => {
    if (!walletLoaded) return
    void ensureRates([...snapshotDates(snapshots), todayIsoDate()])
  }, [snapshots, ensureRates, walletLoaded])

  const openAccount = useCallback(
    (accountId: string) => {
      setFocusAccountId(accountId)
      setSection('accounts')
    },
    [setSection],
  )

  const clearFocus = useCallback(() => setFocusAccountId(null), [])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Sidebar
          active={section}
          onChange={setSection}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
        <main
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] transition-[margin] duration-200 sm:p-4 md:p-6 md:pb-6 ${
            sidebarCollapsed ? 'md:ml-14' : 'md:ml-56'
          }`}
        >
          {!authInitialized || (user && walletLoading && !walletLoaded) ? (
            <p className="text-sm text-slate-500">Загрузка…</p>
          ) : !user ? (
            <EmptyState
              title="Войдите в аккаунт"
              description="Войдите или зарегистрируйтесь в меню слева."
            />
          ) : walletError ? (
            <EmptyState title="Ошибка загрузки" description={walletError} />
          ) : (
            <SectionContent
              section={section}
              onOpenAccount={openAccount}
              focusAccountId={focusAccountId}
              onFocusConsumed={clearFocus}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function SectionContent({
  section,
  onOpenAccount,
  focusAccountId,
  onFocusConsumed,
}: {
  section: AppSection
  onOpenAccount: (accountId: string) => void
  focusAccountId: string | null
  onFocusConsumed: () => void
}) {
  switch (section) {
    case 'dashboard':
      return <Dashboard onOpenAccount={onOpenAccount} />
    case 'checkins':
      return <SnapshotsPanel />
    case 'accounts':
      return (
        <AccountsPanel focusAccountId={focusAccountId} onFocusConsumed={onFocusConsumed} />
      )
    case 'float':
      return <FloatPanel />
    case 'settings':
      return <SettingsPanel />
  }
}

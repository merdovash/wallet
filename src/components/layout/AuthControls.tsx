import { useAuthStore } from '../../store/authStore'
import { dataQa } from '../../lib/dataQa'
import { Button } from '../ui/FormControls'

/** Portal apex URL for SSO login. */
function portalLoginUrl(): string {
  const base = (import.meta.env.VITE_PORTAL_URL as string | undefined)?.replace(/\/$/, '')
  if (!base) return ''
  const returnTo = typeof window !== 'undefined' ? window.location.href : ''
  const url = new URL(base)
  if (returnTo) url.searchParams.set('return', returnTo)
  return url.toString()
}

export function AuthControls() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const logout = useAuthStore((s) => s.logout)
  const portalUrl = portalLoginUrl()

  if (user) {
    return (
      <div className="space-y-2" {...dataQa('auth')}>
        <p
          className="truncate px-1 text-xs text-slate-500 dark:text-slate-400"
          title={user.email}
          {...dataQa('auth-email')}
        >
          {user.email}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          onClick={() => void logout()}
          className="w-full"
          dataQa="auth-logout"
        >
          Выйти
        </Button>
      </div>
    )
  }

  if (portalUrl) {
    return (
      <a
        href={portalUrl}
        className="flex w-full items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
        {...dataQa('auth-login')}
      >
        Войти через Portal
      </a>
    )
  }

  return (
    <p className="px-1 text-xs text-slate-500 dark:text-slate-400" {...dataQa('auth-portal-missing')}>
      Задайте VITE_PORTAL_URL для входа через хаб-портал.
    </p>
  )
}

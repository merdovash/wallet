import { useAuthStore } from '../../store/authStore'
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
      <div className="space-y-2">
        <p className="truncate px-1 text-xs text-slate-500" title={user.email}>
          {user.email}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          onClick={() => void logout()}
          className="w-full"
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
        className="flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Войти через Portal
      </a>
    )
  }

  return (
    <p className="px-1 text-xs text-slate-500">
      Задайте VITE_PORTAL_URL для входа через хаб-портал.
    </p>
  )
}

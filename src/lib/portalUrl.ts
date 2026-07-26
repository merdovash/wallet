/** Apex URL of the current site without the 3rd-level subdomain. */
export function portalHomeUrl(): string {
  const fromEnv = (import.meta.env.VITE_PORTAL_URL as string | undefined)?.replace(/\/$/, '')
  if (typeof window === 'undefined') return fromEnv || '/'

  const { protocol, hostname, port } = window.location
  if (hostname !== 'localhost' && !isIpHost(hostname)) {
    const parts = hostname.split('.')
    if (parts.length >= 3) {
      const apex = parts.slice(1).join('.')
      return `${protocol}//${apex}${port ? `:${port}` : ''}`
    }
  }

  return fromEnv || window.location.origin
}

function isIpHost(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')
}

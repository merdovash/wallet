import type { Plugin } from 'vite'
import { handleAuthApi } from './server/auth/api'
import { handleRatesApi } from './server/rates/api'
import { handleWalletApi } from './server/wallet/api'
import { loadEnvFile } from './server/db/pool'

function apiMiddleware() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith('/api/')) {
      next()
      return
    }

    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname
    loadEnvFile()

    const run = async () => {
      if (pathname.startsWith('/api/auth')) {
        return handleAuthApi(req, res, pathname)
      }
      if (pathname.startsWith('/api/wallet')) {
        return handleWalletApi(req, res, pathname)
      }
      if (pathname.startsWith('/api/rates')) {
        return handleRatesApi(req, res, pathname)
      }
      return false
    }

    run()
      .then((handled) => {
        if (!handled) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Not found' }))
        }
      })
      .catch((err: unknown) => {
        console.error('[api]', err)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Internal error',
          }),
        )
      })
  }
}

export function apiPlugin(): Plugin {
  return {
    name: 'wallet-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware())
    },
  }
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import { getUserFromRequest } from '../auth/session'
import { matchPath, readJsonBody, sendJson } from '../http/util'
import * as store from './store'

async function requireUser(req: IncomingMessage, res: ServerResponse) {
  const user = await getUserFromRequest(req)
  if (!user) {
    sendJson(res, 401, { error: 'Требуется вход' })
    return null
  }
  return user
}

export async function handleWalletApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/wallet')) return false

  const method = req.method ?? 'GET'
  const user = await requireUser(req, res)
  if (!user) return true

  try {
    if (pathname === '/api/wallet' && method === 'GET') {
      sendJson(res, 200, await store.loadWalletBundle(user.id))
      return true
    }

    if (pathname === '/api/wallet/settings' && method === 'GET') {
      sendJson(res, 200, { settings: await store.ensureUserSettings(user.id) })
      return true
    }

    if (pathname === '/api/wallet/settings' && method === 'PATCH') {
      const body = await readJsonBody<{ baseCurrency?: string }>(req)
      if (!body.baseCurrency || !/^[A-Z]{3,8}$/i.test(body.baseCurrency)) {
        sendJson(res, 400, { error: 'Укажите baseCurrency' })
        return true
      }
      const settings = await store.updateSettings(user.id, body.baseCurrency.toUpperCase())
      sendJson(res, 200, { settings })
      return true
    }

    if (pathname === '/api/wallet/accounts' && method === 'GET') {
      sendJson(res, 200, { accounts: await store.listAccounts(user.id) })
      return true
    }

    if (pathname === '/api/wallet/accounts' && method === 'POST') {
      const body = await readJsonBody<{
        name?: string
        currency?: string
        color?: string
        sortOrder?: number
        kind?: store.DbAccountKind
        creditLimit?: number
        linkedAccountId?: string
      }>(req)
      if (!body.name?.trim() || !body.currency || !body.color) {
        sendJson(res, 400, { error: 'Нужны name, currency, color' })
        return true
      }
      const account = await store.createAccount(user.id, {
        name: body.name.trim(),
        currency: body.currency.toUpperCase(),
        color: body.color,
        sortOrder: body.sortOrder,
        kind: body.kind,
        creditLimit: body.creditLimit != null ? Number(body.creditLimit) : undefined,
        linkedAccountId: body.linkedAccountId,
      })
      sendJson(res, 201, { account })
      return true
    }

    if (pathname === '/api/wallet/accounts/order' && method === 'PUT') {
      const body = await readJsonBody<{ orderedIds?: string[] }>(req)
      if (!Array.isArray(body.orderedIds)) {
        sendJson(res, 400, { error: 'Нужен orderedIds' })
        return true
      }
      const accounts = await store.reorderAccounts(user.id, body.orderedIds)
      sendJson(res, 200, { accounts })
      return true
    }

    {
      const params = matchPath(pathname, '/api/wallet/accounts/:id')
      if (params) {
        if (method === 'PATCH') {
          const body = await readJsonBody<{
            name?: string
            currency?: string
            color?: string
            archived?: boolean
            sortOrder?: number
            kind?: store.DbAccountKind
            creditLimit?: number | null
            linkedAccountId?: string | null
          }>(req)
          const account = await store.updateAccount(user.id, params.id!, {
            name: body.name?.trim(),
            currency: body.currency?.toUpperCase(),
            color: body.color,
            archived: body.archived,
            sortOrder: body.sortOrder,
            kind: body.kind,
            creditLimit:
              body.creditLimit === undefined
                ? undefined
                : body.creditLimit == null
                  ? null
                  : Number(body.creditLimit),
            linkedAccountId: body.linkedAccountId,
          })
          if (!account) {
            sendJson(res, 404, { error: 'Счёт не найден' })
            return true
          }
          sendJson(res, 200, { account })
          return true
        }
        if (method === 'DELETE') {
          const ok = await store.deleteAccount(user.id, params.id!)
          if (!ok) {
            sendJson(res, 404, { error: 'Счёт не найден' })
            return true
          }
          sendJson(res, 200, { ok: true })
          return true
        }
      }
    }

    if (pathname === '/api/wallet/snapshots' && method === 'GET') {
      sendJson(res, 200, { snapshots: await store.listSnapshots(user.id) })
      return true
    }

    if (pathname === '/api/wallet/snapshots' && method === 'POST') {
      const body = await readJsonBody<{
        date?: string
        note?: string
        origin?: store.DbSnapshotOrigin
        lines?: Array<{ accountId: string; amount: number }>
      }>(req)
      if (!body.date || !Array.isArray(body.lines) || body.lines.length === 0) {
        sendJson(res, 400, { error: 'Нужны date и lines' })
        return true
      }
      const snapshot = await store.upsertSnapshot(user.id, {
        date: body.date,
        note: body.note,
        origin: body.origin,
        lines: body.lines.map((l) => ({
          accountId: l.accountId,
          amount: Number(l.amount),
        })),
      })
      sendJson(res, 201, { snapshot })
      return true
    }

    {
      const params = matchPath(pathname, '/api/wallet/snapshots/:id')
      if (params) {
        if (method === 'PATCH') {
          const body = await readJsonBody<{
            date?: string
            note?: string | null
            origin?: store.DbSnapshotOrigin
            lines?: Array<{ accountId: string; amount: number }>
          }>(req)
          const snapshot = await store.updateSnapshot(user.id, params.id!, {
            date: body.date,
            note: body.note,
            origin: body.origin,
            lines: body.lines?.map((l) => ({
              accountId: l.accountId,
              amount: Number(l.amount),
            })),
          })
          if (!snapshot) {
            sendJson(res, 404, { error: 'Чек-ин не найден' })
            return true
          }
          sendJson(res, 200, { snapshot })
          return true
        }
        if (method === 'DELETE') {
          const ok = await store.deleteSnapshot(user.id, params.id!)
          if (!ok) {
            sendJson(res, 404, { error: 'Чек-ин не найден' })
            return true
          }
          sendJson(res, 200, { ok: true })
          return true
        }
      }
    }

    if (pathname === '/api/wallet/transfers' && method === 'GET') {
      sendJson(res, 200, { transfers: await store.listTransfers(user.id) })
      return true
    }

    if (pathname === '/api/wallet/transfers' && method === 'POST') {
      const body = await readJsonBody<{
        date?: string
        fromAccountId?: string
        toAccountId?: string
        amount?: number
        note?: string
      }>(req)
      if (
        !body.date ||
        !body.fromAccountId ||
        !body.toAccountId ||
        body.amount == null ||
        !(Number(body.amount) > 0)
      ) {
        sendJson(res, 400, { error: 'Нужны date, fromAccountId, toAccountId, amount > 0' })
        return true
      }
      const transfer = await store.createTransfer(user.id, {
        date: body.date,
        fromAccountId: body.fromAccountId,
        toAccountId: body.toAccountId,
        amount: Number(body.amount),
        note: body.note,
      })
      sendJson(res, 201, { transfer })
      return true
    }

    {
      const params = matchPath(pathname, '/api/wallet/transfers/:id')
      if (params && method === 'DELETE') {
        const ok = await store.deleteTransfer(user.id, params.id!)
        if (!ok) {
          sendJson(res, 404, { error: 'Перевод не найден' })
          return true
        }
        sendJson(res, 200, { ok: true })
        return true
      }
    }

    if (pathname === '/api/wallet/import' && method === 'POST') {
      const body = await readJsonBody<{
        settings?: { baseCurrency?: string }
        accounts?: store.WalletBundle['accounts']
        snapshots?: store.WalletBundle['snapshots']
        transfers?: store.WalletBundle['transfers']
      }>(req)
      const bundle = await store.importWalletData(user.id, {
        settings: body.settings,
        accounts: body.accounts ?? [],
        snapshots: body.snapshots ?? [],
        transfers: body.transfers ?? [],
      })
      sendJson(res, 201, bundle)
      return true
    }

    sendJson(res, 404, { error: 'Not found' })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка API'
    const status = message.includes('уже есть') ? 409 : 400
    sendJson(res, status, { error: message })
    return true
  }
}

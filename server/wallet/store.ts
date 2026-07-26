import { getPool } from '../db/pool'

export type DbAccountKind = 'regular' | 'credit'

export interface DbAccount {
  id: string
  name: string
  currency: string
  color: string
  archived: boolean
  sortOrder: number
  kind: DbAccountKind
  creditLimit?: number
  linkedAccountId?: string
}

export interface DbSnapshotLine {
  accountId: string
  amount: number
}

export type DbSnapshotOrigin = 'manual' | 'transfer'

export interface DbSnapshot {
  id: string
  date: string
  note?: string
  origin: DbSnapshotOrigin
  lines: DbSnapshotLine[]
}

export interface DbTransfer {
  id: string
  date: string
  fromAccountId: string
  toAccountId: string
  amount: number
  note?: string
}

export interface DbSettings {
  baseCurrency: string
}

export interface WalletBundle {
  settings: DbSettings
  accounts: DbAccount[]
  snapshots: DbSnapshot[]
  transfers: DbTransfer[]
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

type AccountRow = {
  id: string
  name: string
  currency: string
  color: string
  archived: boolean
  sort_order: number
  kind: string
  credit_limit: number | string | null
  linked_account_id: string | null
}

const ACCOUNT_SELECT = `id, name, currency, color, archived, sort_order, kind, credit_limit, linked_account_id`

function mapAccount(row: AccountRow): DbAccount {
  const kind: DbAccountKind = row.kind === 'credit' ? 'credit' : 'regular'
  const account: DbAccount = {
    id: String(row.id),
    name: String(row.name),
    currency: String(row.currency),
    color: String(row.color),
    archived: Boolean(row.archived),
    sortOrder: num(row.sort_order),
    kind,
  }
  if (kind === 'credit') {
    if (row.credit_limit != null) account.creditLimit = num(row.credit_limit)
    if (row.linked_account_id) account.linkedAccountId = String(row.linked_account_id)
  }
  return account
}

async function assertLinkedAccount(
  userId: string,
  accountId: string,
  linkedAccountId: string | null | undefined,
): Promise<void> {
  if (!linkedAccountId) return
  if (linkedAccountId === accountId) {
    throw new Error('Связанный счёт не может совпадать с кредиткой')
  }
  const pool = getPool()
  const result = await pool.query<{ kind: string }>(
    `SELECT kind FROM wallet_accounts WHERE id = $1 AND user_id = $2`,
    [linkedAccountId, userId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('Связанный счёт не найден')
  if (row.kind === 'credit') throw new Error('Связанный счёт не может быть кредиткой')
}

export async function ensureUserSettings(userId: string): Promise<DbSettings> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO wallet_settings (user_id, base_currency)
     VALUES ($1, 'RUB')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )
  const result = await pool.query<{ base_currency: string }>(
    `SELECT base_currency FROM wallet_settings WHERE user_id = $1`,
    [userId],
  )
  return { baseCurrency: String(result.rows[0]?.base_currency ?? 'RUB') }
}

export async function updateSettings(
  userId: string,
  baseCurrency: string,
): Promise<DbSettings> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO wallet_settings (user_id, base_currency, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE
     SET base_currency = EXCLUDED.base_currency, updated_at = now()`,
    [userId, baseCurrency],
  )
  return { baseCurrency }
}

export async function listAccounts(userId: string): Promise<DbAccount[]> {
  const pool = getPool()
  const result = await pool.query<AccountRow>(
    `SELECT ${ACCOUNT_SELECT}
     FROM wallet_accounts
     WHERE user_id = $1
     ORDER BY sort_order ASC, name ASC`,
    [userId],
  )
  return result.rows.map(mapAccount)
}

export async function createAccount(
  userId: string,
  input: {
    name: string
    currency: string
    color: string
    sortOrder?: number
    kind?: DbAccountKind
    creditLimit?: number
    linkedAccountId?: string
  },
): Promise<DbAccount> {
  const kind: DbAccountKind = input.kind === 'credit' ? 'credit' : 'regular'
  if (kind === 'credit') {
    if (input.creditLimit == null || !(input.creditLimit > 0)) {
      throw new Error('Для кредитки нужен creditLimit > 0')
    }
    await assertLinkedAccount(userId, '', input.linkedAccountId)
  }

  const pool = getPool()
  let sortOrder = input.sortOrder
  if (sortOrder == null) {
    const max = await pool.query<{ m: number | null }>(
      `SELECT MAX(sort_order) AS m FROM wallet_accounts WHERE user_id = $1`,
      [userId],
    )
    sortOrder = (max.rows[0]?.m == null ? -1 : num(max.rows[0].m)) + 1
  }
  const result = await pool.query<AccountRow>(
    `INSERT INTO wallet_accounts
       (user_id, name, currency, color, sort_order, kind, credit_limit, linked_account_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${ACCOUNT_SELECT}`,
    [
      userId,
      input.name,
      input.currency,
      input.color,
      sortOrder,
      kind,
      kind === 'credit' ? input.creditLimit! : null,
      kind === 'credit' ? (input.linkedAccountId ?? null) : null,
    ],
  )
  return mapAccount(result.rows[0]!)
}

export async function updateAccount(
  userId: string,
  id: string,
  patch: Partial<{
    name: string
    currency: string
    color: string
    archived: boolean
    sortOrder: number
    kind: DbAccountKind
    creditLimit: number | null
    linkedAccountId: string | null
  }>,
): Promise<DbAccount | null> {
  const pool = getPool()
  const existing = await pool.query<AccountRow>(
    `SELECT ${ACCOUNT_SELECT} FROM wallet_accounts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  if (existing.rows.length === 0) return null

  const current = mapAccount(existing.rows[0]!)
  const nextKind: DbAccountKind =
    patch.kind === 'credit' || patch.kind === 'regular' ? patch.kind : current.kind

  let nextLimit: number | null =
    nextKind === 'credit' ? (current.creditLimit ?? null) : null
  if (nextKind === 'credit') {
    if (patch.creditLimit !== undefined) {
      nextLimit = patch.creditLimit
    }
    if (nextLimit == null || !(nextLimit > 0)) {
      throw new Error('Для кредитки нужен creditLimit > 0')
    }
  } else {
    nextLimit = null
  }

  let nextLinked: string | null =
    nextKind === 'credit' ? (current.linkedAccountId ?? null) : null
  if (nextKind === 'credit') {
    if (patch.linkedAccountId !== undefined) {
      nextLinked = patch.linkedAccountId
    }
    await assertLinkedAccount(userId, id, nextLinked)
  } else {
    nextLinked = null
  }

  const result = await pool.query<AccountRow>(
    `UPDATE wallet_accounts SET
       name = COALESCE($3, name),
       currency = COALESCE($4, currency),
       color = COALESCE($5, color),
       archived = COALESCE($6, archived),
       sort_order = COALESCE($7, sort_order),
       kind = $8,
       credit_limit = $9,
       linked_account_id = $10,
       updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${ACCOUNT_SELECT}`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.currency ?? null,
      patch.color ?? null,
      patch.archived ?? null,
      patch.sortOrder ?? null,
      nextKind,
      nextLimit,
      nextLinked,
    ],
  )
  return mapAccount(result.rows[0]!)
}

export async function deleteAccount(userId: string, id: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(
    `DELETE FROM wallet_accounts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  return result.rowCount > 0
}

export async function reorderAccounts(userId: string, orderedIds: string[]): Promise<DbAccount[]> {
  const pool = getPool()
  await pool.transaction(async (query) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await query(
        `UPDATE wallet_accounts SET sort_order = $3, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [orderedIds[i], userId, i],
      )
    }
  })
  return listAccounts(userId)
}

export async function listSnapshots(userId: string): Promise<DbSnapshot[]> {
  const pool = getPool()
  const snaps = await pool.query<{
    id: string
    snapshot_date: string
    note: string | null
    origin: string | null
  }>(
    `SELECT id, snapshot_date::text AS snapshot_date, note, origin
     FROM wallet_snapshots
     WHERE user_id = $1
     ORDER BY snapshot_date ASC`,
    [userId],
  )
  if (snaps.rows.length === 0) return []

  const bySnap = new Map<string, DbSnapshotLine[]>()
  for (const snap of snaps.rows) {
    const lines = await pool.query<{
      snapshot_id: string
      account_id: string
      amount: number
    }>(
      `SELECT snapshot_id, account_id, amount
       FROM wallet_snapshot_lines
       WHERE snapshot_id = $1`,
      [String(snap.id)],
    )
    bySnap.set(
      String(snap.id),
      lines.rows.map((row) => ({
        accountId: String(row.account_id),
        amount: num(row.amount),
      })),
    )
  }

  return snaps.rows.map((row) => ({
    id: String(row.id),
    date: String(row.snapshot_date).slice(0, 10),
    note: row.note ? String(row.note) : undefined,
    origin: row.origin === 'transfer' ? 'transfer' : 'manual',
    lines: bySnap.get(String(row.id)) ?? [],
  }))
}

async function replaceSnapshotLines(
  snapshotId: string,
  lines: DbSnapshotLine[],
  mode: 'replace' | 'merge',
): Promise<void> {
  const pool = getPool()
  await pool.transaction(async (query) => {
    if (mode === 'replace') {
      await query(`DELETE FROM wallet_snapshot_lines WHERE snapshot_id = $1`, [snapshotId])
    }
    for (const line of lines) {
      await query(
        `INSERT INTO wallet_snapshot_lines (snapshot_id, account_id, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (snapshot_id, account_id) DO UPDATE SET amount = EXCLUDED.amount`,
        [snapshotId, line.accountId, line.amount],
      )
    }
  })
}

export async function upsertSnapshot(
  userId: string,
  input: {
    date: string
    note?: string
    lines: DbSnapshotLine[]
    origin?: DbSnapshotOrigin
  },
): Promise<DbSnapshot> {
  const pool = getPool()
  const origin: DbSnapshotOrigin = input.origin === 'transfer' ? 'transfer' : 'manual'
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM wallet_snapshots WHERE user_id = $1 AND snapshot_date = $2::date`,
    [userId, input.date],
  )

  let snapshotId: string
  if (existing.rows[0]) {
    snapshotId = String(existing.rows[0].id)
    if (input.origin !== undefined) {
      await pool.query(
        `UPDATE wallet_snapshots
         SET note = $3, origin = $4, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [snapshotId, userId, input.note ?? null, origin],
      )
    } else {
      await pool.query(
        `UPDATE wallet_snapshots
         SET note = $3, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [snapshotId, userId, input.note ?? null],
      )
    }
    await replaceSnapshotLines(snapshotId, input.lines, 'merge')
  } else {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO wallet_snapshots (user_id, snapshot_date, note, origin)
       VALUES ($1, $2::date, $3, $4)
       RETURNING id`,
      [userId, input.date, input.note ?? null, origin],
    )
    snapshotId = String(inserted.rows[0]!.id)
    await replaceSnapshotLines(snapshotId, input.lines, 'replace')
  }

  const all = await listSnapshots(userId)
  return all.find((s) => s.id === snapshotId)!
}

export async function updateSnapshot(
  userId: string,
  id: string,
  patch: {
    date?: string
    note?: string | null
    lines?: DbSnapshotLine[]
    origin?: DbSnapshotOrigin
  },
): Promise<DbSnapshot | null> {
  const pool = getPool()
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM wallet_snapshots WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  if (existing.rows.length === 0) return null

  if (patch.date !== undefined || patch.note !== undefined || patch.origin !== undefined) {
    await pool.query(
      `UPDATE wallet_snapshots SET
         snapshot_date = COALESCE($3::date, snapshot_date),
         note = CASE WHEN $4::boolean THEN $5 ELSE note END,
         origin = COALESCE($6, origin),
         updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [
        id,
        userId,
        patch.date ?? null,
        patch.note !== undefined,
        patch.note === undefined ? null : patch.note,
        patch.origin ?? null,
      ],
    )
  }

  if (patch.lines) {
    await replaceSnapshotLines(id, patch.lines, 'merge')
  }

  const all = await listSnapshots(userId)
  return all.find((s) => s.id === id) ?? null
}

export async function deleteSnapshot(userId: string, id: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(
    `DELETE FROM wallet_snapshots WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  return result.rowCount > 0
}

export async function listTransfers(userId: string): Promise<DbTransfer[]> {
  const pool = getPool()
  const result = await pool.query<{
    id: string
    transfer_date: string
    from_account_id: string
    to_account_id: string
    amount: number
    note: string | null
  }>(
    `SELECT id, transfer_date::text AS transfer_date, from_account_id, to_account_id, amount, note
     FROM wallet_transfers
     WHERE user_id = $1
     ORDER BY transfer_date ASC, id ASC`,
    [userId],
  )
  return result.rows.map((row) => ({
    id: String(row.id),
    date: String(row.transfer_date).slice(0, 10),
    fromAccountId: String(row.from_account_id),
    toAccountId: String(row.to_account_id),
    amount: num(row.amount),
    note: row.note ? String(row.note) : undefined,
  }))
}

async function assertAccountOwned(userId: string, accountId: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id FROM wallet_accounts WHERE id = $1 AND user_id = $2`,
    [accountId, userId],
  )
  return result.rows.length > 0
}

export async function createTransfer(
  userId: string,
  input: {
    date: string
    fromAccountId: string
    toAccountId: string
    amount: number
    note?: string
  },
): Promise<DbTransfer> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Счета перевода должны отличаться')
  }
  if (!(await assertAccountOwned(userId, input.fromAccountId))) {
    throw new Error('Счёт-источник не найден')
  }
  if (!(await assertAccountOwned(userId, input.toAccountId))) {
    throw new Error('Счёт-получатель не найден')
  }

  const pool = getPool()
  const result = await pool.query<{
    id: string
    transfer_date: string
    from_account_id: string
    to_account_id: string
    amount: number
    note: string | null
  }>(
    `INSERT INTO wallet_transfers
       (user_id, transfer_date, from_account_id, to_account_id, amount, note)
     VALUES ($1, $2::date, $3, $4, $5, $6)
     RETURNING id, transfer_date::text AS transfer_date, from_account_id, to_account_id, amount, note`,
    [
      userId,
      input.date,
      input.fromAccountId,
      input.toAccountId,
      input.amount,
      input.note ?? null,
    ],
  )
  const row = result.rows[0]!
  return {
    id: String(row.id),
    date: String(row.transfer_date).slice(0, 10),
    fromAccountId: String(row.from_account_id),
    toAccountId: String(row.to_account_id),
    amount: num(row.amount),
    note: row.note ? String(row.note) : undefined,
  }
}

export async function deleteTransfer(userId: string, id: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(
    `DELETE FROM wallet_transfers WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  return result.rowCount > 0
}

export async function loadWalletBundle(userId: string): Promise<WalletBundle> {
  const [settings, accounts, snapshots, transfers] = await Promise.all([
    ensureUserSettings(userId),
    listAccounts(userId),
    listSnapshots(userId),
    listTransfers(userId),
  ])
  return { settings, accounts, snapshots, transfers }
}

export async function isWalletEmpty(userId: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query<{ c: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM wallet_accounts WHERE user_id = $1) +
       (SELECT COUNT(*)::int FROM wallet_snapshots WHERE user_id = $1) +
       (SELECT COUNT(*)::int FROM wallet_transfers WHERE user_id = $1) AS c`,
    [userId],
  )
  return num(result.rows[0]?.c ?? 0) === 0
}

export async function importWalletData(
  userId: string,
  payload: {
    settings?: { baseCurrency?: string }
    accounts: Array<{
      id?: string
      name: string
      currency: string
      color: string
      archived?: boolean
      sortOrder?: number
      kind?: DbAccountKind
      creditLimit?: number
      linkedAccountId?: string
    }>
    snapshots: Array<{
      id?: string
      date: string
      note?: string
      lines: Array<{ accountId: string; amount: number }>
    }>
    transfers: Array<{
      id?: string
      date: string
      fromAccountId: string
      toAccountId: string
      amount: number
      note?: string
    }>
  },
): Promise<WalletBundle> {
  if (!(await isWalletEmpty(userId))) {
    throw new Error('Данные уже есть в БД — импорт пропущен')
  }

  const pool = getPool()
  const idMap = new Map<string, string>()

  await pool.transaction(async (query) => {
    await query(
      `INSERT INTO wallet_settings (user_id, base_currency)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET base_currency = EXCLUDED.base_currency`,
      [userId, payload.settings?.baseCurrency ?? 'RUB'],
    )

    for (const [index, account] of payload.accounts.entries()) {
      const kind: DbAccountKind = account.kind === 'credit' ? 'credit' : 'regular'
      const inserted = await query<{ id: string }>(
        `INSERT INTO wallet_accounts
           (user_id, name, currency, color, archived, sort_order, kind, credit_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId,
          account.name,
          account.currency,
          account.color,
          account.archived ?? false,
          account.sortOrder ?? index,
          kind,
          kind === 'credit' ? (account.creditLimit ?? null) : null,
        ],
      )
      const newId = String(inserted.rows[0]!.id)
      if (account.id) idMap.set(account.id, newId)
    }

    for (const account of payload.accounts) {
      if (account.kind !== 'credit' || !account.linkedAccountId || !account.id) continue
      const newId = idMap.get(account.id)
      const linkedId = idMap.get(account.linkedAccountId) ?? account.linkedAccountId
      if (!newId || !linkedId || linkedId === newId) continue
      await query(
        `UPDATE wallet_accounts SET linked_account_id = $2, updated_at = now()
         WHERE id = $1 AND user_id = $3`,
        [newId, linkedId, userId],
      )
    }

    for (const snap of payload.snapshots) {
      const inserted = await query<{ id: string }>(
        `INSERT INTO wallet_snapshots (user_id, snapshot_date, note)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (user_id, snapshot_date) DO UPDATE
           SET note = EXCLUDED.note, updated_at = now()
         RETURNING id`,
        [userId, snap.date, snap.note ?? null],
      )
      const snapshotId = String(inserted.rows[0]!.id)
      for (const line of snap.lines) {
        const accountId = idMap.get(line.accountId) ?? line.accountId
        await query(
          `INSERT INTO wallet_snapshot_lines (snapshot_id, account_id, amount)
           VALUES ($1, $2, $3)
           ON CONFLICT (snapshot_id, account_id) DO UPDATE SET amount = EXCLUDED.amount`,
          [snapshotId, accountId, line.amount],
        )
      }
    }

    for (const transfer of payload.transfers) {
      const fromId = idMap.get(transfer.fromAccountId) ?? transfer.fromAccountId
      const toId = idMap.get(transfer.toAccountId) ?? transfer.toAccountId
      if (fromId === toId) continue
      await query(
        `INSERT INTO wallet_transfers
           (user_id, transfer_date, from_account_id, to_account_id, amount, note)
         VALUES ($1, $2::date, $3, $4, $5, $6)`,
        [userId, transfer.date, fromId, toId, transfer.amount, transfer.note ?? null],
      )
    }
  })

  return loadWalletBundle(userId)
}

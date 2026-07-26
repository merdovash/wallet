import type { SqlQuery } from '../db/pgClient'

export async function ensureCbrRatesSchema(query: SqlQuery): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS cbr_rate_days (
      rate_date DATE PRIMARY KEY,
      pivot jsonb NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS cbr_rate_days_rate_date_idx
    ON cbr_rate_days (rate_date DESC)
  `)
}

export async function getNearestRateDay(
  query: SqlQuery,
  isoDate: string,
): Promise<{ rateDate: string; pivot: Record<string, number> } | null> {
  const result = await query<{ rate_date: string; pivot: Record<string, number> }>(
    `
      SELECT rate_date::text AS rate_date, pivot
      FROM cbr_rate_days
      WHERE rate_date <= $1::date
      ORDER BY rate_date DESC
      LIMIT 1
    `,
    [isoDate],
  )
  const row = result.rows[0]
  if (!row) return null
  const pivot =
    typeof row.pivot === 'string'
      ? (JSON.parse(row.pivot) as Record<string, number>)
      : row.pivot
  return {
    rateDate: String(row.rate_date).slice(0, 10),
    pivot,
  }
}

export async function saveRateDay(
  query: SqlQuery,
  rateDate: string,
  pivot: Record<string, number>,
): Promise<void> {
  await query(
    `
      INSERT INTO cbr_rate_days (rate_date, pivot, fetched_at)
      VALUES ($1::date, $2, now())
      ON CONFLICT (rate_date) DO UPDATE
      SET pivot = EXCLUDED.pivot, fetched_at = now()
    `,
    [rateDate, pivot],
  )
}

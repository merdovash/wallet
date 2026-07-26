# Кошелёк

Веб-приложение для периодической фиксации остатков на счетах и оценки прироста капитала.

Стек: Vite, React 19, Tailwind 4, Zustand, Recharts, Vitest, PostgreSQL (общая БД с [trip_budget](https://github.com/merdovash/trip_budget)).

## Возможности

- Счета, чек-ины, переводы, графики прироста (переводы не считаются ростом)
- Сводный отчёт по валютам
- Курсы ЦБ РФ на дату чек-ина (`cbr-xml-daily.ru`), кэш в `cbr_rate_days`
- Auth (email/пароль) — те же `users` / `sessions`, что у trip_budget
- Данные кошелька в нормализованных таблицах `wallet_*`

## Схема PostgreSQL

Подробное описание таблиц, связей и индексов: [database.md](database.md).

| Таблица | Назначение |
|--------|------------|
| `users`, `sessions` | Auth (общие с trip_budget) |
| `wallet_settings` | `base_currency` на пользователя |
| `wallet_accounts` | Счета |
| `wallet_snapshots` | Чек-ин (шапка), UNIQUE `(user_id, snapshot_date)` |
| `wallet_snapshot_lines` | Остатки по счетам в чек-ине |
| `wallet_transfers` | Переводы между счетами |
| `cbr_rate_days` | Кэш курсов ЦБ |

## Запуск

Требования: Node.js 20+, PostgreSQL 16+ (удобно Docker Compose из trip_budget/`finance`).

```bash
cp .env.example .env
# DATABASE_URL=postgresql://finance:finance@localhost:5432/finance

# Поднять БД trip_budget, затем:
npm install
npm run db:migrate   # идемпотентно: users/sessions/cbr_* могут уже быть
npm run dev
```

Миграции безопасны на общей БД: общие таблицы создаются только если их ещё нет (`IF NOT EXISTS`). Подробности — [database.md](database.md).

Откройте адрес, который Vite выведет после запуска, и зарегистрируйтесь / войдите.
При одновременном запуске сервисов задавайте разные порты снаружи, например
`npm run dev -- --port 5174`.

При первом входе, если в БД пусто, а в браузере остался старый `localStorage` (`wallet-storage`), данные импортируются один раз.

## Сборка и тесты

```bash
npm run build
npm run test
```

## API

- `/api/auth/*` — register, login, logout, me
- `/api/wallet` — полный bundle
- `/api/wallet/settings|accounts|snapshots|transfers|import`
- `/api/rates?date=YYYY-MM-DD` — курсы ЦБ

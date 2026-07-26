# Схема хранения данных

Данные кошелька и пользователи — в **PostgreSQL** (общая БД с trip_budget). Курсы ЦБ кэшируются в той же БД. UI-состояние сайдбара — в `localStorage`. Типы — в `src/types/wallet.ts`. Миграция: [`server/db/migrations/001_wallet_init.sql`](server/db/migrations/001_wallet_init.sql).

## Обзор хранилищ

| Хранилище | Где | Ключ / путь | Содержимое |
|-----------|-----|-------------|------------|
| Пользователи, сессии, кошелёк, курсы ЦБ | PostgreSQL 16+ | `DATABASE_URL` | `users`, `sessions`, `wallet_*`, `cbr_rate_days` |
| Кэш курсов в браузере | `localStorage` | `wallet-cbr-rates` | Zustand: `byDate` (RUB pivot по дням ЦБ) |
| UI сайдбара | `localStorage` | `wallet-sidebar-collapsed` | `'0'` / `'1'` |
| Легаси (импорт один раз) | `localStorage` | `wallet-storage` | Старый Zustand persist; после импорта в БД удаляется |

```mermaid
flowchart TB
  subgraph db [PostgreSQL]
    U[users]
    S[sessions]
    WS[wallet_settings]
    WA[wallet_accounts]
    WP[wallet_snapshots]
    WL[wallet_snapshot_lines]
    WT[wallet_transfers]
    CBR[cbr_rate_days]
  end
  UI[UI] -->|API cookie session| U
  U --> S
  U --> WS
  U --> WA
  U --> WP
  U --> WT
  WP --> WL
  WA --> WL
  WA --> WT
  UI -->|API /api/rates| CBR
```

---

## Подключение и миграции

- `DATABASE_URL` — см. [`.env.example`](.env.example). Обычно та же БД, что у trip_budget: `postgresql://finance:finance@localhost:5432/finance`.
- Применить схему: `npm run db:migrate` (файлы из `server/db/migrations/`, учёт в `wallet_schema_migrations`).

### Совместная БД с trip_budget

При развороте часть объектов **уже может существовать** (`users`, `sessions`, `cbr_rate_days`, индексы). Миграции идемпотентны: везде `CREATE TABLE/INDEX IF NOT EXISTS`. Существующие таблицы не пересоздаются и не меняются.

Учёт применённых миграций — в отдельной таблице `wallet_schema_migrations` (не в `schema_migrations` trip_budget), чтобы два приложения не мешали друг другу.

---

## 1. Auth (общие с trip_budget)

### `users`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `email` | TEXT UNIQUE | Email (нижний регистр) |
| `password_hash` | TEXT | scrypt-хэш пароля |
| `created_at` | TIMESTAMPTZ | Создание |

### `sessions`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `user_id` | UUID FK → users | Владелец, `ON DELETE CASCADE` |
| `token_hash` | TEXT UNIQUE | SHA-256 токена из cookie `session` |
| `expires_at` | TIMESTAMPTZ | Срок действия |

Индексы: `sessions_user_id_idx`, `sessions_expires_at_idx`.

---

## 2. Кошелёк (`wallet_*`)

Все сущности scoped по `user_id`. Не используем JSONB-массивы счетов/строк — строки чек-ина вынесены в отдельную таблицу.

### `wallet_settings`

Одна строка на пользователя.

| Поле | Тип | Описание |
|------|-----|----------|
| `user_id` | UUID | PK, FK → users, `ON DELETE CASCADE` |
| `base_currency` | VARCHAR(8) | Базовая валюта сводки (по умолчанию `RUB`) |
| `updated_at` | TIMESTAMPTZ | Обновление |

Ручные курсы в БД не хранятся: конвертация идёт через ЦБ (`cbr_rate_days`). Клиентский fallback — константа в коде.

### `wallet_accounts`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `user_id` | UUID FK → users | Владелец, `ON DELETE CASCADE` |
| `name` | TEXT | Название |
| `currency` | VARCHAR(8) | Код валюты счёта |
| `color` | TEXT | Цвет в UI |
| `archived` | BOOLEAN | Архив (по умолчанию `false`) |
| `sort_order` | INT | Порядок в списках |
| `kind` | TEXT | `regular` или `credit` (по умолчанию `regular`) |
| `credit_limit` | NUMERIC(20, 8) | Лимит кредитки; только для `credit` |
| `linked_account_id` | UUID FK → wallet_accounts | Кошелёк float; только для `credit`, `ON DELETE SET NULL` |
| `created_at` / `updated_at` | TIMESTAMPTZ | Метки времени |

Индекс: `wallet_accounts_user_sort_idx` на `(user_id, sort_order)`.  
Для кредитки в чек-ине пишут доступный остаток лимита; долг = `credit_limit − available`.

### `wallet_snapshots`

Шапка чек-ина. Не больше одного чек-ина на день у пользователя.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `user_id` | UUID FK → users | Владелец, `ON DELETE CASCADE` |
| `snapshot_date` | DATE | Дата чек-ина |
| `note` | TEXT | Комментарий (nullable) |
| `created_at` / `updated_at` | TIMESTAMPTZ | Метки времени |

Ограничение: `UNIQUE (user_id, snapshot_date)`.  
Индекс: `wallet_snapshots_user_date_idx` на `(user_id, snapshot_date DESC)`.

### `wallet_snapshot_lines`

Остатки по счетам внутри чек-ина. Пустая строка для счёта в новом чек-ине = «без изменений» (в UI); в БД пишутся только явно заданные суммы. Для расчётов по дате недостающие счета дополняются forward-fill по предыдущим чек-инам (логика в `growthEngine`).

| Поле | Тип | Описание |
|------|-----|----------|
| `snapshot_id` | UUID | PK (часть), FK → wallet_snapshots, `ON DELETE CASCADE` |
| `account_id` | UUID | PK (часть), FK → wallet_accounts, `ON DELETE CASCADE` |
| `amount` | NUMERIC(20, 8) | Остаток в валюте счёта |

Индекс: `wallet_snapshot_lines_account_idx` на `(account_id)`.

### `wallet_transfers`

Переводы между отслеживаемыми счетами (не влияют на прирост кошелька; из прироста счёта вычитаются в движке).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `user_id` | UUID FK → users | Владелец, `ON DELETE CASCADE` |
| `transfer_date` | DATE | Дата перевода |
| `from_account_id` | UUID FK → wallet_accounts | Откуда, `ON DELETE CASCADE` |
| `to_account_id` | UUID FK → wallet_accounts | Куда, `ON DELETE CASCADE` |
| `amount` | NUMERIC(20, 8) | Сумма в валюте счёта-источника; `CHECK (amount > 0)` |
| `note` | TEXT | Комментарий (nullable) |
| `created_at` | TIMESTAMPTZ | Создание |

Ограничение: `from_account_id <> to_account_id`.  
Принадлежность обоих счетов пользователю проверяется в API.  
Индекс: `wallet_transfers_user_date_idx` на `(user_id, transfer_date DESC)`.

```mermaid
erDiagram
  users ||--o| wallet_settings : has
  users ||--o{ wallet_accounts : owns
  users ||--o{ wallet_snapshots : owns
  users ||--o{ wallet_transfers : owns
  wallet_snapshots ||--o{ wallet_snapshot_lines : contains
  wallet_accounts ||--o{ wallet_snapshot_lines : "amount on date"
  wallet_accounts ||--o{ wallet_transfers : from
  wallet_accounts ||--o{ wallet_transfers : to
```

---

## 3. Курсы ЦБ

### `cbr_rate_days`

Общий кэш (без `user_id`). Заполняется через `GET /api/rates?date=YYYY-MM-DD`.

| Поле | Тип | Описание |
|------|-----|----------|
| `rate_date` | DATE | PK — фактический день публикации ЦБ |
| `pivot` | JSONB | Карта «код валюты → RUB за 1 единицу» (плюс `RUB: 1`) |
| `fetched_at` | TIMESTAMPTZ | Время записи в кэш |

Индекс: `cbr_rate_days_rate_date_idx` на `(rate_date DESC)`.

Поиск курса на дату чек-ина: ближайший `rate_date <= snapshot_date` (в т.ч. после walk-back выходных).

---

## 4. API ↔ таблицы

| Эндпоинт | Таблицы |
|----------|---------|
| `/api/auth/*` | `users`, `sessions` |
| `/api/wallet`, `/api/wallet/settings` | `wallet_settings` (+ чтение остальных) |
| `/api/wallet/accounts` | `wallet_accounts` |
| `/api/wallet/snapshots` | `wallet_snapshots`, `wallet_snapshot_lines` |
| `/api/wallet/transfers` | `wallet_transfers` |
| `/api/wallet/import` | все `wallet_*` (один раз, если пусто) |
| `/api/rates` | `cbr_rate_days` |

Репозиторий: [`server/wallet/store.ts`](server/wallet/store.ts).

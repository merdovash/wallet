# Схема базы данных

Данные кошелька и пользователи — в **PostgreSQL 16+** (общая БД с trip_budget / finance). Курсы ЦБ кэшируются в той же БД.

Источники схемы:

- миграции: [`server/db/migrations/`](server/db/migrations/) (`001` … `013`)
- учёт миграций: таблица `wallet_schema_migrations`
- клиентские типы: [`src/types/wallet.ts`](src/types/wallet.ts)

Применить: `npm run db:migrate` (`DATABASE_URL` — см. [`.env.example`](.env.example)).

---

## Список таблиц

| Таблица | Назначение |
|--------|------------|
| `wallet_schema_migrations` | Учёт применённых SQL-миграций wallet |
| `users` | Пользователи (общая с trip_budget) |
| `sessions` | Сессии входа (общая с trip_budget) |
| `wallet_settings` | Настройки кошелька (базовая валюта) |
| `wallet_accounts` | Счета / кошельки |
| `wallet_snapshots` | Чек-ины (шапка по дате) |
| `wallet_snapshot_lines` | Остатки счетов внутри чек-ина |
| `wallet_transfers` | Переводы между счетами |
| `wallet_account_funds` | Фонды (конверты) внутри счёта; остатки считаются из чек-инов и переводов |
| `wallet_account_fund_expenses` | Итоговые расходы фонда по календарным месяцам |
| `cbr_rate_days` | Кэш дневных курсов ЦБ (общий) |

```mermaid
erDiagram
  wallet_schema_migrations {
    text id PK
    timestamptz applied_at
  }
  users ||--o{ sessions : has
  users ||--o| wallet_settings : has
  users ||--o{ wallet_accounts : owns
  users ||--o{ wallet_snapshots : owns
  users ||--o{ wallet_transfers : owns
  users ||--o{ wallet_account_funds : owns
  wallet_accounts ||--o| wallet_accounts : "linked_account_id (float)"
  wallet_snapshots ||--o{ wallet_snapshot_lines : contains
  wallet_accounts ||--o{ wallet_snapshot_lines : "amount on date"
  wallet_accounts ||--o{ wallet_transfers : from
  wallet_accounts ||--o{ wallet_transfers : to
  wallet_accounts ||--o{ wallet_account_funds : envelopes
  wallet_account_funds ||--o{ wallet_account_fund_expenses : months
  wallet_account_fund_expenses {
    uuid fund_id PK
    text year_month PK
  }
  cbr_rate_days {
    date rate_date PK
  }
```

---

## 1. `wallet_schema_migrations`

Служебная таблица миграций приложения wallet (не путать с `schema_migrations` trip_budget).

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `id` | TEXT | NOT NULL | — | PK — имя файла миграции (например `007_account_kind_growth.sql`) |
| `applied_at` | TIMESTAMPTZ | NOT NULL | `now()` | Когда миграция применена |

Ограничения: `PRIMARY KEY (id)`.

---

## 2. `users`

Пользователи. Может уже существовать из trip_budget; миграция идемпотентна (`IF NOT EXISTS`).

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `email` | TEXT | NOT NULL | — | Email (уникальный; в API нормализуется в нижний регистр) |
| `password_hash` | TEXT | NOT NULL | — | scrypt-хэш пароля |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Время создания |

Ограничения: `PRIMARY KEY (id)`, `UNIQUE (email)`.

---

## 3. `sessions`

Сессии cookie `session`. Общая с trip_budget.

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | UUID | NOT NULL | — | FK → `users(id)` `ON DELETE CASCADE` |
| `token_hash` | TEXT | NOT NULL | — | SHA-256 токена из cookie; уникальный |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — | Срок действия сессии |

Ограничения: `PRIMARY KEY (id)`, `UNIQUE (token_hash)`, FK `user_id`.

Индексы:

- `sessions_user_id_idx` на `(user_id)`
- `sessions_expires_at_idx` на `(expires_at)`

---

## 4. `wallet_settings`

Одна строка настроек кошелька на пользователя.

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `user_id` | UUID | NOT NULL | — | PK, FK → `users(id)` `ON DELETE CASCADE` |
| `base_currency` | VARCHAR(8) | NOT NULL | `'RUB'` | Базовая валюта сводок и доходов/расходов чек-ина |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | Время последнего обновления |

Ограничения: `PRIMARY KEY (user_id)`, FK `user_id`.

Ручные курсы в БД не хранятся: конвертация через `cbr_rate_days` (клиентский fallback — константа в коде).

---

## 5. `wallet_accounts`

Счета пользователя.

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | UUID | NOT NULL | — | FK → `users(id)` `ON DELETE CASCADE` |
| `name` | TEXT | NOT NULL | — | Название счёта |
| `currency` | VARCHAR(8) | NOT NULL | — | Код валюты счёта (`RUB`, `USD`, …) |
| `color` | TEXT | NOT NULL | — | Цвет в UI |
| `archived` | BOOLEAN | NOT NULL | `false` | Архивный счёт |
| `sort_order` | INT | NOT NULL | `0` | Порядок в списках |
| `kind` | TEXT | NOT NULL | `'operational'` | Тип счёта (см. ниже) |
| `credit_limit` | NUMERIC(20, 8) | NULL | — | Лимит кредитки; только для `kind = 'credit'` |
| `linked_account_id` | UUID | NULL | — | FK → `wallet_accounts(id)` `ON DELETE SET NULL` — float-кошелёк; только для кредитки |
| `grace_months` | INT | NULL | — | Грейс в календарных месяцах после месяца трат (1–12); только для кредитки |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Создание |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | Обновление |

### Значения `kind`

| Значение | Смысл | Учитывается в приросте капитала |
|----------|-------|----------------------------------|
| `operational` | Оперативный | нет |
| `fund` | Фонд | да |
| `deposit` | Вклад | да |
| `investment` | Инвестиции | да |
| `cash` | Наличка | нет |
| `credit` | Кредитка | нет |

Легаси: `regular` / `bank` при миграции `007` переведены в `operational`.

### Ограничения

- `PRIMARY KEY (id)`
- FK `user_id` → `users`
- FK `linked_account_id` → `wallet_accounts`
- `wallet_accounts_kind_check`: `kind IN ('operational', 'fund', 'deposit', 'investment', 'cash', 'credit')`
- `wallet_accounts_credit_fields_check`:
  - для не-кредиток: `credit_limit`, `linked_account_id`, `grace_months` все `NULL`
  - для `credit`: `credit_limit > 0`, `grace_months` в диапазоне 1–12
- `wallet_accounts_linked_not_self`: `linked_account_id IS NULL OR linked_account_id <> id`

Индекс: `wallet_accounts_user_sort_idx` на `(user_id, sort_order)`.

**Семантика кредитки:** в чек-ине хранится доступный остаток лимита; долг = `credit_limit − available`. В чистых активах учитывается как `−debt`.

---

## 6. `wallet_snapshots`

Шапка чек-ина. Не больше одного чек-ина на день у пользователя.

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | UUID | NOT NULL | — | FK → `users(id)` `ON DELETE CASCADE` |
| `snapshot_date` | DATE | NOT NULL | — | Дата чек-ина |
| `note` | TEXT | NULL | — | Комментарий |
| `origin` | TEXT | NOT NULL | `'manual'` | Источник: `manual` или `transfer` |
| `income` | NUMERIC(20, 8) | NOT NULL | `0` | Внешний доход за день в **базовой валюте** (не входит в прирост) |
| `expense` | NUMERIC(20, 8) | NOT NULL | `0` | Внешний расход за день в **базовой валюте** (не входит в прирост) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Создание |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | Обновление |

### Ограничения

- `PRIMARY KEY (id)`
- `UNIQUE (user_id, snapshot_date)`
- FK `user_id` → `users`
- `wallet_snapshots_origin_check`: `origin IN ('manual', 'transfer')`
- `wallet_snapshots_income_nonneg`: `income >= 0`
- `wallet_snapshots_expense_nonneg`: `expense >= 0`

Индекс: `wallet_snapshots_user_date_idx` на `(user_id, snapshot_date DESC)`.

**`origin = 'transfer'`:** чек-ин создан переводом; суммы строк в UI заблокированы.

---

## 7. `wallet_snapshot_lines`

Остатки по счетам внутри чек-ина. В БД пишутся только явно заданные суммы. Для расчётов на дату недостающие счета дополняются forward-fill по предыдущим чек-инам (логика в `growthEngine`).

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `snapshot_id` | UUID | NOT NULL | — | PK (часть), FK → `wallet_snapshots(id)` `ON DELETE CASCADE` |
| `account_id` | UUID | NOT NULL | — | PK (часть), FK → `wallet_accounts(id)` `ON DELETE CASCADE` |
| `amount` | NUMERIC(20, 8) | NOT NULL | — | Остаток в валюте счёта (для кредитки — доступный остаток лимита) |

Ограничения: `PRIMARY KEY (snapshot_id, account_id)`, FK на snapshots и accounts.

Индекс: `wallet_snapshot_lines_account_idx` на `(account_id)`.

---

## 8. `wallet_transfers`

Переводы между счетами одного пользователя. Не считаются приростом капитала; в приросте отдельного счёта вычитаются в движке.

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | UUID | NOT NULL | — | FK → `users(id)` `ON DELETE CASCADE` |
| `transfer_date` | DATE | NOT NULL | — | Дата перевода |
| `from_account_id` | UUID | NOT NULL | — | FK → `wallet_accounts(id)` `ON DELETE CASCADE` — откуда |
| `to_account_id` | UUID | NOT NULL | — | FK → `wallet_accounts(id)` `ON DELETE CASCADE` — куда |
| `amount` | NUMERIC(20, 8) | NOT NULL | — | Сумма списания в валюте счёта-источника; `CHECK (amount > 0)` |
| `to_amount` | NUMERIC(20, 8) | NULL | — | Сумма зачисления в валюте счёта-получателя. `NULL` — как раньше: та же сумма или официальный курс. `CHECK (to_amount IS NULL OR to_amount > 0)` |
| `note` | TEXT | NULL | — | Комментарий |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Создание |

### Ограничения

- `PRIMARY KEY (id)`
- FK `user_id`, `from_account_id`, `to_account_id`
- `CHECK (amount > 0)`
- `wallet_transfers_distinct_accounts`: `from_account_id <> to_account_id`

Индекс: `wallet_transfers_user_date_idx` на `(user_id, transfer_date DESC)`.

Принадлежность обоих счетов пользователю дополнительно проверяется в API.

---

## 9. `wallet_account_funds`

Конверты («фонды») внутри счёта. В таблице только определения: название, целевое ежемесячное пополнение, приоритет, привязка к счёту. Остатки и доли **не хранятся** — считаются из чек-инов и переводов.

Системный фонд `system_key = 'free_money'` («Свободные деньги») создаётся при первом пользовательском фонде на счёте, не удаляется.

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | UUID | NOT NULL | — | FK → `users(id)` `ON DELETE CASCADE` |
| `account_id` | UUID | NOT NULL | — | FK → `wallet_accounts(id)` `ON DELETE CASCADE` |
| `name` | TEXT | NOT NULL | — | Название |
| `monthly_target` | NUMERIC(20, 8) | NOT NULL | `0` | Цель пополнения переводами за календарный месяц; `0` у free_money |
| `priority` | INT | NOT NULL | `0` | Больше — раньше заполняется при входящем переводе |
| `system_key` | TEXT | NULL | — | `NULL` или `'free_money'` |
| `auto_target` | BOOLEAN | NOT NULL | `FALSE` | Если true, `monthly_target` = среднее сохранённых расходов по месяцам |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Создание |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | Обновление |

Индекс уникальности одного free_money на счёт: `wallet_account_funds_one_free_money` на `(account_id) WHERE system_key = 'free_money'`.

---

## 9.1. `wallet_account_fund_expenses`

Итог расхода фонда за календарный месяц (`YYYY-MM`). Не путать с `expense` чек-ина. На карточке фонда можно вводить прошлые месяцы; при `auto_target` цель пополнения пересчитывается как среднее арифметическое этих сумм.

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `fund_id` | UUID | NOT NULL | — | PK, FK → `wallet_account_funds(id)` `ON DELETE CASCADE` |
| `year_month` | TEXT | NOT NULL | — | PK, `YYYY-MM` |
| `user_id` | UUID | NOT NULL | — | FK → `users(id)` `ON DELETE CASCADE` |
| `amount` | NUMERIC(20, 8) | NOT NULL | — | Сумма ≥ 0 |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | Создание |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | Обновление |

---

## 10. `cbr_rate_days`

Общий кэш курсов ЦБ (без `user_id`). Может уже существовать из trip_budget. Заполняется через `GET /api/rates?date=YYYY-MM-DD` (в т.ч. `refresh=1` для принудительного обновления).

| Поле | Тип | NULL | По умолчанию | Описание |
|------|-----|------|--------------|----------|
| `rate_date` | DATE | NOT NULL | — | PK — фактический день публикации / котировки ЦБ |
| `pivot` | JSONB | NOT NULL | — | Карта «код валюты → RUB за 1 единицу» (плюс `RUB: 1`; алиас `USDT` ← `USD` может быть добавлен при записи) |
| `fetched_at` | TIMESTAMPTZ | NOT NULL | `now()` | Время записи / обновления кэша |

Ограничения: `PRIMARY KEY (rate_date)`.

Индекс: `cbr_rate_days_rate_date_idx` на `(rate_date DESC)`.

Поиск на дату чек-ина: ближайший `rate_date <= snapshot_date` (выходные/праздники — walk-back).

---

## Миграции

| Файл | Что меняет |
|------|------------|
| `001_wallet_init.sql` | Базовые таблицы: users, sessions, wallet_*, cbr_rate_days |
| `002_credit_accounts.sql` | `kind`, `credit_limit`, `linked_account_id` у счетов |
| `003_snapshot_origin.sql` | `origin` у чек-инов |
| `004_credit_grace_months.sql` | `grace_months` у кредиток |
| `005_account_kinds.sql` | Виды: bank / cash / credit / investment (легаси) |
| `006_snapshot_cashflow.sql` | `income`, `expense` у чек-инов |
| `007_account_kind_growth.sql` | Виды: operational / fund / deposit / investment / cash / credit |
| `008_cashback_kind.sql` | Вид счёта cashback |
| `009_annual_inflation.sql` | Годовая инфляция в настройках |
| `010_key_rate.sql` | Ключевая ставка в настройках |
| `011_account_funds.sql` | Фонды-конверты внутри счёта |
| `012_fund_monthly_expenses.sql` | Расходы фонда по месяцам и `auto_target` |

---

## API ↔ таблицы

| Эндпоинт | Таблицы |
|----------|---------|
| `/api/auth/*` | `users`, `sessions` |
| `/api/wallet`, `/api/wallet/settings` | `wallet_settings` (+ чтение остальных `wallet_*`) |
| `/api/wallet/accounts` | `wallet_accounts` |
| `/api/wallet/snapshots` | `wallet_snapshots`, `wallet_snapshot_lines` |
| `/api/wallet/transfers` | `wallet_transfers` |
| `/api/wallet/funds` | `wallet_account_funds`, `wallet_account_fund_expenses` |
| `/api/wallet/import` | все `wallet_*` (если кошелёк пуст) |
| `/api/rates` | `cbr_rate_days` |

Репозиторий кошелька: [`server/wallet/store.ts`](server/wallet/store.ts). Курсы: [`server/rates/`](server/rates/).

---

## Вне PostgreSQL (справочно)

| Хранилище | Ключ | Содержимое |
|-----------|------|------------|
| `localStorage` | `wallet-cbr-rates` | Кэш курсов в браузере (Zustand persist: `byDate`, `lastFetchedAt`, …) |
| `localStorage` | `wallet-sidebar-collapsed` | UI сайдбара: `'0'` / `'1'` |
| `localStorage` | `wallet-storage` | Легаси Zustand; после импорта в БД удаляется |

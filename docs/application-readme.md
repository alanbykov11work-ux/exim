# EXIM Super App — полноценная версия

Прототип превращён в реальное приложение: **Next.js 14 + Supabase** (Postgres, авторизация с email-верификацией, разграничение прав). Весь интерфейс прототипа сохранён: дашборд, перевозки, трекинг на карте, контейнеры, услуги, чаты, инвойсы, уведомления, RU/KZ/EN, светлая/тёмная тема.

## Что изменилось по сравнению с прототипом

- Настоящая регистрация и вход (Supabase Auth): пароль, **подтверждение email обязательно** — без него в приложение не пустит (контролируется на сервере, в middleware).
- Восстановление пароля по почте.
- Роли хранятся в базе: `client` / `manager` / `logist` / `admin`. При самостоятельной регистрации всегда `client`; клиент не может переключиться в менеджера (проверка и в UI, и политиками БД).
- Все данные (перевозки, заявки, чаты, задачи, уведомления, профиль, настройки) синхронизируются в Postgres per-user, изолированы Row Level Security. Работает с любого устройства.
- KYC-поле `verified` в профиле — менеджер/админ отмечает проверенные компании.

## Запуск: 3 шага

### 1. Supabase (бесплатный тариф достаточен)

1. [supabase.com](https://supabase.com) → New project.
2. SQL Editor → вставьте содержимое `supabase/schema.sql` → **Run**.
3. Authentication → Providers → Email: включён, **Confirm email = ON** (по умолчанию включено).
4. Authentication → URL Configuration → Site URL: адрес вашего сайта (для локали `http://localhost:3000`), в Redirect URLs добавьте `http://localhost:3000/auth/callback` и продовый `https://ваш-домен/auth/callback`.
5. Project Settings → API → скопируйте `URL` и `anon public` ключ.

### 2. Локальный запуск

```bash
cp .env.example .env.local   # вставьте URL и anon key
npm install
npm run dev                  # http://localhost:3000
```

### 3. Деплой на Vercel

1. Залейте папку в GitHub-репозиторий.
2. [vercel.com](https://vercel.com) → Add New Project → импортируйте репозиторий.
3. В Environment Variables добавьте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. После деплоя добавьте прод-домен в Supabase (Site URL + Redirect URLs, шаг 1.4).

## Администрирование

Назначить сотрудника (в Supabase → SQL Editor):

```sql
update public.profiles set role = 'manager' where email = 'manager@exim.kz';
update public.profiles set role = 'logist'  where email = 'logist@exim.kz';
```

Отметить компанию клиента как проверенную (KYC):

```sql
update public.profiles set verified = true where email = 'client@company.kz';
```

## Письма (важно для продакшена)

Встроенная почта Supabase лимитирована (~3-4 письма/час) и годится только для тестов. Для продакшена подключите свой SMTP: Supabase → Project Settings → Auth → SMTP Settings (подойдёт Resend, Postmark, SES, Mailgun). Там же можно русифицировать шаблоны писем (Auth → Email Templates).

## Структура

```
app/                 — маршруты Next.js (login, register, verify, reset, app)
components/          — AuthHero, EximApp (загрузчик основного приложения)
lib/supabase/        — клиенты Supabase (browser / server)
middleware.ts        — защита маршрутов + принудительная верификация email
public/exim/         — ядро приложения (интерфейс прототипа: css, js, разметка, Leaflet, шрифты)
supabase/schema.sql  — схема БД: профили, состояние, RLS-политики, триггеры
```

## Дорожная карта (следующие итерации)

- Общие данные между клиентом и менеджером: перенос заявок/чатов из per-user состояния в общие реляционные таблицы + Supabase Realtime (живой чат клиент ↔ менеджер).
- SMS-верификация телефона (Mobizon/SMSC + Supabase Phone Auth).
- Загрузка документов в Supabase Storage (инвойсы, CMR, таможенные декларации).
- Админ-панель верификации компаний вместо SQL-запросов.

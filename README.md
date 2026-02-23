# Pipedrive Sales AI Assistant

MVP: Human-in-the-loop sales assistant for Pipedrive. **The AI never executes write operations without explicit human confirmation.**

## Stack

- **Node.js + TypeScript**, **Fastify**, **Zod**, **Prisma** (Postgres), **pino**
- **Docker** + **docker-compose** (API + worker + Postgres)

## Features (MVP)

- **Pipedrive client**: token auth, getDeal, searchDeals, listActivities, listNotes; createNote, createActivity, updateDealStage (writes require confirmation).
- **Webhook receiver**: `POST /webhooks/pipedrive` stores payloads; worker polls and marks processed (no auto-execution of writes).
- **Chat assistant**: read-only queries run immediately; write-like requests produce a plan with `pending_confirmation` and a confirm token.
- **Confirmation gate**: `POST /api/actions/confirm` with `actionRequestId` and `confirm`; only then are allowlisted write actions executed and logged to `audit_log`.
- **Actions allowlist**: summarize_deal, draft_followup_email, create_note, create_activity, move_stage, weekly_report (writes: create_note, create_activity, move_stage).
- **RBAC**: viewer (read-only chat), sales_rep (can request + confirm own), sales_manager/admin (can confirm any).
- **Minimal UI**: login, chat, confirm/cancel for pending actions (Hebrew default).

## Setup

### 1. Clone and install

```bash
cd pipedrive-sales-ai
npm install
```

### 2. Environment

Copy `.env.example` to `.env` and set:

- **`DATABASE_URL`** – Postgres connection string (required).
- **`PIPEDRIVE_API_TOKEN`** – Pipedrive API token (required for real Pipedrive calls).
- **`PIPEDRIVE_DOMAIN`** – e.g. `https://your-company.pipedrive.com` (optional; default in .env.example).
- **`ANTHROPIC_API_KEY`** – optional; if not set, rules-based planner is used (app runs without it).
- **`SESSION_SECRET`** – secret for session cookie (required in production).

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Database

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. (Optional) Seed a user

```bash
# Use Prisma Studio or a one-off script to create a user with hashed password.
# Example: POST /api/auth/register with { "email": "you@example.com", "password": "yourpassword", "role": "sales_rep" }
```

## Run locally (no Docker)

**Terminal 1 – API**

```bash
npm run dev
```

**Terminal 2 – Worker (optional)**

```bash
npm run worker:dev
```

**Terminal 3 – Open app**

- UI: http://localhost:3000/chat (redirects to /login if not logged in).
- Register once via `/api/auth/register` or add a user in DB, then log in at `/login`.

## Run with Docker

```bash
docker-compose up --build
```

- API: http://localhost:3000
- Worker runs in a separate container; DB is Postgres 16.

First run: create a user (e.g. register via UI or seed script), then log in.

## Commands

| Command | Description |
|--------|-------------|
| `npm run dev` | Start API with tsx watch |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run `node dist/server.js` |
| `npm run worker` | Run webhook worker |
| `npm run worker:dev` | Run worker with tsx watch |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:migrate:deploy` | `prisma migrate deploy` (production) |
| `npm run test` | Run unit tests (Vitest) |

## Where to configure

- **Pipedrive (your account)**: `.env` → `PIPEDRIVE_API_TOKEN`, `PIPEDRIVE_DOMAIN`.  
  **Full step-by-step:** see [PIPEDRIVE_CONNECTION.md](./PIPEDRIVE_CONNECTION.md) (Hebrew).
- **Anthropic (optional)**: `.env` → `ANTHROPIC_API_KEY`. If unset, rules-based planner is used.

## Security

- No API keys in repo; use `.env`.
- Write actions only via confirmation gate; all executed writes logged in `audit_log`.
- AI only triggers allowlisted actions; no arbitrary code/tools.
- Default for ambiguity: do not execute; ask user; require confirmation.

## Tests

```bash
npm run test
```

Covers: allowlist rejects unknown actions, write actions cannot run without confirmed `ActionRequest`, confirm endpoint validates payload and RBAC.

# TravelBooster Agent (Pipedrive → TravelBooster)

Backend agent that connects **Pipedrive** to **TravelBooster** with a **human-approval gate**: when a deal is marked WON, the system sets approval to Pending and notifies the owner; only when the owner sets **TravelFile Approval Status** to **Approved** (and all validations pass) does the agent create the booking in TravelBooster and write back the identifiers to Pipedrive.

## Requirements

- Node.js 18+
- npm or yarn

## Install and run locally

```bash
cd travelboster
npm install
npm run prepare-env    # creates .env from .env.example if missing
# Edit .env and set PIPEDRIVE_API_TOKEN, TB_CLIENT_ID, TB_CLIENT_SECRET, etc.
npm run build
npm start
```

Before going live, check readiness: **GET http://localhost:3000/setup** – returns whether Pipedrive and TravelBooster are configured and TB token exists (no secrets exposed).

For development with auto-reload:

```bash
npm run dev
```

## Environment variables

Set these in `.env` (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `3000`) |
| `PIPEDRIVE_API_TOKEN` | Pipedrive API token |
| `PIPEDRIVE_BASE_URL` | Pipedrive API base URL (default `https://api.pipedrive.com/v1`) |
| `TB_BASE_URL` | TravelBooster API base (default `https://tbapi-sandbox.travelbooster.com`) |
| `TB_CLIENT_ID` | TravelBooster OAuth client ID |
| `TB_CLIENT_SECRET` | TravelBooster OAuth client secret |
| `TB_REDIRECT_URI` | OAuth redirect URI (e.g. `http://localhost:3000/tb/callback`) |
| `LOG_LEVEL` | Log level (default `info`) |

Optional: if your Pipedrive custom field API keys differ from defaults, set them in `.env` (see `.env.example`), e.g. `PIPEDRIVE_DEAL_FIELD_SELECTED_TOUR_CODE`, `PIPEDRIVE_PERSON_FIELD_ID_PASSPORT`.

## Register Pipedrive webhook

1. In Pipedrive: **Settings → Integrations → Webhooks** (or Developer Hub → Webhooks).
2. Create a webhook:
   - **Subscription**: Deal updated (or “Deal – updated”).
   - **Endpoint URL**: `https://YOUR_PUBLIC_URL/webhooks/pipedrive`  
     For local testing use a tunnel (e.g. ngrok): `https://xxxx.ngrok.io/webhooks/pipedrive`.
3. Save. Pipedrive will send `POST` requests to this URL when a deal is updated.

## Test locally with a sample payload

Send a deal-update webhook manually:

```bash
curl -X POST http://localhost:3000/webhooks/pipedrive \
  -H "Content-Type: application/json" \
  -d '{"meta":{"entity":"deal","entity_id":123},"data":{"id":123}}'
```

Replace `123` with a real deal ID in your Pipedrive. The agent will fetch the full deal and participants and run the orchestrator (WON → Pending/Approved → create in TravelBooster if valid).

## TravelBooster OAuth (first-time setup)

1. Start the server.
2. Open in browser: `http://localhost:3000/tb/auth`  
   You are redirected to TravelBooster to authorize.
3. After authorizing, you are redirected to `/tb/callback?code=...`. The server exchanges the code for an access token and stores it under `./travelboster/src/store/tb-token.json` (created at runtime).

After that, the agent can call TravelBooster APIs until the token expires (re-run the OAuth flow if needed).

## Audit log

The agent keeps a minimal audit log at:

**`./travelboster/src/store/audit.json`**

(Created at runtime if missing.)

Each entry has: `deal_id`, `action`, `timestamp`, and optionally `tb_booking_id`, `tb_travelfile_number`. Used for idempotency and replay protection: replaying the same webhook does not create duplicate TravelBooster bookings.

## Tests

```bash
npm test
```

Runs Jest tests in `test/` (e.g. `validation.test.ts`).

## Acceptance criteria (summary)

1. **Deal becomes WON** → No TravelBooster calls; set approval to Pending if missing; create Activity “Approve TravelBooster TravelFile”.
2. **Deal WON + Approval = Approved + all required fields** → Create TravelBooster booking once; write Booking ID, TravelFile Number, system status = Created.
3. **Duplicate webhook replay** → No duplicate creation (idempotency via TravelFile Number / Booking ID and audit log).
4. **Approved but missing required deal/person fields** → Status = Failed, error message set, Activity created; no TravelBooster call.
5. **Approval = Cancelled** → No TravelBooster call; optional note/activity.

## Project structure

```
travelboster/
  package.json
  tsconfig.json
  .env.example
  README.md
  src/
    server.ts
    config.ts
    routes/
      health.ts
      webhooks.pipedrive.ts
    services/
      pipedriveClient.ts
      travelboosterClient.ts
      agentOrchestrator.ts
    domain/
      types.ts
      validation.ts
    store/
      auditLog.ts
      audit.json        # created at runtime
  test/
    validation.test.ts
```

## Pipedrive custom fields

Ensure your Pipedrive deal and person custom fields exist and that their **API keys** match what the agent expects (or configure field keys in `src/config.ts`):

- **Deal**: Selected Tour Code, Departure Date, Variant, Total Price, Currency, TravelFile Approval Status, TravelFile System Status, TravelBooster Booking ID, TravelFile Number, TravelBooster Error Message.
- **Person**: ID/Passport, Date of Birth (optional: Gender, Passport expiry, Nationality).

Passengers are **Deal Participants** (linked Persons). The agent reads participants via the Pipedrive API and validates that each has ID/Passport and Date of Birth before creating the TravelBooster booking.

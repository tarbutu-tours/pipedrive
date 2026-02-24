# WEBTARBUTU – AI Chatbot (WhatsApp + Web)

Production-ready chatbot for **תרבותו (Tarbutu)** travel agency: WhatsApp via whatsapp-web.js and a website widget. All logic lives in this folder.

## Features

- **Gatekeeper**: Welcome → 1. Sales | 2. Support
- **Sales**: GPT-4o answers from [tarbutu.co.il](https://tarbutu.co.il/) content; **mandatory lead capture** (name + phone) before pricing; Pipedrive Person + Deal with UTM and chat summary
- **Support**: FAQ-based answers; Monday.com item per support request
- **WhatsApp**: QR in terminal; human takeover = 60 min pause when you reply from the phone
- **Alerts**: Email (and optional WhatsApp) to manager on low-confidence/unanswered
- **Admin**: `/admin` – live chat feed, leads table, Pause Bot
- **Web widget**: Floating bubble; captures UTM from URL and sends to backend

## Setup

### 1. Install

```bash
cd WEBTARBUTU
npm install
```

### 2. Environment

Copy `.env.example` to `.env` and set:

- `PORT` – server port (default 3000)
- `OPENAI_API_KEY` – OpenAI API key
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` – Supabase project
- `PIPEDRIVE_API_TOKEN`, `PIPEDRIVE_DOMAIN` – Pipedrive
- `MONDAY_API_KEY`, `MONDAY_BOARD_ID` – Monday.com (optional: `MONDAY_COLUMN_DESCRIPTION`, `MONDAY_COLUMN_PHONE`)
- `ALERT_EMAIL` – manager email for alerts
- `ALERT_WHATSAPP_PHONE` – optional (e.g. `972501234567`)
- SMTP vars – for alert emails
- `AGENCY_NAME` – e.g. תרבותו

### 3. Database

In Supabase SQL Editor, run:

```bash
# contents of database/schema.sql
```

### 4. Run

```bash
npm start
```

- Server: http://localhost:3000  
- Admin: http://localhost:3000/admin  
- On first run, **scan the QR code** in the terminal with WhatsApp to link the bot.

## Web Widget

Add to your site (e.g. tarbutu.co.il):

```html
<script>
  window.WEBTARBUTU_API = 'https://your-backend-url.com';  // optional if same origin
  window.WEBTARBUTU_AGENCY = 'תרבותו';
</script>
<script src="https://your-backend-url.com/widget.js" async></script>
```

UTM params (`utm_source`, `utm_medium`, `utm_campaign`) are read from the page URL and sent with each message.

## Deployment

- **Render**: Use the included `render.yaml` (Web Service). Persist `.wwebjs_auth` via a disk or re-scan QR after deploy.
- **Vercel**: Serverless is not suitable for the WhatsApp long-running client; run the backend on Render/Fly/Railway and point the widget and admin to that URL.

## API (for widget / custom clients)

- `POST /api/chat` – body: `{ message, sessionId?, utm? }` → `{ reply, sessionId, leadCaptured? }`
- `POST /api/chat/welcome` – body: `{ sessionId?, utm? }` → `{ reply, sessionId }`
- `GET /api/chat/history?sessionId=...` – chat history
- `GET /api/admin/leads`, `GET /api/admin/messages`, `GET|POST /api/admin/pause` – admin (no auth in this version; add auth in production)

## License

Proprietary – Tarbutu.

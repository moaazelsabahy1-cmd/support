# Solvio

Production-ready customer support SaaS: tickets, live chat, knowledge base, AI assistant, meetings, notifications, analytics, PWA, and an embeddable widget.

This app uses a **custom Node server** (`server.ts`) so Socket.IO and Next.js share one process. It is not deployable to Vercel serverless. Use Docker, a VM, or any long-running Node host.

## Prerequisites

- Node.js 20+
- PostgreSQL 16 (local, Docker, or hosted). Default local Compose URL: `postgresql://solvio:solvio@localhost:5433/solvio` (host port 5433 to avoid clashing with an existing Postgres on 5432).

Optional: OpenRouter (LLM + embeddings), Cloudflare R2, Qdrant, Firecrawl, SMTP, VAPID push keys.

## Commands

```bash
npm install
cp .env.example .env
docker compose up -d db
npx prisma migrate deploy
npm run db:check
npm run db:seed
npm run dev
```

If you already have Postgres, set `DATABASE_URL` in `.env` and skip Compose.

Copy an existing MongoDB workspace (preserves 24-character document IDs for Qdrant):

```bash
npx tsx scripts/migrate-mongo-to-postgres.ts
```

Production:

```bash
npm run build
npm run start
```

Quality:

```bash
npm run lint
npm run typecheck
npm test
```

## Demo accounts (development only)

| Role | Email | Password |
| --- | --- | --- |
| Super admin | superadmin@solvio.local | SolvioSuper1! |
| Admin | admin@solvio.local | SolvioAdmin1! |
| Agent | agent@solvio.local | SolvioAgent1! |
| Customer | customer@solvio.local | SolvioCustomer1! |

## Embed widget

```html
<script src="http://localhost:3000/widget.js"></script>
```

Public widget APIs use `WIDGET_PUBLIC_KEY` (not your OpenRouter key).
LLM requests go through OpenRouter (`OPENROUTER_API_KEY`). Chat model: `OPENROUTER_MODEL` (default `google/gemini-3.7-flash`). Embeddings: `OPENROUTER_EMBEDDING_MODEL` (default `openai/text-embedding-3-small`, 1536 dimensions). Requests use `https://openrouter.ai/api/v1`, not OpenAI’s API. Do not put provider keys in client-side code.

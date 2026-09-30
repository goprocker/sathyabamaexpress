# Livora AI

A household operating system. Livora watches everyday events (a grocery bill, a spoken meal plan, a due date), keeps the canonical state in one place, predicts what needs attention next, and proposes actions with the evidence behind them. Nothing privileged happens without your approval.

The kitchen is the hero vertical: scan a bill, stock the inventory, pick from 63 Indian recipes, and cook with one tap. Around it sit a timeline, life admin, mobility, circular living, and an assistant you can talk to.

```
OBSERVE → UNDERSTAND → UPDATE STATE → PREDICT → PLAN → ASK → ACT → VERIFY
```

## Features

| Area | What it does |
|---|---|
| **Home** | Today at a glance: what matters next, module summaries, suggestions you can accept or dismiss. |
| **Timeline** | One calendar for meals, bills, vehicle service and trips, with collision detection when deadlines pile up. |
| **Kitchen** | Inventory fed by scanned bills, recipes, meal plan, smart cart, voice commands, forecasts and approvals. |
| **Life Admin** | Bills, documents, renewals and vehicle obligations, with due dates and status. |
| **Mobility** | Leave-by times, route cost and CO₂ comparison, EV charge planning, trip sharing. |
| **Circular** | Wardrobe, occasion outfit planning, reuse and sharing with an editable impact estimate. |
| **Assistant** | Ask in text, by voice, or with a photo. Answers come from your own household data, never from a menu of canned questions. |
| **Notifications** | Grouped, not noisy. |

### Kitchen in detail

- **Inventory** (`/inventory`): stock, expiry and low-stock status. Confirming a scanned bill adds items here with quantity and expiry.
- **Scan bill** (`/receipt`): upload a receipt, review the extracted lines, confirm. Extraction uses a vision model; quantities and unit conversion are deterministic.
- **Recipes** (`/recipes`): 63 South Indian and pan-Indian recipes with photos, method and per-serving scaling (1 to 8). Each ingredient shows what you have and what is short.
- **Prepare this recipe**: deducts the ingredients from inventory, oldest stock first. It refuses when something is short unless you choose "Prepare with what I have". Retries never deduct twice (idempotency keys).
- **Voice**: speak a meal plan in Tamil, Tanglish or English; the app simulates the consequences, then proposes an approval-gated vendor call for any shortage.

### Assistant

Every question is answered by a language model against a deterministic snapshot of your household (timeline, pantry, cart, bills, forecasts, commute, wardrobe, and which recipes you can cook now). Totals such as weekly spend are computed in code and passed in, not calculated by the model. Voice input uses speech-to-text, and you can attach a photo of a receipt, bill or outfit. Without an OpenAI key it falls back to rule-based answers.

## Principles

1. **PostgreSQL-shaped canonical state is the source of truth.** LLM context is never application state.
2. **Agents reason, services calculate.** Inventory arithmetic, recipe scaling and state transitions are deterministic TypeScript.
3. **Every action has evidence:** required, available, deficit.
4. **Privileged actions need approval.** Vendor calls happen only with a token bound to `action_id + payload_hash + user_id + expiry`.
5. **Idempotency keys** on every state-changing command.
6. **No secrets in the browser.** Only `VITE_*` values reach the frontend.

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces (pnpm 10, Node 22+) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Router and Query |
| Backend | Node.js, TypeScript, Fastify |
| Validation | Zod, shared contracts in `packages/contracts` |
| Auth | Clerk |
| AI, voice, execution | OpenAI, Sarvam, Snapserve (server-side only) |
| Tests | Node test runner via `tsx` |

## Repository layout

```
apps/
  web/                React SPA, installable as a mobile PWA
  api/                Fastify API (routes, Clerk guard, Vercel entry)
packages/
  contracts/          Zod schemas and types shared by web, api, agents, tests
  db/                 Canonical state store
  domain/             Deterministic engines: inventory, meals, forecasts, ripple, approvals
  life/               Timeline, mobility, circular, recipe catalogue, assistant context
  agents/             Voice and receipt workflows
  integrations/       OpenAI, Sarvam and Snapserve adapters
  tools/              Typed tool layer with permission checks
tests/                unit, integration and eval tests
docs/                 PRD.md, TRD.md, DESIGN_SYSTEM.md
```

## Getting started

**Prerequisites:** Node 22 or newer and pnpm 10.

```bash
pnpm install
cp .env.example .env      # then fill in the values you need, see below
pnpm dev:all              # API on :4000 and web on :5173
```

Open http://localhost:5173.

With no keys set the app still runs: the API is open, login is off, assistant answers use the rule-based engine, and the receipt scanner and voice fall back to deterministic demos.

### Environment variables

One `.env` at the repository root serves both apps. Never commit it (it is gitignored).

| Variable | Where | Purpose |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | web | Turns on the login gate. Safe for the browser. |
| `CLERK_SECRET_KEY` | api | Makes the API require a valid session on every route except health. Server only. |
| `CLERK_AUTHORIZED_PARTIES` | api | Optional, comma-separated web origins allowed to mint tokens. |
| `DATABASE_URL` | api | Postgres connection string. Stores each user's household in a `livora_user_state` table (created automatically). **Required on Vercel**, where local files do not survive. Without it, users are saved as files in `apps/api/.data/users/`. |
| `OPENAI_API_KEY` | api | Contextual assistant, receipt vision, meal intent. |
| `OPENAI_MODEL`, `OPENAI_VISION_MODEL` | api | Model names (defaults `gpt-4o-mini` and `gpt-4o`). |
| `SARVAM_API_KEY`, `SARVAM_STT_MODEL` | api | Speech-to-text for Tamil, Tanglish and English. |
| `SNAPSERVE_API_KEY`, `SNAPSERVE_AGENT_ID` | api | Real outbound vendor calls; the simulator is used without them. |
| `APPROVAL_HMAC_SECRET` | api | Signs approval tokens. Set a long random value outside local dev. |
| `PORT`, `HOST` | api | Defaults `4000` and `0.0.0.0`. |
| `VITE_API_BASE_URL` | web | Point the web app at a remote API instead of the `/api` proxy. |

### Authentication (Clerk)

1. Create an application at https://dashboard.clerk.com and enable the sign-in methods you want (email, Google).
2. Put the publishable key in `VITE_CLERK_PUBLISHABLE_KEY` and the secret key in `CLERK_SECRET_KEY`.
3. Restart. Every product screen now needs a sign-in, and the API returns `401` without a valid session token.

Left open on purpose: `/landing`, `/api/health`, `/api/ready`, and the Snapserve webhook (it verifies its own HMAC signature). The live event stream (`/api/events/stream`) checks a session token passed as `?token=`, because browsers cannot send an auth header on it.

### Your data (per user)

Every signed-in user gets their own household, and it starts **empty**: no stock, receipts, bills, meals, forecasts, notifications or history. Scan a bill or plan a meal and it fills up. Users never see each other's data, and live events go only to the account that caused them.

- **Where it is stored:** one JSON document per user, in Postgres when `DATABASE_URL` is set, otherwise as a file under `apps/api/.data/users/`.
- **Reset:** "Reset demo" on a signed-in account clears it back to empty, not to demo data.
- **Signed-in accounts never see sample data as their own.** A failed request shows an error instead of falling back to demo content, and a receipt that cannot be read is rejected instead of inventing items.
- **Still sample content:** the Mobility and Circular screens (commute, EV, wardrobe, sharing) and the vendor directory are built-in and shared, because they have no per-user data model yet. Recipes are reference content, not user data.
- **Without Clerk keys** the app runs as one shared demo household with sample data.

## Commands

```bash
pnpm dev:all          # API and web together
pnpm dev              # web only
pnpm dev:api          # API only
pnpm build            # type-check and build the web app
pnpm typecheck        # every workspace
pnpm lint             # eslint across workspaces
pnpm test             # unit, integration and eval tests
pnpm test:unit
pnpm test:integration
pnpm test:evals
```

## API overview

All routes live under `/api`.

| Route | Purpose |
|---|---|
| `GET /inventory`, `GET /inventory/:id` | Stock with lots and expiry |
| `POST /receipts/extract`, `POST /receipts/:id/confirm` | Scan a bill, then commit it to inventory |
| `GET /life/recipes?servings=` | Recipe catalogue with per-ingredient availability |
| `POST /life/recipes/:id/prepare` | Cook: deduct stock, idempotent, `409` when short |
| `GET /life/receipts/recent` | Bills already added to inventory |
| `POST /life/assistant` | Contextual answer, optional `image` and `history` |
| `POST /life/assistant/voice` | Audio in, transcript and answer out |
| `POST /meals/simulate`, `POST /meals/commit` | Meal simulation and commit |
| `GET /forecasts`, `GET /actions`, `POST /actions/:id/approve` | Predictions and the approval flow |
| `GET /life/overview`, `GET /mobility`, `GET /circular`, `GET /notifications` | Life modules |

## Testing

`pnpm test` runs the whole suite against isolated temporary stores, so it never touches your local demo data and never needs Clerk keys or a database. It covers the deterministic engines, the recipe and inventory flow (bill to recipe unlock, refusal when short, idempotent cooking), the auth guard, and per-user isolation (fresh start, privacy between users, persistence across restarts, reset).

## Deployment

`vercel.json` builds the web app (`apps/web/dist`), serves the API through the single function `api/index.ts` (which loads `apps/api`), and rewrites every other path to the single-page app so deep links like `/recipes` work.

**Vercel project settings that matter**

- **Root Directory must be the repository root** (leave it empty). If it is set to `apps/web`, Vercel ignores this `vercel.json`: only the static site is deployed, there is no API, every `/api/*` call and every deep link returns Vercel's `NOT_FOUND`, and the app shows "Can't reach the server" after login.
- Framework preset can be "Other" or "Vite". The build and output settings come from `vercel.json`.
- Set the environment variables from the table above, including `DATABASE_URL` (serverless functions have no durable disk, so per-user data needs Postgres). `VITE_CLERK_PUBLISHABLE_KEY` is baked in at build time, so redeploy after changing it.
- Use a live Clerk instance and rotate any development keys before shipping.

**Check a deployment**

Open `https://<your-app>.vercel.app/api/health`. You should see JSON with `config.auth: "enforced"`. A Vercel `NOT_FOUND` page means the API function is not deployed (check the Root Directory). A JSON message starting `The API failed to start` names the startup problem.

## Design

The design system in `docs/DESIGN_SYSTEM.md` is binding: warm surfaces, near-black text, a single green accent, thin borders, no gradients-on-text, no glow. Interfaces are built for 360, 390 and 430px phones first, with the same codebase scaling up to a desktop layout. Touch targets are at least 44px.

## Credits

Recipe photos are loaded from Wikimedia Commons and are freely licensed; each recipe view credits the source.

## Further reading

- [`docs/PRD.md`](docs/PRD.md): product requirements
- [`docs/TRD.md`](docs/TRD.md): technical requirements
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md): design rules
- [`AGENTS.md`](AGENTS.md): rules for coding agents working in this repo

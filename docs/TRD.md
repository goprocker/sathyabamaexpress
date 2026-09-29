# Agentic Development TRD — Household & Personal Obligation Intelligence

## 1. Technical Overview

**Product:** Household & Personal Obligation Intelligence  
**Architecture:** Hybrid Agentic + Deterministic Modular Monolith  
**Frontend:** React 18/19 + TypeScript + Vite + Tailwind CSS + TanStack Query  
**Mobile:** Responsive PWA (installable manifest + mobile-first action sheet)  
**Backend:** Node.js + TypeScript + Fastify (or Express)  
**Database:** PostgreSQL (Supabase) + `pgvector`  
**ORM & Validation:** Prisma + Zod (`packages/contracts`)  
**LLM Reasoning & Vision:** OpenAI (`gpt-4o` / `gpt-4o-mini` with Structured Outputs)  
**Voice / Indic Speech:** Sarvam AI (Speech-to-Text & Code-Mixed Tanglish/Tamil translation)  
**External Voice Execution:** Snapserve (Outbound Voice Agent API)

### Core Technical Principle

> **Agents decide and interpret. Tools validate. Services calculate deterministically. PostgreSQL remembers. Policies control. The user approves.**

---

## 2. High-Level Architecture

```text
                                 USER
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
          DESKTOP WEB                            MOBILE PWA
    (Sidebar Workspace UI)                 (Bottom Nav + Quick Add)
                │                                     │
                └──────────────────┬──────────────────┘
                                   │ HTTPS / REST + Supabase Realtime
                                   ▼
                             API GATEWAY
                       (Fastify + Zod Validation)
                                   │
                    ┌──────────────▼──────────────┐
                    │     SUPERVISOR ROUTER       │
                    │ (Fast Deterministic Route   │
                    │  + LLM Intent Classifier)   │
                    └──────────────┬──────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
       ▼                           ▼                           ▼
LLM SPECIALIST AGENTS    DETERMINISTIC ENGINES         ACTION & EXECUTION
• Intake Agent           • Inventory Engine            • Action Planner (LLM)
  (Vision + Voice NLU)   • Meal Scaling Engine         • Approval Token Gate
                         • Ripple Graph Engine         • Execution Engine
                         • Forecast Engine             • Reconciliation (LLM)
       │                           │                           │
       └───────────────────────────┼───────────────────────────┘
                                   │
                         TYPED TOOL GATEWAY
                (Schema Validation + RBAC + Audit Log)
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
  CANONICAL STATE           REALTIME & STORAGE         EXTERNAL PROVIDERS
PostgreSQL (Prisma)         Supabase Realtime         • OpenAI (Vision/JSON)
+ pgvector Memory           + Supabase Storage        • Sarvam AI (STT)
                                                      • Snapserve (Outbound)
```

Use a **modular monolith** in a single TypeScript monorepo (`pnpm` workspaces) to eliminate microservice network overhead and guarantee shared type safety across frontend, backend, agents, and tools.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Monorepo** | `pnpm` workspaces | Shared contracts between `apps/web`, `apps/api`, and `packages/*` |
| **Web & Mobile PWA** | React + TypeScript + Vite | Single codebase serving Desktop (`1280px`) and Mobile PWA (`360px–430px`) |
| **Styling & Icons** | Tailwind CSS + CSS Variables + Lucide | Warm editorial design system with zero "AI slop" |
| **Client State** | TanStack Query + Supabase Realtime | Optimistic UI + automatic server-state invalidation on webhook/agent events |
| **Backend API** | Node.js + TypeScript + Fastify | Low-overhead typed HTTP API + webhook receiver |
| **Database** | PostgreSQL (Supabase) | ACID transactions for inventory ledger, events, ripples, and audit logs |
| **ORM** | Prisma | Type-safe schema migrations, transactional writes, and seed scripts |
| **Contracts** | Zod (`packages/contracts`) | Runtime validation for API payloads, OpenAI Structured Outputs, and Tool inputs |
| **LLM** | OpenAI API | Receipt OCR parsing, fuzzy entity resolution, "Why?" synthesis, transcript verification |
| **Voice Input** | Sarvam AI STT API | Tamil, Tanglish, and Indian English speech-to-text transcription |
| **External Execution** | Snapserve API | Outbound automated voice calls to local vendors (`create_outbound_call`, `get_call`) |

---

## 4. Repository Structure

```text
/
├── apps/
│   ├── web/                        # React + Vite + Tailwind (Desktop + Mobile PWA)
│   └── api/                        # Fastify server, routes, realtime broadcaster
│
├── packages/
│   ├── contracts/                  # Shared Zod schemas & TypeScript types
│   ├── db/                         # Prisma schema, migrations, canonical seed script
│   ├── domain/                     # Deterministic Engines: Inventory, Meal, Ripple, Forecast
│   ├── agents/                     # LLM Agents: Supervisor, Intake, ActionPlanner, Reconciliation
│   ├── tools/                      # Typed tool registry, permission guard, audit logger
│   └── integrations/               # OpenAI, Sarvam, Snapserve adapters + offline mock fallbacks
│
├── tests/
│   ├── unit/                       # Deterministic math, unit conversion, ripple traversal tests
│   ├── integration/                # End-to-end event -> ripple -> action -> reconciliation tests
│   └── evals/                      # Tanglish voice & receipt extraction test fixtures
│
├── docs/
│   ├── Household_Intelligence_Agentic_PRD.md
│   ├── Household_Intelligence_Agentic_TRD.md
│   └── Household_Intelligence_Design_System_and_Frontend.md
│
├── AGENTS.md                       # Mandatory rules & file ownership for coding agents
└── .env.example
```

---

## 5. Hybrid Runtime Architecture: LLM Agents vs. Deterministic Engines

A critical architectural decision for meeting the `<1s` Ripple and `<2min` end-to-end demo targets is **avoiding sequential LLM calls for deterministic math**.

### 5.1 Supervisor Router
- **Deterministic Fast Path (0ms LLM overhead):** When the frontend invokes structured endpoints (e.g., `POST /api/meals/simulate`, `POST /api/receipts/:id/confirm`, `POST /api/actions/:id/approve`), the Supervisor Router dispatches directly to the corresponding domain pipeline.
- **LLM Intent Classifier:** When unstructured text or voice transcript arrives at `POST /api/events/ingest`, the Supervisor classifies the intent (`MEAL_PLANNED`, `PURCHASE_RECORDED`, `INVENTORY_QUERY`, `OBLIGATION_ADDED`) and invokes the appropriate specialist agent.
- **Restrictions:** Cannot write to PostgreSQL directly, cannot execute raw SQL, and cannot call external vendors.

### 5.2 Runtime Component Matrix

| Component | Execution Mode | Responsibility | Allowed Tools |
|---|---|---|---|
| **Supervisor** | Hybrid Router | Intent classification & workflow orchestration | `state.read`, `event.read`, `agent.invoke`, `workflow.status` |
| **Intake Agent** | LLM + Vision | Receipt OCR, document parsing, Tanglish/Tamil NLU → normalized event + entity matching | `recipe.read`, `inventory.read`, `event.create` |
| **Inventory Engine** | Deterministic TS | Base-unit conversion (`g`, `ml`, `count`), FIFO lot allocation, `on_hand / reserved / incoming` ledger | `inventory.read`, `inventory.simulate`, `inventory.commit` |
| **Meal Engine** | Deterministic TS | Recipe lookup, exact serving multiplication, ingredient shortage calculation | `recipe.read`, `inventory.read`, `inventory.simulate` |
| **Ripple Engine** | Deterministic TS | Bounded DAG traversal (depth 1–5) across meals, inventory, and obligations | `graph.read`, `inventory.simulate`, `forecast.run` |
| **Forecast Engine** | Deterministic TS | Moving-average burn rate, days-to-depletion, expiry risk | `inventory.read`, `forecast.run`, `forecast.read` |
| **Action Planner** | LLM + Rules | Generates proposed actions, human-readable **"Why?"** evidence, and Snapserve call prompt | `state.read`, `forecast.read`, `action.prepare`, `approval.request` |
| **Execution Engine** | Deterministic TS | Verifies HMAC approval token, dispatches `snapserve.call`, streams call status | `action.read`, `snapserve.call`, `snapserve.status` |
| **Reconciliation Agent** | LLM Verifier | Parses Snapserve call transcript to verify vendor confirmation and update incoming stock | `snapserve.status`, `outcome.reconcile`, `inventory.commit` |

---

## 6. Agent Tool Layer & Permission Guard

Agents never access Prisma/PostgreSQL or external provider SDKs directly. Every operation passes through the **Typed Tool Gateway**:

```text
Agent / Engine Step
        ↓
Tool Invocation (toolName + input payload)
        ↓
Zod Schema Validation (packages/contracts)
        ↓
Permission & Allowlist Check (Agent Role → Allowed Tools)
        ↓
Idempotency Check (idempotency_key lookup for write/external tools)
        ↓
Domain Service Execution (Prisma Transaction / Provider Adapter)
        ↓
Audit & Telemetry Log (tool_calls + audit_log tables)
```

### Tool Permission Tiers

1. **Read Tier (Zero Side Effects):**
   `state.read`, `event.read`, `inventory.read`, `recipe.read`, `graph.read`, `forecast.read`, `action.read`, `snapserve.status`
2. **Compute / Simulation Tier (Pure Functions over State):**
   `inventory.simulate`, `forecast.run`, `state.compare`
3. **Controlled Write Tier (Idempotent State Transitions):**
   `event.create`, `inventory.commit`, `action.prepare`, `approval.request`, `outcome.reconcile`
4. **Privileged External Tier (Requires Verified User Approval Token):**
   `snapserve.call`

---

## 7. Canonical Database Schema (PostgreSQL + Prisma)

PostgreSQL is the single source of truth. All quantities are stored in **canonical base units** (`g` for mass, `ml` for volume, `count` for discrete items) alongside a `display_unit` (`kg`, `g`, `L`, `ml`, `pcs`) so unit arithmetic never suffers from unit mismatch.

### 7.1 Core Entity & Inventory Tables

```sql
-- 1. Households & Members
households (
  id                TEXT PRIMARY KEY,          -- e.g., "hh_demo_001"
  name              TEXT NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

members (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  name              TEXT NOT NULL,
  role              TEXT NOT NULL,             -- 'ADMIN' | 'MEMBER'
  phone_e164        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- 2. Vendors (Targets for Snapserve Execution)
vendors (
  id                TEXT PRIMARY KEY,          -- e.g., "vnd_kaveri_fresh"
  household_id      TEXT NOT NULL REFERENCES households(id),
  name              TEXT NOT NULL,             -- e.g., "Kaveri Fresh Mart & Meats"
  phone_e164        TEXT NOT NULL,             -- e.g., "+919840000000"
  categories        TEXT[] NOT NULL,           -- ['meat', 'dairy', 'produce', 'groceries']
  snapserve_agent_id INTEGER,                  -- Snapserve voice agent ID
  is_preferred      BOOLEAN NOT NULL DEFAULT TRUE
)

-- 3. Canonical Resources & Three-Tier Inventory Ledger
resources (
  id                TEXT PRIMARY KEY,          -- e.g., "res_chicken", "res_rice"
  household_id      TEXT NOT NULL REFERENCES households(id),
  canonical_name    TEXT NOT NULL,             -- e.g., "Chicken", "Basmati Rice", "Onion", "Curd"
  aliases           TEXT[] NOT NULL,           -- ["kozhi", "chicken curry cut", "தயிர்", "yogurt"]
  category          TEXT NOT NULL,             -- 'protein' | 'grain' | 'produce' | 'dairy' | 'spice'
  base_unit         TEXT NOT NULL,             -- 'g' | 'ml' | 'count'
  display_unit      TEXT NOT NULL,             -- 'kg' | 'g' | 'L' | 'ml' | 'pcs'
  on_hand_quantity  NUMERIC(12,2) NOT NULL DEFAULT 0, -- Physical stock currently in kitchen (in base_unit)
  reserved_quantity NUMERIC(12,2) NOT NULL DEFAULT 0, -- Reserved by upcoming MEAL_PLANNED (in base_unit)
  incoming_quantity NUMERIC(12,2) NOT NULL DEFAULT 0, -- Confirmed vendor order en route (in base_unit)
  safety_threshold  NUMERIC(12,2) NOT NULL DEFAULT 0, -- Low-stock alert threshold (in base_unit)
  avg_daily_burn    NUMERIC(12,2) NOT NULL DEFAULT 0, -- Historical/estimated daily consumption
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- 4. FIFO Inventory Lots (Expiry & Purchase Provenance)
inventory_lots (
  id                TEXT PRIMARY KEY,
  resource_id       TEXT NOT NULL REFERENCES resources(id),
  quantity_remaining NUMERIC(12,2) NOT NULL,   -- In base_unit
  unit_Cost_inr     NUMERIC(10,2),
  purchased_at      TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ,
  source_event_id   TEXT,
  status            TEXT NOT NULL              -- 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
)

-- 5. Receipt Uploads (Staging for Low-Confidence Review)
receipt_uploads (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  vendor_name       TEXT,
  image_url         TEXT,
  status            TEXT NOT NULL,             -- 'EXTRACTED_PENDING_REVIEW' | 'COMMITTED'
  extracted_items   JSONB NOT NULL,            -- Array of ReceiptLineItem with confidence scores
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at      TIMESTAMPTZ
)
```

### 7.2 Recipes, Meal Plans, Events & Graph Relationships

```sql
-- 6. Recipes & Ingredients
recipes (
  id                TEXT PRIMARY KEY,          -- e.g., "rcp_chicken_biryani"
  household_id      TEXT NOT NULL REFERENCES households(id),
  name              TEXT NOT NULL,             -- "Chicken Biryani"
  aliases           TEXT[] NOT NULL,           -- ["biryani", "kozhi biryani", "பிரியாணி"]
  default_servings  INTEGER NOT NULL DEFAULT 4
)

recipe_ingredients (
  id                TEXT PRIMARY KEY,
  recipe_id         TEXT NOT NULL REFERENCES recipes(id),
  resource_id       TEXT NOT NULL REFERENCES resources(id),
  qty_per_serving   NUMERIC(10,2) NOT NULL,    -- In resource base_unit (e.g., 250g Chicken, 200g Rice, 133.33g Onion, 50ml Curd)
  is_critical       BOOLEAN NOT NULL DEFAULT TRUE
)

-- 7. Planned Meals
meal_plans (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  recipe_id         TEXT NOT NULL REFERENCES recipes(id),
  servings          INTEGER NOT NULL,
  planned_date      DATE NOT NULL,
  meal_slot         TEXT NOT NULL,             -- 'breakfast' | 'lunch' | 'dinner'
  status            TEXT NOT NULL,             -- 'SIMULATED' | 'PLANNED_SHORTAGE' | 'PLANNED_READY' | 'CONSUMED' | 'CANCELLED'
  source_event_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- 8. Normalized Events (Idempotent Event Log)
events (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  idempotency_key   TEXT UNIQUE NOT NULL,
  type              TEXT NOT NULL,             -- See Section 10 Event Model
  source            TEXT NOT NULL,             -- 'voice' | 'receipt' | 'ui' | 'system' | 'snapserve'
  confidence        NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  payload           JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- 9. Causal Relationships & Obligations
relationships (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  source_type       TEXT NOT NULL,             -- 'meal_plan' | 'recipe' | 'vehicle' | 'document'
  source_id         TEXT NOT NULL,
  relation          TEXT NOT NULL,             -- 'consumes' | 'depends_on' | 'renews_on' | 'conflicts_with'
  target_type       TEXT NOT NULL,             -- 'resource' | 'obligation' | 'meal_plan'
  target_id         TEXT NOT NULL,
  metadata          JSONB
)

obligations (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  category          TEXT NOT NULL,             -- 'utility' | 'document' | 'vehicle' | 'subscription'
  title             TEXT NOT NULL,             -- e.g., "Vehicle Insurance Renewal (TN-01-AB-1234)"
  due_date          TIMESTAMPTZ NOT NULL,
  amount_inr        NUMERIC(10,2),
  status            TEXT NOT NULL,             -- 'UPCOMING' | 'DUE_SOON' | 'OVERDUE' | 'RESOLVED'
  metadata          JSONB
)

forecasts (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  target_type       TEXT NOT NULL,             -- 'resource' | 'obligation'
  target_id         TEXT NOT NULL,
  risk_type         TEXT NOT NULL,             -- 'SHORTAGE_RISK' | 'EXPIRY_RISK' | 'WASTE_RISK' | 'COMPLIANCE_RISK'
  severity          TEXT NOT NULL,             -- 'LOW' | 'MEDIUM' | 'HIGH'
  predicted_date    TIMESTAMPTZ NOT NULL,
  explanation       TEXT NOT NULL,
  details           JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### 7.3 Actions, Approvals & Agent Observability Tables

```sql
-- 10. Actions & Outcomes
actions (
  id                    TEXT PRIMARY KEY,
  household_id          TEXT NOT NULL REFERENCES households(id),
  source_event_id       TEXT REFERENCES events(id),
  type                  TEXT NOT NULL,         -- 'VENDOR_PURCHASE_CALL' | 'OBLIGATION_REMINDER'
  status                TEXT NOT NULL,         -- 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'CONFIRMED' | 'FAILED' | 'REJECTED'
  title                 TEXT NOT NULL,         -- e.g., "Order 800g Chicken & 200ml Curd"
  reason_summary        TEXT NOT NULL,
  why_evidence          JSONB NOT NULL,        -- Structured arithmetic & ripple path for "Why?" drawer
  target_vendor_id      TEXT REFERENCES vendors(id),
  payload               JSONB NOT NULL,        -- Items, quantities, delivery window, call script
  payload_hash          TEXT NOT NULL,         -- SHA-256 hash of canonical payload JSON
  approval_required     BOOLEAN NOT NULL DEFAULT TRUE,
  approval_token_hash   TEXT,                  -- Bound to action_id + payload_hash + user_id + expiry
  approval_expires_at   TIMESTAMPTZ,
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  external_call_id      TEXT,                  -- Snapserve callId
  external_call_status  TEXT,                  -- 'PREPARING' | 'CALLING' | 'CONNECTED' | 'AWAITING_RESPONSE' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

action_outcomes (
  id                TEXT PRIMARY KEY,
  action_id         TEXT NOT NULL REFERENCES actions(id),
  status            TEXT NOT NULL,             -- 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'UNKNOWN'
  transcript        TEXT,                      -- Full Snapserve conversation transcript
  verified_payload  JSONB,                     -- Extracted vendor confirmation (items, price, ETA)
  reconciled_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- 11. Agent Trace & Audit Tables
agent_runs (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  trigger_event_id  TEXT REFERENCES events(id),
  workflow_type     TEXT NOT NULL,             -- 'RECEIPT_INTAKE' | 'MEAL_PLANNING' | 'ACTION_EXECUTION' | 'RECONCILIATION'
  status            TEXT NOT NULL,             -- 'RUNNING' | 'COMPLETED' | 'FAILED'
  input             JSONB NOT NULL,
  output            JSONB,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
)

agent_steps (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES agent_runs(id),
  step_index        INTEGER NOT NULL,
  agent_name        TEXT NOT NULL,             -- 'Supervisor' | 'IntakeAgent' | 'MealEngine' | 'RippleEngine' | 'ActionPlanner' ...
  action            TEXT NOT NULL,
  status            TEXT NOT NULL,
  reason            TEXT NOT NULL,
  latency_ms        INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

tool_calls (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES agent_runs(id),
  agent_step_id     TEXT NOT NULL REFERENCES agent_steps(id),
  tool_name         TEXT NOT NULL,
  idempotency_key   TEXT,
  input             JSONB NOT NULL,
  output            JSONB,
  status            TEXT NOT NULL,
  latency_ms        INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

audit_log (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL,
  actor             TEXT NOT NULL,             -- User ID or Agent Name
  operation         TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  before_state      JSONB,
  after_state       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

---

## 8. Canonical State vs. Agent Memory

Never use LLM prompt history as application state.

| Data Category | Storage Location | Authority Level |
|---|---|---|
| Inventory ledger (`on_hand`, `reserved`, `incoming`) | PostgreSQL (`resources`, `inventory_lots`) | **Canonical** |
| Events, meal plans & obligations | PostgreSQL (`events`, `meal_plans`, `obligations`) | **Canonical** |
| Causal dependency graph | PostgreSQL (`relationships`) | **Canonical** |
| Actions, approval tokens & outcomes | PostgreSQL (`actions`, `action_outcomes`) | **Canonical** |
| Agent execution traces | PostgreSQL (`agent_runs`, `agent_steps`, `tool_calls`) | **Canonical** |
| Household notes & dietary preferences | PostgreSQL (`pgvector` embeddings) | Contextual enrichment only |
| Intermediate LLM scratchpad | Ephemeral agent runtime memory | Discarded after run |

---

## 9. Normalized Event Model

Every external or user input is normalized into a typed `HouseholdEvent`:

```json
{
  "id": "evt_01J9BIRYANI001",
  "idempotencyKey": "voice_hh_demo_001_1727586000",
  "type": "MEAL_PLANNED",
  "householdId": "hh_demo_001",
  "source": "voice",
  "timestamp": "2026-09-29T10:30:00+05:30",
  "confidence": 0.96,
  "payload": {
    "dish": "Chicken Biryani",
    "recipeId": "rcp_chicken_biryani",
    "servings": 6,
    "plannedDate": "2026-09-30",
    "mealSlot": "dinner",
    "rawTranscript": "Naalaikku 6 perukku biryani pannanum."
  }
}
```

### Supported MVP Event Types
- `PURCHASE_RECORDED` — Receipt confirmed or manual purchase added
- `MEAL_PLANNED` — Future meal scheduled and ingredients reserved
- `MEAL_CONSUMED` — Meal cooked; physical stock and reservations deducted
- `DOCUMENT_EXPIRY_DETECTED` — Insurance, ID, or warranty expiry registered
- `UTILITY_BILL_DUE` — Electricity, water, or internet obligation detected
- `VEHICLE_SERVICE_DUE` — Vehicle maintenance or insurance obligation due
- `SUBSCRIPTION_RENEWAL_DETECTED` — Recurring subscription charge upcoming
- `ACTION_APPROVED` — User approved a pending action proposal
- `ACTION_REJECTED` — User rejected a pending action proposal
- `ACTION_COMPLETED` — External execution reconciled into canonical state

---

## 10. Domain Engine Specifications

### 10.1 Kitchen Receipt Pipeline (`Intake Agent` + `Inventory Engine`)

1. **Upload:** User uploads receipt image/PDF (`POST /api/receipts/extract`).
2. **Vision Extraction:** `Intake Agent` calls OpenAI Vision with a strict Zod JSON schema to extract line items (`rawName`, `quantity`, `unit`, `priceInr`, `expiryDate`, `confidence`).
3. **Entity Resolution & Base-Unit Conversion:**
   - Fuzzy-matches `rawName` against `resources.canonical_name` and `resources.aliases`.
   - Converts quantities into `base_unit` (`5 kg` → `5000 g`, `0.7 kg` → `700 g`, `200 ml` → `200 ml`).
4. **Staging & User Review:**
   - Persists staged record in `receipt_uploads` (`status: EXTRACTED_PENDING_REVIEW`).
   - Any item with `confidence < 0.85` (e.g., `Curd 200 ml ?`) is flagged in the UI for explicit confirmation/editing.
5. **Commit (`POST /api/receipts/:id/confirm`):**
   - Emits `PURCHASE_RECORDED` event.
   - Within a single Prisma transaction: creates `inventory_lots`, increments `resources.on_hand_quantity`, updates `forecasts`, and writes `audit_log`.

### 10.2 Meal Simulation & Reservation Engine (`Meal Engine`)

Given `{ recipeId: "rcp_chicken_biryani", servings: 6, plannedDate: "2026-09-30" }`:

1. **Deterministic Scaling:**
   $$\text{Required}_{i} = \text{qty\_per\_serving}_{i} \times \text{servings}$$
   - `Basmati Rice`: $200\text{ g} \times 6 = 1,200\text{ g}$ (`1.2 kg`)
   - `Chicken`: $250\text{ g} \times 6 = 1,500\text{ g}$ (`1.5 kg`)
   - `Onion`: $133.33\text{ g} \times 6 = 800\text{ g}$ (`0.8 kg`)
   - `Curd`: $50\text{ ml} \times 6 = 300\text{ ml}$ (`0.3 L`)
2. **Net Availability Calculation:**
   For each ingredient $i$:
   $$\text{NetAvailable}_{i} = \text{on\_hand}_{i} - \text{reserved\_other\_meals}_{i} + \text{incoming}_{i}$$
   $$\text{PostMealBalance}_{i} = \text{NetAvailable}_{i} - \text{Required}_{i}$$
   $$\text{Deficit}_{i} = \max(0, \text{Required}_{i} - \text{NetAvailable}_{i})$$
3. **Status Classification:**
   - If $\text{Deficit}_{i} > 0 \implies \text{MISSING}$ (e.g., `Chicken`: $1500 - 700 = 800\text{ g short}$; `Curd`: $300 - 200 = 100\text{ ml short}$).
   - Else if active lot `expires_at` $< \text{plannedDate} \implies \text{EXPIRING}$.
   - Else if $\text{PostMealBalance}_{i} \le \text{safety\_threshold}_{i} \implies \text{LOW}$.
   - Else $\implies \text{AVAILABLE}$.

### 10.3 Ripple Engine (Deterministic Graph Traversal)

The Ripple Engine executes a bounded Breadth-First Search (BFS, max depth `5`) starting from the trigger event node:

```text
[Event: MEAL_PLANNED (Biryani × 6)]
       │
       ├──► [Resource: Basmati Rice] ──► (5.0 kg on hand → 3.8 kg after meal: AVAILABLE)
       │
       ├──► [Resource: Onion]        ──► (2.0 kg on hand → 1.2 kg after meal: AVAILABLE)
       │
       ├──► [Resource: Chicken]      ──► [Shortage: 800g Deficit] ──┐
       │                                                            ├──► [Action Proposal: Order from Kaveri Fresh]
       └──► [Resource: Curd]         ──► [Shortage: 100ml Deficit] ─┘
```

**Algorithm:**
1. Initialize DAG with root node (`eventId`).
2. Load direct edges from `relationships` + active `meal_plans` + `inventory_lots`.
3. Evaluate edge rules deterministically:
   - `meal_plan → consumes → resource`: compute `PostMealBalance` and check if any *subsequent* planned meal on `planned_date > current` loses its required stock (cross-meal conflict).
   - `vehicle → depends_on → obligation`: check if `due_date` precedes any planned usage.
4. Deduplicate visited nodes and cap traversal at depth `5`.
5. Persist the structured DAG (`nodes[]`, `edges[]`, `whyEvidence`) so the frontend `RippleGraph` and `"Why?"` drawer render in `<100ms`.

### 10.4 Forecast Engine

Uses deterministic statistical rules over historical consumption and lot expiry dates:

1. **Daily Burn Rate:**
   $$\text{DailyBurn}_{i} = \max\left(\text{avg\_daily\_burn}_{i}, \frac{\sum \text{ConfirmedConsumption}_{14\text{d}}}{14}\right)$$
2. **Days to Depletion:**
   $$\text{DaysRemaining}_{i} = \frac{\max(0, \text{on\_hand}_{i} - \text{reserved}_{i} + \text{incoming}_{i})}{\text{DailyBurn}_{i}}$$
3. **Expiry-Before-Depletion (Waste Risk):**
   If an active lot's `expires_at` is sooner than `NOW() + (lot.quantity_remaining / DailyBurn)`, emit an `EXPIRY_RISK` forecast (e.g., `Milk · 400 ml expiring tomorrow`).

---

## 11. Action & Cryptographic Approval Architecture

When the Ripple or Forecast Engine detects a threshold breach (`MISSING` ingredient for a committed meal or high-severity `EXPIRY_RISK` / `COMPLIANCE_RISK`), the **Action Planner Agent** creates an `Action` record (`status: PENDING_APPROVAL`).

### Approval Token Binding
When the user clicks **Approve** (`POST /api/actions/:id/approve`):

1. Backend verifies that the underlying state (`payload_hash`) has not drifted since the proposal was generated.
2. Backend generates an HMAC-SHA256 approval token:
   $$\text{Token} = \text{HMAC\_SHA256}(\text{secret}, \texttt{action\_id} \parallel \texttt{payload\_hash} \parallel \texttt{user\_id} \parallel \texttt{expires\_at})$$
3. Stores `approval_token_hash` and `approval_expires_at` (`NOW() + 15 minutes`) on the `actions` row.
4. The `snapserve.call` tool **refuses to execute** unless a valid, non-expired token matching the current `payload_hash` is presented.

---

## 12. External Integrations & Fallback Resilience

### 12.1 Snapserve Integration (Outbound Vendor Calls)

Snapserve executes real outbound phone calls to vendors using AI voice agents.

1. **Agent Configuration:** A Snapserve voice agent (`agentId`) is configured with a concise procurement system prompt:
   > *"You are calling on behalf of a household customer to place a quick grocery/meat order with the store. State the items and quantities clearly, ask if they can deliver by tomorrow morning, confirm total availability, and thank them concisely."*
2. **Call Dispatch (`snapserve.call`):**
   Calls Snapserve `create_outbound_call`:
   ```json
   {
     "agentId": 101,
     "toNumber": "+919840000000",
     "metadata": {
       "actionId": "act_biryani_order_01",
       "householdId": "hh_demo_001",
       "orderSummary": "800 grams Chicken curry cut and 200 ml Curd for tomorrow morning delivery"
     }
   }
   ```
3. **Real-Time Status Progression:**
   - Backend polls Snapserve `get_call(callId)` (or receives webhook events) and broadcasts actual status transitions via Supabase Realtime to the frontend:
     `PREPARING → CALLING → CONNECTED → AWAITING_RESPONSE → CONFIRMED | FAILED | UNKNOWN`
4. **Transcript Reconciliation (`Reconciliation Agent`):**
   - Once the call completes, `get_call(callId)` returns the call `transcript` and `status`.
   - `Reconciliation Agent` parses the transcript to verify whether the vendor explicitly agreed to fulfill the items.
   - **Strict Rule:** Only `CONFIRMED` outcomes increment `resources.incoming_quantity` and resolve the meal shortage. `FAILED` or `UNKNOWN` outcomes leave the shortage open and prompt the user for fallback action.
5. **Demo Fallback Mode (`SNAPSERVE_MODE=simulated` or API unreachable):**
   - If Snapserve credentials or phone network are unavailable during testing, the adapter runs a deterministic 8-second state progression (`Preparing → Calling → Connected → Speaking → Confirmed`) with a realistic vendor transcript so the end-to-end state reconciliation pipeline still executes identically.

### 12.2 Sarvam AI Integration (Voice Input)

1. **Audio Capture:** Frontend records audio (`audio/webm` or `audio/wav`) and sends it to `POST /api/voice/transcribe` (protecting the `SARVAM_API_KEY` on the server).
2. **Transcription & Translation:** Backend sends audio to Sarvam STT (`saarika:v2` for native/code-mixed transcription or `saaras:v2` for speech-to-English translation), returning both the original Tamil/Tanglish transcript (`"Naalaikku 6 perukku biryani pannanum"`) and normalized English text.
3. **Fallback:** If Sarvam API is unreachable, the frontend falls back seamlessly to browser `webkitSpeechRecognition` (`ta-IN` / `en-IN`) or direct text input in the Voice drawer.

---

## 13. Complete REST API Specification

All endpoints validate requests and responses using shared Zod schemas from `packages/contracts`.

| Method & Path | Description | Request Body / Params | Response Summary |
|---|---|---|---|
| `GET /api/dashboard` | Aggregated overview state | `?householdId=...` | `{ todayMeals, inventorySummary, attentionItems, pendingActions, recentActivity }` |
| `GET /api/inventory` | List all household resources & lots | `?search=&filter=all\|low\|expiring` | `{ items: ResourceWithLots[], summary }` |
| `GET /api/inventory/:id` | Single resource detail & history | `:id` | `{ resource, lots, recentPurchases, recentConsumption, forecast }` |
| `POST /api/receipts/extract` | Upload receipt image for OCR staging | `multipart/form-data` or base64 image | `{ receiptId, vendorName, items: ExtractedReceiptItem[] }` |
| `POST /api/receipts/:id/confirm` | Confirm reviewed receipt items | `{ idempotencyKey, items: ConfirmedReceiptItem[] }` | `{ eventId, updatedResources, forecasts }` |
| `GET /api/recipes` | List available recipes & ingredients | `?search=` | `{ recipes: RecipeWithIngredients[] }` |
| `POST /api/meals/simulate` | Pure simulation of meal vs inventory | `{ recipeId, dishName, servings, plannedDate, mealSlot }` | `{ simulationId, ingredients: SimulatedIngredient[], ripplePreview }` |
| `POST /api/meals/commit` | Commit planned meal & trigger Ripple/Action | `{ idempotencyKey, recipeId, servings, plannedDate, mealSlot }` | `{ mealPlan, eventId, rippleGraph, proposedActions, agentRunId }` |
| `GET /api/ripples/:eventId` | Fetch causal ripple graph & "Why?" data | `:eventId` | `{ rootEvent, nodes: RippleNode[], edges: RippleEdge[], explanations }` |
| `GET /api/obligations` | List household obligations & forecasts | `?householdId=...` | `{ obligations: Obligation[], forecasts: Forecast[] }` |
| `GET /api/actions` | List pending & historical actions | `?status=PENDING_APPROVAL\|ALL` | `{ actions: ActionWithOutcome[] }` |
| `POST /api/actions/:id/approve` | Issue approval token & start execution | `{ idempotencyKey, userId }` | `{ action, approvalTokenIssued: true, executionStatus }` |
| `POST /api/actions/:id/reject` | Reject a proposed action | `{ userId, reason? }` | `{ action }` |
| `POST /api/voice/transcribe` | Transcribe Tamil/Tanglish/English audio | Audio blob + `?autoIngest=true` | `{ rawTranscript, normalizedText, structuredIntent, simulation? }` |
| `GET /api/timeline` | Chronological activity + agent traces | `?limit=30` | `{ entries: TimelineEntryWithAgentRun[] }` |
| `POST /api/demo/reset` | Reset DB to canonical judge demo seed | `{ householdId }` | `{ ok: true, resetTimestamp }` |

---

## 14. Shared Contracts (`packages/contracts`)

All modules import types and runtime validators from `packages/contracts`:

```typescript
import { z } from "zod";

export const BaseUnitSchema = z.enum(["g", "ml", "count"]);
export const IngredientStatusSchema = z.enum([
  "AVAILABLE",
  "LOW",
  "MISSING",
  "EXPIRING",
  "SURPLUS",
]);

export const MealPlannedPayloadSchema = z.object({
  dish: z.string().min(1),
  recipeId: z.string().optional(),
  servings: z.number().int().positive().max(100),
  plannedDate: z.string(), // ISO YYYY-MM-DD
  mealSlot: z.enum(["breakfast", "lunch", "dinner"]).default("dinner"),
  rawTranscript: z.string().optional(),
});

export const SimulatedIngredientSchema = z.object({
  resourceId: z.string(),
  name: z.string(),
  baseUnit: BaseUnitSchema,
  displayUnit: z.string(),
  requiredQty: z.number().nonnegative(),
  onHandQty: z.number().nonnegative(),
  reservedOtherQty: z.number().nonnegative(),
  incomingQty: z.number().nonnegative(),
  netAvailableQty: z.number(),
  deficitQty: z.number().nonnegative(),
  status: IngredientStatusSchema,
});

export const WhyEvidenceSchema = z.object({
  headline: z.string(),
  triggerLabel: z.string(), // e.g., "Biryani × 6 (Tomorrow · Dinner)"
  requiredDisplay: z.string(), // "1.5 kg (1,500 g)"
  availableDisplay: z.string(), // "700 g"
  deficitDisplay: z.string(), // "800 g"
  sources: z.array(z.string()), // ["Meal plan: Tomorrow Dinner", "Confirmed inventory lot #104", "Preferred vendor: Kaveri Fresh"]
});
```

---

## 15. Security, Idempotency & Failure Handling

### 15.1 Security Guardrails
1. **Zero Frontend Secrets:** `OPENAI_API_KEY`, `SARVAM_API_KEY`, and `SNAPSERVE_API_KEY` exist only in `apps/api` server environment variables.
2. **No Raw SQL by Agents:** Agents can only invoke registered tools in `packages/tools` with Zod-validated parameters.
3. **Cryptographic Approval Enforcement:** `snapserve.call` verifies the HMAC signature over `action_id + payload_hash + user_id + expires_at` before dialing.
4. **Full Auditability:** Every state mutation records `before_state` and `after_state` in `audit_log`.

### 15.2 Failure & Fallback Matrix

| Failure Scenario | Deterministic System Behavior |
|---|---|
| **OpenAI API timeout / error** | Retry once with structured constraint; fall back to deterministic keyword/alias parser for common demo dishes and receipt items |
| **Sarvam STT unavailable** | Automatically switch to browser Web Speech API (`ta-IN` / `en-IN`) + editable transcript text box |
| **Snapserve API unavailable** | Execute transparent simulated call state machine (`Calling → Connected → Confirmed`) with clearly labeled demo transcript |
| **Low-confidence receipt item (`<0.85`)** | Block automatic commit; highlight row with `?` badge in Receipt Review UI until user confirms |
| **State changes after action proposed** | `payload_hash` mismatch invalidates stale approval; system re-runs simulation and refreshes action proposal |
| **Duplicate webhook / double click** | `idempotency_key` unique constraint returns cached operation result with zero duplicate DB mutations |
| **Vendor call outcome `UNKNOWN` or `FAILED`** | Do not increment `incoming_quantity`; keep shortage alert active and offer 1-click retry or manual check-off |

---

## 16. Testing & Performance Targets

### 16.1 Automated Test Suite
- **Unit Tests (`tests/unit`):** Base unit conversions (`kg ↔ g`, `L ↔ ml`), recipe scaling math, three-tier ledger (`on_hand / reserved / incoming`), FIFO lot depletion, Ripple BFS cycle/depth bounds, HMAC approval token verification, and idempotency deduplication.
- **Integration Tests (`tests/integration`):**
  1. `Receipt Confirm → PURCHASE_RECORDED → Inventory Updated`
  2. `Tanglish Voice Intent → MEAL_PLANNED → Simulation → Ripple Graph → Action Proposal`
  3. `Action Approval → Snapserve Execution → Transcript Reconciliation → Incoming Stock Updated`
- **Agent Evals (`tests/evals`):** 10 Tanglish/Tamil/English voice prompts and 3 noisy grocery receipts verified against expected JSON outputs.

### 16.2 Latency Targets

| Operation | Target Latency | Architectural Guarantee |
|---|---:|---|
| `GET /api/dashboard` & `GET /api/inventory` | `< 250 ms` | Indexed PostgreSQL reads |
| `POST /api/meals/simulate` | `< 150 ms` | Pure TypeScript arithmetic (0 LLM calls) |
| Ripple Graph Traversal (`RippleEngine`) | `< 200 ms` | Bounded in-memory/SQL BFS (max depth 5, 0 LLM calls) |
| Forecast Calculation (`ForecastEngine`) | `< 300 ms` | Deterministic moving average (0 LLM calls) |
| Voice / Receipt Intake (Sarvam / OpenAI) | `< 2.5 s` | Single structured LLM call with streaming/optimistic UI |
| Full End-to-End Judge Demo | `< 2 min` | Pre-seeded baseline + instant Demo Reset endpoint |

---

## 17. Technical Definition of Done

The system is complete and ready for judging when:

1. Desktop Web (`1280px`) and Mobile PWA (`360px–430px`) run from the same codebase and share live PostgreSQL state via Supabase Realtime.
2. `POST /api/demo/reset` deterministically seeds the canonical household state in `<1s`.
3. Uploading the grocery receipt extracts `Rice (5 kg ✓)`, `Chicken (700 g ✓)`, `Onion (2 kg ✓)`, and `Curd (200 ml ?)`, requires user confirmation on `Curd`, and updates `on_hand_quantity`.
4. Speaking *"Naalaikku 6 perukku biryani pannanum"* transcribes via Sarvam, scales `Chicken Biryani × 6` deterministically, and identifies `Chicken (800 g short)` and `Curd (100 ml short)`.
5. The **Ripple View** and **"Why?"** drawer display the causal dependency graph and exact arithmetic (`1,500 g required - 700 g available = 800 g short`).
6. Approving the proposed purchase issues an HMAC token, triggers Snapserve (`create_outbound_call`), streams live call status, reconciles the vendor confirmation into `incoming_quantity`, and resolves the meal shortage.
7. Expanding **Activity Details** reveals the complete `agent_runs → agent_steps → tool_calls` trace.

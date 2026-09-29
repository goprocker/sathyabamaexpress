# Agentic Development PRD — Household & Personal Obligation Intelligence

## 1. Product Overview

**Product:** Household & Personal Obligation Intelligence  
**Format:** Responsive desktop web + mobile PWA  
**Development model:** Agentic software development  
**Primary hero use case:** Intelligent kitchen inventory + meal planning + autonomous vendor coordination  
**Secondary obligation domain:** Household bills, document expiry, vehicle maintenance, and recurring subscriptions  
**Core concept:** A household operating system that observes real-world events, maintains canonical state, predicts downstream consequences, proposes evidence-backed actions, and executes approved actions on the user's behalf.

### One-line concept

> A proactive household intelligence system that turns everyday events into an evolving household state, predicts what needs attention next, and safely acts on the user's behalf.

---

## 2. Problem

Household responsibilities are fragmented across:

- grocery bills and receipts
- kitchen inventory and expiry tracking
- daily and event-based meal planning
- utility payments
- insurance renewals
- vehicle maintenance
- subscriptions
- document expiry
- appointments and recurring obligations

Existing apps treat each responsibility as an isolated reminder, static checklist, or manual spreadsheet.

The deeper problem is that household events are **causally interconnected**.

Example:

```text
Buy ingredients (Receipt uploaded)
      ↓
On-hand inventory updates
      ↓
Meal planned ("Tomorrow 6 people for biryani")
      ↓
Ingredients reserved for tomorrow
      ↓
Shortage & competing meal conflicts detected
      ↓
Future meal or obligation affected
      ↓
Purchase requirement calculated deterministically
      ↓
Action proposed with clear evidence ("Why?")
      ↓
User approves
      ↓
Vendor is contacted via Snapserve voice call
      ↓
Vendor confirmation verified from call transcript
      ↓
Incoming stock & forecast reconciled in state
```

The product understands and operates on this entire causal chain instead of treating each item independently.

---

## 3. Product Thesis

The system behaves like a quiet, reliable household operations team.

It continuously performs a closed-loop operating cycle:

```text
OBSERVE
   ↓
UNDERSTAND
   ↓
UPDATE STATE
   ↓
PREDICT
   ↓
PLAN
   ↓
ASK
   ↓
ACT
   ↓
VERIFY
   ↓
RECONCILE STATE
```

The system is not a generic conversational chatbot.

It is a **stateful, agentic operating layer for household life**.

---

## 4. Core Product Principles

1. **State first**
   - PostgreSQL is the single canonical source of truth. LLM context is never used as application state.

2. **Agents reason, services calculate**
   - LLMs interpret unstructured inputs, resolve ambiguity, and synthesize explanations.
   - Deterministic TypeScript domain engines handle unit conversions, inventory arithmetic, recipe scaling, graph traversal, and state transitions.

3. **Every action has evidence**
   - Every alert, forecast, or proposed action must expose a clear, inspectable "Why?" trace linking back to concrete inventory lots, planned meals, or obligations.

4. **Human control for consequential actions**
   - External phone calls, vendor orders, financial commitments, and destructive state changes require explicit human approval bound to a cryptographic approval token.

5. **Closed-loop automation**
   - Starting an action does not mean it succeeded. The system observes external outcomes (e.g., Snapserve call transcripts) and reconciles only verified outcomes back into state.

6. **One system, multiple household domains**
   - Kitchen & meal intelligence is the hero vertical, while the same event, relationship, forecast, and action engine powers broader household obligations (documents, bills, vehicles).

---

## 5. Target Users

### Primary

- families managing shared household responsibilities and daily cooking
- parents coordinating groceries, meals, and recurring household tasks
- working professionals who want low-friction household automation
- students and flatmates living in shared apartments/PGs

### Secondary

- caregivers coordinating supplies and appointments for dependents
- small household teams (family members + domestic help)
- individuals managing vehicles, insurance, subscriptions, and official documents

---

## 6. Primary User Journey (Canonical Hero Scenario)

### Scenario: Receipt Upload → Dinner Planning → Vendor Order

**Step 1 — Baseline / Receipt Intake:**
The user uploads a grocery bill from their local store:
- `Basmati Rice`: `5 kg` (`5000 g`) — High confidence (`✓`)
- `Chicken`: `700 g` (`700 g`) — High confidence (`✓`)
- `Onion`: `2 kg` (`2000 g`) — High confidence (`✓`)
- `Curd`: `200 ml` (`200 ml`) — Low confidence (`?`, user confirms in review step)

*(Existing kitchen inventory also holds `Milk: 400 ml` expiring in 1 day, and `Dal: 850 g`.)*

**Step 2 — Natural Voice Input:**
User speaks in Tanglish/Tamil:

> "Naalaikku 6 perukku biryani pannanum."  
> *(Tomorrow we need to make biryani for 6 people.)*

**Step 3 — Coordinated System Response:**

1. **Transcribes & Understands:** Sarvam STT + Intake Agent extract `{ type: "MEAL_PLANNED", dish: "Chicken Biryani", servings: 6, date: "tomorrow", mealSlot: "dinner" }`.
2. **Resolves Recipe & Scales Deterministically:** Meal Engine multiplies per-serving quantities by `6`:
   - `Basmati Rice`: `200 g × 6 = 1,200 g (1.2 kg)`
   - `Chicken`: `250 g × 6 = 1,500 g (1.5 kg)`
   - `Onion`: `133.3 g × 6 = 800 g (0.8 kg)`
   - `Curd`: `50 ml × 6 = 300 ml (0.3 L)`
3. **Reads Canonical Inventory & Simulates Impact:**
   - `Basmati Rice`: `5,000 g` on hand → `Available` (`3,800 g` remaining)
   - `Chicken`: `700 g` on hand vs `1,500 g` required → **Shortage: `800 g` (`0.8 kg`)**
   - `Onion`: `2,000 g` on hand → `Available` (`1,200 g` remaining)
   - `Curd`: `200 ml` on hand vs `300 ml` required → **Shortage: `100 ml`**
4. **Runs Ripple Engine:** Traces downstream effects (`MEAL_PLANNED → Ingredients → Inventory Shortages → Vendor Purchase Requirement`) and checks if any other planned meals or obligations are impacted.
5. **Updates Forecast:** Calculates depletion horizons for remaining staples and flags `Milk (400 ml)` expiring tomorrow.
6. **Creates Action Proposal:** Action Planner proposes ordering `800 g Chicken` and `200 ml Curd` (standard pack size covering the `100 ml` deficit) from the household's preferred local vendor, explaining the exact arithmetic in the **"Why?"** panel.
7. **Requests User Approval:** User reviews the proposed order, target vendor, and quantities, then clicks **Approve**.
8. **Executes via Snapserve:** Execution Agent triggers an outbound voice call via Snapserve (`create_outbound_call`) to the vendor's phone number.
9. **Verifies & Reconciles:** Reconciliation Agent inspects the completed call status and transcript, confirms the vendor accepted the order for tomorrow morning, records an `INCOMING` stock reservation (`+800 g Chicken`, `+200 ml Curd`), clears the meal shortage warning, and logs the full audit trail.

The user never had to calculate recipe math, cross-check fridge stock, or manually call the shop.

---

## 7. Hero Feature — Intelligent Kitchen Inventory

### 7.1 Bill-to-Inventory Pipeline

User uploads or photographs a grocery receipt.

System extracts per line item:
- `raw_name` and normalized `resource_id`
- `quantity` and normalized base `unit` (`g`, `ml`, `count`)
- `purchase_date`
- `price` (INR)
- `vendor_name`
- `expiry_date` (explicit or inferred by category shelf-life rules)
- `confidence` score (`0.0` to `1.0`)

**Human-in-the-loop rule:** High-confidence items (`>= 0.85`) are pre-checked; low-confidence items (`< 0.85`) are highlighted with `?` for mandatory user review before committing to inventory.

```text
Receipt Image / PDF
        ↓
Vision / OCR Extraction (Intake Agent)
        ↓
Entity Resolution & Unit Normalization
        ↓
User Review & Correction (Staging)
        ↓
Structured PURCHASE_RECORDED Event
        ↓
Inventory Lots Committed + Forecast Updated
```

### 7.2 Meal-to-Inventory Simulation

User selects a dish in the UI or speaks a meal plan.

The deterministic Meal Engine calculates:

$$\text{Required Quantity} = \text{Recipe Quantity per Serving} \times \text{Requested Servings}$$

The inventory simulation compares required quantities against **net available stock** as of the target meal date:

$$\text{Available Quantity} = \text{On-Hand Quantity} - \text{Reserved Quantity (Other Planned Meals)} + \text{Incoming Quantity (Confirmed Orders)}$$

Each ingredient is classified into one of five deterministic states:
- `AVAILABLE` — Sufficient stock remains above safety threshold after reservation
- `LOW` — Sufficient for this meal, but drops below household safety threshold
- `MISSING` — Net available quantity is less than required quantity (deficit $> 0$)
- `EXPIRING` — Available lot expires before or within 24 hours of the planned meal
- `SURPLUS` — Quantity significantly exceeds upcoming 7-day forecast

### 7.3 Three-Tier Inventory Ledger (On-Hand, Reserved, Incoming)

To prevent double-deduction and keep fridge counts accurate, the system separates physical stock from future reservations:

1. **Meal Planned (`MEAL_PLANNED`):** Reserves required quantities (`reserved_quantity += required`) without falsely subtracting from today's physical `on_hand_quantity`.
2. **Vendor Order Confirmed (`ACTION_COMPLETED`):** Adds confirmed purchase quantities to `incoming_quantity`, immediately resolving shortage alerts for tomorrow's meal.
3. **Delivery Received / Meal Cooked (`PURCHASE_RECORDED` / `MEAL_CONSUMED`):** Converts `incoming_quantity` into physical `on_hand_quantity`, and deducts cooked ingredients from both `on_hand_quantity` and `reserved_quantity`.

Example (`Biryani × 6` state transition):

| Ingredient | On-Hand | Required (6 srv) | Reserved | Net Balance | Status | Proposed Action |
|---|---:|---:|---:|---:|---|---|
| Basmati Rice | `5,000 g` | `1,200 g` | `1,200 g` | `+3,800 g` | `AVAILABLE` | None |
| Chicken | `700 g` | `1,500 g` | `700 g` | `-800 g` | `MISSING` (`800 g` short) | Order `800 g` via Snapserve |
| Onion | `2,000 g` | `800 g` | `800 g` | `+1,200 g` | `AVAILABLE` | None |
| Curd | `200 ml` | `300 ml` | `200 ml` | `-100 ml` | `MISSING` (`100 ml` short) | Order `200 ml` pack via Snapserve |

---

## 8. Novel Layer — Ripple Intelligence & Cross-Domain Obligations

The signature mechanism of the product is **Ripple Intelligence**: modeling how one household event propagates across connected resources, future plans, and obligations.

### 8.1 Kitchen Ripple Chain

```text
MEAL_PLANNED (Biryani × 6, Tomorrow Dinner)
      ↓
Ingredient Requirements (1.5 kg Chicken, 300 ml Curd, 1.2 kg Rice, 800 g Onion)
      ↓
Inventory Simulation (Chicken -800 g deficit, Curd -100 ml deficit)
      ↓
Competing Plan Check (Checks if other planned meals this week need Rice/Onion)
      ↓
Depletion Forecast Update (Onion & Rice burn rate updated)
      ↓
Action Proposal Created (Vendor order for 800 g Chicken + 200 ml Curd)
```

### 8.2 Cross-Domain Obligation Ripple (Proving Broader Architecture)

To demonstrate that the engine generalizes beyond the kitchen, the MVP supports household obligation events using the exact same pipeline:

```text
DOCUMENT_EXPIRY_DETECTED (Vehicle Insurance expires in 5 days)
      ↓
Dependency Graph Traversal (Vehicle "Car TN-01-AB-1234" → depends_on → Active Insurance)
      ↓
Upcoming Event Conflict (Weekend family trip planned in 7 days requires Vehicle)
      ↓
Risk Forecast (HIGH COMPLIANCE RISK before trip)
      ↓
Action Proposal (Schedule renewal reminder / call insurance agent via Snapserve)
```

The system always answers the question:

> **"If this happens (or if I do this), what else in my household changes?"**

---

## 9. Hybrid Agentic + Deterministic Architecture

Instead of routing every step through slow, error-prone LLM loops, the runtime separates **LLM Specialist Agents** (for perception, language, and reasoning) from **Deterministic Domain Engines** (for math, graph traversal, and state mutations).

### 9.1 LLM Specialist Agents (OpenAI + Sarvam)

- **Supervisor Agent:** Classifies ambiguous multimodal/natural-language intents, selects the workflow pipeline, and tracks execution progress. Never mutates database state directly.
- **Intake Agent:** Converts voice transcripts (Tamil/Tanglish/English), receipt photos, and obligation documents into schema-validated structured events and resolves fuzzy entity names to canonical household resources.
- **Action Planner Agent:** Takes deterministic shortage/risk outputs and constructs human-readable action proposals, "Why?" explanations, and structured Snapserve call payloads.
- **Reconciliation Agent:** Evaluates external execution transcripts (e.g., Snapserve vendor call transcript) to verify whether the vendor confirmed, modified, or rejected the request.

### 9.2 Deterministic Domain Engines (TypeScript Services)

- **Inventory Engine:** Manages base-unit conversion (`g`, `ml`, `count`), FIFO lot depletion, expiry tracking, and `on_hand / reserved / incoming` ledger arithmetic.
- **Meal Engine:** Performs exact recipe scaling and ingredient availability simulation.
- **Ripple Engine:** Runs bounded breadth-first graph traversal (depth 1–5) over entity relationships and records the causal explanation path.
- **Forecast Engine:** Computes moving-average daily consumption, days-to-depletion, expiry waste risk, and obligation due horizons.
- **Execution Engine:** Validates cryptographic user approval tokens and dispatches idempotent calls to Snapserve.

---

## 10. Agent Roles & Boundaries Summary

| Component | Type | Primary Responsibility | Can Mutate Canonical DB? | Can Call External APIs? |
|---|---|---|---|---|
| **Supervisor Agent** | LLM Router | Intent classification & workflow routing | No | No |
| **Intake Agent** | LLM + Vision | Voice/receipt/document → structured event | Via `event.create` (staged) | OpenAI / Sarvam only |
| **Inventory Engine** | Deterministic | Stock ledger, lot expiry, unit math | Via `inventory.commit` | No |
| **Meal Engine** | Deterministic | Recipe lookup, serving scaling, simulation | Via `meal.commit` | No |
| **Ripple Engine** | Deterministic | Dependency graph traversal & conflict detection | Writes `ripples` trace | No |
| **Forecast Engine** | Deterministic | Depletion & expiry risk calculation | Writes `forecasts` | No |
| **Action Planner Agent** | LLM Reasoner | Proposes actions, "Why?" evidence & call script | Via `action.prepare` (`PENDING`) | OpenAI only |
| **Execution Engine** | Deterministic | Verifies approval token & triggers Snapserve | Updates `actions` status | Yes (`snapserve.call`) |
| **Reconciliation Agent** | LLM Verifier | Parses vendor transcript & reconciles outcome | Via `outcome.reconcile` | OpenAI / `snapserve.status` |

---

## 11. Voice Experience (Sarvam AI)

Sarvam AI provides the speech-to-text (STT) and language understanding bridge for Indian household contexts.

### Supported Input Modes
- **Tamil** (`நாளைக்கு 6 பேருக்கு பிரியாணி பண்ணனும்`)
- **Tanglish / Code-mixed speech** (`"Naalaikku 6 perukku biryani pannanum"`)
- **English** (`"Plan chicken biryani for 6 people tomorrow night"`)

### Voice Pipeline

```text
User Microphone (Web Audio API)
      ↓
Backend Voice Proxy (/api/voice/transcribe)
      ↓
Sarvam Speech-to-Text / Translation API
      ↓
Intake Agent (OpenAI Structured Output)
      ↓
Normalized MealPlannedEvent JSON
```

Example normalized payload:

```json
{
  "type": "MEAL_PLANNED",
  "dish": "Chicken Biryani",
  "servings": 6,
  "date": "2026-09-30",
  "mealSlot": "dinner",
  "rawTranscript": "Naalaikku 6 perukku biryani pannanum."
}
```

Voice is designed as a **fast, natural household command utility**—not an open-ended chat thread.

---

## 12. External Execution (Snapserve)

Snapserve acts as the real-world voice execution layer for approved actions.

### Closed-Loop Execution Lifecycle

```text
Shortage / Obligation Risk Detected
      ↓
Action Proposal Created (status: PENDING_APPROVAL)
      ↓
User Reviews Evidence & Clicks "Approve"
      ↓
Cryptographic Approval Token Issued (bound to action_id + payload_hash)
      ↓
Execution Engine invokes Snapserve Outbound Call (agentId, toNumber, metadata)
      ↓
Realtime Call Status Updates (Preparing → Calling → Connected → Completed)
      ↓
Reconciliation Agent analyzes Call Transcript & Outcome
      ↓
Confirmed Order updates Incoming Inventory & Resolves Shortage
```

This upgrades the product from:
> **Recommend → Stop**

to:
> **Reason → Ask → Act → Verify → Reconcile**

---

## 13. OpenAI Usage & Strict Guardrails

### OpenAI IS used for:
- unstructured voice transcript and text intent parsing
- multimodal grocery receipt and obligation document extraction (Vision)
- fuzzy entity matching (e.g., mapping `"Basmati 5kg bag"` or `"வெங்காயம்"` to canonical resource `Onion`)
- generating concise, human-readable **"Why?"** explanations from deterministic ripple paths
- formatting dynamic vendor order prompts for the Snapserve voice agent
- extracting structured confirmation outcomes from Snapserve call transcripts

### OpenAI is NEVER used for:
- inventory addition or subtraction
- recipe serving multiplication
- unit conversions (`kg` ↔ `g`, `L` ↔ `ml`)
- database transactions or SQL generation
- permission checks or approval token validation
- dependency graph traversal

---

## 14. Unified Product Surfaces & Navigation

Both the Desktop Web interface and the Mobile PWA share the same backend, database, and realtime subscriptions, using a unified information architecture aligned with the Design System.

### Desktop Navigation (Sidebar)

```text
HOUSEHOLD

Overview          (Dashboard: Today's meals, attention items, kitchen summary, recent activity)
Kitchen           (Inventory list, item detail, receipt upload, meal planner & simulator)
Ripple            (Interactive causal dependency graph & "Why?" inspector)
Obligations       (Household bills, document expiry, vehicle & forecast risks)
Actions           (Pending approvals, live Snapserve call status, completed outcomes)
Activity          (Chronological household timeline + expandable Agent & Tool trace)

────────────────

Household         (Vendors, preferences, demo seed/reset controls)
Members           (Shared household members & roles)
Settings          (Notification & voice settings)
```

### Mobile PWA Navigation (Bottom Bar)

```text
[ Home ]   [ Kitchen ]   [ + Add ]   [ Actions ]   [ Activity ]
```

Tapping the center **`+ Add`** button opens a quick-action sheet:
- **Speak** (Voice command via Sarvam)
- **Scan receipt** (Camera / photo upload for grocery bills or documents)
- **Plan meal** (Quick meal simulator)
- **Add manually** (Direct inventory or obligation entry)

---

## 15. Agentic Software Development Strategy

The product is built using specialized coding agents operating in parallel against shared TypeScript/Zod contracts (`packages/contracts`) and governed by a root `AGENTS.md` specification.

### Development Agents

| Agent | Responsibility |
|---|---|
| **Architect Agent** | Repository scaffolding, Prisma schema, `packages/contracts` (Zod), `AGENTS.md`, task graph |
| **Backend Agent** | Fastify/Express API, PostgreSQL state services, deterministic Inventory/Meal/Ripple/Forecast engines |
| **AI Agent** | Intake Agent (Vision/NLU), Action Planner Agent, Reconciliation Agent, prompt schemas & evals |
| **Integration Agent** | Sarvam STT proxy, Snapserve voice agent & outbound call lifecycle, Supabase Realtime broadcasting |
| **Frontend Agent** | React + Tailwind UI, Desktop & Mobile PWA shells, Ripple graph, Voice sheet, Approval & Activity views |
| **QA Agent** | Unit tests for deterministic math, integration pipeline tests, demo seed/reset verification |
| **Security Agent** | Approval token binding, tool allowlists, API key isolation, schema validation enforcement |
| **Demo Agent** | Canonical seed data, one-click demo reset, judge walkthrough verification (<2 minutes) |

### Parallel Development Loop

```text
PRD + TRD + Design Spec
          ↓
   Architect Agent (Hour 0–1: Contracts + DB Schema + AGENTS.md)
          ↓
┌───────────────────┬───────────────────┬────────────────────┐
│   Backend Agent   │  Frontend Agent   │ AI & Integration   │
│ (Domain Engines)  │ (UI + Mock State) │ (OpenAI/Sarvam/SS) │
└─────────┬─────────┴─────────┬─────────┴─────────┬──────────┘
          └───────────────────┼───────────────────┘
                              ↓
                      Integration Wiring
                              ↓
                   QA Agent + Security Agent
                              ↓
                 Demo Agent (Seed + Judge Flow)
```

---

## 16. MVP Scope

### Must Have (P0 — Critical Demo Path)
- Household workspace & pre-seeded canonical state (+ one-click **Demo Reset**)
- Kitchen inventory ledger (`on_hand`, `reserved`, `incoming`) with base unit normalization (`g`, `ml`, `count`)
- Grocery bill upload, Vision extraction, confidence flagging (`✓` vs `?`), and user review/commit flow
- Meal planning with deterministic serving scaling and inventory simulation (`AVAILABLE`, `LOW`, `MISSING`, `EXPIRING`)
- Deterministic Ripple Engine + visual **Ripple View** + **"Why?"** evidence drawer
- Basic depletion & expiry forecasting
- Action proposal generation with human approval gate (cryptographic token binding)
- Snapserve outbound voice call integration (with automatic fallback to deterministic simulated call progress if offline/unconfigured)
- Sarvam voice input supporting Tamil, Tanglish, and English (with Web Speech / text input fallback)
- Unified responsive Desktop Web + Mobile PWA interface
- Expandable Agent Activity & Tool Call trace for technical judges

### Should Have (P1)
- Non-kitchen obligation example (e.g., Vehicle Insurance / Utility Bill expiry flowing into `Obligations` and `Ripple View`)
- Supabase Realtime push updates for live Snapserve call states and inventory mutations
- Vendor directory management (configuring the target phone number for live judge demos)

### Stretch (P2)
- Semantic memory (`pgvector`) for household dietary preferences (e.g., *"Kids prefer less spicy biryani"*)
- Multi-member role permissions (Admin vs Member approval thresholds)
- Autonomous execution for pre-authorized zero-cost actions

---

## 17. Unified 24-Hour Parallel Build Plan

| Phase | Hours | Active Agents | Deliverable |
|---|---:|---|---|
| **1. Contracts & Foundation** | `0–2h` | Architect | Monorepo scaffold, Prisma schema, `packages/contracts` (Zod), `AGENTS.md`, seed script |
| **2. Core Engines & UI Shell** | `2–6h` | Backend + Frontend + AI | *Parallel:* Backend builds Inventory/Meal engines; Frontend builds AppShell, Dashboard & Kitchen UI; AI builds Intake Agent (Receipt + Voice NLU) |
| **3. Ripple, Forecast & Voice** | `6–11h` | Backend + Frontend + Integration | *Parallel:* Backend builds Ripple & Forecast engines; Frontend builds Meal Simulator & Ripple View; Integration wires Sarvam STT proxy |
| **4. Actions & Snapserve** | `11–15h` | Integration + AI + Frontend | Approval token service, Snapserve outbound call + polling/webhook, Reconciliation Agent, Frontend Approval & Live Call UI |
| **5. Full-Stack Integration** | `15–19h` | All Coding Agents | Connect Frontend TanStack Query + Supabase Realtime to live API endpoints; wire Demo Reset button |
| **6. QA, Security & Fallbacks** | `19–22h` | QA + Security | Unit/integration test suite, fallback verification (Sarvam/Snapserve offline resilience), responsive mobile check (`360px–430px`) |
| **7. Demo Freeze & Pitch** | `22–24h` | Demo Agent | Rehearse `<2 minute` signature judge flow, verify seed state reset, freeze production build |

---

## 18. Success Metrics

### Functional
- Uploading the demo receipt extracts items with confidence flags and commits validated quantities to PostgreSQL.
- Speaking *"Naalaikku 6 perukku biryani pannanum"* resolves the recipe for 6 servings and accurately detects the `800 g Chicken` and `100 ml Curd` shortages.
- The **Ripple View** and **"Why?"** drawer clearly display the causal chain and exact arithmetic (`1,500 g required - 700 g available = 800 g deficit`).
- Approving the proposed purchase triggers a real (or cleanly simulated) Snapserve call and streams live call states to the UI.
- Verified call completion updates `incoming` inventory and resolves the shortage warning without manual page refresh.
- One-click **Reset Demo State** restores the exact baseline in `<1 second`.

### Experience
- Complete signature demo runs end-to-end in **under 2 minutes**.
- Voice interaction supports natural Tanglish/Tamil/English without forcing a chatbot UI.
- Zero "AI slop" visual clutter; every screen feels like a calm, high-trust household utility.

### Technical
- **0** LLM-performed arithmetic calculations (100% deterministic math in TypeScript services).
- **0** duplicate state mutations on retried requests (idempotency keys enforced).
- **0** unauthorized external calls (approval token verified before `snapserve.call`).
- **100%** of agent runs and tool calls recorded in `agent_runs`, `agent_steps`, and `tool_calls`.

---

## 19. Signature 2-Minute Judge Demo Script

1. **Baseline & Receipt Upload (0:00–0:30):**
   - Open Dashboard (clean warm-white workspace).
   - Upload grocery receipt → Intake Agent extracts `Basmati Rice (5 kg ✓)`, `Chicken (700 g ✓)`, `Onion (2 kg ✓)`, `Curd (200 ml ?)`.
   - User confirms the flagged `Curd (200 ml)` item and clicks **Confirm** → Inventory updates in real time.
2. **Voice Meal Planning in Tanglish (0:30–1:00):**
   - Tap **Speak** and say: *"Naalaikku 6 perukku biryani pannanum."*
   - System transcribes speech, identifies `Chicken Biryani · 6 servings · Tomorrow Dinner`, and runs deterministic simulation.
3. **Ripple View & "Why?" Inspection (1:00–1:25):**
   - UI transitions to the **Ripple View**: shows `Biryani × 6` branching into `Rice (Available)`, `Onion (Available)`, `Chicken (Short 800 g)`, and `Curd (Short 100 ml)`.
   - Click **"Why?"** on `Chicken · 800 g short` → Side drawer shows exact formula (`Required: 1,500 g | Available: 700 g | Deficit: 800 g`) and proposed vendor action.
4. **Human Approval & Live Snapserve Call (1:25–1:50):**
   - Click **Approve** on the proposed vendor order (`800 g Chicken + 200 ml Curd`).
   - Snapserve dials the vendor phone number (judge's phone or live vendor test number) → UI shows real-time status (`Calling → Connected → Speaking → Confirmed`).
5. **Closed-Loop Reconciliation & Agent Trace (1:50–2:00):**
   - Reconciliation Agent parses the call transcript, marks the order `CONFIRMED`, updates `Incoming Inventory (+800 g Chicken, +200 ml Curd)`, and changes tomorrow's Biryani status to `Ready (All ingredients covered)`.
   - Expand **Activity Details** to show the judges the exact multi-agent & tool execution trace (`Intake → Meal Engine → Ripple Engine → Action Planner → Snapserve → Reconciliation`).

---

## 20. Product Differentiation

The differentiator is **not**:
- a conversational AI wrapper
- a generic voice assistant
- a manual pantry spreadsheet
- a passive reminder app

The differentiator **is**:

> **A deterministic household state engine paired with bounded specialist agents that turns one real-world event into a verified chain of predictions, approvals, and real-world actions.**

---

## 21. Final Product Definition

> **A stateful household operating system that observes everyday events, understands how they affect one another through a causal ripple graph, predicts what will happen next, and safely coordinates real-world actions on the user's behalf.**

The intelligent kitchen and meal workflow is the hero proof of this architecture, built on a generalized engine ready for every household obligation.

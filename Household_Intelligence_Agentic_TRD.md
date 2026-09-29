# Agentic Development TRD — Household & Personal Obligation Intelligence

## 1. Technical Overview

**Product:** Household & Personal Obligation Intelligence  
**Architecture:** Agentic modular monolith  
**Frontend:** React + TypeScript + Tailwind  
**Mobile:** Responsive PWA  
**Backend:** Node.js + TypeScript + Fastify/Express  
**Database:** PostgreSQL + Supabase  
**ORM:** Prisma  
**AI:** OpenAI  
**Voice:** Sarvam  
**External execution:** Snapserve

### Technical principle

> Agents decide. Tools act. Services calculate. PostgreSQL remembers. Policies control. The user approves.

---

# 2. High-Level Architecture

```text
                         USER
                           │
              ┌────────────┴────────────┐
              │                         │
        DESKTOP WEB                MOBILE PWA
              │                         │
              └────────────┬────────────┘
                           │
                       API GATEWAY
                           │
                  ┌────────▼────────┐
                  │   SUPERVISOR    │
                  │      AGENT      │
                  └────────┬────────┘
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
     INTAKE AGENTS    DOMAIN AGENTS    ACTION AGENTS
          │                │                 │
          └────────────────┼─────────────────┘
                           │
                       TOOL LAYER
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
  STATE SERVICES      FORECAST ENGINE     EXTERNAL APIs
       │                   │                   │
       ▼                   ▼                   ▼
 PostgreSQL            ML/Rules       OpenAI / Sarvam /
 Supabase                              Snapserve
```

Use a **modular monolith** for the hackathon instead of microservices.

---

# 3. Technology Stack

| Layer | Technology |
|---|---|
| Web | React + TypeScript |
| Styling | Tailwind CSS |
| Mobile | PWA |
| Backend | Node.js + TypeScript |
| API | Fastify or Express |
| Database | PostgreSQL |
| Backend platform | Supabase |
| ORM | Prisma |
| Validation | Zod |
| Realtime | Supabase Realtime |
| Storage | Supabase Storage |
| LLM | OpenAI |
| Voice/language | Sarvam |
| Voice execution | Snapserve |
| Forecasting | TypeScript rules / Python if needed |
| Deployment | Vercel + Render/Railway/Supabase |

---

# 4. Repository Structure

```text
/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── contracts/
│   ├── db/
│   ├── domain/
│   ├── agents/
│   ├── tools/
│   └── ui/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── PRD.md
│   ├── TRD.md
│   └── ADR/
│
├── AGENTS.md
└── .env.example
```

---

# 5. Agent Architecture

## Supervisor Agent

Responsibilities:

- classify intent
- select specialist
- coordinate workflow
- track progress
- escalate ambiguity

Allowed:

```text
state.read
event.read
agent.invoke
workflow.status
```

Not allowed:

```text
database writes
external calls
direct SQL
```

---

# 6. Specialist Agents

| Agent | Responsibility |
|---|---|
| Supervisor | Orchestration |
| Intake | Input → structured event |
| Inventory | Stock analysis |
| Meal | Recipe + meal planning |
| Ripple | Dependency analysis |
| Forecast | Prediction |
| Action Planner | Action construction |
| Execution | Approved external actions |
| Reconciliation | Outcome verification |
| QA | Agent evaluation |
| Security | Permission review |

Each agent must have:

- narrow role
- input schema
- output schema
- tool allowlist
- state permissions
- failure behavior
- verification rules

---

# 7. Agent Tool Layer

Agents never access PostgreSQL or external APIs directly.

```text
Agent
 ↓
Tool
 ↓
Schema Validation
 ↓
Authorization
 ↓
Domain Service
 ↓
Database / External API
```

## Tools

```text
state.read
state.compare

event.create
event.read

inventory.read
inventory.simulate
inventory.commit

recipe.read

graph.read

forecast.run
forecast.read

action.prepare
action.read
approval.request

snapserve.call
snapserve.status

outcome.reconcile
```

---

# 8. Tool Permissions

### Read

```text
state.read
inventory.read
recipe.read
graph.read
forecast.read
```

### Compute

```text
inventory.simulate
forecast.run
state.compare
```

### Controlled write

```text
event.create
inventory.commit
action.prepare
outcome.reconcile
```

### Privileged

```text
snapserve.call
```

Privileged tools require an explicit approval token.

---

# 9. Database Design

PostgreSQL is the canonical state store.

## Tables

```text
households
members

resources
inventory_lots

recipes
recipe_ingredients

events
relationships

obligations
forecasts

actions
action_outcomes

agent_runs
agent_steps
tool_calls

audit_log
```

---

# 10. Agent Run Data Model

## agent_runs

```text
id
household_id
agent_name
workflow_type
status
input
output
started_at
completed_at
```

## agent_steps

```text
id
run_id
step_index
agent_name
action
status
reason
created_at
```

## tool_calls

```text
id
run_id
agent_step_id
tool_name
input
output
status
latency_ms
created_at
```

This enables an agent trace:

```text
run
 ↓
agent
 ↓
step
 ↓
tool
 ↓
result
 ↓
decision
```

---

# 11. Canonical State vs Agent Memory

Do not use LLM context as application state.

| State | Location |
|---|---|
| Current inventory | PostgreSQL |
| Events | PostgreSQL |
| Relationships | PostgreSQL |
| Actions | PostgreSQL |
| Outcomes | PostgreSQL |
| Agent runs | PostgreSQL |
| Semantic memory | pgvector |
| Temporary reasoning | Agent runtime |

Semantic retrieval can provide context but cannot override structured state.

---

# 12. Event Model

All input becomes a normalized event.

```json
{
  "id": "evt_123",
  "type": "MEAL_PLANNED",
  "householdId": "hh_001",
  "source": "voice",
  "timestamp": "...",
  "confidence": 0.96,
  "payload": {
    "dish": "biryani",
    "servings": 6,
    "date": "..."
  }
}
```

Supported MVP events:

```text
PURCHASE_RECORDED
MEAL_PLANNED
MEAL_CONSUMED
DOCUMENT_EXPIRY_DETECTED
APPOINTMENT_CREATED
VEHICLE_SERVICE_DUE
SUBSCRIPTION_RENEWAL_DETECTED
ACTION_APPROVED
ACTION_COMPLETED
```

---

# 13. Event Processing

```text
Input
 ↓
Agent interpretation
 ↓
Schema validation
 ↓
Entity resolution
 ↓
Event creation
 ↓
Deterministic state transition
 ↓
Ripple calculation
 ↓
Forecast
 ↓
Action proposal
```

---

# 14. Kitchen Inventory Architecture

## Bill pipeline

```text
Bill
 ↓
Upload
 ↓
OCR / Vision
 ↓
Intake Agent
 ↓
Structured Purchase Event
 ↓
Entity Matching
 ↓
User Correction
 ↓
Inventory Commit
 ↓
Forecast Update
```

Extract:

```text
item
quantity
unit
purchase_date
price
vendor
expiry
confidence
```

Low-confidence extraction must be reviewable.

---

# 15. Meal Engine

Input:

```text
dish
servings
date
```

Recipe calculation:

```text
required quantity =
recipe quantity per serving × requested servings
```

The LLM does not perform final arithmetic.

Example:

```text
Biryani × 6

Rice       1.2kg
Chicken    1.5kg
Onion      0.8kg
```

Then:

```text
inventory.simulate
```

returns:

```text
AVAILABLE
LOW
MISSING
EXPIRING
```

---

# 16. Ripple Engine

The Ripple Engine is deterministic graph traversal.

Example:

```text
MEAL_PLANNED
     ↓
RECIPE
     ↓
INGREDIENT
     ↓
INVENTORY
     ↓
SHORTAGE
     ↓
FORECAST
     ↓
ACTION
```

Relationships:

```text
meal → consumes → ingredient
purchase → increases → inventory
vehicle → depends_on → insurance
document → expires_on → date
subscription → renews_on → date
```

### Algorithm

1. Find affected entities.
2. Traverse relationships.
3. Apply relationship-specific rules.
4. Deduplicate nodes.
5. Stop at depth 3–5.
6. Store explanation path.
7. Trigger relevant forecasts.
8. Generate actions when thresholds are crossed.

---

# 17. Forecast Engine

Use deterministic/statistical models.

Possible methods:

- moving average
- exponential smoothing
- historical consumption rate

Example:

```text
daily consumption =
recent confirmed consumption / observed days
```

```text
depletion =
available quantity / expected daily consumption
```

Forecast types:

```text
SHORTAGE_RISK
EXPIRY_RISK
WASTE_RISK
RECURRING_DEMAND
```

---

# 18. Action Engine

Action Planner Agent creates:

```text
ACTION
├── type
├── reason
├── target
├── payload
├── expected_outcome
├── approval_required
└── status
```

Example:

```text
Action:
Purchase 0.8kg chicken

Reason:
Required: 1.5kg
Available: 0.7kg
Deficit: 0.8kg
```

---

# 19. Approval Architecture

```text
Action Proposal
      ↓
User Review
      ↓
Approval
      ↓
Approval Token
      ↓
Execution Agent
```

Approval token must bind:

```text
action_id
payload_hash
user_id
expiry
```

If relevant state changes before execution, approval becomes invalid.

---

# 20. Snapserve Architecture

```text
Action Planner
      ↓
Approval
      ↓
Execution Agent
      ↓
snapserve.call
      ↓
External Party
      ↓
Outcome
      ↓
Reconciliation Agent
      ↓
State Update
```

Never assume a call succeeded merely because it started.

Possible outcomes:

```text
SUCCESS
FAILED
UNKNOWN
```

Only confirmed outcomes may update confirmed state.

---

# 21. Sarvam Architecture

```text
Microphone
 ↓
Sarvam
 ↓
Transcript
 ↓
Intake Agent
 ↓
Structured Event
```

Example:

```text
"Naalaikku 6 perukku biryani pannanum"

↓

MEAL_PLANNED
dish = biryani
servings = 6
date = tomorrow
```

---

# 22. OpenAI Architecture

OpenAI is responsible for:

- semantic interpretation
- document extraction
- ambiguity resolution
- event extraction
- reasoning
- action explanations
- summaries

It is not responsible for:

- arithmetic
- transactions
- authorization
- graph traversal
- state mutation
- final external execution

---

# 23. Agentic Workflow

```text
USER
 ↓
SUPERVISOR
 ↓
INTAKE
 ↓
DOMAIN AGENT
 ↓
TOOLS
 ↓
RIPPLE
 ↓
FORECAST
 ↓
ACTION PLANNER
 ↓
USER APPROVAL
 ↓
EXECUTION
 ↓
RECONCILIATION
 ↓
POSTGRES STATE
```

---

# 24. Frontend Architecture

## Desktop

```text
Dashboard
Inventory
Ripple Map
Obligations
Forecasts
Actions
Agent Activity
History
```

## Mobile PWA

```text
Voice
Scan Bill
Inventory
Today
Approvals
Activity
```

One codebase should serve both experiences.

---

# 25. API Design

```text
POST /api/events/ingest

GET  /api/inventory

POST /api/inventory/purchases

POST /api/meals/simulate

POST /api/meals/commit

GET  /api/ripples/:eventId

GET  /api/forecasts

POST /api/actions/prepare

POST /api/actions/:id/approve

POST /api/actions/:id/execute

POST /api/actions/:id/outcome

GET  /api/timeline
```

---

# 26. Shared Contracts

Use:

- TypeScript
- Zod
- JSON Schema where necessary

Example:

```typescript
const MealPlannedEvent = z.object({
  type: z.literal("MEAL_PLANNED"),
  dish: z.string(),
  servings: z.number().positive(),
  date: z.string()
});
```

Shared contracts should be used by:

- frontend
- backend
- agents
- tools
- tests

---

# 27. Agent Contract

Every agent should define:

```text
Role
Input schema
Allowed tools
Output schema
State access
Approval policy
Failure behavior
Verification
Observability
```

Example:

```text
Meal Agent

Role:
Convert meal requests into validated meal plans.

Tools:
recipe.read
inventory.read
inventory.simulate

Forbidden:
database writes
vendor calls
external purchases

Verification:
recipe exists
servings > 0
quantities calculated deterministically
```

---

# 28. Agentic Development Workflow

The software itself should be built using specialized coding agents.

```text
PRD + TRD
   ↓
Architect Agent
   ↓
Task Graph
   ↓
┌───────────────┬───────────────┬───────────────┐
│ Backend Agent │ Frontend Agent│ AI Agent      │
└───────────────┴───────────────┴───────────────┘
   ↓
Integration Agent
   ↓
QA Agent
   ↓
Security Agent
   ↓
Demo Agent
```

---

# 29. Development Agent Responsibilities

| Agent | Work |
|---|---|
| Architect | architecture + task graph |
| Backend | schema + API + domain logic |
| Frontend | responsive UI + PWA |
| AI | agent workflows + prompts |
| Integration | OpenAI + Sarvam + Snapserve |
| QA | automated testing |
| Security | permission + secret review |
| Demo | end-to-end judge flow |

---

# 30. AGENTS.md

Repository must contain an `AGENTS.md` defining:

- technology stack
- architecture
- coding standards
- file ownership
- database rules
- agent boundaries
- tool permissions
- security requirements
- testing commands
- prohibited patterns

Coding agents must read this before making changes.

---

# 31. Agentic Development Rules

Every development agent must:

1. Inspect existing code before editing.
2. Read relevant PRD/TRD sections.
3. Follow `AGENTS.md`.
4. Work within assigned scope.
5. Avoid unrelated refactors.
6. Use shared contracts.
7. Add tests for state-changing logic.
8. Run relevant tests.
9. Report changed files.
10. Report limitations.

---

# 32. Idempotency

Every state-changing command must support an idempotency key.

Example:

```text
purchase_event_abc123
```

Repeated request:

```text
same key
 ↓
existing operation found
 ↓
no duplicate mutation
```

This is especially important for:

- purchase events
- inventory commits
- Snapserve calls
- reconciliation

---

# 33. Security

Requirements:

1. No provider API keys in frontend.
2. Agents cannot access secrets.
3. Tools enforce authorization.
4. Privileged tools require approval.
5. Agent output is schema validated.
6. State changes are audited.
7. External actions are logged.
8. Documents use protected storage.
9. Agents receive minimum required context.
10. Agents cannot execute raw SQL.

---

# 34. Failure Handling

| Failure | Behavior |
|---|---|
| OpenAI unavailable | structured/manual fallback |
| Sarvam unavailable | text input |
| Snapserve unavailable | mock/manual fallback |
| Invalid agent output | retry/constrain |
| Tool timeout | retry if idempotent |
| State conflict | stop + re-evaluate |
| Poor receipt extraction | user correction |
| Unknown vendor outcome | no confirmed state update |
| Duplicate event | idempotency protection |

---

# 35. Observability

Every agent run must generate:

```text
run_id
agent
input
tool calls
tool results
decision
approval
execution
outcome
```

Track:

- agent latency
- tool latency
- token usage
- tool failure rate
- schema failures
- action success
- reconciliation mismatch
- retry count

---

# 36. Testing

## Unit

- inventory arithmetic
- recipe scaling
- expiry
- forecasting
- graph traversal
- state transitions
- approval rules
- idempotency

## Integration

```text
Bill → event → inventory
```

```text
Voice → event → meal → inventory
```

```text
Meal → ripple → forecast → action
```

```text
Action → approval → Snapserve → outcome → state
```

## Agent evaluation

Test:

- Tamil voice
- Tanglish
- English
- ambiguous requests
- noisy receipts
- duplicate events
- conflicting state
- external failures

---

# 37. Performance Targets

| Operation | Target |
|---|---:|
| API request | <500ms |
| Inventory read | <300ms |
| State transaction | <500ms |
| Ripple | <1s |
| Forecast | <2s |
| UI refresh | <1s |
| Full demo | <2min |

AI/provider latency is treated separately.

---

# 38. 24-Hour Agentic Development Plan

| Phase | Time | Primary Agent |
|---|---:|---|
| Architecture | 0–1h | Architect |
| Backend foundation | 1–4h | Backend |
| AI/event pipeline | 3–6h | AI |
| Voice | 5–8h | Integration |
| Ripple/forecast | 7–11h | Backend + AI |
| Action execution | 10–14h | Integration |
| Frontend | 13–17h | Frontend |
| QA/security | 16–20h | QA + Security |
| Demo | 20–22h | Demo |
| Freeze | 22–24h | Integration |

---

# 39. Technical Definition of Done

The system is complete when:

- desktop and mobile use the same backend
- PostgreSQL contains canonical household state
- all inputs become normalized events
- specialized agents perform bounded reasoning
- agents use typed tools
- agents cannot directly access the DB
- inventory calculations are deterministic
- meals dynamically affect inventory
- ripple analysis uses actual relationships
- forecasting identifies future risks
- action proposals are generated
- external actions require approval
- Snapserve can execute an approved action
- outcomes reconcile into state
- agent runs are observable
- core state logic is tested
- failure fallbacks work
- end-to-end demo is repeatable in <2 minutes

---

# 40. Final Architecture Principle

```text
Observe
  ↓
Understand
  ↓
Model State
  ↓
Predict
  ↓
Plan
  ↓
Ask
  ↓
Act
  ↓
Verify
  ↓
Update State
```

The goal is not to build an LLM chatbot with household features.

The goal is to build a **stateful household operating system with an agentic reasoning and execution layer**.

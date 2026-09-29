# Agentic Development PRD — Household & Personal Obligation Intelligence

## 1. Product Overview

**Product:** Household & Personal Obligation Intelligence  
**Format:** Responsive desktop web + mobile PWA  
**Development model:** Agentic software development  
**Primary hero use case:** Intelligent kitchen inventory + meal planning  
**Core concept:** A household operating system that observes real-world events, maintains state, predicts what will happen next, proposes actions, and executes approved actions.

### One-line concept

> A proactive household intelligence system that turns everyday events into an evolving household state, predicts what needs attention next, and can safely act on the user's behalf.

---

## 2. Problem

Household responsibilities are fragmented across:

- grocery bills
- kitchen inventory
- meal planning
- utility payments
- insurance
- vehicle maintenance
- subscriptions
- document expiry
- appointments
- recurring obligations

Existing apps generally treat each responsibility as an isolated reminder or record.

The deeper problem is that household events are **interconnected**.

Example:

```text
Buy ingredients
      ↓
Inventory changes
      ↓
Meal planned
      ↓
Ingredients consumed
      ↓
Stock becomes low
      ↓
Future meal affected
      ↓
Purchase becomes necessary
      ↓
User approves
      ↓
Vendor is contacted
      ↓
Inventory is updated
```

The product should understand this chain instead of treating each item independently.

---

# 3. Product Thesis

The system behaves like a lightweight household operations team.

It continuously performs:

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
UPDATE STATE
```

The system is not simply a chatbot.

It is a **stateful, agentic operating layer for household life**.

---

# 4. Core Product Principles

1. **State first**
   - PostgreSQL is the canonical source of truth.

2. **Agents reason, services calculate**
   - LLMs interpret and plan.
   - Deterministic services handle arithmetic and state transitions.

3. **Every action has evidence**
   - Agents should explain why an action was proposed.

4. **Human control for consequential actions**
   - External calls, purchases and other meaningful actions require approval.

5. **Closed-loop automation**
   - The system observes outcomes and reconciles them back into state.

6. **One system, multiple household domains**
   - Kitchen is the hero vertical, but the architecture supports broader obligations.

---

# 5. Target Users

### Primary

- families managing shared household responsibilities
- parents managing groceries and household tasks
- working professionals
- students living independently
- shared apartments/PGs

### Secondary

- caregivers
- small household teams
- people managing vehicles, subscriptions and documents

---

# 6. Primary User Journey

## Scenario: Dinner planning

User says:

> "Naalaikku 6 perukku biryani pannanum."

System:

1. Understands the request.
2. Identifies the recipe.
3. Calculates required quantities.
4. Reads current inventory.
5. Simulates consumption.
6. Detects shortages.
7. Checks future depletion.
8. Determines whether action is needed.
9. Creates an action proposal.
10. Asks for approval.
11. Executes through Snapserve.
12. Verifies the outcome.
13. Updates household state.

The user does not manually coordinate every step.

---

# 7. Hero Feature — Intelligent Kitchen Inventory

## 7.1 Bill-to-inventory

User uploads a grocery bill.

System extracts:

- product
- quantity
- unit
- purchase date
- price
- vendor
- expiry when available

After validation:

```text
Receipt
 ↓
Structured Purchase Event
 ↓
Inventory Update
```

## 7.2 Meal-to-inventory

User selects or speaks a meal.

System calculates:

```text
Required quantity =
recipe quantity per serving × requested servings
```

The inventory simulation determines:

- available
- low
- missing
- expiring
- surplus

## 7.3 Dynamic inventory

Confirmed meals update inventory.

Example:

```text
Rice: 2.5kg
Chicken: 1.2kg
Onion: 2kg

Biryani × 6
      ↓
Rice -1.2kg
Chicken -1.5kg
Onion -0.8kg
```

---

# 8. Novel Layer — Ripple Intelligence

The key novelty is not simply inventory management.

The system models relationships between household events.

Example:

```text
Meal planned
      ↓
Ingredient consumption
      ↓
Inventory shortage
      ↓
Future meal conflict
      ↓
Forecast
      ↓
Purchase requirement
      ↓
Action proposal
```

The system should answer:

> "If I do this, what else changes?"

This becomes the product's signature mechanism.

---

# 9. Agentic Architecture

Use specialized agents instead of one general-purpose chatbot.

### Agents

- Supervisor Agent
- Intake Agent
- Inventory Agent
- Meal Agent
- Ripple Agent
- Forecast Agent
- Action Planner Agent
- Execution Agent
- Reconciliation Agent

Each agent has:

- a narrow responsibility
- explicit tools
- structured input
- structured output
- permission boundaries
- failure behavior

---

# 10. Agent Roles

## Supervisor Agent

Coordinates workflows.

It decides:

```text
What happened?
Which specialist should handle it?
What step comes next?
```

It does not directly mutate state.

## Intake Agent

Converts:

- voice
- text
- receipts
- documents

into structured events.

## Inventory Agent

Analyzes:

- current stock
- shortages
- expiry
- historical consumption

## Meal Agent

Handles:

- recipe lookup
- serving scaling
- meal requirements
- inventory simulation

## Ripple Agent

Finds downstream consequences.

## Forecast Agent

Predicts:

- depletion
- shortage
- expiry
- recurring demand

## Action Planner

Creates proposed actions.

## Execution Agent

Executes approved external actions.

## Reconciliation Agent

Verifies what actually happened and updates state.

---

# 11. Voice Experience

Sarvam provides the voice/language interface.

Supported interaction:

```text
Tamil
Tanglish
English
Mixed-language speech
```

Example:

> "Naalaikku 6 perukku biryani pannanum."

↓

```json
{
  "intent": "MEAL_PLANNED",
  "dish": "biryani",
  "servings": 6,
  "date": "tomorrow"
}
```

Voice is primarily a **natural input mechanism**, not a generic chatbot.

---

# 12. Snapserve Execution

Snapserve acts as the external execution layer.

Example:

```text
Shortage detected
      ↓
Action proposed
      ↓
User approval
      ↓
Snapserve voice call
      ↓
Vendor response
      ↓
Outcome verification
      ↓
Inventory/state reconciliation
```

This creates:

> **Reason → Act → Observe**

instead of:

> **Recommend → Stop**

---

# 13. OpenAI Usage

OpenAI is used for:

- unstructured input understanding
- receipt/document interpretation
- ambiguous language
- event extraction
- reasoning
- action explanations
- semantic retrieval
- natural-language summaries

OpenAI should not be responsible for:

- inventory arithmetic
- recipe multiplication
- database transactions
- authorization
- graph traversal
- final execution

---

# 14. Product Surfaces

## Desktop

Designed for deeper management.

```text
Dashboard
Inventory
Ripple Map
Obligations
Forecasts
Pending Actions
Agent Activity
History
```

## Mobile PWA

Designed for quick actions.

```text
Voice
Scan Bill
Inventory
Today
Approvals
Activity
```

Both use the same backend and state.

---

# 15. Agentic Development Strategy

The application is agentic, and the development process is agentic too.

### Development agents

| Agent | Responsibility |
|---|---|
| Architect Agent | Architecture + task graph |
| Backend Agent | API + database + state engine |
| Frontend Agent | Desktop + mobile UI |
| AI Agent | Agent workflows + prompts |
| Integration Agent | OpenAI + Sarvam + Snapserve |
| QA Agent | Testing |
| Security Agent | Permissions + tool boundaries |
| Demo Agent | Final judge workflow |

### Development loop

```text
PRD/TRD
 ↓
Architect Agent
 ↓
Task Graph
 ↓
Parallel Coding Agents
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

# 16. MVP Scope

## Must have

- authentication
- household state
- inventory
- bill upload
- receipt extraction
- meal planning
- serving-based inventory calculation
- ripple engine
- basic forecasting
- action proposal
- approval flow
- Snapserve integration/mock
- Sarvam voice input
- desktop interface
- mobile PWA

## Should have

- document obligations
- semantic memory
- agent activity trace
- realtime updates

## Stretch

- multiple household members
- automatic recurring obligation detection
- advanced forecasting
- autonomous low-risk actions
- richer cross-domain ripple simulations

---

# 17. 24-Hour Product Plan

| Phase | Time | Goal |
|---|---:|---|
| Foundation | 0–2h | DB, auth, repo, contracts |
| State engine | 2–5h | Events, inventory, relationships |
| Kitchen core | 4–8h | Bills, recipes, meals |
| Agent layer | 6–11h | Supervisor + specialist agents |
| Ripple/forecast | 9–13h | Novel intelligence |
| Voice | 11–14h | Sarvam |
| Action layer | 12–16h | Approval + Snapserve |
| Frontend | 14–20h | Desktop + mobile |
| QA/demo | 20–24h | Integration + pitch |

---

# 18. Success Metrics

### Functional

- bill can update inventory
- meal can reduce inventory
- shortage can be detected
- ripple chain can be displayed
- forecast can be generated
- action can be proposed
- approval can trigger execution
- outcome can update state

### Experience

- core demo <2 minutes
- voice interaction feels natural
- user understands why an action was proposed
- system requires minimal manual data entry

### Technical

- no duplicate state mutations
- no unauthorized external actions
- deterministic calculations
- complete action trace
- graceful API failure

---

# 19. Signature Demo

### Scene

User uploads grocery bill.

Inventory updates.

User says:

> "Tomorrow 6 people are coming. Make biryani."

System:

```text
Voice
 ↓
Meal Agent
 ↓
Inventory
 ↓
Ripple Engine
 ↓
Forecast
 ↓
Shortage detected
 ↓
Action proposal
```

User approves.

Snapserve calls the vendor.

Vendor confirms.

System reconciles:

```text
PURCHASE CONFIRMED
        ↓
INVENTORY UPDATED
        ↓
FORECAST UPDATED
```

The demo ends with the user seeing that a single sentence triggered a chain of coordinated operations.

---

# 20. Product Differentiation

The differentiator is not:

- AI chatbot
- voice assistant
- inventory tracker
- reminder app
- grocery list

The differentiator is:

> **A household state engine that understands dependencies and uses agents to turn one real-world event into a verified chain of actions.**

---

# 21. Final Product Definition

> **A stateful household operating system that observes everyday events, understands how they affect one another, predicts what will happen next, and safely coordinates actions on the user's behalf.**

The kitchen inventory system is the first concrete proof of this architecture, not the entire product.

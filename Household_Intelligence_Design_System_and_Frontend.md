# Household Intelligence — Design System & Frontend Build Specification

## 1. Design Direction

### Product character

The product should feel like a **calm, human household workspace**, not an AI product showcase.

Core references in spirit:

- Linear: information hierarchy
- Apple Notes: simplicity
- modern editorial products: whitespace and typography
- household utility apps: practical and understandable

Do not copy any specific product.

### Design principle

> **Content creates the visual hierarchy. Decoration does not.**

The interface should make the intelligence of the system visible through useful information and state changes, not gradients, AI illustrations, or decorative effects.

---

# 2. Anti-AI-Slop Rules

Absolutely avoid:

- purple/blue AI gradients
- glowing backgrounds
- floating AI orbs
- glassmorphism
- excessive blur
- giant gradient text
- excessive pill-shaped UI
- "✨ AI-powered" labels
- robot illustrations
- futuristic 3D graphics
- unnecessary animated particles
- excessive dashboard cards
- fake analytics charts
- chatbot-first interaction
- excessive badges
- huge rounded containers
- decorative AI imagery

### Preferred

- warm white background
- near-black typography
- thin borders
- subtle separators
- restrained green accent
- simple line icons
- compact data visualization
- generous whitespace
- 8–12px radius
- almost no shadows
- subtle transitions
- real household data

---

# 3. Visual System

## Colors

Use CSS variables.

```css
:root {
  --background: #FAFAF8;
  --surface: #FFFFFF;
  --surface-subtle: #F5F5F2;

  --text-primary: #171717;
  --text-secondary: #6B6B67;
  --text-tertiary: #969690;

  --border: #E7E7E2;
  --border-strong: #D8D8D1;

  --accent: #356B4A;
  --accent-subtle: #EAF2EC;

  --warning: #9A6B16;
  --warning-subtle: #F8F0DC;

  --danger: #A5443A;
  --danger-subtle: #F8E9E7;

  --success: #356B4A;
  --success-subtle: #EAF2EC;
}
```

Use only one primary accent.

Do not introduce multiple decorative accent colors.

---

# 4. Typography

Preferred:

1. Geist
2. Inter
3. system sans-serif fallback

### Scale

```text
Display      32px / 40px
Page title   28px / 36px
Section      18px / 26px
Body         15px / 23px
Small        13px / 19px
Metadata     12px / 17px
```

Use font weight primarily for hierarchy.

Avoid oversized marketing-style typography inside the application.

---

# 5. Spacing

Use a 4px base system.

```text
4px
8px
12px
16px
20px
24px
32px
40px
48px
64px
```

Primary content should have generous vertical spacing.

---

# 6. Borders and Radius

```text
Small controls: 6px
Cards:          10px
Dialogs:        12px
Buttons:        8px
```

Borders should be more common than shadows.

Default shadow:

```css
box-shadow: none;
```

Only use a subtle shadow for overlays or dialogs when necessary.

---

# 7. Iconography

Use a consistent outline icon library such as Lucide.

Rules:

- 16–20px icons for controls
- 20–24px icons for navigation
- no decorative icons
- no emoji as UI icons
- no colorful icon sets

---

# 8. Application Structure

## Desktop Navigation

```text
HOUSEHOLD

Overview
Kitchen
Obligations
Actions
Activity

────────────────

Household
Members
Settings
```

Keep navigation narrow and quiet.

---

# 9. Mobile Navigation

Bottom navigation:

```text
Home
Kitchen
Add
Activity
You
```

The center Add button opens:

```text
Speak
Scan receipt
Add manually
Plan meal
```

The mobile interface should prioritize quick household actions.

---

# 10. Frontend Pages

The frontend should implement the following pages.

## Required MVP Pages

1. Onboarding
2. Dashboard
3. Kitchen / Inventory
4. Inventory item detail
5. Receipt upload
6. Meal planner
7. Meal simulation
8. Ripple view
9. Actions / approvals
10. Activity timeline
11. Voice interaction
12. Settings
13. Household members

## Optional

14. Obligations
15. Forecasts
16. Agent activity detail
17. Semantic memory
18. Analytics

---

# 11. Dashboard

## Purpose

Answer:

> What needs my attention right now?

### Structure

```text
Good morning

TODAY

Dinner
Biryani · 6 people
2 ingredients short
Review →

────────────────────────

KITCHEN

42 items
3 running low
2 expiring soon

────────────────────────

NEEDS YOUR ATTENTION

Chicken · 800g short
Purchase proposed
Review →

────────────────────────

RECENT ACTIVITY

09:51  Meal planned
09:43  Inventory updated
09:42  Grocery receipt processed
```

Do not turn every section into a large card.

Use typography, separators and whitespace.

---

# 12. Kitchen / Inventory

## Main goals

Users should be able to:

- see current stock
- search
- filter
- add items
- edit quantities
- view expiry
- understand consumption
- scan/upload bills
- simulate meals

### Layout

```text
Kitchen

42 items

[ Search inventory ]

Needs attention
3 low · 2 expiring

All items

Rice             2.4 kg
Chicken          700 g
Onion            1.8 kg
Milk             0.4 L
Dal              850 g
```

### Inventory item

Show:

```text
Item
Current quantity
Unit
Expected depletion
Expiry
Recent purchases
Recent consumption
```

---

# 13. Receipt Upload

## User flow

```text
Kitchen
 ↓
Scan receipt
 ↓
Upload / Camera
 ↓
Processing
 ↓
Extracted items
 ↓
User review
 ↓
Confirm
 ↓
Inventory updated
```

### Review screen

```text
Grocery receipt

Rice            5 kg     ✓
Chicken         1.5 kg   ✓
Onion           2 kg     ✓
Tomato          1 kg     ?

────────────────

4 items detected

[ Confirm ] [ Edit ]
```

Never silently add low-confidence data.

---

# 14. Meal Planner

Users can:

- search dishes
- choose servings
- choose date
- review ingredients
- simulate inventory impact

Example:

```text
Plan a meal

Biryani

Servings
−   6   +

Tomorrow · Dinner

Ingredients

Rice        1.2 kg
Chicken     1.5 kg
Onion       0.8 kg

Inventory check

Rice        Available
Chicken     Short 800g
Onion       Available

[ Continue ]
```

---

# 15. Signature Feature — Ripple View

This is the most distinctive interface in the product.

The system should show:

```text
Biryani · 6 servings
        │
        ├─────────────┐
        ↓             ↓
      Rice          Chicken
   Available        700g
                      │
                      ↓
                  Need 800g
                      │
                      ↓
               Purchase needed
                      │
                      ↓
                [ Review ]
```

### Design rules

- thin connector lines
- small nodes
- simple labels
- no glowing graphs
- no 3D network
- no excessive animation

Animation should only communicate the sequence of state changes.

---

# 16. "Why?" Interaction

Every intelligent recommendation should be explainable.

Example:

```text
Chicken · 800g short

Why?

Tomorrow's meal:
Biryani × 6

Required       1.5 kg
Available      700 g
Difference     800 g

Sources:
• meal plan
• confirmed inventory
• recent purchase history
```

This should appear in a side panel or lightweight modal.

---

# 17. Actions / Approval Page

This page contains actions that need user approval.

Example:

```text
Actions

NEEDS REVIEW

Purchase chicken
800 g

Reason
Tomorrow's biryani requires 1.5 kg.
Current inventory contains 700 g.

────────────────

[ Reject ]       [ Approve ]
```

Approval should always show:

1. what will happen
2. why
3. quantity/cost where applicable
4. external party
5. consequences

---

# 18. Snapserve Execution State

After approval:

```text
Calling vendor...

Connecting
    ↓
Speaking
    ↓
Vendor response
    ↓
Confirming order
    ↓
Completed
```

Do not fake real-time activity.

Show actual status received from the backend.

Possible states:

```text
Preparing
Calling
Connected
Awaiting response
Confirmed
Failed
Unknown
```

---

# 19. Voice UI

Voice should feel like a utility, not a chatbot.

### State 1

```text
Listening

Speak naturally.
```

### State 2

```text
"Naalaikku 6 perukku biryani pannanum."
```

### State 3

```text
Biryani · 6 servings
Tomorrow

Checking inventory...
```

### State 4

```text
2 things need attention.

Chicken · 800g short
```

Then transition to the relevant action.

Do not create a permanent chat window as the main interaction.

---

# 20. Activity Timeline

This is how the agentic architecture is exposed to users.

```text
Activity

09:53
Action approved
Purchase chicken · 800g

09:52
Shortage detected
Chicken · 800g

09:51
Meal planned
Biryani · 6 servings

09:43
Inventory updated
Rice +5kg

09:42
Receipt processed
4 items detected
```

Use timestamps, labels and short descriptions.

---

# 21. Agent Activity Detail

For advanced users and judges:

```text
Meal planned
09:51

Supervisor
→ classified request

Meal Agent
→ resolved recipe

Inventory Tool
→ checked 42 items

Ripple Engine
→ found chicken shortage

Forecast
→ predicted depletion

Action Planner
→ proposed purchase
```

This should be hidden behind an "Activity details" interaction.

The normal user should not be forced to see internal agent terminology.

---

# 22. Onboarding

Keep it short.

### Step 1

```text
Set up your household

What should we help manage?

☑ Kitchen
☐ Bills
☐ Documents
☐ Vehicle
☐ Subscriptions
```

### Step 2

```text
Add your first grocery receipt

[ Upload receipt ]
```

### Step 3

```text
You're ready.

Try saying:
"Naalaikku 4 perukku dosa pannanum."
```

---

# 23. Responsive Behavior

## Desktop

Use a centered workspace.

Recommended:

```text
max-width: 1280px
```

Desktop layout:

```text
Sidebar | Main content | Optional context panel
```

## Tablet

Collapse sidebar.

## Mobile

Use:

```text
Top header
Main content
Bottom navigation
```

No horizontal scrolling.

---

# 24. Component System

Create reusable components:

```text
AppShell
Sidebar
MobileNav
PageHeader
SectionHeader
Divider

Button
IconButton
Input
SearchInput
Select
Tabs
Modal
Drawer
Toast

InventoryItem
InventoryList
InventoryStatus
ReceiptItem
ReceiptReview

MealCard
MealSimulation
IngredientRow

RippleGraph
RippleNode
RippleEdge

ActionCard
ApprovalPanel
ActionStatus

VoiceButton
VoiceState
Transcript

Timeline
TimelineItem

EmptyState
LoadingState
ErrorState
```

---

# 25. Component Rules

Components should be:

- reusable
- composable
- accessible
- typed
- visually consistent

Avoid creating one-off components for every screen.

---

# 26. States Every Component Must Handle

Every data-dependent component needs:

### Loading

Use skeletons or quiet loading text.

### Empty

Example:

```text
No inventory yet.

Upload your first grocery receipt.
```

### Error

```text
Couldn't load inventory.

Try again.
```

### Success

Use subtle confirmation.

### Partial data

Clearly mark uncertain information.

---

# 27. Interaction Design

Use transitions around:

- navigation
- drawer/modal opening
- inventory updates
- ripple generation
- action status changes
- voice state changes

Animation duration:

```text
120–220ms
```

Avoid:

- bouncing
- floating
- spinning AI icons
- excessive parallax

---

# 28. Accessibility

Required:

- keyboard navigation
- visible focus states
- semantic HTML
- sufficient contrast
- screen-reader labels
- touch targets ≥44px
- reduced-motion support
- form error messages

---

# 29. Frontend Data Architecture

Use a server-state library such as TanStack Query.

Suggested structure:

```text
components/
features/
  dashboard/
  inventory/
  meals/
  ripple/
  actions/
  voice/
  activity/
hooks/
lib/
api/
types/
```

Frontend should not contain business-critical inventory calculations.

---

# 30. Frontend API Layer

Create typed API functions:

```text
getDashboard()
getInventory()
getInventoryItem(id)

uploadReceipt()
reviewReceipt()

getRecipes()
simulateMeal()
commitMeal()

getRipple(eventId)

getActions()
approveAction(id)
rejectAction(id)

getActivity()

startVoiceSession()
```

Use shared Zod/TypeScript contracts.

---

# 31. Realtime UI

Use Supabase Realtime for:

- inventory changes
- action status
- Snapserve status
- activity events
- agent workflow completion

Example:

```text
Vendor confirms order
       ↓
Backend updates action
       ↓
Realtime event
       ↓
Frontend updates automatically
```

Do not require manual refresh.

---

# 32. Dashboard Data Model

Dashboard should be derived from backend state.

```text
todayMeals
inventorySummary
attentionItems
pendingActions
recentActivity
```

Do not hardcode dashboard numbers for the final demo.

---

# 33. Frontend Build Order

## Phase 1 — Foundation

Build:

- React app
- routing
- Tailwind
- fonts
- design tokens
- AppShell
- responsive layout
- navigation

## Phase 2 — Dashboard

Build:

- dashboard
- today section
- kitchen summary
- attention section
- activity preview

## Phase 3 — Kitchen

Build:

- inventory
- search
- filters
- item detail
- receipt upload
- receipt review

## Phase 4 — Meal Intelligence

Build:

- meal planner
- serving selector
- ingredient breakdown
- inventory simulation
- shortage state

## Phase 5 — Ripple

Build:

- RippleGraph
- node states
- relationship edges
- explanation panel
- "Why?" interaction

## Phase 6 — Actions

Build:

- action list
- approval panel
- approval states
- execution status
- success/failure states

## Phase 7 — Voice

Build:

- voice button
- listening state
- transcript
- processing state
- result state
- transition into meal/action flow

## Phase 8 — Activity

Build:

- timeline
- agent activity details
- tool execution details

## Phase 9 — Mobile

Optimize every major screen for:

- 360px
- 390px
- 430px

## Phase 10 — Polish

Perform:

- spacing pass
- typography pass
- accessibility pass
- loading/error states
- responsive testing
- animation restraint
- removal of unnecessary UI

---

# 34. Demo-First Frontend Priority

For the hackathon, the critical path is:

```text
Dashboard
   ↓
Upload receipt
   ↓
Inventory updated
   ↓
Voice meal request
   ↓
Meal simulation
   ↓
Ripple
   ↓
Shortage
   ↓
Action
   ↓
Approval
   ↓
Snapserve
   ↓
Updated state
```

Every screen required for this flow should be polished before optional pages.

---

# 35. Judge-Facing Visual Moment

The strongest visual moment should be the transition:

```text
Biryani × 6

        ↓

Inventory simulation

        ↓

Chicken
700g available
1.5kg required

        ↓

800g short

        ↓

Purchase action

        ↓

Approve

        ↓

Calling vendor

        ↓

Confirmed

        ↓

Inventory updated
```

This demonstrates the product's intelligence through a real chain of state changes.

---

# 36. Final Frontend Principle

The interface should never try to convince the user that it is intelligent.

It should **demonstrate intelligence through behavior**.

```text
Simple UI
   +
Real household state
   +
Visible cause → effect
   +
Safe automation
   =
Product intelligence
```

The final frontend should feel like a polished household utility that happens to contain a sophisticated agentic system underneath.

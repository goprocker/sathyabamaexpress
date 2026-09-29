# Household Intelligence — Design System & Frontend Build Specification

## 1. Design Direction

### Product Character

The product must feel like a **calm, human household workspace**, not an AI product showcase.

Core references in spirit:
- **Linear:** crisp information hierarchy, keyboard-friendly speed, hairline borders
- **Apple Notes / Things:** quiet simplicity and approachable utility
- **Modern editorial products:** warm paper-like surfaces, high-contrast typography, generous whitespace
- **Household utility apps:** practical, scannable, and immediately understandable by any family member

Do not copy any specific product verbatim.

### Core Design Principle

> **Content creates the visual hierarchy. Decoration does not.**

The interface makes the intelligence of the system visible through **accurate household state, clear causal relationships, and verified real-world outcomes**—never through gradients, glowing orbs, or decorative effects.

---

## 2. Anti-AI-Slop Rules

### Strictly Forbidden
- purple, blue, or neon AI gradients
- glowing backgrounds or ambient light blurs
- floating AI orbs or pulsing sparkles
- heavy glassmorphism (`backdrop-filter: blur` overuse)
- giant gradient marketing text inside the app workspace
- excessive pill-shaped containers everywhere
- `"✨ AI-Powered"` badges or robot/brain illustrations
- futuristic 3D graphs or particle animations
- bloated dashboard cards with fake sparklines
- permanent chatbot sidebar as the primary interface
- emoji used as structural UI icons

### Required Aesthetic
- warm alabaster/paper-white background (`#FAFAF8`)
- near-black editorial typography (`#171717`)
- 1px solid hairline borders (`#E7E7E2`)
- subtle horizontal section separators
- restrained forest-green semantic accent (`#356B4A`)
- clean 1.5px stroke outline icons (Lucide)
- compact, truthful data displays (three-tier inventory bars, simple causal node trees)
- generous vertical rhythm and whitespace
- `6px–12px` border radius scale
- flat surfaces (`box-shadow: none` by default)
- fast, functional transitions (`120ms–200ms`)

---

## 3. Visual System & Color Tokens

Define all colors via semantic CSS variables in `apps/web/src/styles/tokens.css`:

```css
:root {
  /* Surfaces */
  --background: #FAFAF8;
  --surface: #FFFFFF;
  --surface-subtle: #F5F5F2;
  --surface-hover: #EFEFEA;

  /* Typography */
  --text-primary: #171717;
  --text-secondary: #6B6B67;
  --text-tertiary: #969690;
  --text-inverse: #FFFFFF;

  /* Borders & Dividers */
  --border: #E7E7E2;
  --border-strong: #D8D8D1;
  --focus-ring: rgba(53, 107, 74, 0.28);

  /* Primary Interactive & Brand Accent */
  --primary: #171717;
  --primary-hover: #2E2E2C;
  --accent: #356B4A;
  --accent-hover: #2A563B;
  --accent-subtle: #EAF2EC;

  /* Semantic Status Tokens */
  --success: #2E6F40;
  --success-subtle: #EAF2EC;

  --warning: #9A6B16;
  --warning-subtle: #F8F0DC;

  --danger: #A5443A;
  --danger-subtle: #F8E9E7;

  --info: #3B5B7E;
  --info-subtle: #EBF1F6;
}
```

### Button & Token Usage Rules
- **Primary Utility CTA** (e.g., `Continue`, `Confirm`, `Plan Meal`): `--primary` (`#171717`) background with `--text-inverse` text.
- **High-Consequence Approval CTA** (e.g., `Approve & Call Vendor`): `--accent` (`#356B4A`) background with `--text-inverse` text.
- **Secondary Action** (e.g., `Edit`, `Why?`, `Review`): `--surface` background, `1px solid var(--border-strong)`, `--text-primary` text.
- **Destructive / Reject Action** (e.g., `Reject`): `--surface` background, `1px solid var(--border)`, `--danger` text on hover.

---

## 4. Typography (Including Tamil / Indic Support)

Because users speak in **Tamil, Tanglish, and English**, the font stack must include clean Tamil glyph support alongside the primary geometric sans-serif:

```css
--font-sans: 'Geist', 'Inter', 'Noto Sans Tamil', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
```

### Type Scale (`font-size` / `line-height` / `font-weight`)

| Token | Size / Line Height | Weight | Usage |
|---|---|---|---|
| `Display` | `32px / 40px` | `600` (`-0.02em`) | Onboarding hero or major summary metric |
| `Page Title` | `26px / 34px` | `600` (`-0.015em`) | Top-level view header (`Good morning`, `Kitchen`) |
| `Section Header` | `16px / 24px` | `600` | Section titles (`Needs your attention`, `Ingredients`) |
| `Body` | `15px / 23px` | `400` / `500` | Primary list rows, descriptions, explanations |
| `Small` | `13px / 19px` | `400` / `500` | Secondary labels, unit breakdowns, status chips |
| `Metadata` | `12px / 17px` | `500` (`0.04em` uppercase) | Section kickers (`TODAY`, `KITCHEN`, `NEEDS REVIEW`), timestamps |

Use tabular numerals (`font-variant-numeric: tabular-nums`) on all quantities, weights, prices, and timestamps so columns align cleanly.

---

## 5. Spacing, Borders & Radius

### 4px Spacing Scale
`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `40px`, `48px`, `64px`.

### Radius Scale
- **Small badges & chips:** `6px`
- **Buttons & inputs:** `8px`
- **Cards & panels:** `10px`
- **Modals & bottom sheets:** `12px`

### Elevation Rule
- Default containers use `border: 1px solid var(--border)` and `box-shadow: none`.
- Only floating drawers, modals, and the mobile quick-action sheet use a subtle elevation:
  `box-shadow: 0 8px 24px rgba(23, 23, 23, 0.06);`

---

## 6. Iconography

Use **Lucide React** (`lucide-react`) with `strokeWidth={1.6}`.
- `16px` for inline status indicators and button icons
- `18px–20px` for sidebar and bottom navigation
- Never use emojis as navigation or status icons

---

## 7. Unified Application Structure & Navigation

Both Desktop and Mobile PWA render from the same React router and state hooks.

### 7.1 Desktop Navigation (`>= 1024px` Left Sidebar, `220px` wide)

```text
HOUSEHOLD

Overview
Kitchen
Ripple
Obligations
Actions          [2]
Activity

────────────────────

Household
Members
Settings
[ ↺ Reset Demo ]
```

### 7.2 Mobile PWA Navigation (`< 768px` Fixed Bottom Bar, `64px` height)

```text
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│   Home   │ Kitchen  │  + Add   │ Actions  │ Activity │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

Tapping the center **`+ Add`** button opens a bottom sheet with 4 direct utilities:
1. **Speak** — Opens the Sarvam voice command utility (`"Naalaikku 6 perukku biryani pannanum"`)
2. **Scan receipt** — Opens camera/file upload for grocery bills or obligation documents
3. **Plan meal** — Opens the Meal Planner & Simulator
4. **Add manually** — Quick form to add an inventory item or household obligation

---

## 8. Screen-by-Screen Specifications

### 8.1 Dashboard (`Overview` / `Home`)

**Purpose:** Answer *"What needs my attention right now?"* in a single glance without scrolling through card clutter.

```text
Good morning

TODAY
────────────────────────────────────────────────────────
Dinner · Tomorrow
Chicken Biryani · 6 servings               2 items short
1.5 kg chicken & 300 ml curd needed             Review →


NEEDS YOUR ATTENTION (3)
────────────────────────────────────────────────────────
Chicken · 800 g short
Required for tomorrow's Biryani (700 g on hand)
Purchase proposed · Kaveri Fresh                Review →

Curd · 100 ml short
Required for tomorrow's Biryani (200 ml on hand)
Included in proposed order                      Review →

Milk · 400 ml expiring tomorrow
Use before 30 Sep or plan morning coffee/tea      Why? →


KITCHEN SUMMARY
────────────────────────────────────────────────────────
42 items tracked · 2 shortages · 1 expiring soon
Open Kitchen →


RECENT ACTIVITY
────────────────────────────────────────────────────────
09:51   Meal planned          Chicken Biryani · 6 servings
09:43   Inventory updated     +4 items from receipt
09:42   Receipt processed     Kaveri Fresh Mart
```

---

### 8.2 Kitchen / Inventory View

Users can search, filter (`All`, `Short / Low`, `Expiring`, `Reserved`), upload a receipt, or inspect any resource's three-tier ledger (`On-Hand`, `Reserved`, `Incoming`).

```text
Kitchen                               [ Scan Receipt ]  [ Plan Meal ]

42 items · 2 short for planned meals · 1 expiring

[ Search inventory (e.g., chicken, rice, தயிர்)...                  ]
[ All (42) ]  [ Needs Attention (3) ]  [ Reserved (4) ]  [ Expiring (1) ]

─────────────────────────────────────────────────────────────────────
ITEM              ON HAND      RESERVED     INCOMING     STATUS
─────────────────────────────────────────────────────────────────────
Chicken           700 g        1.5 kg       —            Short 800 g
Curd              200 ml       300 ml       —            Short 100 ml
Milk              400 ml       —            —            Expires 1d
Basmati Rice      5.0 kg       1.2 kg       —            Available (3.8 kg net)
Onion             2.0 kg       800 g        —            Available (1.2 kg net)
Tomato            1.0 kg       —            —            Available
Dal               850 g        —            —            Available
```

**Inventory Item Detail Drawer (when clicking `Chicken`):**
- **On-hand quantity:** `700 g` (Lot `#104`, purchased today from Kaveri Fresh, expires in 2 days)
- **Reserved for meals:** `1,500 g` (`Chicken Biryani × 6`, Tomorrow Dinner)
- **Incoming orders:** `0 g` (becomes `+800 g` once Snapserve call is confirmed)
- **Net available balance:** `-800 g` (`Short 800 g`)
- **Expected depletion / burn rate:** `~350 g / day`

---

### 8.3 Receipt Upload & Confidence Review Screen

Never silently commit low-confidence OCR extractions.

```text
Grocery Receipt · Kaveri Fresh Mart

Review extracted items before updating kitchen inventory:

ITEM                QUANTITY     UNIT     EXPIRY       CONFIDENCE
─────────────────────────────────────────────────────────────────
Basmati Rice        5.0          kg       12 months    ✓ 98%
Chicken (Curry Cut) 700          g        2 days       ✓ 95%
Onion               2.0          kg       14 days      ✓ 94%
Curd (Pouch)        200          ml       4 days       ? 74%  [ Confirm / Edit ]

─────────────────────────────────────────────────────────────────
4 items detected · 1 item needs your confirmation

[ Cancel ]                                  [ Confirm & Update Inventory ]
```

---

### 8.4 Meal Planner & Deterministic Simulator

Allows users to select a dish, adjust servings with `- / +` controls, and immediately see deterministic ingredient math (`0ms` LLM wait).

```text
Plan a Meal

Dish:       [ Chicken Biryani                           ▼ ]
Servings:   [ − ]   6   [ + ]
When:       Tomorrow · Dinner (30 Sep)

───────────────────────────────────────────────────────────
INGREDIENT        REQUIRED     ON HAND     NET STATUS
───────────────────────────────────────────────────────────
Basmati Rice      1.2 kg       5.0 kg      Available (3.8 kg left)
Chicken           1.5 kg       700 g       Short 800 g
Onion             800 g        2.0 kg      Available (1.2 kg left)
Curd              300 ml       200 ml      Short 100 ml

───────────────────────────────────────────────────────────
Summary: 2 of 4 ingredients are short. Committing this meal will
generate a purchase proposal for 800 g Chicken and 200 ml Curd.

[ Simulate Ripple ]                    [ Commit Meal Plan ]
```

---

### 8.5 Signature Feature — Ripple View (Responsive Desktop & Mobile)

The Ripple View visualizes how one household event propagates across resources, forecasts, and actions.

#### Desktop Layout (`>= 768px` — 2D Causal Flow)

```text
[ Event: Biryani · 6 servings (Tomorrow Dinner) ]
        │
        ├──────────────────┬──────────────────┬──────────────────┐
        ▼                  ▼                  ▼                  ▼
  Basmati Rice           Onion             Chicken              Curd
  1.2 kg needed       800 g needed      1.5 kg needed       300 ml needed
  5.0 kg on hand      2.0 kg on hand    700 g on hand       200 ml on hand
  [ Available ]       [ Available ]     [ Short 800 g ]     [ Short 100 ml ]
                                              │                  │
                                              └────────┬─────────┘
                                                       ▼
                                         [ Forecast: Meal Deficit Risk ]
                                                       │
                                                       ▼
                                      [ Action: Order from Kaveri Fresh ]
                                       800 g Chicken + 200 ml Curd Pack
                                                       │
                                                       ▼
                                       [ Why? ]   [ Review & Approve → ]
```

#### Mobile Layout (`< 768px` — Vertical Indented Causal Tree, Zero Horizontal Scroll)

```text
● Event: Chicken Biryani · 6 servings
│ Tomorrow · Dinner
│
├─ ✓ Basmati Rice (1.2 kg needed / 5.0 kg on hand)
├─ ✓ Onion (800 g needed / 2.0 kg on hand)
│
├─ ! Chicken · Short 800 g
│  │ Required: 1.5 kg · Available: 700 g
│  │
├─ ! Curd · Short 100 ml
│  │ Required: 300 ml · Available: 200 ml
│  │
└──► Proposed Action: Order from Kaveri Fresh
     800 g Chicken + 200 ml Curd
     [ Why? ]  [ Approve Order ]
```

---

### 8.6 "Why?" Evidence Drawer

Every recommendation or shortage badge has an interactive **`Why?`** trigger that opens a clean slide-over drawer showing the deterministic provenance:

```text
Why is Chicken 800 g short?

TRIGGER EVENT
Tomorrow's Dinner · Chicken Biryani × 6 servings
Spoken at 09:51 ("Naalaikku 6 perukku biryani pannanum")

DETERMINISTIC CALCULATION
Recipe per serving          250 g × 6
Total required              1,500 g (1.5 kg)
Physical on-hand stock        700 g (Receipt #104, 09:42)
Reserved for other meals        0 g
Incoming vendor orders          0 g
───────────────────────────────────────
Net Deficit                   800 g

PROPOSED RESOLUTION
Call Kaveri Fresh Mart (+91 98400 •••••) via Snapserve
Order: 800 g Chicken (Curry Cut) + 200 ml Curd pouch
```

---

### 8.7 Actions & Approval View + Live Snapserve Execution

#### Before Approval (`PENDING_APPROVAL`)

```text
Actions · Needs Review (1)

ORDER FROM VENDOR
Purchase 800 g Chicken & 200 ml Curd

Reason
Tomorrow's Chicken Biryani (6 servings) requires 1.5 kg chicken
and 300 ml curd. Current inventory has 700 g chicken and 200 ml curd.

Execution Details
• Vendor:          Kaveri Fresh Mart (+91 98400 •••••)
• Channel:         Snapserve Automated Voice Call
• Delivery Target: Tomorrow morning (before 10:00 AM)
• Est. Cost:       ₹260

───────────────────────────────────────────────────────────
[ Reject ]                              [ Approve & Call Vendor ]
```

#### During & After Approval (Real-Time Snapserve State)

Never fake states—bind directly to Supabase Realtime updates from the backend `actions` and `action_outcomes` tables:

```text
Action #ACT-01 · Executing via Snapserve

● Preparing call script & verifying approval token      09:53:02
● Calling Kaveri Fresh Mart (+91 98400 •••••)           09:53:04
● Connected · Speaking order in Tamil/English           09:53:09
● Vendor response received                              09:53:18
● Order Confirmed & Reconciled                          09:53:21

LIVE CALL TRANSCRIPT
Agent:  "Vanakkam, calling from Household Assistant for Sai's home.
         We need 800 grams chicken curry cut and one 200 ml curd
         pouch delivered tomorrow morning before 10 AM. Is it available?"
Vendor: "Yes sir, both are available. We will deliver by 8:30 AM."

RECONCILED STATE IMPACT
✓ Chicken: +800 g Incoming (Tomorrow's Biryani shortage resolved)
✓ Curd:    +200 ml Incoming (Tomorrow's Biryani shortage resolved)
```

---

### 8.8 Voice Command Utility (Sarvam AI)

Voice is presented as a focused command sheet/modal—never a permanent chat history.

- **State 1 — Listening:**
  Quiet waveform bar + prompt: *"Speak naturally in Tamil, Tanglish, or English..."*
- **State 2 — Live Transcript:**
  `"Naalaikku 6 perukku biryani pannanum."` *(with editable text input fallback)*
- **State 3 — Structured Understanding Chips:**
  `[ Intent: Plan Meal ]` `[ Dish: Chicken Biryani ]` `[ Servings: 6 ]` `[ When: Tomorrow Dinner ]`
- **State 4 — Immediate Simulation Result:**
  `2 ingredients short: Chicken (800 g short), Curd (100 ml short)` → Primary CTA: **`[ View Ripple & Action → ]`**

---

### 8.9 Activity Timeline & Expandable Judge Trace

By default, shows human-friendly household events. Clicking **`Inspect Agent Trace`** on any row reveals the full `agent_runs → agent_steps → tool_calls` chain for technical judges:

```text
09:53   Vendor Order Confirmed
        800 g Chicken & 200 ml Curd · Kaveri Fresh Mart
        [ Inspect Agent Trace ▾ ]
        ┌────────────────────────────────────────────────────────────┐
        │ Run #run_892 · WORKFLOW: ACTION_EXECUTION (19.2s total)    │
        │ 1. ApprovalGate      Verified HMAC token        (4 ms)     │
        │ 2. ExecutionEngine   Tool: snapserve.call       (16,400 ms)│
        │ 3. Reconciliation    Parsed vendor transcript   (1,120 ms) │
        │ 4. InventoryEngine   Tool: outcome.reconcile    (18 ms)    │
        │    → incoming_quantity: Chicken +800g, Curd +200ml         │
        └────────────────────────────────────────────────────────────┘

09:51   Meal Planned (2 shortages detected)
        Chicken Biryani · 6 servings · Tomorrow Dinner
        [ Inspect Agent Trace ▾ ]
        ┌────────────────────────────────────────────────────────────┐
        │ Run #run_891 · WORKFLOW: MEAL_PLANNING (1.4s total)        │
        │ 1. SarvamProxy       STT Transcription          (620 ms)   │
        │ 2. IntakeAgent       Extracted MEAL_PLANNED     (540 ms)   │
        │ 3. MealEngine        Tool: inventory.simulate   (12 ms)    │
        │ 4. RippleEngine      BFS depth=4, 6 nodes       (9 ms)     │
        │ 5. ForecastEngine    Tool: forecast.run         (14 ms)    │
        │ 6. ActionPlanner     Tool: action.prepare       (210 ms)   │
        └────────────────────────────────────────────────────────────┘
```

---

## 9. Frontend Data & API Layer (`apps/web/src/api`)

All API calls use TanStack Query and shared Zod contracts from `packages/contracts`:

```typescript
// Dashboard & Reset
getDashboard(householdId: string): Promise<DashboardResponse>
resetDemoState(householdId: string): Promise<{ ok: boolean; resetTimestamp: string }>

// Inventory & Receipts
getInventory(params?: { search?: string; filter?: string }): Promise<InventoryListResponse>
getInventoryItem(resourceId: string): Promise<InventoryDetailResponse>
extractReceipt(file: File): Promise<ReceiptExtractionResponse>
confirmReceipt(receiptId: string, items: ConfirmedReceiptItem[]): Promise<ReceiptCommitResponse>

// Meals & Ripple
getRecipes(search?: string): Promise<RecipeListResponse>
simulateMeal(input: MealSimulationInput): Promise<MealSimulationResponse>
commitMeal(input: MealCommitInput): Promise<MealCommitResponse>
getRippleGraph(eventId: string): Promise<RippleGraphResponse>

// Obligations, Actions & Voice
getObligations(householdId: string): Promise<ObligationsResponse>
getActions(status?: string): Promise<ActionsListResponse>
approveAction(actionId: string, userId: string): Promise<ActionApprovalResponse>
rejectAction(actionId: string, userId: string, reason?: string): Promise<ActionResponse>
transcribeVoice(audioBlob: Blob, autoIngest?: boolean): Promise<VoiceTranscriptionResponse>
getTimeline(limit?: number): Promise<TimelineResponse>
```

---

## 10. Component Inventory (`apps/web/src/components`)

| Category | Reusable Components |
|---|---|
| **Layout & Navigation** | `AppShell`, `DesktopSidebar`, `MobileBottomNav`, `QuickAddSheet`, `PageHeader`, `SectionHeader`, `Divider`, `DemoResetButton` |
| **Primitives** | `Button`, `IconButton`, `Input`, `SearchInput`, `Select`, `StatusBadge`, `Drawer`, `Modal`, `Toast`, `Skeleton` |
| **Kitchen & Receipts** | `InventoryTable`, `InventoryItemDrawer`, `LedgerBar` (`on_hand / reserved / incoming`), `ReceiptDropzone`, `ReceiptReviewTable` |
| **Meals & Ripple** | `MealPlannerForm`, `ServingStepper`, `SimulationTable`, `RippleGraphDesktop` (2D DAG), `RippleTreeMobile` (vertical tree), `WhyEvidenceDrawer` |
| **Actions & Voice** | `ActionApprovalCard`, `SnapserveLiveStepper`, `CallTranscriptBox`, `VoiceCommandModal`, `IntentChips` |
| **Activity & Obligations** | `ActivityTimeline`, `AgentTraceAccordion`, `ObligationRow`, `ForecastRiskCard` |

---

## 11. Accessibility & Responsive Quality Bar

- **Mobile Viewport Verification:** Every screen must be tested at `360px`, `390px`, and `430px` widths with **zero horizontal overflow**.
- **Touch Targets:** All interactive controls on mobile (`+ Add`, `- / +` serving buttons, `Approve`, `Reject`) must be at least `44px × 44px`.
- **Keyboard Support:** Escape closes drawers/modals; Enter submits forms; focus rings use `2px solid var(--focus-ring)`.
- **Reduced Motion:** Respect `prefers-reduced-motion: reduce` by disabling step transitions.

---

## 12. Final Frontend Principle

The interface never tries to *convince* the user that it is intelligent through futuristic decoration.

It **demonstrates intelligence through quiet, accurate behavior**:

$$\text{Calm Editorial UI} + \text{Canonical Three-Tier State} + \text{Visible Cause-and-Effect Ripple} + \text{Human-Approved Execution} = \text{Product Intelligence}$$

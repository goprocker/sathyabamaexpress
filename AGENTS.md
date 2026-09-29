# AGENTS.md — Household & Personal Obligation Intelligence

> **Every coding agent MUST read this file before making any change.**
> Authoritative specs: [`docs/PRD.md`](docs/PRD.md) · [`docs/TRD.md`](docs/TRD.md) · [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

---

## 1. What this product is

A stateful household operating system: it observes everyday events, maintains canonical state in PostgreSQL, predicts what needs attention next (ripple + forecast engines), proposes actions with evidence, and executes approved actions through Snapserve. Kitchen inventory + meal planning is the hero vertical.

Core loop: `OBSERVE → UNDERSTAND → UPDATE STATE → PREDICT → PLAN → ASK → ACT → VERIFY`.

## 2. Technology stack (fixed — do not swap without an ADR)

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces (`pnpm@10`, Node ≥ 22) |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Routing / server state | TanStack Router · TanStack Query |
| Forms | react-hook-form + zod resolver |
| Backend | Node.js + TypeScript + **Fastify** |
| Database | PostgreSQL (Supabase) via Prisma |
| Validation | Zod — shared contracts in `packages/contracts` |
| AI / Voice / Execution | OpenAI · Sarvam · Snapserve (server-side only) |

## 3. Repository structure

```text
/
├── AGENTS.md            ← this file
├── docs/                ← PRD.md · TRD.md · DESIGN_SYSTEM.md (specs live here)
├── apps/
│   └── web/             ← React SPA (desktop + mobile PWA) — owner: frontend agent
├── packages/
│   └── contracts/       ← Zod schemas + TS types shared by web, api, agents, tests
└── .env.example         ← copy to .env; never commit .env
```

`apps/api`, `packages/db`, `packages/domain`, `packages/agents`, `packages/tools` are planned next; their owners scaffold them under this structure.

## 4. File ownership — stay in your lane

| Agent | Owns | May read | Must not touch |
|---|---|---|---|
| **Frontend** | `apps/web/**`, `docs/DESIGN_SYSTEM.md` | everything | backend logic, DB schema |
| Backend | `apps/api/**`, `packages/db`, `packages/domain` | everything | `apps/web` UI internals |
| AI | `packages/agents`, `packages/tools`, prompts | everything | UI, Prisma schema |
| Integration | OpenAI/Sarvam/Snapserve adapters | everything | domain logic |
| QA / Security | `tests/**`, review on any PR | everything | — |

Cross-cutting changes (contracts, AGENTS.md, PRD/TRD) require an explicit note in the hand-off summary.

## 5. Non-negotiable rules

1. **PostgreSQL is canonical state.** LLM context is never application state.
2. **Agents reason, services calculate.** Inventory arithmetic, recipe scaling, graph traversal, and state transitions are deterministic TypeScript — never LLM output.
3. **Every action has evidence.** Proposals carry a reason chain (required / available / deficit).
4. **Privileged actions require approval.** Snapserve calls happen only with a valid approval token bound to `action_id + payload_hash + user_id + expiry`.
5. **Idempotency keys** on every state-changing command (purchases, inventory commits, Snapserve calls).
6. **No secrets in frontend.** Browser code uses only `VITE_*` vars. Provider keys live server-side only.
7. **Agents/tools never touch SQL or secrets directly** — they go through the typed tool layer with permission checks.
8. **Shared contracts first.** API request/response shapes are defined once in `packages/contracts` (Zod) and consumed by web, api, agents, and tests.
9. **No unrelated refactors.** Keep PRs inside assigned scope; report limitations honestly.

## 6. Frontend rules (apps/web) — binding

- The design system in `docs/DESIGN_SYSTEM.md` is law: warm white `#FAFAF8`, near-black text, thin borders `#E7E7E2`, single green accent `#356B4A`, 4px spacing grid, radii 6/8/10/12px, `box-shadow: none` by default.
- **Anti-slop:** no purple/blue AI gradients, no glow, no glassmorphism, no gradient text, no robot/orb imagery, no "✨ AI-powered" labels, no fake charts, no chatbot-first UI.
- All colors/spacing/radii come from CSS variables / Tailwind theme tokens — no ad-hoc hex values in components.
- Lucide outline icons only; 16–20px controls, 20–24px nav. No emoji as UI icons.
- Server state via TanStack Query. **No business-critical calculations in the frontend** — quantities, shortages, and forecasts come from the API (mock layer now, real API later).
- Every data-dependent component implements loading / empty / error / partial-data states.
- Accessibility: semantic HTML, visible focus, keyboard navigation, touch targets ≥ 44px, reduced-motion support.
- Transitions 120–220ms; restrained motion only.
- One codebase serves desktop (sidebar + 1280px workspace) and mobile PWA (bottom nav + Add sheet); optimize for 360/390/430px.
- Demo critical path (polish these first): Dashboard → Receipt upload → Inventory updated → Voice meal → Simulation → Ripple → Shortage → Action → Approval → Snapserve → State updated.

## 7. Workflow for every agent

1. Read this file + the relevant spec sections before editing.
2. Inspect existing code; match its conventions.
3. Make the smallest change that fulfills the task.
4. Add/adjust tests for state-changing logic.
5. Run `pnpm typecheck` and `pnpm --filter @household/web build` (or the package's own checks) before hand-off.
6. Report: changed files, decisions taken, limitations, follow-ups.

## 8. Prohibited patterns

- `any` in new code; non-null `!` assertions to silence types
- hardcoding demo numbers that should come from state (dashboard must derive from API)
- raw `fetch` outside `apps/web/src/lib/api`; direct SQL from agents/tools
- new UI dependencies without strong justification (bar chart libs, animation suites, component kits)
- committing `.env`, build output, or provider keys
- decorative animations, glassmorphism, gradient text, emoji icons

## 9. Commands

```bash
pnpm install                          # bootstrap
pnpm dev                              # web dev server (Vite)
pnpm build                            # production build
pnpm typecheck                        # all workspaces
pnpm lint                             # eslint across workspaces
```

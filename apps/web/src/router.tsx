import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage as KitchenPage } from "@/features/dashboard/DashboardPage";
import { HomePage } from "@/features/home/HomePage";
import { TimelinePage } from "@/features/timeline/TimelinePage";
import { MobilityPage } from "@/features/mobility/MobilityPage";
import { CircularPage } from "@/features/circular/CircularPage";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { PlansPage } from "@/features/plans/PlansPage";
import { PantryPage } from "@/features/inventory/PantryPage";
import { InventoryItemPage } from "@/features/inventory/InventoryItemPage";
import { ReceiptPage } from "@/features/inventory/ReceiptPage";
import { MealPlannerPage } from "@/features/meals/MealPlannerPage";
import { RecipesPage } from "@/features/recipes/RecipesPage";
import { SmartCartPage } from "@/features/cart/SmartCartPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { ObligationsPage } from "@/features/obligations/ObligationsPage";
import { ForecastsPage } from "@/features/forecasts/ForecastsPage";
import { RipplePage } from "@/features/ripple/RipplePage";
import { ActionsPage } from "@/features/actions/ActionsPage";
import { ActivityPage } from "@/features/activity/ActivityPage";
import { VoicePage } from "@/features/voice/VoicePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { MembersPage } from "@/features/settings/MembersPage";
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";

// Landing (GSAP + Lenis + video story) is code-split so the product
// bundle stays lean. Preloaded from the dashboard demo helper link.
const LandingPage = lazy(() =>
  import("@/landing/LandingPage").then((m) => ({ default: m.LandingPage })),
);

const rootRoute = createRootRoute({ component: () => <Outlet /> });

// Product pages share the AppShell chrome; landing renders standalone.
function shell(page: ReactNode) {
  return <AppShell>{page}</AppShell>;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => shell(<HomePage />),
});

const kitchenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/kitchen",
  component: () => shell(<KitchenPage />),
});

const timelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/timeline",
  component: () => shell(<TimelinePage />),
  validateSearch: (search: Record<string, unknown>): { day?: string } => ({
    day: typeof search.day === "string" ? search.day : undefined,
  }),
});

const mobilityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mobility",
  component: () => shell(<MobilityPage />),
});

const circularRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/circular",
  component: () => shell(<CircularPage />),
});

const assistantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assistant",
  component: () => shell(<AssistantPage />),
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: () => shell(<NotificationsPage />),
});

const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plans",
  component: () => shell(<PlansPage />),
});

const pantryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pantry",
  component: () => shell(<PantryPage />),
});

const inventoryItemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/$itemId",
  component: () => shell(<InventoryItemPage />),
});

const receiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/receipt",
  component: () => shell(<ReceiptPage />),
});

const recipesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recipes",
  component: () => shell(<RecipesPage />),
});

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cart",
  component: () => shell(<SmartCartPage />),
});

const mealsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/meals",
  component: () => shell(<MealPlannerPage />),
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: () => shell(<ProfilePage />),
});

const rippleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ripple",
  component: () => shell(<RipplePage />),
  validateSearch: (search: Record<string, unknown>): { eventId?: string } => ({
    eventId: typeof search.eventId === "string" ? search.eventId : undefined,
  }),
});

const actionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/actions",
  component: () => shell(<ActionsPage />),
});

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activity",
  component: () => shell(<ActivityPage />),
});

const obligationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/obligations",
  component: () => shell(<ObligationsPage />),
});

const forecastsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forecasts",
  component: () => shell(<ForecastsPage />),
});

const voiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/voice",
  component: () => shell(<VoicePage />),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => shell(<SettingsPage />),
});

const membersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/members",
  component: () => shell(<MembersPage />),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: () => shell(<OnboardingPage />),
});

// Legacy route — redirect /inventory to /pantry
const inventoryRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory",
  component: () => shell(<PantryPage />),
});

// Marketing landing page — no app chrome (own nav + footer).
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/landing",
  component: () => (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[var(--color-background)]">
          <p className="text-[13px] text-[var(--color-text-secondary)]">Loading story…</p>
        </div>
      }
    >
      <LandingPage />
    </Suspense>
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  kitchenRoute,
  timelineRoute,
  mobilityRoute,
  circularRoute,
  assistantRoute,
  notificationsRoute,
  plansRoute,
  pantryRoute,
  inventoryRedirectRoute,
  inventoryItemRoute,
  receiptRoute,
  recipesRoute,
  cartRoute,
  mealsRoute,
  profileRoute,
  rippleRoute,
  actionsRoute,
  activityRoute,
  obligationsRoute,
  forecastsRoute,
  voiceRoute,
  settingsRoute,
  membersRoute,
  onboardingRoute,
  landingRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

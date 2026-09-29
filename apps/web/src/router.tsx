import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { InventoryPage } from "@/features/inventory/InventoryPage";
import { InventoryItemPage } from "@/features/inventory/InventoryItemPage";
import { ReceiptPage } from "@/features/inventory/ReceiptPage";
import { MealPlannerPage } from "@/features/meals/MealPlannerPage";
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
  component: () => shell(<DashboardPage />),
});

const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory",
  component: () => shell(<InventoryPage />),
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

const mealsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/meals",
  component: () => shell(<MealPlannerPage />),
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

// Marketing landing page — no app chrome (own nav + footer).
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/landing",
  component: () => (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#FAFAF8]">
          <p className="text-sm text-[#6B6B67]">Loading story…</p>
        </div>
      }
    >
      <LandingPage />
    </Suspense>
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  inventoryRoute,
  inventoryItemRoute,
  receiptRoute,
  mealsRoute,
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

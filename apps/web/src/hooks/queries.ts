import {
  QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "../lib/api";
import type { ReceiptLineReview } from "../lib/api";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

const keys = {
  dashboard: ["dashboard"] as const,
  inventory: ["inventory"] as const,
  inventoryItem: (id: string) => ["inventory", id] as const,
  recipes: ["recipes"] as const,
  actions: ["actions"] as const,
  activity: ["activity"] as const,
  agentTrace: ["agentTrace"] as const,
  forecasts: ["forecasts"] as const,
  obligations: ["obligations"] as const,
  ripple: (eventId: string) => ["ripple", eventId] as const,
  why: (itemId: string) => ["why", itemId] as const,
  stateDiff: ["stateDiff"] as const,
};

// ── Queries ────────────────────────────────────────────────────────────────

export const dashboardQuery = () =>
  queryOptions({ queryKey: keys.dashboard, queryFn: api.getDashboard });

export const inventoryQuery = () =>
  queryOptions({ queryKey: keys.inventory, queryFn: api.getInventory });

export const inventoryItemQuery = (id: string) =>
  queryOptions({
    queryKey: keys.inventoryItem(id),
    queryFn: () => api.getInventoryItem(id),
  });

export const recipesQuery = () =>
  queryOptions({ queryKey: keys.recipes, queryFn: api.getRecipes });

export const actionsQuery = () =>
  queryOptions({ queryKey: keys.actions, queryFn: api.getActions });

export const activityQuery = () =>
  queryOptions({ queryKey: keys.activity, queryFn: api.getActivity });

export const agentTraceQuery = () =>
  queryOptions({ queryKey: keys.agentTrace, queryFn: api.getAgentTrace });

export const forecastsQuery = () =>
  queryOptions({ queryKey: keys.forecasts, queryFn: api.getForecasts });

export const obligationsQuery = () =>
  queryOptions({ queryKey: keys.obligations, queryFn: api.getObligations });

export const rippleQuery = (eventId: string) =>
  queryOptions({
    queryKey: keys.ripple(eventId),
    queryFn: () => api.getRipple(eventId),
  });

export const whyQuery = (itemId: string) =>
  queryOptions({ queryKey: keys.why(itemId), queryFn: () => api.getWhy(itemId) });

export const stateDiffQuery = () =>
  queryOptions({ queryKey: keys.stateDiff, queryFn: api.getStateDiff });

// Convenience wrappers for components.
export const useDashboard = () => useQuery(dashboardQuery());
export const useInventory = () => useQuery(inventoryQuery());
export const useInventoryItem = (id: string) =>
  useQuery(inventoryItemQuery(id));
export const useRecipes = () => useQuery(recipesQuery());
export const useActions = () => useQuery(actionsQuery());
export const useActivity = () => useQuery(activityQuery());
export const useAgentTrace = () => useQuery(agentTraceQuery());
export const useForecasts = () => useQuery(forecastsQuery());
export const useObligations = () => useQuery(obligationsQuery());
export const useRipple = (eventId: string) => useQuery(rippleQuery(eventId));
export const useWhy = (itemId: string) => useQuery(whyQuery(itemId));
export const useStateDiff = () => useQuery(stateDiffQuery());

// ── Mutations ──────────────────────────────────────────────────────────────

export function invalidateAllHouseholdQueries(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.dashboard });
  // Life screens (recipes, summaries, assistant context) read the same inventory.
  void qc.invalidateQueries({ queryKey: ["life"] });
  void qc.invalidateQueries({ queryKey: keys.inventory });
  void qc.invalidateQueries({ queryKey: keys.actions });
  void qc.invalidateQueries({ queryKey: keys.activity });
  void qc.invalidateQueries({ queryKey: keys.agentTrace });
  void qc.invalidateQueries({ queryKey: keys.forecasts });
  void qc.invalidateQueries({ queryKey: keys.obligations });
  void qc.invalidateQueries({ queryKey: ["ripple"] });
  void qc.invalidateQueries({ queryKey: keys.stateDiff });
}

export function useConfirmReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lines: ReceiptLineReview[]) => api.confirmReceipt(lines),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

export function useCommitMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      recipeId,
      servings,
    }: {
      recipeId: string;
      servings: number;
    }) => api.commitMeal(recipeId, servings),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

export function useConsumeMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mealPlanId: string) => api.consumeMeal(mealPlanId),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

export function useApproveAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approveAction(id),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

export function useRejectAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rejectAction(id),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

export function useCompleteSnapserve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.completeSnapserve(id),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

export function useVerifyDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      actionId: string;
      mode: "EXACT_MATCH" | "SHORT_DELIVERY";
    }) => api.verifyDelivery(input),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

export function useResetDemoState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode?: "pre-receipt" | "post-receipt") =>
      api.resetDemoState(mode),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

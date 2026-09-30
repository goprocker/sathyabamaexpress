import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListingType, ModuleId, TransportMode, WardrobeCategory } from "@household/life";
import { useEffect } from "react";
import * as life from "@/lib/lifeApi";
import { subscribeToHouseholdEvents } from "@/lib/api";
import { invalidateAllHouseholdQueries } from "@/hooks/queries";

const K = {
  overview: ["life", "overview"] as const,
  summary: ["life", "summary"] as const,
  notifications: ["life", "notifications"] as const,
  mobility: ["life", "mobility"] as const,
  circular: ["life", "circular"] as const,
  scopes: ["life", "scopes"] as const,
  plans: ["life", "plans"] as const,
  cart: ["kitchen", "cart"] as const,
  budget: ["kitchen", "budget"] as const,
  mealPlan: ["kitchen", "meal-plan"] as const,
  members: ["household", "members"] as const,
};

export const useOverview = () => useQuery({ queryKey: K.overview, queryFn: life.getOverview });
export const useSummary = () => useQuery({ queryKey: K.summary, queryFn: life.getSummary });
// Refreshed live (SSE / push, see useLiveNotifications) and every minute as a fallback.
export const useNotifications = () =>
  useQuery({ queryKey: K.notifications, queryFn: life.getNotifications, refetchInterval: 60_000 });

/** Keeps the notification list current: server events and pushes arriving while the app is open. */
export function useLiveNotifications() {
  const qc = useQueryClient();
  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: K.notifications });
    const unsubscribe = subscribeToHouseholdEvents((type) => {
      if (type === "NOTIFICATIONS_UPDATED") refresh();
    });
    const onWorkerMessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === "PUSH_RECEIVED") refresh();
    };
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      unsubscribe();
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [qc]);
}
export const useMobility = () => useQuery({ queryKey: K.mobility, queryFn: life.getMobility });
export const useCircular = () => useQuery({ queryKey: K.circular, queryFn: life.getCircular });
export const useScopes = () => useQuery({ queryKey: K.scopes, queryFn: life.getScopes });
export const usePlans = () => useQuery({ queryKey: K.plans, queryFn: life.getPlans, staleTime: 5 * 60_000 });
export const useCart = () => useQuery({ queryKey: K.cart, queryFn: life.getCart });
export const useBudget = () => useQuery({ queryKey: K.budget, queryFn: life.getBudget });
export const useMealPlan = () => useQuery({ queryKey: K.mealPlan, queryFn: life.getMealPlan });
export const useMembers = () => useQuery({ queryKey: K.members, queryFn: life.getMembers, staleTime: 5 * 60_000 });
export const useStarters = () => useQuery({ queryKey: ["life", "starters"], queryFn: life.getStarters, staleTime: Infinity });

export const useLeaveBy = (arrival: string, mode: TransportMode) =>
  useQuery({
    queryKey: ["life", "leave-by", arrival, mode],
    queryFn: () => life.getLeaveBy(arrival, mode),
    enabled: /^\d{2}:\d{2}$/.test(arrival),
    placeholderData: keepPreviousData,
  });

export const useChargePlan = (target: number) =>
  useQuery({
    queryKey: ["life", "charge-plan", target],
    queryFn: () => life.getChargePlan(target),
    placeholderData: keepPreviousData,
  });

export const useOccasionPlan = (picked: { Ethnic: string | null; Accessory: string | null }) =>
  useQuery({
    queryKey: ["life", "occasion-plan", picked.Ethnic, picked.Accessory],
    queryFn: () => life.getOccasionPlan(picked),
    placeholderData: keepPreviousData,
  });

export const useLifeSearch = (q: string) =>
  useQuery({
    queryKey: ["life", "search", q],
    queryFn: () => life.searchLife(q),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });

/** Mutation that refreshes every LIVORA query afterwards. */
function useLifeMutation<A, R>(fn: (arg: A) => Promise<R>, extra: readonly (readonly string[])[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["life"] });
      for (const key of extra) void qc.invalidateQueries({ queryKey: [...key] });
    },
  });
}

export const useDecideSuggestion = () => useLifeMutation(life.decideSuggestion);
export const useResetLearning = () => useLifeMutation(life.resetLearning);
export const useApplyCollision = () =>
  useLifeMutation((v: { id: string; enabled: boolean }) => life.setCollisionApplied(v.id, v.enabled));
export const useMarkRead = () => useLifeMutation((ids: string[] | "all") => life.markNotificationsRead(ids));
export const useTripShare = () =>
  useLifeMutation((v: { contactId: string; enabled: boolean }) => life.setTripShare(v.contactId, v.enabled));
export const useRideRequest = () =>
  useLifeMutation((v: { poolId: string; enabled: boolean }) => life.setRideRequest(v.poolId, v.enabled));
export const useAddWardrobe = () =>
  useLifeMutation((v: { name: string; category: WardrobeCategory; occasion: string }) => life.addWardrobeItem(v));
export const useAddListing = () =>
  useLifeMutation((v: { title: string; type: ListingType; perDay: number }) => life.addListing(v));
export const useSetFactors = () => useLifeMutation(life.setImpactFactors);
export const useSetScope = () =>
  useLifeMutation((v: { module: ModuleId; enabled: boolean }) => life.setScope(v.module, v.enabled));
/** Everything derived from the cart: the cart itself plus spending in overview and summary. */
function useInvalidateCart() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: K.cart }),
      qc.invalidateQueries({ queryKey: K.overview }),
      qc.invalidateQueries({ queryKey: K.summary }),
    ]);
}

export const useAsk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { question: string; history: life.AssistantTurn[]; image?: string }) =>
      life.askAssistant(v.question, v.history, v.image),
    // The agent can change anything (meal plans, orders, bills, cart…): refresh every screen.
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
};
export const useAskByVoice = () => {
  const invalidateCart = useInvalidateCart();
  return useMutation({
    mutationFn: (v: { audio: Blob; history: life.AssistantTurn[] }) => life.askAssistantByVoice(v.audio, v.history),
    onSuccess: (out) => {
      if (out.answer.actions?.length) void invalidateCart();
    },
  });
};

export const useCartView = () => useQuery({ queryKey: [...K.cart, "view"], queryFn: life.getCartView });

export const useAddCartItem = () => {
  const invalidateCart = useInvalidateCart();
  return useMutation({ mutationFn: life.addCartItem, onSettled: invalidateCart });
};

export const useSetCartQuantity = () => {
  const invalidateCart = useInvalidateCart();
  return useMutation({
    mutationFn: (v: { id: string; quantity: number }) => life.setCartItemQuantity(v.id, v.quantity),
    onSettled: invalidateCart,
  });
};

export const useRemoveCartItem = () => {
  const invalidateCart = useInvalidateCart();
  return useMutation({ mutationFn: life.removeCartItem, onSettled: invalidateCart });
};

/** Cart, monthly budget and weekly meal plan, loaded together for kitchen screens. */
export function useKitchenSample() {
  return useQueries({
    queries: [
      { queryKey: K.cart, queryFn: life.getCart },
      { queryKey: K.budget, queryFn: life.getBudget },
      { queryKey: K.mealPlan, queryFn: life.getMealPlan },
    ],
    combine: (results) => {
      const [cart, budget, days] = results;
      return {
        isPending: results.some((r) => r.isPending),
        isError: results.some((r) => r.isError),
        error: results.find((r) => r.error)?.error,
        data:
          cart?.data !== undefined && budget?.data !== undefined && days?.data !== undefined
            ? { cart: cart.data, budget: budget.data, days: days.data }
            : undefined,
        refetch: () => Promise.all(results.map((r) => r.refetch())),
      };
    },
  });
}

export type KitchenSample = NonNullable<ReturnType<typeof useKitchenSample>["data"]>;

export const useRecipeCatalog = (servings: number) =>
  useQuery({ queryKey: ["life", "recipes", servings], queryFn: () => life.getRecipeCatalog(servings), placeholderData: keepPreviousData });

export const useRecentReceipts = () => useQuery({ queryKey: ["life", "receipts"], queryFn: life.getRecentReceipts });

export function usePrepareRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; servings: number; allowPartial: boolean; idempotencyKey: string }) =>
      life.prepareRecipe(v.id, v),
    onSuccess: () => invalidateAllHouseholdQueries(qc),
  });
}

// ── Stores & phone ordering ─────────────────────────────────────────────────

const storesKey = ["kitchen", "stores"] as const;
const orderingKey = ["kitchen", "ordering"] as const;

export const useVendors = () => useQuery({ queryKey: storesKey, queryFn: life.getVendors });
export const useOrdering = () => useQuery({ queryKey: orderingKey, queryFn: life.getOrdering });

function useStoreMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storesKey });
      void qc.invalidateQueries({ queryKey: orderingKey });
    },
  });
}

export const useAddVendor = () => useStoreMutation(life.addVendor);
export const useUpdateVendor = () =>
  useStoreMutation((v: { id: string; patch: Parameters<typeof life.updateVendor>[1] }) => life.updateVendor(v.id, v.patch));
export const useRemoveVendor = () => useStoreMutation(life.removeVendor);
export const useSetOrderingPhone = () => useStoreMutation(life.setOrderingPhone);

export const usePlaceOrder = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: life.placeOrder, onSuccess: () => invalidateAllHouseholdQueries(qc) });
};

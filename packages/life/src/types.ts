export type ModuleId = "kitchen" | "admin" | "mobility" | "circular" | "personal";

// Structural inputs. The API adapts canonical store data to these; the web
// offline fallback adapts its seed data. Both are supersets of these shapes.

export interface LifeObligation {
  id: string;
  domain: "document" | "vehicle" | "subscription" | "bill" | "appointment";
  title: string;
  provider: string;
  detail: string;
  dueDate?: string | undefined;
  amount?: string | undefined;
  status: "ok" | "due_soon" | "overdue" | "action_proposed";
}

export interface LifeForecast {
  id: string;
  itemId: string;
  itemName: string;
  type: "SHORTAGE_RISK" | "EXPIRY_RISK" | "WASTE_RISK" | "RECURRING_DEMAND" | "COMPLIANCE_RISK";
  detail: string;
  horizonDays: number;
  severity: "high" | "medium" | "low";
  domain?: string | undefined;
}

export interface LifeInventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  daysRemaining?: number | null | undefined;
}

export interface LifeCartItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedPrice: number;
  source: "auto" | "manual" | "recipe";
  reason?: string;
  platform?: "zepto" | "blinkit" | "manual";
}

export interface LifeMeal {
  id: string;
  recipeId: string;
  recipeName: string;
  servings: number;
  date: string;
  slot: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  status: "planned" | "confirmed" | "completed";
  prepTime?: number;
  emoji?: string;
}

export interface LifeWeeklyMealPlan {
  day: string;
  date: string;
  meals: LifeMeal[];
  isToday?: boolean;
  cookingTimeAvailable?: number;
}

export interface LifeBudget {
  monthlyBudget: number;
  spent: number;
  remaining: number;
  projectedSpend: number;
  weeklyBreakdown: Array<{ week: string; spent: number; budget: number }>;
}

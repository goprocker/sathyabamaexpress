// Kitchen sample data served by /api/cart, /api/meal-plan and /api/budget until
// these are backed by the canonical store.
import type { LifeBudget, LifeCartItem, LifeWeeklyMealPlan } from "./types.js";

export const weeklyMealPlan: LifeWeeklyMealPlan[] = [
  {
    day: "Monday",
    date: "2026-09-29",
    isToday: true,
    cookingTimeAvailable: 45,
    meals: [
      { id: "wm_01", recipeId: "rcp_dosa", recipeName: "Masala Dosa", servings: 4, date: "2026-09-29", slot: "Breakfast", status: "completed", prepTime: 25, emoji: "🥞" },
      { id: "wm_02", recipeId: "rcp_dal_tadka", recipeName: "Dal Tadka", servings: 4, date: "2026-09-29", slot: "Lunch", status: "confirmed", prepTime: 35, emoji: "🥘" },
      { id: "wm_03", recipeId: "rcp_egg_curry", recipeName: "Egg Curry", servings: 4, date: "2026-09-29", slot: "Dinner", status: "planned", prepTime: 30, emoji: "🍳" },
    ],
  },
  {
    day: "Tuesday",
    date: "2026-09-30",
    cookingTimeAvailable: 30,
    meals: [
      { id: "wm_04", recipeId: "rcp_dosa", recipeName: "Masala Dosa", servings: 4, date: "2026-09-30", slot: "Breakfast", status: "planned", prepTime: 25, emoji: "🥞" },
      { id: "wm_05", recipeId: "rcp_dal_tadka", recipeName: "Dal Tadka", servings: 4, date: "2026-09-30", slot: "Lunch", status: "planned", prepTime: 35, emoji: "🥘" },
      { id: "meal_001", recipeId: "rcp_biryani", recipeName: "Chicken Biryani", servings: 6, date: "2026-09-30", slot: "Dinner", status: "planned", prepTime: 75, emoji: "🍛" },
    ],
  },
  {
    day: "Wednesday",
    date: "2026-10-01",
    cookingTimeAvailable: 60,
    meals: [
      { id: "wm_07", recipeId: "rcp_chapati", recipeName: "Chapati", servings: 4, date: "2026-10-01", slot: "Breakfast", status: "planned", prepTime: 30, emoji: "🫓" },
      { id: "wm_08", recipeId: "rcp_curry", recipeName: "Chicken Curry", servings: 4, date: "2026-10-01", slot: "Lunch", status: "planned", prepTime: 45, emoji: "🍲" },
      { id: "wm_09", recipeId: "rcp_egg_curry", recipeName: "Egg Curry", servings: 4, date: "2026-10-01", slot: "Dinner", status: "planned", prepTime: 30, emoji: "🍳" },
    ],
  },
  {
    day: "Thursday",
    date: "2026-10-02",
    cookingTimeAvailable: 20,
    meals: [
      { id: "wm_10", recipeId: "rcp_dosa", recipeName: "Masala Dosa", servings: 4, date: "2026-10-02", slot: "Breakfast", status: "planned", prepTime: 25, emoji: "🥞" },
    ],
  },
  {
    day: "Friday",
    date: "2026-10-03",
    cookingTimeAvailable: 45,
    meals: [
      { id: "wm_11", recipeId: "rcp_chapati", recipeName: "Chapati", servings: 4, date: "2026-10-03", slot: "Breakfast", status: "planned", prepTime: 30, emoji: "🫓" },
      { id: "wm_12", recipeId: "rcp_biryani", recipeName: "Chicken Biryani", servings: 4, date: "2026-10-03", slot: "Dinner", status: "planned", prepTime: 75, emoji: "🍛" },
    ],
  },
  {
    day: "Saturday",
    date: "2026-10-04",
    cookingTimeAvailable: 90,
    meals: [],
  },
  {
    day: "Sunday",
    date: "2026-10-05",
    cookingTimeAvailable: 120,
    meals: [],
  },
];


export const smartCart: LifeCartItem[] = [
  {
    id: "cart_001",
    itemId: "ing_chicken",
    name: "Chicken",
    quantity: 1.5,
    unit: "kg",
    estimatedPrice: 390,
    source: "auto",
    reason: "21-day replenishment · current stock 700g, need 2.2kg for next 21 days",
    platform: "zepto",
  },
  {
    id: "cart_002",
    itemId: "ing_milk",
    name: "Milk (1L pack)",
    quantity: 3,
    unit: "L",
    estimatedPrice: 180,
    source: "auto",
    reason: "Expires tomorrow · need 3.15L for 21 days",
    platform: "blinkit",
  },
  {
    id: "cart_003",
    itemId: "ing_egg",
    name: "Eggs (12 pack)",
    quantity: 2,
    unit: "dozen",
    estimatedPrice: 144,
    source: "auto",
    reason: "21-day cycle · current stock 6 pcs, need 21 pcs",
    platform: "zepto",
  },
  {
    id: "cart_004",
    itemId: "ing_curd",
    name: "Curd",
    quantity: 1,
    unit: "kg",
    estimatedPrice: 60,
    source: "recipe",
    reason: "Recipe: Dal Tadka needs curd as accompaniment",
    platform: "blinkit",
  },
];


export const budgetData: LifeBudget = {
  monthlyBudget: 8000,
  spent: 5240,
  remaining: 2760,
  projectedSpend: 7800,
  weeklyBreakdown: [
    { week: "Week 1", spent: 1850, budget: 2000 },
    { week: "Week 2", spent: 1640, budget: 2000 },
    { week: "Week 3", spent: 1750, budget: 2000 },
    { week: "Week 4", spent: 774, budget: 2000 },
  ],
};

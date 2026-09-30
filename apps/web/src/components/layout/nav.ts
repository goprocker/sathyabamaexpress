import {
  Activity,
  BellRing,
  BookOpen,
  CalendarDays,
  ChefHat,
  ClipboardList,
  CreditCard,
  FileCheck2,
  Home,
  Mic,
  Package,
  Receipt,
  Recycle,
  Rocket,
  Route,
  Settings,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  User,
  Users,
  UtensilsCrossed,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { ModuleId } from "@/lib/modules";

export interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Extra path prefixes that keep this item highlighted. */
  also?: string[];
}

export interface NavGroup {
  title: string;
  module?: ModuleId;
  items: NavItem[];
}

const kitchenPaths = [
  "/pantry",
  "/recipes",
  "/cart",
  "/meals",
  "/receipt",
  "/voice",
  "/ripple",
  "/forecasts",
  "/actions",
  "/inventory",
];

/** Top bar and mobile bar destinations. */
export const primaryNav: NavItem[] = [
  { to: "/", label: "Home", hint: "Your day at a glance", icon: Home, exact: true },
  { to: "/timeline", label: "Timeline", hint: "Everything in one calendar", icon: CalendarDays },
  { to: "/kitchen", label: "Kitchen", hint: "Pantry, meals, groceries", icon: ChefHat, also: kitchenPaths },
  { to: "/obligations", label: "Life Admin", hint: "Bills, documents, renewals", icon: FileCheck2 },
  { to: "/mobility", label: "Mobility", hint: "Commute and EV charging", icon: Route },
  { to: "/circular", label: "Circular", hint: "Wardrobe, sharing, reuse", icon: Recycle },
];

export const navGroups: NavGroup[] = [
  {
    title: "Intelligence",
    items: [
      { to: "/", label: "Home", hint: "Command centre", icon: Home, exact: true },
      { to: "/assistant", label: "Assistant", hint: "Ask in text or voice", icon: Sparkles },
      { to: "/timeline", label: "Timeline", hint: "Conflicts and priorities", icon: CalendarDays },
      { to: "/notifications", label: "Notifications", hint: "Grouped, not noisy", icon: BellRing },
    ],
  },
  {
    title: "SmartKitchen AI",
    module: "kitchen",
    items: [
      { to: "/kitchen", label: "Kitchen", hint: "Overview and status", icon: ChefHat },
      { to: "/inventory", label: "Inventory", hint: "Stock from your bills", icon: Package },
      { to: "/recipes", label: "Recipes", hint: "Cook from what you have", icon: UtensilsCrossed },
      { to: "/cart", label: "Smart Cart", hint: "What to buy next", icon: ShoppingCart },
      { to: "/meals", label: "Meal Plan", hint: "Week at a glance", icon: CalendarDays },
      { to: "/receipt", label: "Scan Receipt", hint: "Update stock from a bill", icon: Receipt },
      { to: "/voice", label: "Voice", hint: "Update by speaking", icon: Mic },
      { to: "/ripple", label: "Ripple", hint: "What a change affects", icon: Waypoints },
      { to: "/forecasts", label: "Forecasts", hint: "Shortages ahead", icon: TrendingUp },
      { to: "/actions", label: "Actions", hint: "Approve proposals", icon: ClipboardList },
    ],
  },
  {
    title: "Life Administration",
    module: "admin",
    items: [
      { to: "/obligations", label: "Obligations", hint: "Bills, documents, vehicle", icon: FileCheck2 },
      { to: "/activity", label: "Activity", hint: "Everything that happened", icon: Activity },
    ],
  },
  {
    title: "Mobility and Circular",
    items: [
      { to: "/mobility", label: "Smart Mobility", hint: "Routes, EV, trips", icon: Route },
      { to: "/circular", label: "Circular Living", hint: "Wardrobe and sharing", icon: Recycle },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/profile", label: "Profile", hint: "Preferences", icon: User },
      { to: "/members", label: "Household", hint: "Members and sharing", icon: Users },
      { to: "/plans", label: "Plans", hint: "Free and Premium", icon: CreditCard },
      { to: "/settings", label: "Settings", hint: "Notifications and data", icon: Settings },
      { to: "/onboarding", label: "Setup", hint: "Family, documents, vehicles, vendors", icon: Rocket },
      { to: "/landing", label: "The story", hint: "How it works", icon: BellRing },
      { to: "/docs", label: "Documentation", hint: "Project dossier", icon: BookOpen },
    ],
  },
];

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.to;
  const paths = [item.to, ...(item.also ?? [])];
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

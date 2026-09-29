import {
  CalendarDays,
  ChefHat,
  FileCheck2,
  Recycle,
  Route,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type { ModuleId } from "@household/life";
export type { ModuleId };

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  tagline: string;
  to: string;
  icon: LucideIcon;
  /** Soft tile (icon backgrounds, chips) */
  tint: string;
  /** Solid dot / bar colour */
  dot: string;
}

export const MODULES: Record<ModuleId, ModuleMeta> = {
  kitchen: {
    id: "kitchen",
    label: "SmartKitchen AI",
    tagline: "Pantry, meals and groceries",
    to: "/kitchen",
    icon: ChefHat,
    tint: "bg-accent-subtle text-accent",
    dot: "bg-accent",
  },
  admin: {
    id: "admin",
    label: "Life Administration",
    tagline: "Bills, documents, renewals",
    to: "/obligations",
    icon: FileCheck2,
    tint: "bg-tint-violet-subtle text-tint-violet",
    dot: "bg-tint-violet",
  },
  mobility: {
    id: "mobility",
    label: "Smart Mobility",
    tagline: "Commute, EV charging, trips",
    to: "/mobility",
    icon: Route,
    tint: "bg-tint-sky-subtle text-tint-sky",
    dot: "bg-tint-sky",
  },
  circular: {
    id: "circular",
    label: "Circular Living",
    tagline: "Wardrobe, sharing, reuse",
    to: "/circular",
    icon: Recycle,
    tint: "bg-tint-teal-subtle text-tint-teal",
    dot: "bg-tint-teal",
  },
  personal: {
    id: "personal",
    label: "Personal",
    tagline: "Events and travel",
    to: "/timeline",
    icon: CalendarDays,
    tint: "bg-tint-coral-subtle text-tint-coral",
    dot: "bg-tint-coral",
  },
};

export const ASSISTANT_TINT = "bg-gold-subtle text-warning";
export const ASSISTANT_ICON = Sparkles;

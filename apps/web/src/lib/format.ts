// Quantity formatting helpers — display only (never business logic).

export function formatQuantity(qty: number, unit: string): string {
  if (unit === "kg" || unit === "L") {
    const subUnit = unit === "L" ? "ml" : "g";
    return qty >= 1
      ? `${round1(qty)} ${unit}`
      : `${Math.round(qty * 1000)} ${subUnit}`;
  }
  return `${round1(qty)} ${unit}`;
}

function round1(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function relativeDay(iso: string): string {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const target = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDateShort(iso);
}

export function isExpiringSoon(iso: string | null | undefined, withinDays = 3): boolean {
  if (!iso) return false;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return false;
  const threshold = Date.now() + withinDays * 24 * 60 * 60 * 1000;
  return target.getTime() <= threshold;
}

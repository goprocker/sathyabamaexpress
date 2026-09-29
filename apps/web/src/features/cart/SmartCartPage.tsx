import { useState } from "react";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ExternalLink,
  Sparkles,
  Package,
  CheckCircle2,
} from "lucide-react";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useKitchenSample, type KitchenSample } from "@/hooks/life";
import type { CartItem } from "@/mocks/types";

function PlatformBadge({ platform }: { platform?: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    zepto: { bg: "#E8F5E9", text: "#2E7D32" },
    blinkit: { bg: "#FFF8E1", text: "#F57F17" },
    manual: { bg: "var(--color-surface-subtle)", text: "var(--color-text-secondary)" },
  };
  const c = colors[platform ?? "manual"] ?? { bg: "var(--color-surface-subtle)", text: "var(--color-text-secondary)" };
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-[0.04em]"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {platform ?? "manual"}
    </span>
  );
}

export function SmartCartPage() {
  const sample = useKitchenSample();
  return <QueryBoundary query={sample}>{(data) => <CartView sample={data} />}</QueryBoundary>;
}

function CartView({ sample }: { sample: KitchenSample }) {
  const { cart: smartCart, budget: budgetData } = sample;
  const [items, setItems] = useState<CartItem[]>([...smartCart]);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);

  const total = items.reduce((s, i) => s + i.estimatedPrice * i.quantity, 0);
  const remainingBudget = budgetData.remaining;
  const overBudget = total > remainingBudget;

  function updateQuantity(id: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0),
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleCheckout() {
    setCheckoutMode(true);
    setTimeout(() => {
      setCheckedOut(true);
    }, 2000);
  }

  if (checkedOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center fade-in-up">
        <div className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-[var(--color-success)]" />
        </div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)] mb-2">
          Order Placed!
        </h1>
        <p className="text-[15px] text-[var(--color-text-secondary)] max-w-[320px] mb-1">
          Your grocery order of ₹{total.toLocaleString()} has been prepared.
        </p>
        <p className="text-[13px] text-[var(--color-text-tertiary)] max-w-[320px] mb-6">
          Items will be delivered to your doorstep. Your pantry will update automatically once delivered.
        </p>
        <button
          onClick={() => { setCheckedOut(false); setCheckoutMode(false); setItems([...smartCart]); }}
          className="btn-secondary text-[13px]"
        >
          Back to Cart
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="fade-in-up stagger-1">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart size={18} className="text-[var(--color-accent)]" />
          <h1 className="page-title">Smart Cart</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-secondary)]">
          AI-prepared replenishment list based on your 21-day consumption forecast
        </p>
      </header>

      {/* AI Insight Banner */}
      <div className="card-base p-4 flex items-start gap-3 border-[var(--color-accent-subtle)] bg-[var(--color-accent-subtle)]/30 fade-in-up stagger-2">
        <Sparkles size={18} className="text-[var(--color-accent)] shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-medium text-[var(--color-accent)]">
            21-Day Smart Replenishment
          </p>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
            These items are predicted to run out within the next 21 days based on your household's consumption patterns, meal plans, and upcoming recipes.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center fade-in-up">
          <Package size={40} className="text-[var(--color-text-tertiary)] mb-3" strokeWidth={1.25} />
          <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">Your cart is empty</p>
          <p className="text-[13px] text-[var(--color-text-tertiary)] mt-1">
            AI will add items when stock runs low
          </p>
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div className="space-y-2 fade-in-up stagger-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="card-base p-4 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-[10px] bg-[var(--color-surface-subtle)] flex items-center justify-center text-[18px] shrink-0">
                  📦
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                      {item.name}
                    </p>
                    <PlatformBadge platform={item.platform} />
                  </div>
                  <p className="text-[12px] text-[var(--color-text-tertiary)] mt-0.5 line-clamp-1">
                    {item.reason}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-[var(--color-surface-subtle)] rounded-[8px] p-0.5">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-[var(--color-border)] transition-colors duration-[120ms]"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-[13px] font-medium w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-[var(--color-border)] transition-colors duration-[120ms]"
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <p className="text-[14px] font-semibold text-[var(--color-text-primary)] w-16 text-right">
                    ₹{(item.estimatedPrice * item.quantity).toLocaleString()}
                  </p>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-8 h-8 rounded-[6px] flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors duration-[120ms]"
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="card-base p-5 space-y-4 fade-in-up stagger-4">
            <div className="space-y-2">
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--color-text-secondary)]">Subtotal ({items.length} items)</span>
                <span className="font-medium">₹{total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--color-text-secondary)]">Delivery</span>
                <span className="font-medium text-[var(--color-success)]">Free</span>
              </div>
              <div className="border-t border-[var(--color-border)] pt-2 flex justify-between">
                <span className="text-[15px] font-semibold">Total</span>
                <span className="text-[18px] font-semibold">₹{total.toLocaleString()}</span>
              </div>
            </div>

            {/* Budget check */}
            {overBudget && (
              <div className="rounded-[8px] bg-[var(--color-warning-bg)] px-3 py-2.5 flex items-start gap-2">
                <Sparkles size={14} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
                <p className="text-[12px] text-[var(--color-warning)]">
                  This exceeds your remaining monthly budget by ₹{(total - remainingBudget).toLocaleString()}.
                  Consider removing non-essential items.
                </p>
              </div>
            )}

            {/* Platform buttons */}
            <div className="space-y-2">
              <button
                onClick={handleCheckout}
                disabled={checkoutMode}
                className="btn-primary w-full justify-center text-[14px] py-3 relative overflow-hidden"
              >
                {checkoutMode ? (
                  <>
                    <div className="absolute inset-0 bg-[var(--color-accent-hover)]">
                      <div className="h-full bg-[var(--color-accent)] animate-[progress-bar_2s_ease-in-out]" />
                    </div>
                    <span className="relative z-10">Processing order...</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart size={16} />
                    Place Order · ₹{total.toLocaleString()}
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary justify-center text-[12px] gap-1.5 py-2.5 min-h-0">
                  <ExternalLink size={13} />
                  Open in Zepto
                </button>
                <button className="btn-secondary justify-center text-[12px] gap-1.5 py-2.5 min-h-0">
                  <ExternalLink size={13} />
                  Open in Blinkit
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

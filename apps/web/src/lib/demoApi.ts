// The demo account: sign in with one tap, and put the demo household back to how it started.
import { API_BASE } from "./api";
import { authHeaders } from "./auth";

/** Asks the server for a one-time Clerk sign-in ticket for the demo account. */
export async function requestDemoTicket(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/demo/login`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { ticket?: string; error?: string };
  if (!res.ok || !body.ticket) throw new Error(body.error ?? "The demo is unavailable right now. Please try again in a moment.");
  return body.ticket;
}

/** Restores the demo household to its starting data. */
export async function resetDemoHousehold(): Promise<void> {
  const res = await fetch(`${API_BASE}/demo/reset`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(await authHeaders()) },
    body: "{}",
  });
  if (!res.ok) throw new Error("Couldn't reset the demo. Try again.");
}

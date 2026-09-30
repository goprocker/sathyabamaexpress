// Installed-app helpers: the "Install app" prompt, phone notifications (Web
// Push via the service worker) and the app-icon badge.
import { useEffect, useState } from "react";
import { API_BASE } from "./api";
import { authHeaders } from "./auth";

// ── Install ────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Call once at startup: Chrome fires this early, before any screen mounts. */
export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    installed: isStandalone(),
    /** Chrome/Edge/Android: a real install button is possible. */
    canPrompt: deferredPrompt !== null,
    /** iPhone/iPad: install is manual (Share → Add to Home Screen). */
    iosManual: isIos() && !isStandalone(),
    install: async () => {
      if (!deferredPrompt) return false;
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notify();
      return outcome === "accepted";
    },
  };
}

// ── Phone notifications (Web Push) ─────────────────────────────────────────

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "The server didn't accept that.");
  return data;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  // iOS only allows web push for apps added to the Home Screen.
  if (isIos() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return (await currentSubscription()) ? "on" : "off";
}

/** Asks permission, subscribes this device and registers it with the API. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const res = await fetch(`${API_BASE}/push/public-key`, { headers: await authHeaders() });
  const { publicKey } = (await res.json().catch(() => ({}))) as { publicKey?: string | null };
  if (!publicKey) throw new Error("Phone notifications aren't set up on the server yet.");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await postJson("/push/subscribe", sub.toJSON());
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await postJson("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return "off";
}

export const sendTestPush = () => postJson("/push/test", {});

// ── App-icon badge ─────────────────────────────────────────────────────────

/** Shows the unread count on the installed app's icon, where supported. */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
    else void nav.clearAppBadge?.().catch(() => undefined);
  } catch {
    /* unsupported */
  }
}

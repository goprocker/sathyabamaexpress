// Web Push handling, imported into the generated service worker (vite.config.ts
// workbox.importScripts). Shows household notifications sent by the API and
// opens the right screen when one is tapped.
/* eslint-disable no-restricted-globals */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "LIVORA", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "LIVORA";
  const options = {
    body: data.body || "",
    icon: "/brand/icon-maskable-192.png",
    badge: "/brand/badge-96.png",
    // Same tag replaces the earlier notification (e.g. repeated "milk is low").
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/notifications" },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Let open tabs refresh their notification list.
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
        clients.forEach((c) => c.postMessage({ type: "PUSH_RECEIVED" })),
      ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

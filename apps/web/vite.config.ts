import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  // One .env at the repo root serves both apps. Only VITE_* values reach the browser.
  envDir: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.png", "brand/apple-touch-icon-180.png", "brand/badge-96.png"],
      manifest: {
        id: "/",
        name: "LIVORA AI",
        short_name: "LIVORA",
        description:
          "A personal life intelligence app for household, obligations, mobility and reuse.",
        lang: "en-IN",
        dir: "ltr",
        scope: "/",
        start_url: "/?source=pwa",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        theme_color: "#F3F2E8",
        background_color: "#F3F2E8",
        categories: ["lifestyle", "productivity", "shopping"],
        icons: [
          { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/brand/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Long-press the app icon for these.
        shortcuts: [
          { name: "Notifications", url: "/notifications", icons: [{ src: "/brand/icon-maskable-192.png", sizes: "192x192" }] },
          { name: "Inventory", url: "/inventory", icons: [{ src: "/brand/icon-maskable-192.png", sizes: "192x192" }] },
          { name: "Scan a receipt", url: "/receipt", icons: [{ src: "/brand/icon-maskable-192.png", sizes: "192x192" }] },
          { name: "Order from a store", url: "/stores", icons: [{ src: "/brand/icon-maskable-192.png", sizes: "192x192" }] },
        ],
      },
      workbox: {
        // Push notifications (public/push-sw.js) run inside the generated worker.
        importScripts: ["/push-sw.js"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Deep links open the app shell offline; API calls always go to the network.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/push-sw\.js$/],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  // Dev and preview forward /api to the Fastify API (apps/api, default :4000).
  // pm2 (ecosystem.config.cjs) sets API_ORIGIN and WEB_PORT for the self-hosted deploy.
  server: {
    proxy: {
      "/api": { target: process.env.API_ORIGIN ?? process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:4000", changeOrigin: true, ws: true },
    },
  },
  preview: {
    ...(process.env.WEB_PORT ? { port: Number(process.env.WEB_PORT), host: "127.0.0.1" } : {}),
    allowedHosts: [".reeganlabs.com"],
    proxy: {
      "/api": { target: process.env.API_ORIGIN ?? process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:4000", changeOrigin: true, ws: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});

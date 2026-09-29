import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "LIVORA AI",
        short_name: "LIVORA",
        description:
          "A personal life intelligence app for household, obligations, mobility and reuse.",
        theme_color: "#F3F2E8",
        background_color: "#F3F2E8",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
    }),
  ],
  // Dev and preview forward /api to the Fastify API (apps/api, default :4000).
  server: {
    proxy: {
      "/api": { target: process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      "/api": { target: process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});

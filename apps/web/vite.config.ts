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
        name: "Household Intelligence",
        short_name: "Household",
        description:
          "A calm household workspace that tracks inventory, meals and obligations.",
        theme_color: "#FAFAF8",
        background_color: "#FAFAF8",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});

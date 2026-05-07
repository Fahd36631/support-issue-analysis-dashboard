import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/support-issue-analysis-dashboard/",
  server: {
    port: 5173
  }
});


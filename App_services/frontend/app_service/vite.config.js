import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const server = {
    port: Number(env.VITE_DASHBOARD_PORT || 5175),
    strictPort: true,
    host: env.VITE_HOST || "localhost", // local access only by default; Docker passes --host 0.0.0.0
  };
  return { plugins: [react()], server, preview: server };
});
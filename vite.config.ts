import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const supabaseUrl = loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL;
  // Mirrors worker/index.ts so Partner API URLs work against `npm run dev`.
  const partnerProxy = supabaseUrl
    ? {
        "/api/partner/v1": {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api\/partner/, "/functions/v1/partner-api"),
        },
        "^/handoff(\\?.*)?$": {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/handoff/, "/functions/v1/partner-handoff"),
        },
      }
    : undefined;

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: partnerProxy,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function normalizeProxyTarget(value: string) {
  return value.replace(/\/api\/v1\/?$/i, "").replace(/\/$/, "");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = normalizeProxyTarget(env.VITE_API_PROXY_TARGET ?? "https://www.intellilaw.ai");

  return {
    plugins: [react()],
    resolve: {
      extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"]
    },
    server: {
      proxy: {
        "/api/v1": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("origin");
              proxyReq.removeHeader("referer");
            });

            proxy.on("proxyRes", (proxyRes) => {
              const setCookie = proxyRes.headers["set-cookie"];
              if (!setCookie) {
                return;
              }

              proxyRes.headers["set-cookie"] = setCookie.map((cookie) =>
                cookie
                  .replace(/;\s*Domain=[^;]+/gi, "")
                  .replace(/;\s*Secure/gi, "")
                  .replace(/;\s*SameSite=None/gi, "; SameSite=Lax")
              );
            });
          }
        }
      }
    },
    optimizeDeps: {
      include: ["docx", "jspdf"]
    }
  };
});

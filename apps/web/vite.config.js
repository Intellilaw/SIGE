import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    resolve: {
        extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"]
    },
    server: {
        proxy: {
            "/api/v1": {
                target: "https://api.pruebasb.online",
                changeOrigin: true,
                secure: true,
                headers: {
                    origin: "http://127.0.0.1:5173",
                    referer: "http://127.0.0.1:5173/"
                },
                configure(proxy) {
                    proxy.on("proxyReq", (proxyReq) => {
                        proxyReq.setHeader("origin", "http://127.0.0.1:5173");
                        proxyReq.setHeader("referer", "http://127.0.0.1:5173/");
                    });
                    proxy.on("proxyRes", (proxyRes) => {
                        const setCookie = proxyRes.headers["set-cookie"];
                        if (!setCookie) {
                            return;
                        }
                        proxyRes.headers["set-cookie"] = setCookie.map((cookie) => cookie
                            .replace(/;\s*Domain=[^;]+/gi, "")
                            .replace(/;\s*Secure/gi, "")
                            .replace(/;\s*SameSite=None/gi, "; SameSite=Lax"));
                    });
                }
            }
        }
    },
    optimizeDeps: {
        include: ["docx", "jspdf"]
    }
});

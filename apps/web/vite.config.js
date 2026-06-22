import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function normalizeProxyTarget(value) {
    return value.replace(/\/api\/v1\/?$/i, "").replace(/\/$/, "");
}
function cleanOutDirPreservingStaticDocs(outDir) {
    if (!fs.existsSync(outDir)) {
        return;
    }
    const preservedNames = new Set(["docs", "internal-contract-templates"]);
    for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
        if (preservedNames.has(entry.name)) {
            continue;
        }
        fs.rmSync(path.join(outDir, entry.name), { force: true, recursive: true });
    }
}
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const apiProxyTarget = normalizeProxyTarget(env.VITE_API_PROXY_TARGET ?? "http://localhost:4000");
    const cacheDir = env.VITE_CACHE_DIR ?? path.join(os.tmpdir(), "sige-2-vite-web-cache");
    const outDir = path.resolve(process.cwd(), "dist");
    return {
        cacheDir,
        plugins: [
            {
                name: "sige-clean-out-dir",
                apply: "build",
                buildStart() {
                    cleanOutDirPreservingStaticDocs(outDir);
                }
            },
            react()
        ],
        build: {
            emptyOutDir: false,
            outDir
        },
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
    };
});

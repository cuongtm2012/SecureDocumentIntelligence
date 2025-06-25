import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      // Remove PDF worker bundling since we're using CDN
      external: [],
    }
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // Remove cache control headers as they're not needed for CDN worker
  },
  optimizeDeps: {
    // Include react-pdf-viewer packages in dependency optimization
    include: ['pdfjs-dist', '@react-pdf-viewer/core', '@react-pdf-viewer/default-layout'],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  // Remove worker file handling since we're using CDN
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  }
});

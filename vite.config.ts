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
      // Ensure PDF.js worker is properly bundled
      external: [],
      output: {
        // Keep worker files separate for proper loading
        manualChunks: (id) => {
          if (id.includes('pdf.worker')) {
            return 'pdf-worker';
          }
        }
      }
    }
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  optimizeDeps: {
    // Include pdfjs-dist in dependency optimization
    include: ['pdfjs-dist'],
    esbuildOptions: {
      // Handle PDF.js worker properly
      target: 'es2020'
    }
  },
  // Add support for importing worker files
  assetsInclude: ['**/*.worker.js', '**/*.worker.min.js']
});

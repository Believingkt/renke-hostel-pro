import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react({
      jsxImportSource: 'react',
    }), 
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // Router
          if (id.includes('react-router')) {
            return 'router';
          }
          // Supabase SDK
          if (id.includes('@supabase/')) {
            return 'supabase';
          }
          // UI library (radix + shadcn deps)
          if (id.includes('@radix-ui/') || id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) {
            return 'ui-vendor';
          }
          // Charting
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'charts';
          }
          // TanStack Query
          if (id.includes('@tanstack/')) {
            return 'tanstack';
          }
          // Date utilities
          if (id.includes('date-fns')) {
            return 'date-utils';
          }
          // Rich text / DnD
          if (id.includes('tiptap') || id.includes('prosemirror') || id.includes('@dnd-kit/')) {
            return 'editor';
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
    esbuildOptions: {
      jsx: 'automatic',
    },
  },
}));

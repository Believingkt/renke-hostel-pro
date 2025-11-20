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
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React 核心庫
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-core';
          }
          // React Router
          if (id.includes('node_modules/react-router-dom')) {
            return 'react-router';
          }
          // Radix UI 組件
          if (id.includes('node_modules/@radix-ui')) {
            return 'radix-ui';
          }
          // Supabase
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
          // TanStack Query
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'tanstack-query';
          }
          // Chart 相關庫
          if (id.includes('node_modules/recharts') || id.includes('node_modules/@tremor')) {
            return 'charts';
          }
          // Lucide 圖標
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          // 日期處理庫
          if (id.includes('node_modules/date-fns') || id.includes('node_modules/react-day-picker')) {
            return 'date-utils';
          }
          // 其他大型依賴
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
  },
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'react-router-dom', 
      '@supabase/supabase-js',
      '@tanstack/react-query',
      'lucide-react',
      'date-fns',
    ],
  },
}));

// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/lint",
      "@codemirror/lang-json"
    ],
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/lint",
      "@codemirror/lang-json"
    ],
  },
  // Optional: If you use React or other frameworks, add more dedupe entries as needed.
});

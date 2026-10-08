import { defineConfig } from "vite";
import { asyncContext } from "async-browser-context/vite";

// The README setup: one plugin. It transforms the app and its dependencies.
export default defineConfig({ plugins : [asyncContext()] });

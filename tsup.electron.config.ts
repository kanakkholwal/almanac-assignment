import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["electron/main.ts", "electron/preload.ts"],
  outDir: "dist-electron",
  format: ["cjs"],
  target: "node20",
  platform: "node",
  external: ["electron", "electron-updater"],
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  shims: false,
});

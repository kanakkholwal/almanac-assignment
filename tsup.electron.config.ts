import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["electron/main.ts", "electron/preload.ts"],
  outDir: "dist-electron",
  format: ["cjs"],
  target: "node20",
  platform: "node",
  external: ["electron", "electron-updater"],
  // The preload runs in a sandboxed renderer where `require()` is restricted to
  // electron + a small whitelist. Any npm dep it uses must be bundled inline,
  // otherwise the preload throws on load and `window.almanac` is never exposed.
  noExternal: ["zod"],
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  shims: false,
});

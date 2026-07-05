import esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

/** Extension host bundle (Node.js context). */
const hostConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

/** Webview bundle (browser context, Preact). */
const webviewConfig = {
  entryPoints: ["webview-ui/src/main.tsx"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  jsxImportSource: "preact",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  loader: { ".css": "css" },
};

if (watch) {
  const contexts = await Promise.all([
    esbuild.context(hostConfig),
    esbuild.context(webviewConfig),
  ]);
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("[esbuild] watching…");
} else {
  await Promise.all([esbuild.build(hostConfig), esbuild.build(webviewConfig)]);
}

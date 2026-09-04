import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

esbuild
  .build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
      "obsidian",
      "electron",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      ...builtins,
    ],
    format: "cjs",
    target: "es2020",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outdir: "dist",
    outbase: "src",
    minify: prod,
  })
  .then(() => {
    // 复制 manifest.json 和 styles.css 到 dist
    fs.copyFileSync("manifest.json", path.join("dist", "manifest.json"));
    if (fs.existsSync(path.join("src", "styles.css"))) {
      fs.copyFileSync(path.join("src", "styles.css"), path.join("dist", "styles.css"));
    }
    console.log("Copied manifest.json and styles.css to dist/");
  })
  .catch(() => process.exit(1));

// The builds of the build tool test (test/bundlers/run.ts). Each case is the
// setup of the guide "Build tools". Start it with `node build.mjs <case>`.
// The bundle goes into `out/<case>/`, with `index.html`.
import fs from "node:fs";
import path from "node:path";

const PRESET = "async-browser-context/babel-preset";
const name = process.argv[2];
const out = path.resolve("out", name);

/** Starts a webpack or Rspack compiler, and fails on an error of the build. */
function compile(compiler) {
    return new Promise((resolve, reject) => {
        compiler.run((error, stats) => {
            if (error || stats.hasErrors()) {
                reject(error ?? new Error(stats.toString("errors-only")));
                return;
            }
            compiler.close(() => resolve());
        });
    });
}

/** The esbuild plugin of the guide: it applies the Babel preset to each module with async code. */
async function babelPlugin() {
    const babel = await import("@babel/core");
    return {
        name : "async-browser-context",
        setup(build) {
            build.onLoad({ filter : /\.[cm]?[jt]sx?$/ }, async (args) => {
                const source = await fs.promises.readFile(args.path, "utf8");
                if (!/\basync\b|\byield\b|function\s*\*/.test(source)) {
                    return undefined;
                }
                const typescript = /\.[cm]?tsx?$/.test(args.path);
                const result = await babel.transformAsync(source, {
                    filename : args.path,
                    babelrc : false,
                    configFile : false,
                    sourceType : "unambiguous",
                    parserOpts : { plugins : typescript ? ["typescript", "jsx"] : ["jsx"] },
                    presets : [PRESET],
                });
                const loader = path.extname(args.path).slice(1).replace(/^[cm]/, "");
                return { contents : result.code, loader };
            });
        },
    };
}

const BUILDS = {
    async webpack() {
        const { default : webpack } = await import("webpack");
        await compile(webpack({
            mode : "production",
            entry : "./main.js",
            output : { path : out, filename : "main.js" },
            module : {
                rules : [
                    // No `exclude`: the preset also transforms the dependencies in node_modules
                    { test : /\.[cm]?[jt]sx?$/, use : { loader : "babel-loader", options : { presets : [PRESET] } } },
                ],
            },
        }));
    },
    async rspack() {
        const { rspack } = await import("@rspack/core");
        await compile(rspack({
            mode : "production",
            entry : "./main.js",
            output : { path : out, filename : "main.js" },
            module : {
                rules : [
                    { test : /\.[cm]?[jt]sx?$/, use : { loader : "babel-loader", options : { presets : [PRESET] } } },
                ],
            },
        }));
    },
    async "rspack-swc-es2016"() {
        const { rspack } = await import("@rspack/core");
        await compile(rspack({
            mode : "production",
            entry : "./main.js",
            output : { path : out, filename : "main.js" },
            module : {
                rules : [
                    // SWC changes each async function into a generator with `then` callbacks
                    { test : /\.[cm]?js$/, loader : "builtin:swc-loader", options : { jsc : { target : "es2016" } }, type : "javascript/auto" },
                ],
            },
        }));
    },
    async rollup() {
        const { rollup } = await import("rollup");
        const { nodeResolve } = await import("@rollup/plugin-node-resolve");
        const { babel } = await import("@rollup/plugin-babel");
        const bundle = await rollup({
            input : "main.js",
            plugins : [
                nodeResolve({ browser : true }),
                babel({ babelHelpers : "bundled", babelrc : false, configFile : false, presets : [PRESET] }),
            ],
        });
        await bundle.write({ dir : out, format : "es" });
        await bundle.close();
    },
    async "esbuild-babel"() {
        const esbuild = await import("esbuild");
        await esbuild.build({ entryPoints : ["main.js"], bundle : true, format : "esm", outdir : out, plugins : [await babelPlugin()] });
    },
    async "esbuild-es2016"() {
        const esbuild = await import("esbuild");
        // esbuild changes each async function into a generator with `then` callbacks
        await esbuild.build({ entryPoints : ["main.js"], bundle : true, format : "esm", outdir : out, target : "es2016" });
    },
};

if (!(name in BUILDS)) {
    throw new Error(`Unknown build ${name}. The builds: ${Object.keys(BUILDS).join(", ")}`);
}
fs.rmSync(out, { recursive : true, force : true });
await BUILDS[name]();
fs.copyFileSync("index.html", path.join(out, "index.html"));

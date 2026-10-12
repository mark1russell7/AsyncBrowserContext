/**
 * The size measurement (pnpm bench:size). It tells how much code the library
 * adds to a browser application:
 *
 * 1. The runtime: the classes, the patches and the runtime of the transform,
 *    in one minified bundle. The bundle exports all names of the entries
 *    `async-browser-context` and `async-browser-context/runtime`, also
 *    `asyncGenerator` and `OverloadYield`, which the transform imports.
 *    zone.js is in the table for comparison.
 * 2. The transform: for each package of a set of real npm packages, the
 *    script builds four bundles with Vite:
 *    - without a transform;
 *    - with the Vite plugin of the library;
 *    - with the Vite plugin and the option `names: false`;
 *    - with the target ES2016, without the plugin. Vite then changes all
 *      syntax after ES2016, not only the async functions. Examples are async
 *      generators, object spread, optional chaining, `??` and class fields.
 *      Thus this column also has the cost of these other changes. It is for
 *      comparison: SWC and esbuild do the same with this target.
 *    The bundles do not contain the runtime, because item 1 has it.
 *
 * Vite builds each bundle as an application, not as a library. Thus the
 * minifier also removes the white space, as in the build of an application.
 * A dynamic `import()` gets the preload helper of Vite, in all four bundles.
 *
 * The script installs the packages with npm in `node_modules/.cache/abc-size`
 * and uses that folder again when it has the correct versions. Each bundle
 * imports all exports of the package, so that the minifier removes no code.
 * The script writes `bench/results/size.json` and shows a table.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { transformAsync, types, type NodePath, type PluginObject } from "@babel/core";
import { build, version as viteVersion, type Plugin } from "vite";
import { asyncContext } from "../src/vite/plugin.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cache = path.join(root, "node_modules", ".cache", "abc-size");

/** A package of the set, and the modules that the bundle imports from it. */
interface Subject {
    readonly name : string;
    readonly version : string;
    readonly entries : readonly string[];
    /** What the package does, for the table. */
    readonly kind : string;
}

/** Packages with much async code, and React DOM as an example of user-interface code. */
const SUBJECTS : readonly Subject[] = [
    { name : "react-dom", version : "19.3.0", entries : ["react-dom/client"], kind : "User interface" },
    { name : "@tanstack/query-core", version : "5.104.2", entries : ["@tanstack/query-core"], kind : "Data fetching and cache" },
    { name : "ky", version : "2.2.0", entries : ["ky"], kind : "HTTP client" },
    { name : "idb", version : "8.0.4", entries : ["idb"], kind : "IndexedDB with promises" },
    { name : "@supabase/supabase-js", version : "2.117.3", entries : ["@supabase/supabase-js"], kind : "Backend client" },
    { name : "openai", version : "7.32.0", entries : ["openai"], kind : "API client with streams" },
    { name : "@aws-sdk/client-s3", version : "3.1149.0", entries : ["@aws-sdk/client-s3"], kind : "API client, large" },
];

/** An example application: a user interface, a data cache, a backend client and an HTTP client in one bundle. */
const APPLICATION : Subject = {
    name : "Example application",
    version : "",
    entries : ["react-dom/client", "@tanstack/query-core", "@supabase/supabase-js", "ky"],
    kind : "React DOM, TanStack Query, supabase-js and ky",
};

/** The other library in the table of the runtime. */
const ZONE = { name : "zone.js", version : "0.16.3" } as const;

interface Size {
    readonly minifiedBytes : number;
    readonly gzipBytes : number;
    readonly brotliBytes : number;
}

function sizeOf(code : string) : Size {
    return {
        minifiedBytes : Buffer.byteLength(code),
        gzipBytes : gzipSync(code, { level : 9 }).length,
        brotliBytes : brotliCompressSync(code).length,
    };
}

/** The packages of the set that the cache folder does not have in the correct version, as `name@version`. */
function missingPackages(dependencies : Readonly<Record<string, string>>) : string[] {
    return Object.entries(dependencies).filter(([name, version]) => {
        const file = path.join(cache, "node_modules", ...name.split("/"), "package.json");
        return !fs.existsSync(file) || (JSON.parse(fs.readFileSync(file, "utf8")) as { version? : string }).version !== version;
    }).map(([name, version]) => `${name}@${version}`);
}

/**
 * Installs the packages in the cache folder, if the folder does not have
 * these versions. The script examines the installed versions, not only the
 * manifest, so an install that fails does not leave packages of other
 * versions under the new labels.
 */
function install() : void {
    const dependencies = Object.fromEntries([...SUBJECTS, ZONE].map((subject) => [subject.name, subject.version]));
    if (missingPackages(dependencies).length === 0) {
        return;
    }
    fs.mkdirSync(cache, { recursive : true });
    fs.writeFileSync(path.join(cache, "package.json"), JSON.stringify({ name : "abc-size", private : true, type : "module", dependencies }, null, 2));
    console.log("installing the packages of the measurement with npm");
    execSync("npm install --no-audit --no-fund --silent --ignore-scripts", { cwd : cache, stdio : ["ignore", "inherit", "inherit"] });
    const missing = missingPackages(dependencies);
    if (missing.length > 0) {
        throw new Error(`npm did not install these packages: ${missing.join(", ")}`);
    }
}

const SCRIPT = /\.[cm]?[jt]sx?$/;

/** Counts the async functions and the generator functions of each module that the build reads. */
function counter() : { plugin : Plugin; counts : { asyncFunctions : number; generators : number } } {
    const counts = { asyncFunctions : 0, generators : 0 };
    const count : PluginObject = {
        visitor : {
            Function(functionPath : NodePath<types.Function>) {
                if (functionPath.node.async) counts.asyncFunctions++;
                if (functionPath.node.generator) counts.generators++;
            },
        },
    };
    const plugin : Plugin = {
        name : "count-functions",
        enforce : "post",
        transform : {
            filter : { code : /\basync\b|\byield\b|function\s*\*/ },
            async handler(code, id) {
                if (!id.startsWith("\0") && SCRIPT.test(id.split("?", 1)[0] ?? id)) {
                    await transformAsync(code, { filename : id, babelrc : false, configFile : false, sourceType : "unambiguous", code : false, plugins : [() => count] });
                }
                return null;
            },
        },
    };
    return { plugin, counts };
}

/** The source of an entry module that keeps all exports of each module. */
function keepAll(entries : readonly string[]) : string {
    const imports = entries.map((entry, index) => `import * as module${index} from ${JSON.stringify(entry)};`);
    return `${imports.join("\n")}\nglobalThis.keep = [${entries.map((_, index) => `module${index}`).join(", ")}];\n`;
}

/**
 * Builds one minified bundle of `source`, and gives its code. The build is an
 * application build: a library build in the format `es` keeps the white
 * space, also with `minify: true`. The option `preserveEntrySignatures`
 * keeps the exports of the entry.
 */
async function bundle(source : string, plugins : Plugin[], target = "esnext") : Promise<string> {
    const directory = fs.mkdtempSync(path.join(cache, "build-"));
    try {
        const file = path.join(directory, "entry.js");
        fs.writeFileSync(file, source);
        const result = await build({
            configFile : false,
            logLevel : "silent",
            root : cache,
            plugins,
            define : { "process.env.NODE_ENV" : JSON.stringify("production") },
            build : {
                write : false,
                minify : true,
                target,
                rolldownOptions : {
                    input : file,
                    preserveEntrySignatures : "strict",
                    // The runtime of the transform is in the table of the runtime, not here
                    external : [/^async-browser-context(\/|$)/],
                },
            },
        });
        const outputs = (Array.isArray(result) ? result : [result]) as { output : { type : string; code? : string }[] }[];
        return outputs.flatMap((item) => item.output).filter((chunk) => chunk.type === "chunk").map((chunk) => chunk.code ?? "").join("\n");
    } finally {
        fs.rmSync(directory, { recursive : true, force : true });
    }
}

function increase(before : Size, after : Size) : number {
    return Math.round(((after.gzipBytes - before.gzipBytes) / before.gzipBytes) * 1000) / 10;
}

async function measure(subject : Subject) {
    const source = keepAll(subject.entries);
    const { plugin, counts } = counter();
    const native = sizeOf(await bundle(source, [plugin]));
    const transformed = sizeOf(await bundle(source, [asyncContext()]));
    const transformedWithoutNames = sizeOf(await bundle(source, [asyncContext({ names : false })]));
    const loweredEs2016 = sizeOf(await bundle(source, [], "es2016"));
    return {
        ...subject,
        ...counts,
        native,
        transformed,
        transformedWithoutNames,
        loweredEs2016,
        gzipIncreasePercent : {
            transformed : increase(native, transformed),
            transformedWithoutNames : increase(native, transformedWithoutNames),
            loweredEs2016 : increase(native, loweredEs2016),
        },
    };
}

const kilobytes = (bytes : number) : string => `${(bytes / 1000).toFixed(1)} kB`;

install();
execSync("npx tsc -p tsconfig.build.json", { cwd : root, stdio : "ignore" });
const dist = (file : string) : string => JSON.stringify(path.join(root, "dist", file).replace(/\\/g, "/"));

// All names of the two entries. A list of some names lets the bundler remove the others, for example asyncGenerator and OverloadYield.
const runtime = sizeOf(await bundle([
    `export * from ${dist("index.js")};`,
    `export * from ${dist("runtime.js")};`,
].join("\n"), []));
const zone = sizeOf(await bundle(`import "zone.js";`, []));

const rows = [];
for (const subject of [...SUBJECTS, APPLICATION]) {
    rows.push(await measure(subject));
}

const results = {
    date : new Date().toISOString(),
    vite : viteVersion,
    runtime : { entries : ["async-browser-context", "async-browser-context/runtime"], ...runtime },
    zone : { version : ZONE.version, ...zone },
    transform : rows,
};
fs.mkdirSync(path.join(here, "results"), { recursive : true });
fs.writeFileSync(path.join(here, "results", "size.json"), `${JSON.stringify(results, null, 2)}\n`);

console.log(`\nThe runtime (Vite ${viteVersion}, minified)`);
console.table({
    "async-browser-context" : { minified : kilobytes(runtime.minifiedBytes), gzip : kilobytes(runtime.gzipBytes), brotli : kilobytes(runtime.brotliBytes) },
    [`zone.js ${ZONE.version}`] : { minified : kilobytes(zone.minifiedBytes), gzip : kilobytes(zone.gzipBytes), brotli : kilobytes(zone.brotliBytes) },
});
console.log("\nThe transform (gzip of the minified bundle, without the runtime)");
console.table(Object.fromEntries(rows.map((row) => [row.version === "" ? row.name : `${row.name} ${row.version}`, {
    "async functions" : row.asyncFunctions,
    generators : row.generators,
    native : kilobytes(row.native.gzipBytes),
    "plugin" : `${kilobytes(row.transformed.gzipBytes)} (+${row.gzipIncreasePercent.transformed}%)`,
    "names: false" : `+${row.gzipIncreasePercent.transformedWithoutNames}%`,
    "ES2016 target" : `+${row.gzipIncreasePercent.loweredEs2016}%`,
}])));
console.log("wrote bench/results/size.json");

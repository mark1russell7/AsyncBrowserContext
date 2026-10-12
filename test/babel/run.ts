/**
 * The Babel test (pnpm test:babel). The preset accepts Babel 7.22 or later
 * and Babel 8. The test examines each version as a user has it:
 *
 * 1. It packs the package.
 * 2. For each version, it installs the tarball and `@babel/core` with npm in a
 *    new folder.
 * 3. It transforms `program.js` with the preset, by the package name, with
 *    the async API of Babel (as `babel-loader` does).
 * 4. It starts the output on the browser runtime in Node.js. Each request
 *    must get its own context after each `await`, in a generator, in an async
 *    generator and in a `super` call.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

/** The lowest version of the range of the preset, the newest Babel 7, and the newest Babel 8. */
const VERSIONS = ["7.22.0", "7", "8"] as const;

const expected = (id : string) => ({ fromAwait : [id, id, id], fromGenerator : id, fromAsyncGenerator : id, fromSuper : `child:${id}` });
const EXPECTED = JSON.stringify([expected("a"), expected("b")]);

/** The script that transforms and starts the program, in the folder of one version. */
const CHECK = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as babel from "@babel/core";

const source = fs.readFileSync("program.js", "utf8");
const result = await babel.transformAsync(source, {
    filename : path.resolve("program.js"),
    babelrc : false,
    configFile : false,
    sourceType : "module",
    presets : [["async-browser-context/babel-preset", { runtime : "async-browser-context/browser/runtime" }]],
});
fs.writeFileSync("output.mjs", result.code);
const { main } = await import(pathToFileURL(path.resolve("output.mjs")).href);
process.stdout.write(JSON.stringify({ babel : babel.version, results : await main() }));
`;

/** Runs a command in a shell (npm is a .cmd file on Windows). Each argument is in quotes. */
function run(command : string, args : string[], cwd : string) : string {
    const line = [command, ...args.map((argument) => JSON.stringify(argument))].join(" ");
    return execSync(line, { cwd, encoding : "utf8", stdio : ["ignore", "pipe", "inherit"] });
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "abc-babel-"));
let failed = false;
try {
    const tarball = path.join(work, run("npm", ["pack", "--pack-destination", work, "--silent"], root).trim().split(/\r?\n/).pop() ?? "");
    for (const version of VERSIONS) {
        const app = path.join(work, `babel-${version}`);
        fs.mkdirSync(app);
        fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ name : "babel-check", private : true, type : "module" }));
        fs.copyFileSync(path.join(here, "program.js"), path.join(app, "program.js"));
        fs.writeFileSync(path.join(app, "check.mjs"), CHECK);
        run("npm", ["install", "--no-audit", "--no-fund", "--silent", tarball, `@babel/core@${version}`], app);
        const output = JSON.parse(run("node", ["check.mjs"], app)) as { babel : string; results : unknown };
        const actual = JSON.stringify(output.results);
        const pass = actual === EXPECTED;
        failed ||= !pass;
        console.log(`${pass ? "PASS" : "FAIL"} Babel ${output.babel}: ${actual}`);
    }
} finally {
    fs.rmSync(work, { recursive : true, force : true });
}
if (failed) {
    console.error(`Expected for each version: ${EXPECTED}`);
    process.exitCode = 1;
}

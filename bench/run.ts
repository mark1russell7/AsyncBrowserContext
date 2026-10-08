/**
 * The benchmark runner. Start it with `pnpm bench` (the script builds the
 * library first).
 *
 * The runner compiles `scenarios.ts` for each case and starts one Node.js
 * process for each case, so that the patches of one case do not change
 * another case. Each process measures the scenarios with tinybench and writes
 * its results as JSON. The runner writes `bench/results/latest.json` and
 * shows a table.
 *
 * The load of the machine can change while the runner operates. Thus the
 * runner does more than one round. Each round starts one process for each
 * case, and each round has a different order of the cases. The result of a
 * case is the median of its rounds. The range shows the lowest and the
 * highest factor "library / plain" of one round.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformAsync } from "@babel/core";
import ts from "typescript";
import preset from "../src/babel/preset.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(here, ".out");
const dist = (file : string) : string => pathToFileURL(path.join(root, "dist", file)).href;

/** The number of rounds. Set `BENCH_ROUNDS` to change it. */
const ROUNDS = Math.max(1, Number(process.env["BENCH_ROUNDS"] ?? 5));

interface Case {
    readonly name : string;
    readonly description : string;
    /** The module that gives the Variable class, or undefined for a class without propagation. */
    readonly library : string | undefined;
    /** The runtime of the transform, or undefined for plain JavaScript. */
    readonly runtime : string | undefined;
}

const CASES : readonly Case[] = [
    { name : "plain", description : "Plain JavaScript, no library", library : undefined, runtime : undefined },
    { name : "transform only", description : "The Babel preset with the plain coroutine of the Node.js runtime, no patches", library : undefined, runtime : dist("node/runtime.js") },
    { name : "library", description : "The Babel preset and the browser runtime", library : dist("index.js"), runtime : dist("runtime.js") },
];

/** A Variable class without propagation, for the cases without the library. */
const PLAIN_VARIABLE = `
export class Variable {
    #value;
    #set = false;
    get() { return this.#set ? this.#value : undefined; }
    run(value, fn) {
        const previous = [this.#value, this.#set];
        this.#value = value;
        this.#set = true;
        try { return fn(); } finally { [this.#value, this.#set] = previous; }
    }
}
`;

const CHILD = `
import { Bench } from "tinybench";
import { Variable } from "./variable.mjs";
import { createScenarios } from "./scenarios.mjs";

const bench = new Bench({ time : 1500, warmupTime : 300 });
for (const scenario of createScenarios(Variable)) {
    bench.add(scenario.name, scenario.run);
}
await bench.run();
const results = bench.tasks.map((task) => ({
    name : task.name,
    meanMs : task.result.latency.mean,
    p75Ms : task.result.latency.p75,
    rme : task.result.latency.rme,
    samples : task.result.latency.samplesCount,
}));
process.stdout.write(JSON.stringify(results));
`;

interface TaskResult {
    readonly name : string;
    readonly meanMs : number;
    readonly p75Ms : number;
    readonly rme : number;
    readonly samples : number;
}

async function prepare(benchCase : Case) : Promise<string> {
    const directory = path.join(outDir, benchCase.name.replace(/\s+/g, "-"));
    fs.mkdirSync(directory, { recursive : true });
    const source = fs.readFileSync(path.join(here, "scenarios.ts"), "utf8");
    const javascript = ts.transpileModule(source, { compilerOptions : { target : ts.ScriptTarget.ES2022, module : ts.ModuleKind.ESNext } }).outputText;
    let code = javascript;
    if (benchCase.runtime !== undefined) {
        const result = await transformAsync(javascript, { filename : "scenarios.mjs", babelrc : false, configFile : false, presets : [[preset, { runtime : benchCase.runtime }]] });
        code = result?.code ?? javascript;
    }
    fs.writeFileSync(path.join(directory, "scenarios.mjs"), code);
    fs.writeFileSync(path.join(directory, "variable.mjs"), benchCase.library === undefined ? PLAIN_VARIABLE : `export { Variable } from ${JSON.stringify(benchCase.library)};\n`);
    fs.writeFileSync(path.join(directory, "child.mjs"), CHILD);
    // The child resolves tinybench from the node_modules of the repository
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type : "module" }));
    return path.join(directory, "child.mjs");
}

function run(child : string) : TaskResult[] {
    const output = execFileSync(process.execPath, [child], { cwd : root, encoding : "utf8", env : { ...process.env, NODE_PATH : path.join(root, "node_modules") } });
    return JSON.parse(output) as TaskResult[];
}

function median(values : readonly number[]) : number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] as number : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

async function main() : Promise<void> {
    fs.rmSync(outDir, { recursive : true, force : true });
    // Link node_modules, so that the children find tinybench
    fs.mkdirSync(outDir, { recursive : true });
    fs.symlinkSync(path.join(root, "node_modules"), path.join(outDir, "node_modules"), "junction");
    const children = new Map<string, string>();
    const rounds = new Map<string, TaskResult[][]>();
    for (const benchCase of CASES) {
        children.set(benchCase.name, await prepare(benchCase));
        rounds.set(benchCase.name, []);
    }
    for (let round = 0; round < ROUNDS; round++) {
        // Turn the order, so that each case also runs first and last in a round
        const order = CASES.map((_, index) => CASES[(index + round) % CASES.length] as Case);
        process.stdout.write(`round ${round + 1} of ${ROUNDS}:`);
        for (const benchCase of order) {
            rounds.get(benchCase.name)?.push(run(children.get(benchCase.name) as string));
            process.stdout.write(` ${benchCase.name};`);
        }
        process.stdout.write("\n");
    }
    /** The mean times of one scenario in one case, one value for each round. */
    const meansOf = (caseName : string, scenario : string) : number[] =>
        (rounds.get(caseName) ?? []).flatMap((tasks) => tasks.filter((task) => task.name === scenario).map((task) => task.meanMs));
    const scenarios = (rounds.get("plain")?.[0] ?? []).map((task) => task.name);
    const rows = scenarios.map((scenario) => {
        const plain = meansOf("plain", scenario);
        const transformOnly = meansOf("transform only", scenario);
        const library = meansOf("library", scenario);
        const roundFactors = library.map((ms, round) => ms / (plain[round] as number));
        return {
            benchmark : scenario,
            plainMs : median(plain),
            transformOnlyMs : transformOnly.length === 0 ? null : median(transformOnly),
            libraryMs : library.length === 0 ? null : median(library),
            libraryFactor : library.length === 0 ? null : median(library) / median(plain),
            factorRange : roundFactors.length === 0 ? null : [Math.min(...roundFactors), Math.max(...roundFactors)],
        };
    });
    const results = {
        date : new Date().toISOString(),
        environment : { node : process.version, os : `${os.type()} ${os.release()}`, cpu : os.cpus()[0]?.model.trim() ?? "unknown", cores : os.cpus().length },
        rounds : ROUNDS,
        cases : CASES.map(({ name, description }) => ({ name, description })),
        rows,
    };
    fs.mkdirSync(path.join(here, "results"), { recursive : true });
    fs.writeFileSync(path.join(here, "results", "latest.json"), `${JSON.stringify(results, null, 2)}\n`);
    console.table(rows.map((row) => ({
        benchmark : row.benchmark,
        "plain (ms)" : row.plainMs.toFixed(3),
        "transform only (ms)" : row.transformOnlyMs?.toFixed(3),
        "library (ms)" : row.libraryMs?.toFixed(3),
        "library / plain" : row.libraryFactor?.toFixed(2),
        "range of rounds" : row.factorRange?.map((factor) => factor.toFixed(2)).join(" to "),
    })));
}

await main();

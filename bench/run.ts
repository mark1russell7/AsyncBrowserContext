/**
 * The benchmark runner. Start it with `pnpm bench`.
 *
 * The runner first builds the library, so that the runtime in `dist` and the
 * transform of `src` come from the same source. Then it compiles
 * `scenarios.ts` for each case and starts one Node.js process for each case,
 * so that the patches of one case do not change another case. Each process
 * measures the scenarios with tinybench and writes its results as JSON. The
 * runner writes `bench/results/latest.json` and shows a table.
 *
 * The load of the machine can change while the runner operates. Thus the
 * runner does more than one round. Each round starts one process for each
 * case, and each round has a different order of the cases. The result of a
 * case is the median of its rounds. The range shows the lowest and the
 * highest factor "library / plain" of one round. The noise is the relative
 * margin of error (rme) of tinybench, in percent, as the median of the rounds.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformAsync } from "@babel/core";
import ts from "typescript";
import preset from "../src/babel/preset.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
/** The folder of the files of the runner. Other scripts can use other folders in `bench/.out`. */
const outDir = path.join(here, ".out", "run");
const dist = (file : string) : string => pathToFileURL(path.join(root, "dist", file)).href;

/** The number of rounds: 5, or the value of `BENCH_ROUNDS`, which must be a positive integer. */
function roundCount() : number {
    const text = process.env["BENCH_ROUNDS"]?.trim();
    if (text === undefined || text === "") {
        return 5;
    }
    if (!/^\d+$/.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
        throw new Error(`BENCH_ROUNDS must be a positive integer, not "${process.env["BENCH_ROUNDS"]}".`);
    }
    return Number(text);
}

const ROUNDS = roundCount();

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
    // The folder of the child is in the repository, so the child finds tinybench in the node_modules folder of the repository.
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type : "module" }));
    return path.join(directory, "child.mjs");
}

function run(child : string) : TaskResult[] {
    const output = execFileSync(process.execPath, [child], { cwd : root, encoding : "utf8" });
    return JSON.parse(output) as TaskResult[];
}

function median(values : readonly number[]) : number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] as number : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

async function main() : Promise<void> {
    // The transform comes from src, and the runtime from dist. The build makes dist match src.
    execSync("npx tsc -p tsconfig.build.json", { cwd : root, stdio : "inherit" });
    fs.rmSync(outDir, { recursive : true, force : true });
    fs.mkdirSync(outDir, { recursive : true });
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
    /** One value of one scenario in one case, for each round. */
    const valuesOf = (caseName : string, scenario : string, value : (task : TaskResult) => number) : number[] =>
        (rounds.get(caseName) ?? []).flatMap((tasks) => tasks.filter((task) => task.name === scenario).map(value));
    const medianOrNull = (values : readonly number[]) : number | null => values.length === 0 ? null : median(values);
    const scenarios = (rounds.get("plain")?.[0] ?? []).map((task) => task.name);
    const rows = scenarios.map((scenario) => {
        const plain = valuesOf("plain", scenario, (task) => task.meanMs);
        const transformOnly = valuesOf("transform only", scenario, (task) => task.meanMs);
        const library = valuesOf("library", scenario, (task) => task.meanMs);
        const roundFactors = library.map((ms, round) => ms / (plain[round] as number));
        const rme = (caseName : string) : number | null => medianOrNull(valuesOf(caseName, scenario, (task) => task.rme));
        return {
            benchmark : scenario,
            plainMs : median(plain),
            transformOnlyMs : medianOrNull(transformOnly),
            libraryMs : medianOrNull(library),
            libraryFactor : library.length === 0 ? null : median(library) / median(plain),
            factorRange : roundFactors.length === 0 ? null : [Math.min(...roundFactors), Math.max(...roundFactors)],
            /** The relative margin of error of tinybench in percent, the median of the rounds. */
            rmePercent : { plain : rme("plain"), transformOnly : rme("transform only"), library : rme("library") },
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
        "rme % (plain, transform, library)" : [row.rmePercent.plain, row.rmePercent.transformOnly, row.rmePercent.library].map((rme) => rme?.toFixed(1) ?? "-").join(", "),
    })));
}

await main();

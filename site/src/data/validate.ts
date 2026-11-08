import type { SiteDataMap, SiteDataName } from "./types";

function isRecord(value : unknown) : value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsOf(file : Record<string, unknown>, key : string, name : string) : Record<string, unknown>[] {
    const rows = file[key];
    if (!Array.isArray(rows) || !rows.every(isRecord)) {
        throw new Error(`The file data/${name}.json has no list "${key}".`);
    }
    return rows;
}

function requireFields(rows : readonly Record<string, unknown>[], fields : Readonly<Record<string, "string" | "number">>, name : string) : void {
    rows.forEach((row, index) => {
        for (const [field, type] of Object.entries(fields)) {
            if (typeof row[field] !== type) {
                throw new Error(`In data/${name}.json, row ${index + 1} has no ${type} "${field}".`);
            }
        }
    });
}

/** This function makes sure that each row has one of the permitted values in `field`, or no value if the field is optional. */
function requireOneOf(rows : readonly Record<string, unknown>[], field : string, values : readonly string[], name : string, optional = false) : void {
    rows.forEach((row, index) => {
        const value = row[field];
        if (optional && value === undefined) return;
        if (typeof value !== "string" || !values.includes(value)) {
            throw new Error(`In data/${name}.json, row ${index + 1} has the "${field}" ${JSON.stringify(value)}. Use one of: ${values.join(", ")}.`);
        }
    });
}

function requireNumbers(record : Record<string, unknown>, fields : readonly string[], where : string) : void {
    for (const field of fields) {
        if (typeof record[field] !== "number" || !Number.isFinite(record[field])) throw new Error(`${where} has no number "${field}".`);
    }
}

function requireStrings(value : unknown, where : string) : void {
    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) throw new Error(`${where} is not a list of text values.`);
}

/** The values of `ProbeResult.status` and `MutationRow.suite` (refer to `types.ts`). */
const PROBE_STATUSES = ["fixed", "safe", "documentation", "correct"] as const;
const MUTATION_SUITES = ["old", "new"] as const;

/** The sizes of one bundle, in bytes. */
const BUNDLE_FIELDS = ["minifiedBytes", "gzipBytes", "brotliBytes"] as const;

/**
 * This function examines the shape of a data file. It gives the file if the
 * shape is correct, and it throws an error with the first problem if not.
 */
export function validateDataFile<K extends SiteDataName>(name : K, value : unknown) : SiteDataMap[K] {
    if (!isRecord(value)) throw new Error(`The file data/${name}.json is not an object.`);
    if (typeof value["generated"] !== "string") throw new Error(`The file data/${name}.json has no "generated" time.`);
    const run = value["run"];
    if (run !== undefined) {
        if (!isRecord(run)) throw new Error(`In data/${name}.json, "run" is not an object.`);
        for (const field of ["id", "url", "date", "version"]) {
            if (typeof run[field] !== "string") throw new Error(`In data/${name}.json, "run" has no text "${field}".`);
        }
    }
    switch (name) {
        case "probes": {
            const probes = rowsOf(value, "probes", name);
            requireFields(probes, { id : "string", scenario : "string", before : "string", after : "string", status : "string" }, name);
            requireOneOf(probes, "status", PROBE_STATUSES, name);
            probes.forEach((probe, index) => {
                if (probe["rule"] !== undefined && typeof probe["rule"] !== "string") throw new Error(`In data/${name}.json, row ${index + 1} has a "rule" that is not text.`);
            });
            break;
        }
        case "mutation": {
            const rows = rowsOf(value, "rows", name);
            requireFields(rows, { mutant : "string", description : "string", suite : "string", passed : "number", total : "number" }, name);
            requireOneOf(rows, "suite", MUTATION_SUITES, name);
            const stryker = value["stryker"];
            if (stryker !== undefined) {
                if (!isRecord(stryker)) throw new Error(`In data/${name}.json, "stryker" is not an object.`);
                requireNumbers(stryker, ["score", "killed", "survived", "timeout", "noCoverage", "total"], `In data/${name}.json, "stryker"`);
                requireStrings(stryker["scope"], `In data/${name}.json, "stryker.scope"`);
            }
            break;
        }
        case "browsers":
            requireFields(rowsOf(value, "rows", name), { browser : "string", version : "string", passed : "number", failed : "number", skipped : "number" }, name);
            break;
        case "size": {
            requireNumbers(value, BUNDLE_FIELDS, `The file data/${name}.json`);
            requireStrings(value["entries"], `In data/${name}.json, "entries"`);
            if (typeof value["vite"] !== "string") throw new Error(`The file data/${name}.json has no text "vite".`);
            const zone = value["zone"];
            if (!isRecord(zone)) throw new Error(`The file data/${name}.json has no "zone".`);
            requireNumbers(zone, BUNDLE_FIELDS, `In data/${name}.json, "zone"`);
            if (typeof zone["version"] !== "string") throw new Error(`In data/${name}.json, "zone" has no text "version".`);
            const rows = rowsOf(value, "transform", name);
            requireFields(rows, { name : "string", version : "string", kind : "string", asyncFunctions : "number" }, name);
            rows.forEach((row, index) => {
                for (const form of ["native", "transformed", "transformedWithoutNames", "loweredEs2016"]) {
                    const bundle = row[form];
                    if (!isRecord(bundle)) throw new Error(`In data/${name}.json, row ${index + 1} has no "${form}".`);
                    requireNumbers(bundle, BUNDLE_FIELDS, `In data/${name}.json, row ${index + 1}, "${form}"`);
                }
            });
            break;
        }
        case "browser-bench": {
            requireNumbers(value, ["count", "runs", "minRunMs"], `The file data/${name}.json`);
            const rows = rowsOf(value, "rows", name);
            requireFields(rows, { engine : "string", version : "string", workload : "string" }, name);
            rows.forEach((row, index) => {
                const ms = row["ms"];
                if (!isRecord(ms)) throw new Error(`In data/${name}.json, row ${index + 1} has no "ms".`);
                requireNumbers(ms, ["Native", "Babel helper", "Library"], `In data/${name}.json, row ${index + 1}, "ms"`);
            });
            break;
        }
        case "bench": {
            const environment = value["environment"];
            if (!isRecord(environment)) throw new Error(`The file data/${name}.json has no "environment".`);
            for (const field of ["node", "os", "cpu"]) {
                if (typeof environment[field] !== "string") throw new Error(`In data/${name}.json, "environment" has no text "${field}".`);
            }
            requireFields(rowsOf(value, "rows", name), { benchmark : "string", plainMs : "number", transformOnlyMs : "number", libraryMs : "number" }, name);
            break;
        }
        default:
            throw new Error(`There is no data file with the name "${String(name)}".`);
    }
    return value as SiteDataMap[K];
}

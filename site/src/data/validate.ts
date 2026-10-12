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

/**
 * This function examines the shape of a data file. It gives the file if the
 * shape is correct, and it throws an error with the first problem if not.
 */
export function validateDataFile<K extends SiteDataName>(name : K, value : unknown) : SiteDataMap[K] {
    if (!isRecord(value)) throw new Error(`The file data/${name}.json is not an object.`);
    if (typeof value["generated"] !== "string") throw new Error(`The file data/${name}.json has no "generated" time.`);
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
        case "size":
            requireNumbers(value, ["minifiedBytes", "gzipBytes", "brotliBytes"], `The file data/${name}.json`);
            requireStrings(value["entries"], `In data/${name}.json, "entries"`);
            break;
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

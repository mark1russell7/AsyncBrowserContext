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

/**
 * This function examines the shape of a data file. It gives the file if the
 * shape is correct, and it throws an error with the first problem if not.
 */
export function validateDataFile<K extends SiteDataName>(name : K, value : unknown) : SiteDataMap[K] {
    if (!isRecord(value)) throw new Error(`The file data/${name}.json is not an object.`);
    if (typeof value["generated"] !== "string") throw new Error(`The file data/${name}.json has no "generated" time.`);
    switch (name) {
        case "probes":
            requireFields(rowsOf(value, "probes", name), { id : "string", scenario : "string", before : "string", after : "string", status : "string" }, name);
            break;
        case "mutation":
            requireFields(rowsOf(value, "rows", name), { mutant : "string", description : "string", suite : "string", passed : "number", total : "number" }, name);
            break;
        case "browsers":
            requireFields(rowsOf(value, "rows", name), { browser : "string", version : "string", passed : "number", failed : "number", skipped : "number" }, name);
            break;
        case "bench": {
            if (!isRecord(value["environment"])) throw new Error(`The file data/${name}.json has no "environment".`);
            requireFields(rowsOf(value, "rows", name), { benchmark : "string", plainMs : "number", transformOnlyMs : "number", libraryMs : "number" }, name);
            break;
        }
        default:
            throw new Error(`There is no data file with the name "${String(name)}".`);
    }
    return value as SiteDataMap[K];
}

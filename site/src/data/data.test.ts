import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHttpDataSource, createMemoryDataSource } from "./source";
import type { SiteDataName } from "./types";
import { validateDataFile } from "./validate";

/** The files in public/data. Vite does not let a module import a file of the public folder, so the test reads them. */
function dataFile(name : SiteDataName) : unknown {
    return JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), "utf8")) as unknown;
}

const probes = dataFile("probes");
const bench = validateDataFile("bench", dataFile("bench"));

const MUTATION = { generated : "x", rows : [{ mutant : "m1", description : "d", suite : "old", passed : 1, total : 2 }] };
const STRYKER = { score : 90, killed : 9, survived : 1, timeout : 0, noCoverage : 0, total : 10, scope : ["src/a.ts"] };

describe("data files", () => {
    it("accepts each file in public/data", () => {
        expect(validateDataFile("probes", probes).probes.length).toBeGreaterThan(0);
        expect(validateDataFile("mutation", dataFile("mutation")).rows.length).toBeGreaterThan(0);
        expect(validateDataFile("browsers", dataFile("browsers")).rows.length).toBeGreaterThan(0);
        expect(bench.rows.length).toBeGreaterThan(0);
        expect(validateDataFile("size", dataFile("size")).gzipBytes).toBeGreaterThan(0);
    });

    it("gives the first problem of a file with an incorrect shape", () => {
        expect(() => validateDataFile("probes", [])).toThrow("is not an object");
        expect(() => validateDataFile("probes", { probes : [] })).toThrow("no \"generated\" time");
        expect(() => validateDataFile("mutation", { generated : "x", rows : [{ mutant : "m1" }] })).toThrow("row 1 has no string \"description\"");
        expect(() => validateDataFile("bench", { generated : "x", rows : [] })).toThrow("no \"environment\"");
    });

    it("refuses a value that the types do not have", () => {
        const probe = { id : "P1", scenario : "s", before : "a", after : "b", status : "fixed" };
        expect(() => validateDataFile("probes", { generated : "x", probes : [{ ...probe, status : "broken" }] })).toThrow("row 1 has the \"status\" \"broken\"");
        expect(() => validateDataFile("probes", { generated : "x", probes : [{ ...probe, rule : 4 }] })).toThrow("\"rule\" that is not text");
        expect(validateDataFile("probes", { generated : "x", probes : [{ ...probe, status : "correct", rule : "C4" }] }).probes).toHaveLength(1);
        expect(() => validateDataFile("mutation", { ...MUTATION, rows : [{ ...MUTATION.rows[0], suite : "newer" }] })).toThrow("\"suite\" \"newer\"");
    });

    it("examines the optional Stryker summary of the mutation file", () => {
        expect(validateDataFile("mutation", MUTATION).stryker).toBeUndefined();
        expect(validateDataFile("mutation", { ...MUTATION, stryker : STRYKER }).stryker).toEqual(STRYKER);
        expect(() => validateDataFile("mutation", { ...MUTATION, stryker : [] })).toThrow("\"stryker\" is not an object");
        expect(() => validateDataFile("mutation", { ...MUTATION, stryker : { ...STRYKER, score : "90%" } })).toThrow("\"stryker\" has no number \"score\"");
        expect(() => validateDataFile("mutation", { ...MUTATION, stryker : { ...STRYKER, scope : [1] } })).toThrow("\"stryker.scope\" is not a list");
    });

    it("examines the entries of the size file and the environment of the bench file", () => {
        const size = { generated : "x", entries : ["a"], minifiedBytes : 3, gzipBytes : 2, brotliBytes : 1 };
        expect(validateDataFile("size", size).entries).toEqual(["a"]);
        expect(() => validateDataFile("size", { ...size, entries : "a" })).toThrow("\"entries\" is not a list");
        expect(() => validateDataFile("size", { ...size, gzipBytes : null })).toThrow("has no number \"gzipBytes\"");
        expect(() => validateDataFile("bench", { generated : "x", environment : { node : "v24", os : "Linux" }, rows : [] })).toThrow("\"environment\" has no text \"cpu\"");
        expect(() => validateDataFile("bench", { generated : "x", environment : { node : "v24", os : "Linux", cpu : "x" }, rows : [{ benchmark : "b", plainMs : 1, transformOnlyMs : null, libraryMs : 2 }] }))
            .toThrow("row 1 has no number \"transformOnlyMs\"");
    });
});

describe("data sources", () => {
    it("loads each file one time from the base URL", async () => {
        const urls : string[] = [];
        const source = createHttpDataSource("/AsyncBrowserContext/", (url) => {
            urls.push(url);
            return Promise.resolve({ ok : true, status : 200, json : () => Promise.resolve(probes) });
        });
        await source.load("probes");
        await source.load("probes");
        expect(urls).toEqual(["/AsyncBrowserContext/data/probes.json"]);
    });

    it("gives an error for a failed load, and loads the file again at the next use", async () => {
        let attempts = 0;
        const source = createHttpDataSource("/", () => {
            attempts++;
            return Promise.resolve(attempts === 1
                ? { ok : false, status : 404, json : () => Promise.resolve(null) }
                : { ok : true, status : 200, json : () => Promise.resolve(bench as unknown) });
        });
        await expect(source.load("bench")).rejects.toThrow("HTTP 404");
        await expect(source.load("bench")).resolves.toMatchObject({ rows : bench.rows });
    });

    it("gives an error for a file that the memory source does not have", async () => {
        await expect(createMemoryDataSource({}).load("bench")).rejects.toThrow("There is no file data/bench.json");
    });
});

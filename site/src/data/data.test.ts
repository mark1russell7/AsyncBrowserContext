import { describe, expect, it } from "vitest";
import bench from "../../public/data/bench.json";
import browsers from "../../public/data/browsers.json";
import mutation from "../../public/data/mutation.json";
import probes from "../../public/data/probes.json";
import { createHttpDataSource, createMemoryDataSource } from "./source";
import { validateDataFile } from "./validate";

describe("data files", () => {
    it("accepts each file in public/data", () => {
        expect(validateDataFile("probes", probes).probes.length).toBeGreaterThan(0);
        expect(validateDataFile("mutation", mutation).rows.length).toBeGreaterThan(0);
        expect(validateDataFile("browsers", browsers).rows.length).toBeGreaterThan(0);
        expect(validateDataFile("bench", bench).rows.length).toBeGreaterThan(0);
    });

    it("gives the first problem of a file with an incorrect shape", () => {
        expect(() => validateDataFile("probes", [])).toThrow("is not an object");
        expect(() => validateDataFile("probes", { probes : [] })).toThrow("no \"generated\" time");
        expect(() => validateDataFile("mutation", { generated : "x", rows : [{ mutant : "m1" }] })).toThrow("row 1 has no string \"description\"");
        expect(() => validateDataFile("bench", { generated : "x", rows : [] })).toThrow("no \"environment\"");
    });
});

describe("data sources", () => {
    it("loads each file one time from the base URL", async () => {
        const urls : string[] = [];
        const source = createHttpDataSource("/AsyncBrowserContext/", (url) => {
            urls.push(url);
            return Promise.resolve({ ok : true, status : 200, json : () => Promise.resolve(probes as unknown) });
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

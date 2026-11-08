import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDataFile } from "../data/validate";
import { benchMs, gzipIncrease, kilobytes, rangeOf, transformRanges } from "./performance";

const bundle = (gzipBytes : number) => ({ minifiedBytes : gzipBytes * 3, gzipBytes, brotliBytes : gzipBytes });

describe("the performance tables", () => {
    it("formats sizes in kB of 1,000 bytes and the increase in percent with one decimal", () => {
        expect(kilobytes(5997)).toBe("6.0 kB");
        expect(gzipIncrease(bundle(80_619), bundle(85_814))).toBe(6.4);
        expect(gzipIncrease(bundle(100), bundle(100))).toBe(0);
    });

    it("gives the range of the API clients and of the option names: false", () => {
        const row = (name : string, kind : string, asyncFunctions : number, transformed : number, withoutNames : number) => ({
            name, version : "1.0.0", kind, asyncFunctions,
            native : bundle(1000), transformed : bundle(transformed), transformedWithoutNames : bundle(withoutNames), loweredEs2016 : bundle(1100),
        });
        const rows = [row("react-dom", "User interface", 0, 1000, 1000), row("ky", "HTTP client", 28, 1041, 1029), row("openai", "API client with streams", 145, 1064, 1057)];
        expect(transformRanges(rows)).toEqual({ clients : [4.1, 6.4], names : [0.7, 1.2] });
        expect(transformRanges([rows[0]!])).toEqual({});
        expect(rangeOf([])).toBeUndefined();
    });

    it("shows the times of the browser benchmark with two, one or no decimals", () => {
        expect(benchMs(0.6289)).toBe("0.63");
        expect(benchMs(2.1739)).toBe("2.2");
        expect(benchMs(268)).toBe("268");
    });

    it("gives the ranges of the current data file, so the text under the table has values", () => {
        const file = validateDataFile("size", JSON.parse(readFileSync(new URL("../../public/data/size.json", import.meta.url), "utf8")) as unknown);
        const { clients, names } = transformRanges(file.transform);
        expect(clients?.[0]).toBeLessThanOrEqual(clients?.[1] ?? Number.NaN);
        expect(names?.[0]).toBeLessThanOrEqual(names?.[1] ?? Number.NaN);
    });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dictionary, DictionaryError, loadDictionary, parseDictionary } from "./dictionary.js";

let directory : string;

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ste-dictionary-"));
});

afterEach(() => {
    rmSync(directory, { recursive : true, force : true });
});

describe("parseDictionary", () => {
    it("reads the short form: an array of approved words", () => {
        const dictionary = parseDictionary(["Make", "makes", "valve"], "d.json");
        expect(dictionary.size).toBe(3);
        expect(dictionary.lookup("make").status).toBe("approved");
        expect(dictionary.lookup("MAKES").status).toBe("approved");
        expect(dictionary.lookup("made").status).toBe("unknown");
    });

    it("reads the full form with parts of speech, forms and words that are not approved", () => {
        const dictionary = parseDictionary({
            format : "ste-lint-dictionary",
            version : 1,
            entries : [
                "a",
                { word : "make", pos : "verb", forms : ["makes", "made"] },
                { word : "make sure", pos : "verb" },
                { word : "valve", pos : "noun" },
                { word : "battery", pos : "n" },
                { word : "utilize", pos : "v", approved : false, alternatives : ["use"] },
                { word : "frob", approved : false },
            ],
        }, "d.json");
        expect(dictionary.lookup("made").status).toBe("approved");
        expect(dictionary.lookup("sure").status).toBe("approved");
        expect(dictionary.lookup("valves").status).toBe("approved");
        expect(dictionary.lookup("batteries").status).toBe("approved");
        expect(dictionary.lookup("valve's").status).toBe("approved");
        expect(dictionary.lookup("makings").status).toBe("unknown");
        expect(dictionary.lookup("Utilize")).toEqual({ status : "not-approved", alternatives : ["use"] });
        expect(dictionary.lookup("frob")).toEqual({ status : "not-approved", alternatives : [] });
        expect([...dictionary.nouns].sort()).toEqual(["battery", "valve"]);
        expect([...dictionary.verbs].sort()).toEqual(["make", "make sure"]);
    });

    it("gives clear errors for a file that is not valid", () => {
        expect(() => parseDictionary(["a", 1], "d.json")).toThrow("only strings");
        expect(() => parseDictionary(3, "d.json")).toThrow(DictionaryError);
        expect(() => parseDictionary({ format : "other", entries : [] }, "d.json")).toThrow("\"format\" must be");
        expect(() => parseDictionary({ entries : {} }, "d.json")).toThrow("\"entries\" must be an array");
        expect(() => parseDictionary({ entries : [5] }, "d.json")).toThrow("entries[0] must be a string or an object");
        expect(() => parseDictionary({ entries : [{ word : "" }] }, "d.json")).toThrow("word must be a string");
        expect(() => parseDictionary({ entries : [{ word : "a", pos : 1 }] }, "d.json")).toThrow("pos must be a string");
        expect(() => parseDictionary({ entries : [{ word : "a", approved : "no" }] }, "d.json")).toThrow("approved must be true or false");
        expect(() => parseDictionary({ entries : [{ word : "a", forms : "b" }] }, "d.json")).toThrow("forms must be an array of strings");
    });

    it("makes an empty dictionary", () => {
        expect(new Dictionary([]).lookup("anything").status).toBe("unknown");
    });
});

describe("loadDictionary", () => {
    it("reads a JSON file", () => {
        const path = join(directory, "dictionary.json");
        writeFileSync(path, JSON.stringify(["valve"]));
        expect(loadDictionary(path).lookup("valve").status).toBe("approved");
    });

    it("gives clear errors for a missing file and a file that is not JSON", () => {
        expect(() => loadDictionary(join(directory, "missing.json"))).toThrow("Cannot read the dictionary file");
        const path = join(directory, "broken.json");
        writeFileSync(path, "[");
        expect(() => loadDictionary(path)).toThrow("is not valid JSON");
    });
});

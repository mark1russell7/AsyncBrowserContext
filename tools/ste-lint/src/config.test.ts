import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    ConfigError,
    DEFAULT_IGNORE,
    DEFAULT_INCLUDE,
    DEFAULT_LIMITS,
    findConfigFile,
    loadConfig,
    mergeWordList,
    resolveConfig,
    resolvePath,
    validateConfig,
} from "./config.js";
import { DEFAULT_WORD_LIST } from "./word-list.js";

let directory : string;

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ste-config-"));
});

afterEach(() => {
    rmSync(directory, { recursive : true, force : true });
});

describe("validateConfig", () => {
    it("accepts a full configuration", () => {
        const file = {
            $schema : "./schema.json",
            include : ["README.md"],
            ignore : ["**/dist/**"],
            technicalNouns : ["monitor"],
            technicalVerbs : ["flush"],
            properNouns : ["Grafana"],
            allowedWords : ["okay"],
            rules : { "modal-verb" : "warning", "noun-cluster" : "off" },
            wordList : [{ match : ["blazingly fast"], suggest : "\"fast\"", severity : "warning", verbOnly : false, note : null }, { id : "via", severity : "off" }],
            limits : { instructionWords : 18 },
            dictionaryPath : null,
        };
        expect(validateConfig(file, "ste.config.json")).toBe(file);
    });

    it("lists all problems in one error", () => {
        const bad = {
            unknown : 1,
            include : "README.md",
            rules : { "no-such-rule" : "error", "semicolon" : "fatal", "constructor" : "off" },
            limits : { instructionWords : 0, constructor : 5, wordCount : 2 },
            dictionaryPath : 3,
            wordList : [{}, "x", { match : [], severity : "loud", verbOnly : "yes", id : 4, suggest : 5, extra : true }],
        };
        let message = "";
        try {
            validateConfig(bad, "ste.config.json");
        } catch (error) {
            expect(error).toBeInstanceOf(ConfigError);
            message = (error as Error).message;
        }
        for (const part of [
            "\"unknown\" is not a known property",
            "\"include\" must be an array of strings",
            "\"rules.no-such-rule\" is not a known rule",
            "\"rules.semicolon\" must be \"error\", \"warning\" or \"off\"",
            "\"rules.constructor\" is not a known rule",
            "\"limits.instructionWords\" must be an integer of 1 or more",
            "\"limits.constructor\" is not a known limit",
            "\"limits.wordCount\" is not a known limit",
            "\"dictionaryPath\" must be a string or null",
            "\"wordList[0]\" must have \"id\" or \"match\"",
            "\"wordList[1]\" must be an object",
            "\"wordList[2].match\" must be a string or an array of strings",
            "\"wordList[2].severity\"",
            "\"wordList[2].verbOnly\" must be true or false",
            "\"wordList[2].id\" must be a string",
            "\"wordList[2].suggest\" must be a string or null",
            "\"wordList[2].extra\" is not a known property",
        ]) {
            expect(message).toContain(part);
        }
    });

    it("rejects values that are not objects", () => {
        expect(() => validateConfig([], "x")).toThrow(ConfigError);
        expect(() => validateConfig(null, "x")).toThrow("must be a JSON object");
        expect(() => validateConfig({ rules : [] }, "x")).toThrow("\"rules\" must be an object");
        expect(() => validateConfig({ limits : 3 }, "x")).toThrow("\"limits\" must be an object");
        expect(() => validateConfig({ wordList : {} }, "x")).toThrow("\"wordList\" must be an array");
    });
});

describe("resolveConfig", () => {
    it("applies the defaults", () => {
        const config = resolveConfig({}, { root : directory });
        expect(config.include).toBe(DEFAULT_INCLUDE);
        expect(config.ignore).toBe(DEFAULT_IGNORE);
        expect(config.limits).toEqual(DEFAULT_LIMITS);
        expect(config.wordList).toEqual(DEFAULT_WORD_LIST);
        expect(config.dictionaryPath).toBeNull();
        expect(config.dictionarySource).toBeNull();
        expect(config.configFile).toBeNull();
    });

    it("keeps known rule settings and merges the limits", () => {
        const config = resolveConfig({ rules : { "modal-verb" : "warning" }, limits : { paragraphSentences : 4 } }, { root : directory });
        expect(config.rules).toEqual({ "modal-verb" : "warning" });
        expect(config.limits).toEqual({ ...DEFAULT_LIMITS, paragraphSentences : 4 });
    });

    it("resolves the dictionary path from the configuration, relative to the root", () => {
        const config = resolveConfig({ dictionaryPath : ".ste/dictionary.json" }, { root : directory });
        expect(config.dictionaryPath).toBe(resolve(directory, ".ste/dictionary.json"));
        expect(config.dictionarySource).toBe("config");
    });

    it("gives the environment variable priority, relative to the working directory", () => {
        const config = resolveConfig({ dictionaryPath : "a.json" }, { root : directory, cwd : "/work", env : { STE_DICTIONARY : "b.json" } });
        expect(config.dictionaryPath).toBe(resolve("/work", "b.json"));
        expect(config.dictionarySource).toBe("env");
        expect(resolveConfig({}, { root : directory, env : { STE_DICTIONARY : "  " } }).dictionaryPath).toBeNull();
    });

    it("expands ~ to the home directory", () => {
        expect(resolvePath("~/ste/dictionary.json", "/base")).toBe(join(homedir(), "ste/dictionary.json"));
        expect(resolvePath("~", "/base")).toBe(homedir());
        expect(resolvePath("/abs/file.json", "/base")).toBe(resolve("/abs/file.json"));
    });
});

describe("mergeWordList", () => {
    it("changes, adds and removes entries", () => {
        const merged = mergeWordList(DEFAULT_WORD_LIST, [
            { id : "via", suggest : "\"by\"", severity : "warning" },
            { match : "blazingly fast", suggest : "\"fast\"" },
            { id : "utilize", severity : "off" },
            { match : ["easily"], severity : "off" },
        ]);
        const byId = new Map(merged.map((entry) => [entry.id, entry]));
        expect(byId.get("via")).toMatchObject({ suggest : "\"by\"", severity : "warning", match : ["via"] });
        expect(byId.get("blazingly fast")).toMatchObject({ match : ["blazingly fast"], suggest : "\"fast\"", severity : "error", verbOnly : false, note : null });
        expect(byId.has("utilize")).toBe(false);
        expect(byId.get("simple")!.match).toEqual(["simple", "simply"]);
    });

    it("removes an entry that has no words left", () => {
        const merged = mergeWordList(DEFAULT_WORD_LIST, [{ match : ["numerous"], severity : "off" }]);
        expect(merged.some((entry) => entry.id === "numerous")).toBe(false);
    });

    it("keeps the fields of a default entry that the override does not give", () => {
        const merged = mergeWordList(DEFAULT_WORD_LIST, [{ id : "run", note : "Extra." }]);
        expect(merged.find((entry) => entry.id === "run")).toMatchObject({ verbOnly : true, severity : "warning", note : "Extra." });
    });
});

describe("loadConfig", () => {
    it("finds ste.config.json in a parent directory and uses its directory as the root", () => {
        writeFileSync(join(directory, "ste.config.json"), JSON.stringify({ technicalNouns : ["monitor"], dictionaryPath : "dict.json" }));
        const nested = join(directory, "a", "b");
        mkdirSync(nested, { recursive : true });
        expect(findConfigFile(nested)).toBe(join(directory, "ste.config.json"));
        const config = loadConfig({ cwd : nested });
        expect(config.root).toBe(directory);
        expect(config.technicalNouns).toEqual(["monitor"]);
        expect(config.dictionaryPath).toBe(join(directory, "dict.json"));
    });

    it("uses the defaults without a configuration file", () => {
        const config = loadConfig({ cwd : directory, env : {} });
        expect(config.configFile === null || !config.configFile.startsWith(directory)).toBe(true);
    });

    it("reads an explicit configuration file", () => {
        writeFileSync(join(directory, "custom.json"), JSON.stringify({ rules : { semicolon : "warning" } }));
        expect(loadConfig({ cwd : directory, configPath : "custom.json" }).rules).toEqual({ semicolon : "warning" });
    });

    it("gives clear errors for a missing file, a file that is not JSON and a configuration that is not valid", () => {
        expect(() => loadConfig({ cwd : directory, configPath : "missing.json" })).toThrow("Cannot read the configuration file");
        writeFileSync(join(directory, "broken.json"), "{ nope");
        expect(() => loadConfig({ cwd : directory, configPath : "broken.json" })).toThrow("is not valid JSON");
        writeFileSync(join(directory, "invalid.json"), JSON.stringify({ rules : { nope : "error" } }));
        expect(() => loadConfig({ cwd : directory, configPath : "invalid.json" })).toThrow("is not a known rule");
    });
});

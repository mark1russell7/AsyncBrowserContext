import { describe, expect, it } from "vitest";
import * as api from "./index.js";

describe("public API", () => {
    it("exports the linter, the configuration, the dictionary, the CLI and the rules", () => {
        for (const name of [
            "Linter", "lintText", "fileKind", "loadConfig", "resolveConfig", "validateConfig", "findConfigFile", "mergeWordList",
            "ConfigError", "Dictionary", "DictionaryError", "loadDictionary", "parseDictionary", "findFiles", "globToRegExp",
            "formatJson", "formatText", "summarize", "buildLexicon", "getRule", "RULES", "parseArgs", "runCli", "isRuleId",
        ]) {
            expect(api).toHaveProperty(name);
        }
        expect(api.CONFIG_FILE_NAME).toBe("ste.config.json");
        expect(api.DICTIONARY_ENV).toBe("STE_DICTIONARY");
        expect(api.DICTIONARY_FORMAT).toBe("ste-lint-dictionary");
        expect(api.RULE_IDS).toHaveLength(14);
        expect(api.DEFAULT_LIMITS.instructionWords).toBe(20);
        expect(api.DEFAULT_INCLUDE).toContain("README.md");
        expect(api.DEFAULT_IGNORE).toContain("**/node_modules/**");
        expect(api.DEFAULT_WORD_LIST.length).toBeGreaterThan(40);
        expect(api.USAGE).toContain("ste-lint");
    });

    it("lints text with the defaults", () => {
        const config = api.resolveConfig({}, { root : "/" });
        expect(api.lintText("You should stop.", "a.md", config).map((finding) => finding.ruleId)).toEqual(["modal-verb"]);
    });
});

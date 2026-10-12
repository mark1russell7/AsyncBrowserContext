import { describe, expect, it } from "vitest";
import { resolveConfig, type SteConfigFile } from "../config.js";
import { Linter } from "../lint.js";
import { WordListMatcher } from "./word-list-matcher.js";
import { DEFAULT_WORD_LIST } from "../word-list.js";

const lint = (text : string, file : SteConfigFile = {}, path : string = "doc.md") =>
    new Linter(resolveConfig(file, { root : "/" })).lintText(text, path).filter((finding) => finding.ruleId === "word-list");
const found = (text : string, file : SteConfigFile = {}) : string[] => lint(text, file).map((finding) => text.slice(finding.column - 1, finding.endColumn - 1));

describe("word-list", () => {
    it("reports long words and gives the plain-language word", () => {
        const findings = lint("Utilize the cache to initiate the run and ensure that it facilitates the work via the API.");
        expect(findings.map((finding) => finding.message)).toEqual([
            "Write \"use\", not \"Utilize\".",
            "Write \"start\", not \"initiate\".",
            "Write \"make sure\", not \"ensure\". Write \"that\" after it: \"make sure that ...\".",
            "Write \"help\" or \"make ... easier\", not \"facilitates\".",
            "Write \"through\" or \"with\", not \"via\".",
        ]);
        expect(findings.every((finding) => finding.severity === "error")).toBe(true);
    });

    it("reports phrases, and the longest phrase wins", () => {
        expect(found("Prior to the run, and in order to stop, due to the fact that it fails, due to the load.")).toEqual([
            "Prior to", "in order to", "due to the fact that", "due to",
        ]);
        expect(found("However, it works. Therefore, it stops. Ask whether or not it runs, or whether it stops. Tools such as this.")).toEqual([
            "However", "Therefore", "whether or not", "runs", "whether", "such as",
        ]);
    });

    it("reports the verbs that have simpler words", () => {
        expect(found("It allows a restart. It requires a key. It provides data, provided that it runs. It executes code. It creates files. Kill it.")).toEqual([
            "allows", "requires", "provides", "provided that", "runs", "executes", "creates", "Kill",
        ]);
    });

    it("reports run, call, return and display only where they are verbs", () => {
        expect(found("Run the tests. The monitor runs every second. Call `stop()`. It returns the value. The page displays a chart.")).toEqual([
            "Run", "runs", "Call", "returns", "displays",
        ]);
        expect(found("A test run takes time. Each call is fast. The return value is 0. The display is dark.")).toEqual([]);
    });

    it("reports \"see\" only where it means \"refer to\"", () => {
        expect(found("See the guide. For details, see `x`. Read it (see below). You can see the chart. I want to see it.")).toEqual([
            "See", "see", "see",
        ]);
    });

    it("reports filler words as warnings, and gives the time and negation alternatives", () => {
        const findings = lint("It is simple. Simply run it. It is easily done. It is just a test. Please wait. It is currently off. Now it runs. It never stops.");
        expect(findings.map((finding) => [finding.severity, finding.message.split(".")[0]])).toEqual([
            ["warning", "Remove \"simple\""],
            ["warning", "Remove \"Simply\""],
            ["warning", "Write \"start\", \"starts\" or \"operates\", not \"run\""],
            ["warning", "Remove \"easily\""],
            ["warning", "Write \"only\", not \"just\""],
            ["warning", "Remove \"Please\""],
            ["error", "Write \"at this time\", not \"currently\""],
            ["error", "Write \"at this time\", not \"Now\""],
            ["warning", "Write \"start\", \"starts\" or \"operates\", not \"runs\""],
            ["error", "Write \"do not\", not \"never\""],
        ]);
    });

    it("does not report \"approximately\" or words in code", () => {
        expect(found("It takes approximately 5 ms. Use `utilize()` and `createMonitor`.")).toEqual([]);
    });

    it("does not report a word that the glossary permits", () => {
        expect(found("Run the tests.", { technicalVerbs : ["run"] })).toEqual([]);
        expect(found("It creates a file.", { allowedWords : ["creates"] })).toEqual([]);
    });

    it("lets the configuration change, add and remove entries", () => {
        const file : SteConfigFile = {
            wordList : [
                { id : "via", severity : "warning", suggest : "\"by\"" },
                { match : ["blazingly fast"], suggest : "\"fast\"" },
                { match : "simply", severity : "off" },
                { id : "utilize", note : "Short words are better." },
            ],
        };
        const findings = lint("Go via the API. It is blazingly fast. Simply utilize it.", file);
        expect(findings.map((finding) => [finding.severity, finding.message])).toEqual([
            ["warning", "Write \"by\", not \"via\"."],
            ["error", "Write \"fast\", not \"blazingly fast\"."],
            ["error", "Write \"use\", not \"utilize\". Short words are better."],
        ]);
    });

    it("lets the rule setting override the severity of all entries", () => {
        expect(lint("Utilize it.", { rules : { "word-list" : "warning" } })[0]!.severity).toBe("warning");
        expect(lint("Utilize it.", { rules : { "word-list" : "off" } })).toEqual([]);
    });

    it("examines doc comments", () => {
        expect(lint("/** This function returns the value. */\nexport const a = 1;", {}, "a.ts")).toHaveLength(1);
    });
});

describe("WordListMatcher", () => {
    it("gives the single words of the list, for the other rules", () => {
        const matcher = new WordListMatcher(DEFAULT_WORD_LIST);
        expect(matcher.words.has("running")).toBe(true);
        expect(matcher.words.has("in order to")).toBe(false);
    });
});

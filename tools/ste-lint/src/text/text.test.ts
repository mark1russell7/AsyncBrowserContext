import { describe, expect, it } from "vitest";
import { normalizeInline } from "../source/inline.js";
import { splitLines } from "../source/lines.js";
import { findPassives, hasLemmaIn, isInstruction, isParticiple, isVerbUse, lemmas, nextCounted, startsObject } from "./grammar.js";
import { PhraseMatcher } from "./phrases.js";
import { countWords, splitSentences, topLevelParentheses } from "./sentences.js";
import { isAbbreviation, isCapitalized, isCounted, isIdentifierLike, isNumber, normalizeWord, tokenize, type Token } from "./tokens.js";
import { COMMON_VERBS } from "./words.js";

const tokens = (text : string, tsdoc : boolean = false) : Token[] => tokenize(normalizeInline(splitLines(text), { mdx : false, tsdoc }));
const texts = (text : string) : string[] => tokens(text).map((token) => token.text);
const sentences = (text : string) : string[] => {
    const all = tokens(text);
    return splitSentences(all).map((range) => all.slice(range.from, range.to).map((token) => token.text).join(" "));
};
const noPhrases = new PhraseMatcher();
const words = (text : string, properNouns : PhraseMatcher = noPhrases) : number => countWords(tokens(text), { properNouns }).words;
const verbs = { verbs : COMMON_VERBS };

describe("tokenize", () => {
    it("keeps hyphenated words, identifiers, paths, versions and flags as one token", () => {
        expect(texts("main-thread I/O e.g. v1.2.3 snake_case don't packages/lag --max-warnings @lag/core #12 $HOME foo() 5–20")).toEqual([
            "main-thread", "I/O", "e.g", ".", "v1.2.3", "snake_case", "don't", "packages/lag", "--max-warnings", "@lag/core", "#12", "$HOME", "foo()", "5–20",
        ]);
    });

    it("gives punctuation as separate tokens and an ellipsis as one token", () => {
        expect(texts("Wait... then (go); end.")).toEqual(["Wait", "...", "then", "(", "go", ")", ";", "end", "."]);
    });

    it("gives a code token for each placeholder, with the file range of the code span", () => {
        const all = tokens("Run `pnpm test` now.");
        const code = all.find((token) => token.kind === "code")!;
        expect(code.text).toBe("pnpm test");
        expect([code.start, code.end]).toEqual([4, 15]);
        expect(all.map((token) => token.kind)).toEqual(["word", "code", "word", "punct"]);
    });

    it("records white space before each token", () => {
        expect(tokens("a, b").map((token) => token.spaceBefore)).toEqual([true, false, true]);
    });

    it("classifies tokens", () => {
        const [number, numberWord, abbreviation, plural, word, camel] = tokens("1,000 twelve API CPUs Word camelCase");
        expect(isNumber(number)).toBe(true);
        expect(isNumber(numberWord)).toBe(true);
        expect(isAbbreviation(abbreviation)).toBe(true);
        expect(isAbbreviation(plural)).toBe(true);
        expect(isAbbreviation(word)).toBe(false);
        expect(isCapitalized(word)).toBe(true);
        expect(isIdentifierLike(camel)).toBe(true);
        expect(isIdentifierLike(word)).toBe(false);
        expect(isIdentifierLike(tokens("e.g")[0])).toBe(false);
        expect(isCounted(undefined)).toBe(false);
        expect(normalizeWord("It’s")).toBe("it's");
    });
});

describe("splitSentences", () => {
    it("divides at a period, a question mark or an exclamation mark before a capital letter", () => {
        expect(sentences("First one. Second one? Third one! Fourth")).toEqual(["First one .", "Second one ?", "Third one !", "Fourth"]);
    });

    it("does not divide after an abbreviation, an initial, a decimal or before a lower-case word", () => {
        expect(sentences("Use e.g. A or i.e. B here. J. Smith wrote 1.5 lines. The approx. value is fine. Fig. 3 shows it.")).toEqual([
            "Use e.g . A or i.e . B here .",
            "J . Smith wrote 1.5 lines .",
            "The approx . value is fine .",
            "Fig . 3 shows it .",
        ]);
        expect(sentences("A short ending etc. then more.")).toHaveLength(1);
    });

    it("divides after a unit at the end of a sentence, for example milliseconds", () => {
        expect(sentences("The handler blocks for 120 ms. The monitor gives 5 s. Ms. Lee wrote it.")).toEqual([
            "The handler blocks for 120 ms .",
            "The monitor gives 5 s .",
            "Ms . Lee wrote it .",
        ]);
    });

    it("keeps closing brackets and quotes in the sentence", () => {
        expect(sentences("(See the guide.) Next. He said \"Go.\" Then")).toEqual(["( See the guide . )", "Next .", "He said Go. .", "Then"]);
    });

    it("divides before a code span, a digit or an opening bracket", () => {
        expect(sentences("It stops. `stop()` frees it. 3 monitors run. (Optional) text.")).toHaveLength(4);
    });

    it("ignores a sentence without words", () => {
        expect(sentences("Text. ...")).toEqual(["Text . ..."]);
    });
});

describe("countWords", () => {
    it("counts each code span as one word", () => {
        expect(words("Run `pnpm -r build --filter @lag/core` and `pnpm test` now.")).toBe(5);
    });

    it("counts each link tag, URL and quoted text as one word", () => {
        expect(countWords(tokens("Refer to {@link Monitor.stop | the stop method}.", true), { properNouns : noPhrases }).words).toBe(3);
        expect(words("Open https://example.com/a/b/c in the browser.")).toBe(5);
        expect(words("Click the \"Save all changes\" button.")).toBe(4);
    });

    it("counts a number and its unit as one word, and a hyphenated word as one word", () => {
        expect(words("The unit weighs 20 kilograms.")).toBe(4);
        expect(words("Wait 5 ms for the soap-and-water rinse.")).toBe(6);
    });

    it("counts text in parentheses as one word and gives it as a separate sentence", () => {
        const all = tokens("Make sure that the switch is released (the legend is off).");
        const count = countWords(all, { properNouns : noPhrases });
        expect(count.words).toBe(8);
        expect(count.parentheticals).toHaveLength(1);
        expect(count.parentheticals[0]!.map((token) => token.text)).toEqual(["the", "legend", "is", "off"]);
        expect(words("Remove the safety pin (10).")).toBe(5);
        expect(words("An unmatched ( bracket.")).toBe(3);
    });

    it("counts a multi-word proper noun from the glossary, and a group of capitalized words, as one word", () => {
        const proper = new PhraseMatcher({ caseSensitive : true });
        proper.add("Web Worker", true);
        expect(words("Web Worker threads run code.", proper)).toBe(4);
        expect(words("A web worker thread runs code.", proper)).toBe(6);
        expect(words("The first president of the United States of America was George Washington.")).toBe(10);
        expect(words("Use the Long Animation Frames API to measure.")).toBe(5);
    });

    it("finds only the top-level parentheses", () => {
        expect(topLevelParentheses(tokens("a (b (c) d) e (f)"))).toHaveLength(2);
    });
});

describe("lemmas", () => {
    it("gives the possible base forms of a word", () => {
        expect(lemmas("monitors")).toContain("monitor");
        expect(lemmas("batteries")).toContain("battery");
        expect(lemmas("pushes")).toContain("push");
        expect(lemmas("enabled")).toContain("enable");
        expect(lemmas("debugged")).toContain("debug");
        expect(lemmas("applied")).toContain("apply");
        expect(lemmas("running")).toContain("run");
        expect(lemmas("making")).toContain("make");
        expect(lemmas("dying")).toContain("die");
        expect(lemmas("page's")).toContain("page");
        expect(hasLemmaIn("installs", new Set(["install"]))).toBe(true);
    });

    it("finds participles", () => {
        expect(isParticiple("written")).toBe(true);
        expect(isParticiple("started")).toBe(true);
        expect(isParticiple("speed")).toBe(false);
        expect(isParticiple("need")).toBe(false);
    });
});

describe("isInstruction", () => {
    const instruction = (text : string) : boolean => isInstruction(tokens(text), verbs);

    it("finds imperative sentences", () => {
        expect(instruction("Run the tests.")).toBe(true);
        expect(instruction("Then run the tests.")).toBe(true);
        expect(instruction("Please open the file.")).toBe(true);
        expect(instruction("Do not stop the worker.")).toBe(true);
        expect(instruction("Don't stop the worker.")).toBe(true);
        expect(instruction("Never stop the worker.")).toBe(true);
        expect(instruction("Make sure that the port is open.")).toBe(true);
        expect(instruction("Be careful with the cache.")).toBe(true);
        expect(instruction("If the tests fail, run the build again.")).toBe(true);
        expect(instruction("To run the tests, use `pnpm test`.")).toBe(true);
        expect(instruction("Update tests before the release.")).toBe(true);
    });

    it("does not find descriptive sentences", () => {
        expect(instruction("The monitor runs every second.")).toBe(false);
        expect(instruction("Test runs take 5 s.")).toBe(false);
        expect(instruction("Build is fast.")).toBe(false);
        expect(instruction("Use of the cache is optional.")).toBe(false);
        expect(instruction("If the tests fail the build stops.")).toBe(false);
        expect(instruction("When the page is hidden, the monitor stops.")).toBe(false);
        expect(instruction("`stop()` releases the timers.")).toBe(false);
        expect(instruction("Then.")).toBe(false);
        expect(instruction("If, then.")).toBe(false);
        expect(instruction("(")).toBe(false);
    });
});

describe("isVerbUse", () => {
    const verbAt = (text : string, word : string) : boolean => {
        const all = tokens(text);
        return isVerbUse(all, all.findIndex((token) => token.lower === word), verbs);
    };

    it("finds verbs from the words near them", () => {
        expect(verbAt("Run the tests.", "run")).toBe(true);
        expect(verbAt("You can run the tests.", "run")).toBe(true);
        expect(verbAt("Do not call it.", "call")).toBe(true);
        expect(verbAt("It is called twice.", "called")).toBe(true);
        expect(verbAt("It returned the value.", "returned")).toBe(true);
        expect(verbAt("The monitor runs every second.", "runs")).toBe(true);
        expect(verbAt("This function returns the value.", "returns")).toBe(true);
        expect(verbAt("The worker is running now.", "running")).toBe(true);
        expect(verbAt("Stop it by calling `stop()`.", "calling")).toBe(true);
        expect(verbAt("Calling `stop()` frees it.", "calling")).toBe(true);
        expect(verbAt("To call the API, use a key.", "call")).toBe(true);
    });

    it("does not find nouns and adjectives", () => {
        expect(verbAt("Each call costs time.", "call")).toBe(false);
        expect(verbAt("A test run takes time.", "run")).toBe(false);
        expect(verbAt("The return value is a number.", "return")).toBe(false);
        expect(verbAt("API calls are slow.", "calls")).toBe(false);
        expect(verbAt("The running process stops.", "running")).toBe(false);
        expect(verbAt("Run time", "run")).toBe(false);
        expect(verbAt("2 runs", "runs")).toBe(false);
        expect(verbAt("The value returned stays.", "returned")).toBe(false);
        expect(verbAt("For running", "running")).toBe(false);
    });

    it("finds no verb at a punctuation token", () => {
        expect(isVerbUse(tokens(", x"), 0, verbs)).toBe(false);
    });
});

describe("findPassives", () => {
    const passives = (text : string) => {
        const all = tokens(text);
        return findPassives(all).map((passive) => ({
            words : all.slice(passive.auxiliary, passive.participle + 1).map((token) => token.text).join(" "),
            obligation : passive.obligation,
            modal : passive.modal,
            agent : passive.agent,
            inCondition : passive.inCondition,
        }));
    };

    it("finds a form of 'be' and a participle, with the details", () => {
        expect(passives("The file is created by the build.")).toEqual([{ words : "is created", obligation : false, modal : false, agent : true, inCondition : false }]);
        expect(passives("The token must be set first.")).toEqual([{ words : "be set", obligation : true, modal : true, agent : false, inCondition : false }]);
        expect(passives("The value has to be written.")[0]!.obligation).toBe(true);
        expect(passives("It can be used.")[0]).toMatchObject({ modal : true, obligation : false });
        expect(passives("Make sure that the server is not started.")[0]).toMatchObject({ words : "is not started", inCondition : true });
        expect(passives("The callback gets called.")).toHaveLength(1);
    });

    it("ignores a form of 'be' without a participle", () => {
        expect(passives("The value is positive.")).toEqual([]);
        expect(passives("The rate is speed.")).toEqual([]);
    });
});

describe("small helpers", () => {
    it("finds the next counted token and object starts", () => {
        const all = tokens(", the value");
        expect(nextCounted(all, 0)).toBe(1);
        expect(nextCounted(all, 5)).toBe(-1);
        expect(startsObject(all[1])).toBe(true);
        expect(startsObject(undefined)).toBe(false);
        expect(startsObject(all[0])).toBe(false);
    });
});

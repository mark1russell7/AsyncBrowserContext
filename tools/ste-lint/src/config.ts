/**
 * The configuration file `ste.config.json`, and the configuration that the
 * linter uses after it reads the file, the environment and the defaults.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isRuleId, RULE_IDS, type RuleId, type RuleSetting, type Severity } from "./types.js";
import { DEFAULT_WORD_LIST, type WordListEntry } from "./word-list.js";

export const CONFIG_FILE_NAME = "ste.config.json";

/** The environment variable that gives the path of the local dictionary. It has priority over `dictionaryPath`. */
export const DICTIONARY_ENV = "STE_DICTIONARY";

/** An entry of `wordList` in the configuration file. */
export type WordListEntryConfig = {
    /** The ID of a default entry to change. A new entry gets the first word of `match` as its ID. */
    readonly id? : string;
    readonly match? : string | readonly string[];
    readonly suggest? : string | null;
    readonly note? : string | null;
    readonly severity? : RuleSetting;
    readonly verbOnly? : boolean;
};

export type LimitsConfig = {
    /** The maximum number of words in an instruction. Default: 20 (STE Rule 5.1). */
    readonly instructionWords? : number;
    /** The maximum number of words in a description. Default: 25 (STE Rule 6.3). */
    readonly descriptionWords? : number;
    /** The maximum number of sentences in a paragraph. Default: 6 (STE Rule 6.6). */
    readonly paragraphSentences? : number;
    /** The maximum number of nouns in a noun cluster. Default: 3 (STE Rule 2.1). */
    readonly nounClusterNouns? : number;
};

/** The contents of `ste.config.json`. All properties are optional. */
export type SteConfigFile = {
    readonly $schema? : string;
    readonly include? : readonly string[];
    readonly ignore? : readonly string[];
    readonly technicalNouns? : readonly string[];
    readonly technicalVerbs? : readonly string[];
    readonly properNouns? : readonly string[];
    readonly allowedWords? : readonly string[];
    readonly rules? : Readonly<Record<string, RuleSetting>>;
    readonly wordList? : readonly WordListEntryConfig[];
    readonly limits? : LimitsConfig;
    readonly dictionaryPath? : string | null;
};

export type Limits = Required<LimitsConfig>;

export type ResolvedConfig = {
    /** The directory that `include` and `ignore` are relative to. */
    readonly root : string;
    /** The configuration file, or null when the linter uses the defaults. */
    readonly configFile : string | null;
    readonly include : readonly string[];
    readonly ignore : readonly string[];
    readonly technicalNouns : readonly string[];
    readonly technicalVerbs : readonly string[];
    readonly properNouns : readonly string[];
    readonly allowedWords : readonly string[];
    /** The rule settings from the configuration. A rule without a setting uses its default severity. */
    readonly rules : Readonly<Partial<Record<RuleId, RuleSetting>>>;
    readonly wordList : readonly WordListEntry[];
    readonly limits : Limits;
    /** The absolute path of the local dictionary, or null. */
    readonly dictionaryPath : string | null;
    /** Where the dictionary path came from. */
    readonly dictionarySource : "env" | "config" | null;
};

export const DEFAULT_INCLUDE : readonly string[] = [
    "README.md",
    "docs/**/*.{md,mdx}",
    "packages/*/README.md",
    "packages/site/**/*.{md,mdx}",
    "packages/*/src/**/*.{ts,tsx}",
    "packages/*/build/**/*.{ts,tsx}",
    "packages/*/commands/**/*.{ts,tsx}",
    "packages/*/*.config.{ts,mts}",
    "packages/site/content/**/*.{ts,tsx}",
];

export const DEFAULT_IGNORE : readonly string[] = [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.d.ts",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
];

export const DEFAULT_LIMITS : Limits = {
    instructionWords : 20,
    descriptionWords : 25,
    paragraphSentences : 6,
    nounClusterNouns : 3,
};

/** An error in the configuration. */
export class ConfigError extends Error {
    override readonly name : string = "ConfigError";
}

const SETTINGS : readonly string[] = ["error", "warning", "off"];

const KNOWN_KEYS = new Set([
    "$schema", "include", "ignore", "technicalNouns", "technicalVerbs", "properNouns", "allowedWords",
    "rules", "wordList", "limits", "dictionaryPath",
]);

const WORD_LIST_KEYS = new Set(["id", "match", "suggest", "note", "severity", "verbOnly"]);

/** This function makes sure that `value` is a valid configuration. It throws a `ConfigError` that lists all problems. */
export function validateConfig(value : unknown, source : string) : SteConfigFile {
    const problems : string[] = [];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new ConfigError(`${source}: the configuration must be a JSON object.`);
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        if (!KNOWN_KEYS.has(key)) problems.push(`"${key}" is not a known property. Known properties: ${[...KNOWN_KEYS].join(", ")}.`);
    }
    for (const key of ["include", "ignore", "technicalNouns", "technicalVerbs", "properNouns", "allowedWords"]) {
        const item = record[key];
        if (item !== undefined && !(Array.isArray(item) && item.every((entry) => typeof entry === "string"))) {
            problems.push(`"${key}" must be an array of strings.`);
        }
    }
    const rules = record["rules"];
    if (rules !== undefined) {
        if (typeof rules !== "object" || rules === null || Array.isArray(rules)) {
            problems.push(`"rules" must be an object.`);
        } else {
            for (const [id, setting] of Object.entries(rules)) {
                if (!isRuleId(id)) problems.push(`"rules.${id}" is not a known rule. Known rules: ${RULE_IDS.join(", ")}.`);
                if (typeof setting !== "string" || !SETTINGS.includes(setting)) problems.push(`"rules.${id}" must be "error", "warning" or "off".`);
            }
        }
    }
    const limits = record["limits"];
    if (limits !== undefined) {
        if (typeof limits !== "object" || limits === null || Array.isArray(limits)) {
            problems.push(`"limits" must be an object.`);
        } else {
            for (const [key, limit] of Object.entries(limits)) {
                if (!Object.hasOwn(DEFAULT_LIMITS, key)) problems.push(`"limits.${key}" is not a known limit. Known limits: ${Object.keys(DEFAULT_LIMITS).join(", ")}.`);
                if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) problems.push(`"limits.${key}" must be an integer of 1 or more.`);
            }
        }
    }
    const dictionaryPath = record["dictionaryPath"];
    if (dictionaryPath !== undefined && dictionaryPath !== null && typeof dictionaryPath !== "string") {
        problems.push(`"dictionaryPath" must be a string or null.`);
    }
    const wordList = record["wordList"];
    if (wordList !== undefined) {
        if (!Array.isArray(wordList)) {
            problems.push(`"wordList" must be an array.`);
        } else {
            wordList.forEach((item : unknown, index : number) => problems.push(...validateWordListEntry(item, `wordList[${index}]`)));
        }
    }
    if (problems.length > 0) throw new ConfigError(`${source}:\n  - ${problems.join("\n  - ")}`);
    return record as SteConfigFile;
}

function validateWordListEntry(item : unknown, where : string) : string[] {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [`"${where}" must be an object.`];
    const problems : string[] = [];
    const entry = item as Record<string, unknown>;
    for (const key of Object.keys(entry)) {
        if (!WORD_LIST_KEYS.has(key)) problems.push(`"${where}.${key}" is not a known property.`);
    }
    const match = entry["match"];
    const matchValid = typeof match === "string" || (Array.isArray(match) && match.length > 0 && match.every((word) => typeof word === "string"));
    if (match !== undefined && !matchValid) problems.push(`"${where}.match" must be a string or an array of strings.`);
    if (entry["id"] !== undefined && typeof entry["id"] !== "string") problems.push(`"${where}.id" must be a string.`);
    if (entry["id"] === undefined && match === undefined) problems.push(`"${where}" must have "id" or "match".`);
    for (const key of ["suggest", "note"]) {
        const text = entry[key];
        if (text !== undefined && text !== null && typeof text !== "string") problems.push(`"${where}.${key}" must be a string or null.`);
    }
    const severity = entry["severity"];
    if (severity !== undefined && (typeof severity !== "string" || !SETTINGS.includes(severity))) problems.push(`"${where}.severity" must be "error", "warning" or "off".`);
    if (entry["verbOnly"] !== undefined && typeof entry["verbOnly"] !== "boolean") problems.push(`"${where}.verbOnly" must be true or false.`);
    return problems;
}

/**
 * This function merges the default word list and the entries of the
 * configuration. An entry with the ID (or the first `match` word) of a
 * default entry changes that entry. The severity "off" removes the entry
 * with that ID, and it removes the `match` words from all entries.
 */
export function mergeWordList(defaults : readonly WordListEntry[], overrides : readonly WordListEntryConfig[]) : WordListEntry[] {
    const entries = new Map<string, WordListEntry | null>(defaults.map((entry) => [entry.id, entry]));
    for (const override of overrides) {
        const match = override.match === undefined ? undefined : typeof override.match === "string" ? [override.match] : [...override.match];
        const id = override.id ?? match![0]!;
        const base = entries.get(id) ?? null;
        if (override.severity === "off") {
            entries.set(id, null);
            const removed = new Set((match ?? []).map((word) => word.toLowerCase()));
            for (const [key, entry] of entries) {
                if (entry === null) continue;
                const kept = entry.match.filter((word) => !removed.has(word.toLowerCase()));
                entries.set(key, kept.length === 0 ? null : { ...entry, match : kept });
            }
            continue;
        }
        const merged : WordListEntry = {
            id,
            match : match ?? base?.match ?? [id],
            suggest : override.suggest !== undefined ? override.suggest : base?.suggest ?? null,
            note : override.note !== undefined ? override.note : base?.note ?? null,
            severity : (override.severity as Severity | undefined) ?? base?.severity ?? "error",
            verbOnly : override.verbOnly ?? base?.verbOnly ?? false,
            context : base?.context ?? null,
        };
        entries.set(id, merged);
    }
    return [...entries.values()].filter((entry) : entry is WordListEntry => entry !== null);
}

/** This function expands a leading `~/` to the home directory, and makes the path absolute. */
export function resolvePath(path : string, base : string) : string {
    const expanded = path === "~" ? homedir() : path.startsWith("~/") || path.startsWith("~\\") ? join(homedir(), path.slice(2)) : path;
    return resolve(base, expanded);
}

export type ResolveOptions = {
    /** The directory of the configuration file, or the working directory. */
    readonly root : string;
    readonly configFile? : string | null;
    /** The working directory. `STE_DICTIONARY` is relative to it. */
    readonly cwd? : string;
    readonly env? : Readonly<Record<string, string | undefined>>;
};

/** This function applies the defaults and the environment to a configuration file. */
export function resolveConfig(file : SteConfigFile, options : ResolveOptions) : ResolvedConfig {
    const env = options.env ?? {};
    const cwd = options.cwd ?? options.root;
    const fromEnv = env[DICTIONARY_ENV];
    let dictionaryPath : string | null = null;
    let dictionarySource : ResolvedConfig["dictionarySource"] = null;
    if (fromEnv !== undefined && fromEnv.trim().length > 0) {
        dictionaryPath = resolvePath(fromEnv.trim(), cwd);
        dictionarySource = "env";
    } else if (typeof file.dictionaryPath === "string" && file.dictionaryPath.trim().length > 0) {
        dictionaryPath = resolvePath(file.dictionaryPath.trim(), options.root);
        dictionarySource = "config";
    }
    const rules : Partial<Record<RuleId, RuleSetting>> = {};
    for (const [id, setting] of Object.entries(file.rules ?? {})) {
        if (isRuleId(id)) rules[id] = setting;
    }
    return {
        root : options.root,
        configFile : options.configFile ?? null,
        include : file.include ?? DEFAULT_INCLUDE,
        ignore : file.ignore ?? DEFAULT_IGNORE,
        technicalNouns : file.technicalNouns ?? [],
        technicalVerbs : file.technicalVerbs ?? [],
        properNouns : file.properNouns ?? [],
        allowedWords : file.allowedWords ?? [],
        rules,
        wordList : mergeWordList(DEFAULT_WORD_LIST, file.wordList ?? []),
        limits : { ...DEFAULT_LIMITS, ...file.limits },
        dictionaryPath,
        dictionarySource,
    };
}

/** The first `ste.config.json` in `cwd` or one of its parent directories, or null. */
export function findConfigFile(cwd : string) : string | null {
    let directory = resolve(cwd);
    for (;;) {
        const candidate = join(directory, CONFIG_FILE_NAME);
        if (existsSync(candidate)) return candidate;
        const parent = dirname(directory);
        if (parent === directory) return null;
        directory = parent;
    }
}

export type LoadOptions = {
    readonly cwd : string;
    /** An explicit configuration file. Without it, the linter looks for `ste.config.json`. */
    readonly configPath? : string;
    readonly env? : Readonly<Record<string, string | undefined>>;
};

/** This function reads the configuration file, if there is one, and resolves it. */
export function loadConfig(options : LoadOptions) : ResolvedConfig {
    const configFile = options.configPath !== undefined ? resolve(options.cwd, options.configPath) : findConfigFile(options.cwd);
    const env = options.env ?? {};
    if (configFile === null) return resolveConfig({}, { root : resolve(options.cwd), cwd : options.cwd, env });
    let text : string;
    try {
        text = readFileSync(configFile, "utf8");
    } catch (error) {
        throw new ConfigError(`Cannot read the configuration file ${configFile}: ${(error as Error).message}`);
    }
    let value : unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new ConfigError(`${configFile}: the file is not valid JSON: ${(error as Error).message}`);
    }
    const file = validateConfig(value, configFile);
    return resolveConfig(file, { root : dirname(configFile), configFile, cwd : options.cwd, env });
}

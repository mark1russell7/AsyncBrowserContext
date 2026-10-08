/**
 * The command-line interface. `runCli` does not use `process` directly, so
 * the tests can give it arguments, an environment and output functions.
 */

import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { ConfigError, DICTIONARY_ENV, loadConfig, type ResolvedConfig } from "./config.js";
import { DictionaryError, loadDictionary, type Dictionary } from "./dictionary.js";
import { findFiles } from "./files.js";
import { formatJson, formatText, summarize } from "./format.js";
import { buildLexicon } from "./lexicon.js";
import { fileKind, Linter } from "./lint.js";
import type { Finding } from "./types.js";

export type CliIo = {
    readonly cwd : string;
    readonly env : Readonly<Record<string, string | undefined>>;
    readonly stdout : (text : string) => void;
    readonly stderr : (text : string) => void;
};

export type CliOptions = {
    readonly patterns : readonly string[];
    readonly format : "text" | "json";
    readonly maxWarnings : number | null;
    readonly configPath : string | null;
    readonly help : boolean;
};

/** An incorrect command line. */
export class UsageError extends Error {
    override readonly name : string = "UsageError";
}

export const USAGE : string = `Usage: ste-lint [options] [patterns...]

ste-lint examines the prose in Markdown files, MDX files and TypeScript doc
comments. It finds text that does not obey the writing rules of ASD-STE100
Simplified Technical English. The tool is an automated approximation of
these rules. It does not certify that a text obeys the standard.

Without patterns, ste-lint uses the "include" patterns of ste.config.json,
or the default patterns. Patterns are relative to the working directory.

Options:
  --format <text|json>  The output format. The default is "text".
  --max-warnings <n>    Exit with code 1 when there are more than n warnings.
  --config <path>       Use this configuration file.
  -h, --help            Show this help.

Exit codes:
  0  No errors, and not more warnings than the maximum.
  1  One or more errors, or more warnings than the maximum.
  2  An incorrect command line or configuration, or no files.

Environment:
  ${DICTIONARY_ENV}  The path of a local dictionary file. This path has
                  priority over "dictionaryPath" in ste.config.json.
`;

function optionValue(argv : readonly string[], index : number, name : string) : string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`The option ${name} needs a value.`);
    return value;
}

/** This function reads the command-line arguments. */
export function parseArgs(argv : readonly string[]) : CliOptions {
    const patterns : string[] = [];
    let format : CliOptions["format"] = "text";
    let maxWarnings : number | null = null;
    let configPath : string | null = null;
    let help = false;
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i]!;
        const [name, inline] = argument.startsWith("--") && argument.includes("=") ? [argument.slice(0, argument.indexOf("=")), argument.slice(argument.indexOf("=") + 1)] : [argument, undefined];
        const value = () : string => {
            if (inline !== undefined) return inline;
            const next = optionValue(argv, i, name);
            i++;
            return next;
        };
        switch (name) {
            case "-h":
            case "--help":
                help = true;
                break;
            case "--format": {
                const text = value();
                if (text !== "text" && text !== "json") throw new UsageError(`The format must be "text" or "json", not "${text}".`);
                format = text;
                break;
            }
            case "--max-warnings": {
                const text = value();
                const count = Number(text);
                if (!/^\d+$/.test(text) || !Number.isSafeInteger(count)) throw new UsageError(`--max-warnings must be an integer of 0 or more, not "${text}".`);
                maxWarnings = count;
                break;
            }
            case "--config":
                configPath = value();
                break;
            default:
                if (argument.startsWith("-") && argument !== "-") throw new UsageError(`"${argument}" is not a known option. Use --help to show the options.`);
                patterns.push(argument);
        }
    }
    return { patterns, format, maxWarnings, configPath, help };
}

function displayPath(path : string, cwd : string) : string {
    const shown = relative(cwd, path);
    return (shown.length > 0 && !shown.startsWith("..") ? shown : path).split(sep).join("/");
}

function loadOptionalDictionary(config : ResolvedConfig, io : CliIo) : Dictionary | null {
    if (config.dictionaryPath === null) return null;
    if (!existsSync(config.dictionaryPath)) {
        const from = config.dictionarySource === "env" ? DICTIONARY_ENV : "dictionaryPath";
        io.stderr(`ste-lint: the dictionary file ${config.dictionaryPath} (from ${from}) does not exist. The unknown-word rule is off.\n`);
        return null;
    }
    return loadDictionary(config.dictionaryPath);
}

/** This function starts the linter with command-line arguments. The result is the exit code. */
export function runCli(argv : readonly string[], io : CliIo) : number {
    let options : CliOptions;
    try {
        options = parseArgs(argv);
    } catch (error) {
        io.stderr(`ste-lint: ${(error as Error).message}\n`);
        return 2;
    }
    if (options.help) {
        io.stdout(USAGE);
        return 0;
    }

    let config : ResolvedConfig;
    let dictionary : Dictionary | null;
    try {
        config = loadConfig({ cwd : io.cwd, env : io.env, ...(options.configPath === null ? {} : { configPath : options.configPath }) });
        dictionary = loadOptionalDictionary(config, io);
    } catch (error) {
        if (error instanceof ConfigError || error instanceof DictionaryError) {
            io.stderr(`ste-lint: ${error.message}\n`);
            return 2;
        }
        throw error;
    }

    const explicit = options.patterns.length > 0;
    const files = (explicit
        ? findFiles({ root : io.cwd, include : options.patterns, ignore : config.ignore })
        : findFiles({ root : config.root, include : config.include, ignore : config.ignore })
    ).filter((file) => fileKind(file) !== null);
    if (files.length === 0) {
        io.stderr(explicit ? "ste-lint: no files match the patterns.\n" : "ste-lint: no files to examine.\n");
        return explicit ? 2 : 0;
    }

    const linter = new Linter(config, buildLexicon(config, dictionary));
    const findings : Finding[] = [];
    let failed = false;
    for (const file of files) {
        try {
            findings.push(...linter.lintFile(file, displayPath(file, resolve(io.cwd))));
        } catch (error) {
            io.stderr(`ste-lint: cannot examine ${file}: ${(error as Error).message}\n`);
            failed = true;
        }
    }

    const summary = summarize(findings, files.length);
    io.stdout(options.format === "json" ? formatJson(findings, summary) : formatText(findings, summary));
    const tooManyWarnings = options.maxWarnings !== null && summary.warnings > options.maxWarnings;
    if (tooManyWarnings && options.format === "text") {
        io.stderr(`ste-lint: ${summary.warnings} warnings. The maximum is ${options.maxWarnings}.\n`);
    }
    if (failed) return 2;
    return summary.errors > 0 || tooManyWarnings ? 1 : 0;
}

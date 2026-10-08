/**
 * `@lag/ste-lint`: a linter for prose in Markdown, MDX and TypeScript doc
 * comments. It is an automated approximation of the writing rules of
 * ASD-STE100 Simplified Technical English. It does not certify that a text
 * obeys the standard.
 */

export {
    CONFIG_FILE_NAME,
    ConfigError,
    DEFAULT_IGNORE,
    DEFAULT_INCLUDE,
    DEFAULT_LIMITS,
    DICTIONARY_ENV,
    findConfigFile,
    loadConfig,
    mergeWordList,
    resolveConfig,
    validateConfig,
    type Limits,
    type LimitsConfig,
    type ResolvedConfig,
    type SteConfigFile,
    type WordListEntryConfig,
} from "./config.js";
export { Dictionary, DICTIONARY_FORMAT, DictionaryError, loadDictionary, parseDictionary, type DictionaryEntry, type DictionaryLookup } from "./dictionary.js";
export { findFiles, globToRegExp } from "./files.js";
export { formatJson, formatText, summarize, type RuleCount, type Summary } from "./format.js";
export { buildLexicon, type Lexicon } from "./lexicon.js";
export { fileKind, Linter, lintText, type FileKind } from "./lint.js";
export { getRule, RULES, type Rule } from "./rules/index.js";
export { parseArgs, runCli, USAGE, type CliIo, type CliOptions } from "./run-cli.js";
export { isRuleId, RULE_IDS, type Finding, type RuleId, type RuleSetting, type Severity } from "./types.js";
export { DEFAULT_WORD_LIST, type WordListEntry } from "./word-list.js";

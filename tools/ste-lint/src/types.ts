export type Severity = "error" | "warning";

/** The setting of a rule in `ste.config.json`. */
export type RuleSetting = Severity | "off";

export const RULE_IDS = [
    "sentence-length",
    "paragraph-length",
    "modal-verb",
    "semicolon",
    "latin-abbreviation",
    "about-quantity",
    "word-list",
    "gendered-pronoun",
    "first-person",
    "passive-instruction",
    "noun-cluster",
    "missing-subject",
    "ing-verb",
    "unknown-word",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

/**
 * The ID of the findings about the directive comments, for example a rule ID
 * that is not known. It is not a rule: the configuration cannot change it,
 * and a directive cannot stop it.
 */
export const DIRECTIVE_ID = "directive";

/** The ID of a finding: a rule ID, or `directive`. */
export type FindingId = RuleId | typeof DIRECTIVE_ID;

/** One problem that the linter found. Lines and columns start at 1. */
export type Finding = {
    readonly file : string;
    readonly line : number;
    readonly column : number;
    readonly endLine : number;
    readonly endColumn : number;
    readonly ruleId : FindingId;
    readonly severity : Severity;
    readonly message : string;
};

export function isRuleId(value : string) : value is RuleId {
    return (RULE_IDS as readonly string[]).includes(value);
}

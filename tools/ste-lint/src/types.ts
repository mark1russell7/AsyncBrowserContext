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

/** One problem that the linter found. Lines and columns start at 1. */
export type Finding = {
    readonly file : string;
    readonly line : number;
    readonly column : number;
    readonly endLine : number;
    readonly endColumn : number;
    readonly ruleId : RuleId;
    readonly severity : Severity;
    readonly message : string;
};

export function isRuleId(value : string) : value is RuleId {
    return (RULE_IDS as readonly string[]).includes(value);
}

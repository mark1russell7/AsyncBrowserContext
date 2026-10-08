import { RULE_IDS, type Finding, type RuleId } from "./types.js";

export type RuleCount = {
    readonly errors : number;
    readonly warnings : number;
};

export type Summary = {
    /** The number of files that the linter examined. */
    readonly files : number;
    readonly filesWithFindings : number;
    readonly errors : number;
    readonly warnings : number;
    /** The counts of each rule that has findings, in the order of the rule list. */
    readonly byRule : Readonly<Partial<Record<RuleId, RuleCount>>>;
};

/** This function counts the findings, by severity and by rule. */
export function summarize(findings : readonly Finding[], files : number) : Summary {
    const byRule : Partial<Record<RuleId, { errors : number; warnings : number }>> = {};
    for (const id of RULE_IDS) {
        const own = findings.filter((finding) => finding.ruleId === id);
        if (own.length === 0) continue;
        byRule[id] = {
            errors : own.filter((finding) => finding.severity === "error").length,
            warnings : own.filter((finding) => finding.severity === "warning").length,
        };
    }
    return {
        files,
        filesWithFindings : new Set(findings.map((finding) => finding.file)).size,
        errors : findings.filter((finding) => finding.severity === "error").length,
        warnings : findings.filter((finding) => finding.severity === "warning").length,
        byRule,
    };
}

const plural = (count : number, word : string) : string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The findings as text: one group for each file, then a summary and the counts by rule. */
export function formatText(findings : readonly Finding[], summary : Summary) : string {
    const lines : string[] = [];
    const byFile = new Map<string, Finding[]>();
    for (const finding of findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
    }
    for (const [file, list] of byFile) {
        lines.push(file);
        const positions = list.map((finding) => `${finding.line}:${finding.column}`);
        const width = Math.max(...positions.map((position) => position.length));
        list.forEach((finding, index) => {
            lines.push(`  ${positions[index]!.padEnd(width)}  ${finding.severity.padEnd(7)}  ${finding.message}  ${finding.ruleId}`);
        });
        lines.push("");
    }
    const total = summary.errors + summary.warnings;
    if (total === 0) {
        lines.push(`No problems found in ${plural(summary.files, "file")}.`);
        return lines.join("\n") + "\n";
    }
    lines.push(`${plural(total, "problem")} (${plural(summary.errors, "error")}, ${plural(summary.warnings, "warning")}) in ${plural(summary.filesWithFindings, "file")} of ${summary.files}.`);
    lines.push("");
    lines.push("Findings by rule:");
    const entries = Object.entries(summary.byRule) as Array<[RuleId, RuleCount]>;
    const width = Math.max(...entries.map(([id]) => id.length));
    for (const [id, count] of entries) {
        const parts = [count.errors > 0 ? plural(count.errors, "error") : null, count.warnings > 0 ? plural(count.warnings, "warning") : null].filter((part) => part !== null);
        lines.push(`  ${id.padEnd(width)}  ${String(count.errors + count.warnings).padStart(5)}  (${parts.join(", ")})`);
    }
    return lines.join("\n") + "\n";
}

/** The findings and the summary as JSON. */
export function formatJson(findings : readonly Finding[], summary : Summary) : string {
    return JSON.stringify({ tool : "ste-lint", summary, findings }, null, 2) + "\n";
}

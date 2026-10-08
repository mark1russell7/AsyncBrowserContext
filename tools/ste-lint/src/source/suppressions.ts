import type { Directive } from "./blocks.js";

/** A range of the file in which some rules (or all rules) do not report findings. */
export type Suppression = {
    readonly start : number;
    readonly end : number;
    /** The rule IDs, or null for all rules. */
    readonly rules : ReadonlySet<string> | null;
};

type OpenRange = { start : number; rules : Set<string> | null };

/**
 * This class collects suppressions from directive comments:
 *
 * - `ste-disable [rules]` starts a range. `ste-enable [rules]` stops it.
 *   Without an `ste-enable`, the range continues to the end of the file.
 * - `ste-disable-next [rules]` applies to the next block only: the next
 *   paragraph, heading, list item or table row in Markdown, or the next doc
 *   comment in TypeScript.
 *
 * Without rule IDs, a directive applies to all rules.
 */
export class SuppressionCollector {
    private readonly ranges : Suppression[] = [];
    private readonly open : OpenRange[] = [];
    private pending : Set<string> | null | undefined = undefined;

    directive(directive : Directive) : void {
        const rules = directive.rules.length === 0 ? null : new Set(directive.rules);
        if (directive.command === "disable-next") {
            this.pending = rules;
        } else if (directive.command === "disable") {
            this.open.push({ start : directive.offset, rules });
        } else {
            this.enable(directive.offset, rules);
        }
    }

    /**
     * A plain `ste-enable` stops all open ranges. An `ste-enable` with rule
     * IDs stops those rules only. A range for all rules stops only at a
     * plain `ste-enable`.
     */
    private enable(offset : number, rules : Set<string> | null) : void {
        for (let i = this.open.length - 1; i >= 0; i--) {
            const range = this.open[i]!;
            if (rules === null) {
                this.ranges.push({ start : range.start, end : offset, rules : range.rules });
                this.open.splice(i, 1);
                continue;
            }
            if (range.rules === null) continue;
            const closing = [...range.rules].filter((rule) => rules.has(rule));
            if (closing.length === 0) continue;
            this.ranges.push({ start : range.start, end : offset, rules : new Set(closing) });
            this.open.splice(i, 1);
            const remaining = [...range.rules].filter((rule) => !rules.has(rule));
            if (remaining.length > 0) this.open.push({ start : range.start, rules : new Set(remaining) });
        }
    }

    /** This method tells the collector about the next block, so that a pending `ste-disable-next` applies to it. */
    block(start : number, end : number) : void {
        if (this.pending === undefined) return;
        this.ranges.push({ start, end, rules : this.pending });
        this.pending = undefined;
    }

    /** The suppressions. Open ranges stop at `fileEnd`. */
    finish(fileEnd : number) : Suppression[] {
        return [...this.ranges, ...this.open.map((range) => ({ start : range.start, end : fileEnd, rules : range.rules }))];
    }
}

/** True when a suppression covers a finding of `rule` at `offset`. */
export function isSuppressed(suppressions : readonly Suppression[], rule : string, offset : number) : boolean {
    return suppressions.some((range) => offset >= range.start && offset <= range.end && (range.rules === null || range.rules.has(rule)));
}

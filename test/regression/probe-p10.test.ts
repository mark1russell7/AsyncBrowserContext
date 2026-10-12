import { describe, expect, it } from "vitest";

/**
 * The probe P10 of the review of 2026-10-08 (docs/remediation-plan.md,
 * Appendix B). The other probes are in probes.test.ts. This probe has its own
 * file, because esbuild cannot change a top-level `for await` for the target
 * ES2016. Thus only this file is not in the esbuild project (vitest.config.ts).
 */

async function* numbers() : AsyncGenerator<number> {
    yield 1;
    yield 2;
    yield 3;
}

// P10: a top-level for await in a module
const topLevel : number[] = [];
for await (const value of numbers()) {
    topLevel.push(value);
}

describe("regression probes of the review", () => {
    it("P10: a top-level for await in a module completes", () => {
        expect(topLevel).toEqual([1, 2, 3]);
    });
});

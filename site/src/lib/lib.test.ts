import { describe, expect, it, vi } from "vitest";
import { formatBytes, formatCount, formatDate, formatDateTime, formatMs, formatPercent, formatValue, shortCommit } from "./format";
import { memoizePromise, memoizePromiseByKey } from "./memoize-promise";

describe("format", () => {
    it("formats durations", () => {
        expect(formatMs(0.123)).toBe("0.12 ms");
        expect(formatMs(3.46)).toBe("3.5 ms");
        expect(formatMs(120.4)).toBe("120 ms");
        expect(formatMs(1_250)).toBe("1.25 s");
        expect(formatMs(125_000)).toBe("2 min 5 s");
        expect(formatMs(Number.NaN)).toBe("–");
    });

    it("formats percentages, bytes, units and counts", () => {
        expect(formatPercent(87.54)).toBe("87.5%");
        expect(formatPercent(100)).toBe("100%");
        expect(formatPercent(undefined)).toBe("No data");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatValue(0.25, "ratio")).toBe("25%");
        expect(formatValue(3, "{gc}")).toBe("3 gc");
        expect(formatCount(1, "test")).toBe("1 test");
        expect(formatCount(1200, "test")).toBe("1,200 tests");
        expect(shortCommit("f6e5d4c3b2a1")).toBe("f6e5d4c");
    });

    it("formats dates in UTC", () => {
        expect(formatDateTime("2026-10-06T09:41:33.000Z")).toBe("6 Oct 2026, 09:41 UTC");
        expect(formatDate("2026-10-06T23:59:00.000Z")).toBe("6 Oct 2026");
        expect(formatDate("soon")).toBe("soon");
    });
});

describe("memoizePromise", () => {
    it("returns the same promise and tries again after a rejection", async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error("first"))
            .mockResolvedValue("ok");
        const memo = memoizePromise(load);
        await expect(memo()).rejects.toThrow("first");
        const second = memo();
        expect(memo()).toBe(second);
        await expect(second).resolves.toBe("ok");
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("keeps one entry for each key", async () => {
        const load = vi.fn((key : string) => Promise.resolve(key.toUpperCase()));
        const memo = memoizePromiseByKey(load);
        await expect(memo("a")).resolves.toBe("A");
        await memo("a");
        await memo("b");
        expect(load).toHaveBeenCalledTimes(2);
    });
});

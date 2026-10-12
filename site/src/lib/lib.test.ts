import { describe, expect, it, vi } from "vitest";
import { formatBytes, formatCount, formatDate, formatDateTime, formatMs, formatPercent, formatValue } from "./format";
import { memoizePromise } from "./memoize-promise";
import { pathWithoutHtmlFile } from "./page-path";

describe("format", () => {
    it("formats durations", () => {
        expect(formatMs(0.123)).toBe("0.12 ms");
        expect(formatMs(3.46)).toBe("3.5 ms");
        expect(formatMs(120.4)).toBe("120 ms");
        expect(formatMs(1_250)).toBe("1.25 s");
        expect(formatMs(125_000)).toBe("2 min 5 s");
        expect(formatMs(Number.NaN)).toBe("–");
    });

    it("rounds a duration before it selects the unit", () => {
        expect(formatMs(999.4)).toBe("999 ms");
        expect(formatMs(999.6)).toBe("1 s");
        expect(formatMs(59_994)).toBe("59.99 s");
        expect(formatMs(59_999)).toBe("1 min 0 s");
        expect(formatMs(119_700)).toBe("2 min 0 s");
        expect(formatMs(-125_000)).toBe("-2 min 5 s");
        expect(formatMs(-1_250)).toBe("-1.25 s");
    });

    it("formats percentages, bytes, units and counts", () => {
        expect(formatPercent(87.54)).toBe("87.5%");
        expect(formatPercent(100)).toBe("100%");
        expect(formatPercent(undefined)).toBe("No data");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(1023)).toBe("1,023 B");
        expect(formatBytes(1048575)).toBe("1 MB");
        expect(formatBytes(1048524)).toBe("1,023.9 KB");
        expect(formatValue(0.25, "ratio")).toBe("25%");
        expect(formatValue(3, "{gc}")).toBe("3 gc");
        expect(formatCount(1, "test")).toBe("1 test");
        expect(formatCount(1200, "test")).toBe("1,200 tests");
    });

    it("formats dates in UTC", () => {
        expect(formatDateTime("2026-10-06T09:41:33.000Z")).toBe("6 Oct 2026, 09:41 UTC");
        expect(formatDate("2026-10-06T23:59:00.000Z")).toBe("6 Oct 2026");
        expect(formatDate("soon")).toBe("soon");
    });
});

describe("pathWithoutHtmlFile", () => {
    it("removes the name of the HTML file of a page, and keeps each other path", () => {
        expect(pathWithoutHtmlFile("/AsyncBrowserContext/docs.html")).toBe("/AsyncBrowserContext/docs");
        expect(pathWithoutHtmlFile("/AsyncBrowserContext/docs/concepts/rules.html")).toBe("/AsyncBrowserContext/docs/concepts/rules");
        expect(pathWithoutHtmlFile("/AsyncBrowserContext/index.html")).toBe("/AsyncBrowserContext/");
        expect(pathWithoutHtmlFile("/docs/index.html")).toBe("/docs/");
        expect(pathWithoutHtmlFile("/AsyncBrowserContext/docs")).toBe("/AsyncBrowserContext/docs");
        expect(pathWithoutHtmlFile("/")).toBe("/");
        expect(pathWithoutHtmlFile("/docs/.html")).toBe("/docs/.html");
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
});

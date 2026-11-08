import { describe, expect, it } from "vitest";
import { formatMs } from "./format";

const number1 = new Intl.NumberFormat("en", { maximumFractionDigits : 1 });
const number2 = new Intl.NumberFormat("en", { maximumFractionDigits : 2 });
const integer = new Intl.NumberFormat("en", { maximumFractionDigits : 0 });

/** The duration copy of the site before the move to `@mark1russell7/quantity`, word for word. */
function copyFormatMs(ms : number) : string {
    if (!Number.isFinite(ms)) return "–";
    const abs = Math.abs(ms);
    const sign = ms < 0 ? "-" : "";
    if (abs < 1) return `${number2.format(ms)} ms`;
    if (abs < 10) return `${number1.format(ms)} ms`;
    if (Math.round(abs) < 1000) return `${integer.format(ms)} ms`;
    const seconds = Math.round(abs / 10) / 100;
    if (seconds < 60) return `${sign}${number2.format(seconds)} s`;
    const totalSeconds = Math.round(abs / 1000);
    return `${sign}${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The durations of the sweep: dense runs in each unit, the values next to each change of unit, and long runs. */
const MS : number[] = [0, 0.004, 0.005, 0.995, 9.949, 9.95, 999.49, 999.5, 59_994, 59_995, 59_999, MINUTE, 119_700, HOUR, 3_700_000];
for (let i = 0; i <= 2000; i++) MS.push(i / 100);
for (let i = 0; i <= 20_000; i++) MS.push(i / 10);
for (let i = 0; i <= 200_000; i += 7) MS.push(i);
for (let i = 0; i <= 3 * HOUR; i += 997) MS.push(i);
const SIGNED_MS = [...MS, ...MS.filter(ms => ms > 0).map(ms => -ms)];

describe("formatMs on the scale of @mark1russell7/quantity and the copy of the site", () => {
    it("gives the text of the copy below one minute, except for the listed difference", () => {
        let same = 0;
        let zero = 0;
        let longer = 0;
        for (const ms of SIGNED_MS) {
            const old = copyFormatMs(ms);
            const text = formatMs(ms);
            if (text === old) {
                same++;
                continue;
            }
            if (Math.abs(ms) >= 59_995) {
                // the scale shows minutes with no "0 s", and hours and minutes from one hour
                expect(text, `${ms} ms`).toMatch(/^-?\d+ (min|h)( \d+ (s|min))?$/);
                longer++;
                continue;
            }
            // a negative value that rounds to 0 has no sign
            expect([old, text], `${ms} ms`).toEqual(["-0 ms", "0 ms"]);
            zero++;
        }
        expect(same + zero + longer).toBe(SIGNED_MS.length);
        expect(same).toBeGreaterThan(40_000);
        expect(zero).toBeGreaterThan(0);
        expect(longer).toBeGreaterThan(0);
    });

    it("gives the listed text changes", () => {
        expect([copyFormatMs(0.42), formatMs(0.42)]).toEqual(["0.42 ms", "0.42 ms"]);
        expect([copyFormatMs(999.6), formatMs(999.6)]).toEqual(["1 s", "1 s"]);
        expect([copyFormatMs(125_000), formatMs(125_000)]).toEqual(["2 min 5 s", "2 min 5 s"]);
        expect([copyFormatMs(120_000), formatMs(120_000)]).toEqual(["2 min 0 s", "2 min"]);
        expect([copyFormatMs(3_700_000), formatMs(3_700_000)]).toEqual(["61 min 40 s", "1 h 2 min"]);
        expect([copyFormatMs(-0.001), formatMs(-0.001)]).toEqual(["-0 ms", "0 ms"]);
        expect([copyFormatMs(Number.NaN), formatMs(Number.NaN)]).toEqual(["–", "–"]);
    });
});

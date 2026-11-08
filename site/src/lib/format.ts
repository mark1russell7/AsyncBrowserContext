/** Number and date formats for the whole site. Dates show in UTC, so every reader sees the same text. */

const number1 = new Intl.NumberFormat("en", { maximumFractionDigits : 1 });
const number2 = new Intl.NumberFormat("en", { maximumFractionDigits : 2 });
const integer = new Intl.NumberFormat("en", { maximumFractionDigits : 0 });

export function formatNumber(value : number, maximumFractionDigits : 0 | 1 | 2 = 1) : string {
    if (!Number.isFinite(value)) return "–";
    const format = maximumFractionDigits === 0 ? integer : maximumFractionDigits === 1 ? number1 : number2;
    return format.format(value);
}

/**
 * This function formats a duration: "0.42 ms", "3.5 ms", "120 ms", "1.25 s", "2 min 5 s".
 * It rounds the value before it selects the unit. Thus, 59,999 ms gives "1 min 0 s", not "60 s".
 */
export function formatMs(ms : number) : string {
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

/** This function formats a percentage from 0 to 100. The value `undefined` means that there is no data. */
export function formatPercent(value : number | undefined) : string {
    if (value === undefined || !Number.isFinite(value)) return "No data";
    if (value === 100 || value === 0) return `${value}%`;
    return `${number1.format(value)}%`;
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
    day : "numeric",
    month : "short",
    year : "numeric",
    hour : "2-digit",
    minute : "2-digit",
    timeZone : "UTC",
});
const dateOnly = new Intl.DateTimeFormat("en-GB", { day : "numeric", month : "short", year : "numeric", timeZone : "UTC" });

function toDate(iso : string) : Date | undefined {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/** "6 Oct 2026, 09:41 UTC". */
export function formatDateTime(iso : string) : string {
    const date = toDate(iso);
    return date ? `${dateTime.format(date)} UTC` : iso;
}

/** "6 Oct 2026". */
export function formatDate(iso : string) : string {
    const date = toDate(iso);
    return date ? dateOnly.format(date) : iso;
}

/** "1 test", "3 tests". */
export function formatCount(count : number, singular : string, plural = `${singular}s`) : string {
    return `${integer.format(count)} ${count === 1 ? singular : plural}`;
}

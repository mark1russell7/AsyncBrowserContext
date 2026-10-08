/** Number and date formats for the whole site. Dates show in UTC, so every reader sees the same text. */

const number1 = new Intl.NumberFormat("en", { maximumFractionDigits : 1 });
const number2 = new Intl.NumberFormat("en", { maximumFractionDigits : 2 });
const integer = new Intl.NumberFormat("en", { maximumFractionDigits : 0 });

export function formatNumber(value : number, maximumFractionDigits : 0 | 1 | 2 = 1) : string {
    if (!Number.isFinite(value)) return "–";
    const format = maximumFractionDigits === 0 ? integer : maximumFractionDigits === 1 ? number1 : number2;
    return format.format(value);
}

/** This function formats a duration: "0.42 ms", "3.5 ms", "120 ms", "1.25 s", "2 min 5 s". */
export function formatMs(ms : number) : string {
    if (!Number.isFinite(ms)) return "–";
    const abs = Math.abs(ms);
    if (abs < 1) return `${number2.format(ms)} ms`;
    if (abs < 10) return `${number1.format(ms)} ms`;
    if (abs < 1000) return `${integer.format(ms)} ms`;
    if (abs < 60_000) return `${number2.format(ms / 1000)} s`;
    const minutes = Math.floor(abs / 60_000);
    const seconds = Math.round((abs % 60_000) / 1000);
    return `${ms < 0 ? "-" : ""}${minutes} min ${seconds} s`;
}

/** This function formats a percentage from 0 to 100. The value `undefined` means that there is no data. */
export function formatPercent(value : number | undefined) : string {
    if (value === undefined || !Number.isFinite(value)) return "No data";
    if (value === 100 || value === 0) return `${value}%`;
    return `${number1.format(value)}%`;
}

export function formatBytes(bytes : number) : string {
    if (!Number.isFinite(bytes)) return "–";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (Math.abs(value) >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${number1.format(value)} ${units[unit]}`;
}

/** This function formats a value in an OpenTelemetry unit ("ms", "%", "By", "ratio", "{gc}"). */
export function formatValue(value : number, unit : string) : string {
    switch (unit) {
        case "ms": return formatMs(value);
        case "%": return formatPercent(value);
        case "By": return formatBytes(value);
        case "ratio": return formatPercent(value * 100);
        case "1": return formatNumber(value, 2);
        case "": return formatNumber(value, 2);
        default: {
            const label = unit.startsWith("{") && unit.endsWith("}") ? unit.slice(1, -1) : unit;
            return `${formatNumber(value, 2)} ${label}`;
        }
    }
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

export function shortCommit(commit : string) : string {
    return commit.slice(0, 7);
}

/** "1 test", "3 tests". */
export function formatCount(count : number, singular : string, plural = `${singular}s`) : string {
    return `${integer.format(count)} ${count === 1 ? singular : plural}`;
}

/** The values of the performance tables: sizes, increases, ranges and times. The tables of `PerformanceViews.tsx` show them. */
import type { BundleSize, TransformSizeRow } from "../data/types";
import { formatNumber } from "../lib/format";

/** This function formats a size in kilobytes of 1,000 bytes, as the documents of the library do: "17.5 kB". */
export function kilobytes(bytes : number) : string {
    return `${(bytes / 1000).toFixed(1)} kB`;
}

/** This function gives the increase of the gzip size of `bundle` over `native`, in percent, with one decimal. */
export function gzipIncrease(native : BundleSize, bundle : BundleSize) : number {
    return Math.round(((bundle.gzipBytes / native.gzipBytes) - 1) * 1000) / 10;
}

/** This function gives the smallest and the largest value of a list, or `undefined` for an empty list. */
export function rangeOf(values : readonly number[]) : readonly [number, number] | undefined {
    return values.length === 0 ? undefined : [Math.min(...values), Math.max(...values)];
}

/**
 * This function gives the two ranges of the text under the table of the transform: the increase with the Vite plugin
 * for the API clients (each package with "client" in its kind), and the part that the option `names: false` removes
 * from each package with async functions.
 */
export function transformRanges(rows : readonly TransformSizeRow[]) : { clients? : readonly [number, number]; names? : readonly [number, number] } {
    const clients = rangeOf(rows.filter(row => /client/i.test(row.kind)).map(row => gzipIncrease(row.native, row.transformed)));
    const names = rangeOf(rows.filter(row => row.asyncFunctions > 0)
        .map(row => Math.round(((row.transformed.gzipBytes - row.transformedWithoutNames.gzipBytes) / row.native.gzipBytes) * 1000) / 10));
    return { ...(clients === undefined ? {} : { clients }), ...(names === undefined ? {} : { names }) };
}

/** This function formats a time of the browser benchmark: two digits below 1 ms, one digit below 10 ms, else none. */
export function benchMs(ms : number) : string {
    return formatNumber(ms, ms < 1 ? 2 : ms < 10 ? 1 : 0);
}

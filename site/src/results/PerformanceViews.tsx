import type { ReactNode } from "react";
import { ScrollTable } from "../components/ScrollTable/ScrollTable";
import type { BrowserBenchRow, BundleSize } from "../data/types";
import { formatNumber } from "../lib/format";
import { DataState } from "./DataState";
import { benchMs, gzipIncrease, kilobytes, transformRanges } from "./performance";
import { RunName } from "./RunName";
import styles from "./ResultViews.module.css";

const range = ([low, high] : readonly [number, number]) : string => `${formatNumber(low, 1)} to ${formatNumber(high, 1)} percent`;

/** The table of the size of the runtime, next to zone.js. The values come from `pnpm bench:size`. */
export function SizeTable() {
    return (
        <DataState name="size">
            {(file) => (
                <>
                    <p className={styles.environment}>Vite {file.vite}. The values come from <RunName source={file} />.</p>
                    <ScrollTable label="Size of the runtime">
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Code</th>
                                    <th scope="col" data-align="right">Minified</th>
                                    <th scope="col" data-align="right">gzip</th>
                                    <th scope="col" data-align="right">brotli</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <th scope="row">The runtime: the classes, the patches and the runtime of the transform</th>
                                    <td data-align="right">{kilobytes(file.minifiedBytes)}</td>
                                    <td data-align="right">{kilobytes(file.gzipBytes)}</td>
                                    <td data-align="right">{kilobytes(file.brotliBytes)}</td>
                                </tr>
                                <tr>
                                    <th scope="row">zone.js {file.zone.version}, for comparison</th>
                                    <td data-align="right">{kilobytes(file.zone.minifiedBytes)}</td>
                                    <td data-align="right">{kilobytes(file.zone.gzipBytes)}</td>
                                    <td data-align="right">{kilobytes(file.zone.brotliBytes)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </ScrollTable>
                </>
            )}
        </DataState>
    );
}

function SizeCell({ native, bundle } : { native : BundleSize; bundle : BundleSize }) {
    return <td data-align="right">{kilobytes(bundle.gzipBytes)} (+{formatNumber(gzipIncrease(native, bundle), 1)}%)</td>;
}

/** The table of the gzip sizes of npm packages without and with the transform, and the ranges of the increase. */
export function TransformSizeTable() {
    return (
        <DataState name="size">
            {(file) => {
                const { clients, names } = transformRanges(file.transform);
                return (
                    <>
                        <ScrollTable label="Size of npm packages with the transform">
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">Package</th>
                                        <th scope="col" data-align="right">Async functions</th>
                                        <th scope="col" data-align="right">Without the transform</th>
                                        <th scope="col" data-align="right">With the Vite plugin</th>
                                        <th scope="col" data-align="right">With <code>names: false</code></th>
                                        <th scope="col" data-align="right">Target ES2016, no plugin</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {file.transform.map(row => (
                                        <tr key={row.name}>
                                            <th scope="row">{row.version === "" ? `${row.name}: ${row.kind}` : `${row.name} ${row.version}`}</th>
                                            <td data-align="right">{row.asyncFunctions}</td>
                                            <td data-align="right">{kilobytes(row.native.gzipBytes)}</td>
                                            <SizeCell native={row.native} bundle={row.transformed} />
                                            <SizeCell native={row.native} bundle={row.transformedWithoutNames} />
                                            <SizeCell native={row.native} bundle={row.loweredEs2016} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </ScrollTable>
                        <p className={styles.environment}>
                            {clients === undefined ? null : <>With the Vite plugin, the API clients are {range(clients)} larger. </>}
                            {names === undefined ? null : <>The option <code>names: false</code> removes {range(names)} of each package with async functions. </>}
                            The values come from <RunName source={file} />.
                        </p>
                    </>
                );
            }}
        </DataState>
    );
}

/** The names of the workloads of `pnpm bench:browsers`, as the table shows them. */
const WORKLOADS : Readonly<Record<string, ReactNode>> = {
    "await null" : <code>await null</code>,
    "await a promise" : <><code>await</code> of a promise</>,
    "async generator" : <>Async generator with <code>for await</code></>,
    "then chain" : <><code>then</code> chain</>,
};

const BROWSER_CASES = ["Native", "Babel helper", "Library"] as const satisfies readonly (keyof BrowserBenchRow["ms"])[];

/** The table of the browser benchmark: the time of each workload in each engine, for each case. */
export function BrowserBenchTable() {
    return (
        <DataState name="browser-bench">
            {(file) => (
                <>
                    <p className={styles.environment}>
                        Each value is the time of {formatNumber(file.count, 0)} steps in ms, as the median of {file.runs} runs.
                        One run repeats the workload until at least {file.minRunMs} ms have passed. The values come from <RunName source={file} />.
                    </p>
                    <ScrollTable label="Browser benchmark">
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Browser</th>
                                    <th scope="col">Workload</th>
                                    {BROWSER_CASES.map(name => <th key={name} scope="col" data-align="right">{name}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {file.rows.map(row => (
                                    <tr key={`${row.engine}-${row.workload}`}>
                                        <th scope="row">{row.engine} {row.version}</th>
                                        <td>{WORKLOADS[row.workload] ?? row.workload}</td>
                                        {BROWSER_CASES.map(name => <td key={name} data-align="right">{benchMs(row.ms[name])}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ScrollTable>
                </>
            )}
        </DataState>
    );
}

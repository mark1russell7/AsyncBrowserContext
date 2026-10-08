import { PlotFigure } from "../components/PlotFigure/PlotFigure";
import { ScrollTable } from "../components/ScrollTable/ScrollTable";
import { StatusIcon, type StatusKind } from "../components/StatusIcon/StatusIcon";
import type { BenchRow, MutationRow, ProbeResult, StrykerSummary } from "../data/types";
import { formatMs, formatNumber, formatPercent } from "../lib/format";
import { DataState } from "./DataState";
import styles from "./ResultViews.module.css";

const PROBE_STATUS : Readonly<Record<ProbeResult["status"], { kind : StatusKind; text : string }>> = {
    fixed : { kind : "passed", text : "Corrected" },
    correct : { kind : "passed", text : "Correct" },
    safe : { kind : "skipped", text : "Root (C7)" },
    documentation : { kind : "todo", text : "README" },
};

/** The table of the probes: the result of each probe before and after the change. */
export function ProbeTable() {
    return (
        <DataState name="probes">
            {(file) => (
                <ScrollTable label="Probe results">
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col">Probe</th>
                                <th scope="col">Rule</th>
                                <th scope="col">Scenario</th>
                                <th scope="col">Old library</th>
                                <th scope="col">New library</th>
                                <th scope="col">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {file.probes.map(probe => (
                                <tr key={probe.id}>
                                    <th scope="row"><code>{probe.id}</code></th>
                                    <td>{probe.rule ?? "–"}</td>
                                    <td>{probe.scenario}</td>
                                    <td><code>{probe.before}</code></td>
                                    <td><code>{probe.after}</code></td>
                                    <td><StatusIcon kind={PROBE_STATUS[probe.status].kind} showLabel={false} /> {PROBE_STATUS[probe.status].text}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </ScrollTable>
            )}
        </DataState>
    );
}

function mutantLabel(row : MutationRow) : string {
    return `${row.mutant === "real" ? "No mutant" : row.mutant}: ${row.description}`;
}

/** The chart of the mutants: the part of the tests that pass with each mutant of the runtime. */
export function MutationChart() {
    return (
        <DataState name="mutation">
            {(file) => {
                const rows = file.rows.map(row => ({ ...row, label : mutantLabel(row), percent : (100 * row.passed) / Math.max(row.total, 1), suiteLabel : row.suite === "old" ? "Old tests" : "New tests" }));
                return (
                    <>
                    <PlotFigure
                        title="Tests that pass with each mutant of the runtime"
                        description="A bar for each mutant. The length of the bar is the percentage of the tests that pass with that mutant. A good test suite fails with each mutant, so a short bar is good for a mutant and a full bar is correct only for the runtime without a mutant."
                        options={({ Plot, theme }) => ({
                            height : 50 + rows.length * 34,
                            marginLeft : 330,
                            marginRight : 60,
                            x : { label : "Tests that pass (%)", domain : [0, 100], grid : true },
                            y : { label : null, domain : rows.map(row => `${row.label} (${row.suiteLabel})`) },
                            color : { domain : ["Old tests", "New tests"], range : [theme.status.critical, theme.status.good], legend : true },
                            marks : [
                                Plot.barX(rows, { x : "percent", y : (row) => `${row.label} (${row.suiteLabel})`, fill : "suiteLabel" }),
                                Plot.text(rows, { x : "percent", y : (row) => `${row.label} (${row.suiteLabel})`, text : (row) => `${row.passed}/${row.total}`, dx : 6, textAnchor : "start", fill : theme.ink }),
                                Plot.ruleX([0]),
                            ],
                        })}
                        table={{
                            columns : [
                                { key : "label", label : "Mutant" },
                                { key : "suiteLabel", label : "Tests" },
                                { key : "passed", label : "Pass", align : "right" },
                                { key : "total", label : "Total", align : "right" },
                                { key : "percent", label : "Pass (%)", align : "right", format : (value) => formatPercent(value as number) },
                            ],
                            rows,
                        }}
                    />
                    {file.stryker === undefined ? null : <StrykerTable summary={file.stryker} />}
                    </>
                );
            }}
        </DataState>
    );
}

/** The table of the last Stryker run on the current tests. */
function StrykerTable({ summary } : { summary : StrykerSummary }) {
    return (
        <ScrollTable label="Mutation testing of the current tests">
            <table className={styles.table}>
                <caption>Stryker on the current tests: {summary.scope.join(", ")}</caption>
                <thead>
                    <tr>
                        <th scope="col" data-align="right">Score</th>
                        <th scope="col" data-align="right">Found</th>
                        <th scope="col" data-align="right">Timeout</th>
                        <th scope="col" data-align="right">Survived</th>
                        <th scope="col" data-align="right">No coverage</th>
                        <th scope="col" data-align="right">Mutants</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td data-align="right">{formatPercent(summary.score)}</td>
                        <td data-align="right">{summary.killed}</td>
                        <td data-align="right">{summary.timeout}</td>
                        <td data-align="right">{summary.survived}</td>
                        <td data-align="right">{summary.noCoverage}</td>
                        <td data-align="right">{summary.total}</td>
                    </tr>
                </tbody>
            </table>
        </ScrollTable>
    );
}

/** The table of the browser tests: the results of the rule tests in each browser. */
export function BrowserMatrix() {
    return (
        <DataState name="browsers">
            {(file) => (
                <ScrollTable label="Browser results">
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col">Browser</th>
                                <th scope="col">Version</th>
                                <th scope="col" data-align="right">Pass</th>
                                <th scope="col" data-align="right">Fail</th>
                                <th scope="col" data-align="right">Skip</th>
                                <th scope="col">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {file.rows.map(row => (
                                <tr key={`${row.browser}-${row.version}`}>
                                    <th scope="row">{row.browser}</th>
                                    <td>{row.version}</td>
                                    <td data-align="right">{row.passed}</td>
                                    <td data-align="right">{row.failed}</td>
                                    <td data-align="right">{row.skipped}</td>
                                    <td><StatusIcon kind={row.failed > 0 ? "failed" : "passed"} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </ScrollTable>
            )}
        </DataState>
    );
}

type BenchPoint = { benchmark : string; case : string; ms : number; factor : number };

const BENCH_CASES : readonly (readonly [keyof Pick<BenchRow, "plainMs" | "transformOnlyMs" | "libraryMs">, string])[] = [
    ["plainMs", "Plain JavaScript"],
    ["transformOnlyMs", "Transform only"],
    ["libraryMs", "Library"],
];

/** The chart of the benchmarks: the mean time of each case (the median of the rounds), next to plain JavaScript. */
export function BenchChart() {
    return (
        <DataState name="bench">
            {(file) => {
                const points : BenchPoint[] = file.rows.flatMap(row => BENCH_CASES.map(([key, label]) => ({
                    benchmark : row.benchmark,
                    case : label,
                    ms : row[key],
                    factor : row[key] / row.plainMs,
                })));
                return (
                    <>
                        <p className={styles.environment}>
                            Node.js {file.environment.node}, {file.environment.os}, {file.environment.cpu}.
                        </p>
                        <PlotFigure
                            title="The mean time of each benchmark"
                            description="Grouped bars: one group for each benchmark, one bar for each case. The label of each bar is the time as a multiple of the time of plain JavaScript."
                            options={({ Plot, theme }) => ({
                                height : 70 + file.rows.length * 96,
                                marginLeft : 230,
                                marginRight : 70,
                                x : { label : "Mean time (ms)", grid : true },
                                y : { axis : null, domain : BENCH_CASES.map(([, label]) => label) },
                                fy : { label : null, axis : "left", domain : file.rows.map(row => row.benchmark) },
                                color : { domain : BENCH_CASES.map(([, label]) => label), range : [theme.status.neutral, theme.series[1] ?? theme.accent, theme.series[0] ?? theme.accent], legend : true },
                                marks : [
                                    Plot.barX(points, { x : "ms", y : "case", fy : "benchmark", fill : "case" }),
                                    Plot.text(points, { x : "ms", y : "case", fy : "benchmark", text : (point : BenchPoint) => `${formatNumber(point.factor, 2)}×`, dx : 6, textAnchor : "start", fill : theme.ink }),
                                    Plot.ruleX([0]),
                                ],
                            })}
                            table={{
                                columns : [
                                    { key : "benchmark", label : "Benchmark" },
                                    { key : "case", label : "Case" },
                                    { key : "ms", label : "Mean time", align : "right", format : (value) => formatMs(value as number) },
                                    { key : "factor", label : "Factor", align : "right", format : (value) => `${formatNumber(value as number, 2)}×` },
                                ],
                                rows : points,
                            }}
                        />
                    </>
                );
            }}
        </DataState>
    );
}

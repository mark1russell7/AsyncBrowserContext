import { PlotFigure } from "../components/PlotFigure/PlotFigure";
import { ScrollTable } from "../components/ScrollTable/ScrollTable";
import { StatusIcon, type StatusKind } from "../components/StatusIcon/StatusIcon";
import type { BenchRow, MutationRow, ProbeResult, StrykerSummary } from "../data/types";
import { formatMs, formatNumber, formatPercent } from "../lib/format";
import { DataState } from "./DataState";
import styles from "./ResultViews.module.css";

/** An estimate of the width of a text in the charts (12 px font), in pixels. */
function textWidth(text : string) : number {
    return Math.ceil(text.length * 6.6);
}

/** The number of lines of a text that wraps at `width` pixels. */
function lineCount(text : string, width : number) : number {
    return Math.max(1, Math.ceil(textWidth(text) / Math.max(width, 1)));
}

/** Below this width of a chart, the labels go above the bars, so the bars keep the full width. */
const NARROW_CHART = 560;
/** The height of one line of text in the charts, in pixels. */
const LINE_PX = 14;

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
                                    <td className={styles.scenario}>{probe.scenario}</td>
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
                const key = (row : (typeof rows)[number]) : string => `${row.label} (${row.suiteLabel})`;
                return (
                    <>
                    <PlotFigure
                        title="Tests that pass with each mutant of the runtime"
                        description="A bar for each mutant. The length of the bar is the percentage of the tests that pass with that mutant. A good test suite fails with each mutant, so a short bar is good for a mutant and a full bar is correct only for the runtime without a mutant."
                        options={({ Plot, theme, width }) => {
                            const narrow = width < NARROW_CHART;
                            // A narrow chart puts each label above its bar. A wide chart puts the labels at the left, and they wrap.
                            const marginLeft = narrow ? 8 : Math.min(330, Math.round(width * 0.4));
                            const labelWidth = narrow ? width - marginLeft - 12 : marginLeft - 14;
                            const lines = Math.max(...rows.map(row => lineCount(key(row), labelWidth)));
                            const step = narrow ? 32 + lines * LINE_PX : Math.max(34, lines * LINE_PX + 10);
                            const padding = narrow ? 0.1 : 0.2;
                            const [marginTop, marginBottom] = [20, 46];
                            // The band of each row (refer to the band scale of Plot), so a label can stand just above its bar.
                            const bandwidth = ((rows.length * step) / (rows.length + padding)) * (1 - padding);
                            const labelSpace = narrow ? lines * LINE_PX + 8 : 0;
                            return {
                                height : marginTop + marginBottom + rows.length * step,
                                marginTop,
                                marginBottom,
                                marginLeft,
                                marginRight : 56,
                                x : { label : "Tests that pass (%)", labelAnchor : "center", labelOffset : 40, domain : [0, 100], grid : true },
                                y : { label : null, domain : rows.map(key), padding, axis : null },
                                color : { domain : ["Old tests", "New tests"], range : [theme.status.critical, theme.status.good], legend : true },
                                marks : [
                                    Plot.ruleX([0]),
                                    narrow ? null : Plot.axisY({ label : null, tickSize : 0, lineWidth : labelWidth / 12 }),
                                    Plot.barX(rows, { x : "percent", y : key, fill : "suiteLabel", insetTop : labelSpace }),
                                    Plot.text(rows, { x : "percent", y : key, text : (row) => `${row.passed}/${row.total}`, dx : 6, dy : labelSpace / 2, textAnchor : "start", fill : theme.ink }),
                                    narrow ? Plot.text(rows, { x : 0, y : key, text : key, dx : 4, textAnchor : "start", lineAnchor : "bottom", lineWidth : labelWidth / 12, dy : -bandwidth / 2 + labelSpace - 4, fill : theme.inkSecondary }) : null,
                                ],
                            };
                        }}
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
                            options={({ Plot, theme, width }) => {
                                // A narrow chart puts the name of each benchmark above its group of bars.
                                const narrow = width < NARROW_CHART;
                                const longest = Math.max(...file.rows.map(row => textWidth(row.benchmark)));
                                return {
                                    height : 70 + file.rows.length * (narrow ? 112 : 96),
                                    marginTop : narrow ? 34 : 20,
                                    marginLeft : narrow ? 8 : Math.min(230, longest + 20),
                                    marginRight : 56,
                                    x : { label : "Mean time (ms)", grid : true },
                                    y : { axis : null, domain : BENCH_CASES.map(([, label]) => label) },
                                    fy : { label : null, axis : narrow ? null : "left", domain : file.rows.map(row => row.benchmark), padding : narrow ? 0.3 : 0.1 },
                                    color : { domain : BENCH_CASES.map(([, label]) => label), range : [theme.status.neutral, theme.series[1] ?? theme.accent, theme.series[0] ?? theme.accent], legend : true },
                                    marks : [
                                        Plot.barX(points, { x : "ms", y : "case", fy : "benchmark", fill : "case" }),
                                        Plot.text(points, { x : "ms", y : "case", fy : "benchmark", text : (point : BenchPoint) => `${formatNumber(point.factor, 2)}×`, dx : 6, textAnchor : "start", fill : theme.ink }),
                                        narrow ? Plot.text(file.rows, { fy : "benchmark", text : "benchmark", frameAnchor : "top-left", lineAnchor : "bottom", dy : -6, fontWeight : 700, fill : theme.ink }) : null,
                                        Plot.ruleX([0]),
                                    ],
                                };
                            }}
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

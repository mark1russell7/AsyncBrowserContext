import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PlotFigure } from "../components/PlotFigure/PlotFigure";
import type { ThemeColors } from "../theme/colors";
import { useThemeColors } from "../theme/colors";
import {
    IMPLEMENTATIONS,
    implementationById,
    libraryImplementation,
    ROOT,
    type ImplementationId,
} from "./implementations";
import { summarize, type Read, type ReadStatus } from "./recorder";
import { startScenario, type ScenarioRun } from "./run-scenario";
import { SCENARIOS, scenarioById, type Scenario } from "./scenarios";
import styles from "./Explore.module.css";

const STATUS_TEXT : Readonly<Record<ReadStatus, string>> = {
    correct : "correct",
    lost : "lost (root context)",
    wrong : "wrong context",
};

/** This function gives the fill color of a context value. */
function contextColor(theme : ThemeColors, value : string) : string {
    if (value === ROOT) return theme.status.neutral;
    const index = ["A", "B", "C"].indexOf(value);
    return theme.series[index >= 0 ? index : 4] ?? theme.accent;
}

/** This function gives the ring color of a read status. */
function statusColor(theme : ThemeColors, status : ReadStatus) : string {
    if (status === "wrong") return theme.status.critical;
    if (status === "lost") return theme.status.warning;
    return theme.ink;
}

function shortLabel(value : string) : string {
    return value === ROOT ? "–" : value.slice(0, 1);
}

/** The swimlane chart of one run: one lane for each task, one dot for each read. */
function Swimlanes({ run, scenario } : { run : ScenarioRun; scenario : Scenario }) {
    const reads = run.reads;
    const counts = summarize(reads);
    return (
        <section className={styles.panel} aria-label={run.implementation.label}>
            <p className={styles.panelTitle}>{run.implementation.label}</p>
            <p className={styles.meta}>{run.implementation.description}</p>
            <ul className={styles.counts}>
                <li>{counts.total} reads</li>
                <li className={styles.count} data-status="correct">{counts.correct} correct</li>
                <li className={styles.count} data-status="lost">{counts.lost} lost</li>
                <li className={styles.count} data-status="wrong">{counts.wrong} wrong</li>
            </ul>
            <PlotFigure
                title={`${scenario.title}: the reads with ${run.implementation.label}`}
                hideTitle
                description={`A timeline with one lane for each task. Each dot is one read of the variable, in the order of the reads. The fill color is the context that the read got. A thick ring marks a read that did not get the expected context. ${counts.correct} of ${counts.total} reads are correct.`}
                options={({ theme, Plot }) => ({
                    height : 64 + scenario.lanes.length * 52,
                    marginLeft : 120,
                    marginRight : 20,
                    x : { label : "Order of the reads", domain : [0.5, Math.max(reads.length, 1) + 0.5], ticks : reads.map(read => read.order), tickFormat : "d" },
                    y : { label : null, domain : [...scenario.lanes] },
                    marks : [
                        Plot.gridY(scenario.lanes, { stroke : theme.chartGrid, strokeOpacity : 1 }),
                        Plot.dot(reads, {
                            x : "order",
                            y : "task",
                            r : 13,
                            fill : (read : Read) => contextColor(theme, read.seen),
                            stroke : (read : Read) => statusColor(theme, read.status),
                            strokeWidth : (read : Read) => (read.status === "correct" ? 1 : 3.5),
                        }),
                        Plot.text(reads, {
                            x : "order",
                            y : "task",
                            text : (read : Read) => shortLabel(read.seen),
                            fill : theme.surface,
                            fontWeight : 700,
                            fontSize : 12,
                        }),
                        Plot.tip(reads, Plot.pointer({
                            x : "order",
                            y : "task",
                            title : (read : Read) => `${read.step}\nExpected: ${read.expected}\nGot: ${read.seen} (${STATUS_TEXT[read.status]})`,
                        })),
                    ],
                })}
                table={{
                    columns : [
                        { key : "order", label : "Order", align : "right" },
                        { key : "task", label : "Task" },
                        { key : "step", label : "Place in the code" },
                        { key : "expected", label : "Expected" },
                        { key : "seen", label : "Got" },
                        { key : "status", label : "Result", format : (value) => STATUS_TEXT[value as ReadStatus] },
                    ],
                    rows : reads,
                }}
            />
        </section>
    );
}

/** The legend of the colors and the rings. */
function Legend() {
    const theme = useThemeColors();
    return (
        <ul className={styles.legend} aria-label="Legend">
            {["A", "B", "C", ROOT].map(value => (
                <li key={value}>
                    <span className={styles.swatch} style={{ background : contextColor(theme, value) }} aria-hidden="true" />
                    {value === ROOT ? "Root context (no value)" : `Context ${value}`}
                </li>
            ))}
            <li style={{ color : theme.status.warning }}><span className={styles.ring} aria-hidden="true" />Lost</li>
            <li style={{ color : theme.status.critical }}><span className={styles.ring} aria-hidden="true" />Wrong context</li>
        </ul>
    );
}

export type ContextTimelineProps = {
    /** The ID of the first scenario. */
    scenario? : string;
    /** The implementation to compare with the library, or "none". */
    compareWith? : ImplementationId | "none";
};

/**
 * The context timeline. It starts a real scenario in this page with the
 * library, and with a global variable for comparison. Then it shows each read
 * of the variable in a swimlane chart.
 */
export function ContextTimeline({ scenario : initialScenario = SCENARIOS[0]!.id, compareWith = "global-kept" } : ContextTimelineProps) {
    const [scenarioId, setScenarioId] = useState(initialScenario);
    const [comparison, setComparison] = useState<ImplementationId | "none">(compareWith);
    const [runs, setRuns] = useState<ScenarioRun[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const generation = useRef(0);
    const compareId = useId();
    const scenario = scenarioById(scenarioId);

    const start = useCallback(async (id : string, compare : ImplementationId | "none") => {
        const current = ++generation.current;
        setBusy(true);
        setError(undefined);
        try {
            const selected = scenarioById(id);
            const results = [await startScenario(selected, libraryImplementation)];
            if (compare !== "none" && compare !== "library") {
                results.push(await startScenario(selected, implementationById(compare)));
            }
            if (current === generation.current) setRuns(results);
        } catch (reason) {
            if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (current === generation.current) setBusy(false);
        }
    }, []);

    useEffect(() => {
        void start(scenarioId, comparison);
    }, [start, scenarioId, comparison]);

    return (
        <div className={styles.widget}>
            <ul className={styles.choices} aria-label="Scenario">
                {SCENARIOS.map(candidate => (
                    <li key={candidate.id}>
                        <button
                            type="button"
                            className={styles.choice}
                            aria-pressed={candidate.id === scenarioId}
                            onClick={() => setScenarioId(candidate.id)}
                        >
                            {candidate.title}
                        </button>
                    </li>
                ))}
            </ul>
            <p className={styles.meta}>Rule {scenario.rule}</p>
            <p className={styles.summary}>{scenario.summary}</p>
            <pre className={styles.code}><code>{scenario.code}</code></pre>
            <div className={styles.toolbar}>
                <label className={styles.field} htmlFor={compareId}>
                    Compare the library with
                    <select
                        id={compareId}
                        className="control"
                        value={comparison}
                        onChange={(event) => setComparison(event.target.value as ImplementationId | "none")}
                    >
                        <option value="none">No comparison</option>
                        {IMPLEMENTATIONS.filter(implementation => implementation.id !== "library").map(implementation => (
                            <option key={implementation.id} value={implementation.id}>{implementation.label}</option>
                        ))}
                    </select>
                </label>
                <button type="button" className="button" data-variant="primary" disabled={busy} onClick={() => void start(scenarioId, comparison)}>
                    Start the scenario again
                </button>
            </div>
            {error ? <p className={styles.error} role="alert">The scenario stopped with an error: {error}</p> : null}
            <div className={styles.panels} aria-live="polite" aria-busy={busy && runs.length === 0 ? true : undefined} data-loading={busy && runs.length === 0 ? "" : undefined}>
                {runs.filter(run => run.scenario.id === scenarioId).map(run => (
                    <Swimlanes key={run.implementation.id} run={run} scenario={scenario} />
                ))}
            </div>
            <Legend />
        </div>
    );
}

export default ContextTimeline;

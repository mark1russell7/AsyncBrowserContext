import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { usePrefersReducedMotion } from "../lib/use-media-query";
import type { ContextMode } from "./instrumented";
import { laneColor } from "./layout";
import { scenarioById, scenarios as allScenarios, traceScenario, type DebuggerScenario } from "./run";
import type { FrameInfo, Lane, Trace } from "./trace";
import { useStepPlayer, type StepPlayer } from "./useStepPlayer";
import { CodeView, ConsoleView, FrameGraph, LaneTimeline, ReadsBar, StepView } from "./views";
import styles from "./Debugger.module.css";

type CompareMode = Exclude<ContextMode, "library">;

const COMPARE_LABELS : Record<CompareMode, string> = {
    "global-kept" : "Global variable, not set back",
    "global-restored" : "Global variable, set back",
};

/** Code from outside the list of scenarios, for example the code of the playground. */
export type DebuggerSource = {
    /** A new ID starts the debugger again. */
    id : string;
    /** The name in the title of the code panel, for example "playground.js". */
    title : string;
    summary? : string;
    lines : DebuggerScenario["lines"];
    trace(mode : ContextMode) : Promise<Trace>;
};

export type ContextDebuggerProps = {
    /** Code to show instead of the scenarios. Then the debugger shows no scenario tabs. */
    source? : DebuggerSource;
    /** The ID of the first scenario. */
    scenario? : string;
    /** The IDs of the scenarios to show, separated with commas. The default is all the scenarios. */
    scenarios? : string;
    /** "full" for a page, "hero" for the home page: a smaller debugger that plays the steps in a loop. */
    variant? : "full" | "hero";
    /** The implementation that the console compares with the library at the start. */
    compare? : CompareMode;
};

const SPEEDS = [0.5, 1, 2] as const;

function Icon({ name } : { name : "first" | "previous" | "play" | "pause" | "next" | "last" }) {
    const paths = {
        first : "M5 4h2v12H5zM16 4v12L8 10z",
        previous : "M14 4v12L6 10z",
        play : "M6 4v12l10-6z",
        pause : "M5 4h4v12H5zM11 4h4v12h-4z",
        next : "M6 4v12l8-6z",
        last : "M13 4h2v12h-2zM4 4v12l8-6z",
    } as const;
    return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d={paths[name]} fill="currentColor" /></svg>;
}

function Controls({ player, count, compact } : { player : StepPlayer; count : number; compact? : boolean }) {
    const speedId = useId();
    return (
        <div className={styles.controls}>
            <div className={styles.buttons}>
                {compact ? null : <button type="button" className={styles.iconButton} aria-label="First step" disabled={player.index === 0} onClick={() => player.setIndex(0)}><Icon name="first" /></button>}
                <button type="button" className={styles.iconButton} aria-label="Previous step" disabled={player.index === 0} onClick={player.previous}><Icon name="previous" /></button>
                <button type="button" className={styles.playButton} aria-label={player.playing ? "Pause" : "Play the steps"} onClick={player.toggle}>
                    <Icon name={player.playing ? "pause" : "play"} />
                    <span>{player.playing ? "Pause" : "Play"}</span>
                </button>
                <button type="button" className={styles.iconButton} aria-label="Next step" disabled={player.index >= count - 1} onClick={player.next}><Icon name="next" /></button>
                {compact ? null : <button type="button" className={styles.iconButton} aria-label="Last step" disabled={player.index >= count - 1} onClick={() => player.setIndex(count - 1)}><Icon name="last" /></button>}
            </div>
            <span className={styles.counter} aria-live="off">Step <strong>{player.index + 1}</strong> of {count}</span>
            {compact ? null : (
                <label className={styles.speed} htmlFor={speedId}>
                    Speed
                    <select id={speedId} value={player.speed} onChange={(event) => player.setSpeed(Number(event.target.value))}>
                        {SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×</option>)}
                    </select>
                </label>
            )}
        </div>
    );
}

function Panel({ title, aside, className, children } : { title : ReactNode; aside? : ReactNode; className? : string | undefined; children : ReactNode }) {
    return (
        <div className={`${styles.panel} ${className ?? ""}`}>
            <div className={styles.panelHead}>
                <span className={styles.panelTitle}>{title}</span>
                {aside === undefined ? null : <span className={styles.panelAside}>{aside}</span>}
            </div>
            <div className={styles.panelBody}>{children}</div>
        </div>
    );
}

/**
 * The context debugger. It starts a scenario with the real library in the
 * page and records each step. For each step, it shows the line, the frame
 * tree and the search of each read. It also shows the lanes of the contexts
 * and the console. It can compare the console with a global variable.
 */
export function ContextDebugger({ source, scenario : initial = "two-requests", scenarios : only, variant = "full", compare : initialCompare } : ContextDebuggerProps) {
    const hero = variant === "hero";
    const list = useMemo(() => (only === undefined ? allScenarios : only.split(",").map(id => scenarioById(id.trim()))), [only]);
    const [scenarioId, setScenarioId] = useState(initial);
    const scenario = scenarioById(scenarioId);
    const active = useMemo<DebuggerSource>(() => source ?? {
        id : scenario.id,
        title : `${scenario.id}.js`,
        summary : scenario.summary,
        lines : scenario.lines,
        trace : mode => traceScenario(scenario, mode),
    }, [source, scenario]);
    const [compare, setCompare] = useState<CompareMode | "none">(initialCompare ?? "none");
    const [trace, setTrace] = useState<Trace>();
    const [compareTrace, setCompareTrace] = useState<Trace>();
    const reducedMotion = usePrefersReducedMotion();
    const root = useRef<HTMLElement>(null);
    const [visible, setVisible] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [stopped, setStopped] = useState(false);

    useEffect(() => {
        let live = true;
        setTrace(undefined);
        active.trace("library").then((result) => { if (live) setTrace(result); }, () => undefined);
        return () => { live = false; };
    }, [active]);

    useEffect(() => {
        let live = true;
        setCompareTrace(undefined);
        if (compare !== "none") active.trace(compare).then((result) => { if (live) setCompareTrace(result); }, () => undefined);
        return () => { live = false; };
    }, [active, compare]);

    const count = trace?.steps.length ?? 0;
    const player = useStepPlayer(count, { loop : hero, resetKey : `${active.id}:${count}`, startAt : hero && reducedMotion ? "last" : "first" });

    // The hero plays when it is on the screen, and stops while the pointer is on it.
    useEffect(() => {
        if (!hero) return undefined;
        const element = root.current;
        if (!element || typeof IntersectionObserver === "undefined") return undefined;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold : 0.25 });
        observer.observe(element);
        return () => observer.disconnect();
    }, [hero]);
    const shouldPlay = hero && trace !== undefined && visible && !hovered && !reducedMotion && !stopped;
    useEffect(() => {
        if (!hero) return;
        if (shouldPlay) player.play();
        else player.pause();
        // The player functions change at each render; the effect follows only the conditions.
    }, [hero, shouldPlay]); // eslint-disable-line react-hooks/exhaustive-deps

    const lanes = useMemo(() => new Map<string, Lane>((trace?.lanes ?? []).map(lane => [lane.id, lane])), [trace]);
    const frames = useMemo(() => new Map<string, FrameInfo>((trace?.frames ?? []).map(frame => [frame.id, frame])), [trace]);

    const onKeyDown = (event : KeyboardEvent<HTMLElement>) => {
        const onButton = event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement;
        if (event.key === "ArrowRight") player.next();
        else if (event.key === "ArrowLeft") player.previous();
        else if (event.key === "Home") player.setIndex(0);
        else if (event.key === "End") player.setIndex(count - 1);
        else if ((event.key === " " || event.key === "k") && !onButton) player.toggle();
        else return;
        if (hero) setStopped(true);
        event.preventDefault();
    };

    const step = trace?.steps[player.index];
    const viewProps = trace ? { trace, index : player.index, lanes, frames } : undefined;
    const heroPlayer : StepPlayer = {
        ...player,
        toggle : () => {
            setStopped(player.playing);
            player.toggle();
        },
        next : () => { setStopped(true); player.next(); },
        previous : () => { setStopped(true); player.previous(); },
    };

    return (
        <section
            ref={root}
            className={styles.debugger}
            data-variant={variant}
            aria-label={hero ? "A live example: two requests in the debugger" : "Context debugger"}
            onKeyDown={onKeyDown}
            onPointerEnter={hero ? (event) => { if (event.pointerType === "mouse") setHovered(true); } : undefined}
            onPointerLeave={hero ? () => setHovered(false) : undefined}
        >
            {hero ? (
                <div className={styles.windowBar}>
                    <span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span>
                    <span className={styles.windowTitle}>{active.title}</span>
                    <span className={styles.live}><i aria-hidden="true" />Live in this page</span>
                </div>
            ) : source !== undefined ? (
                source.summary === undefined ? null : <p className={styles.summary}>{source.summary}</p>
            ) : (
                <>
                    <ul className={styles.tabs} aria-label="Scenario">
                        {list.map(candidate => (
                            <li key={candidate.id}>
                                <button type="button" aria-pressed={candidate.id === scenario.id} onClick={() => setScenarioId(candidate.id)}>{candidate.title}</button>
                            </li>
                        ))}
                    </ul>
                    <p className={styles.summary}>{scenario.summary}</p>
                </>
            )}
            {trace && viewProps ? (
                <>
                    <div className={styles.stage} tabIndex={0} aria-label="The steps. Use the left and right arrow keys to move through the steps, and the space key to play or pause.">
                        <Panel
                            className={styles.codePanel}
                            title={hero ? "Code" : active.title}
                            aside={step ? <span className={styles.where} style={{ "--lane" : laneColor(lanes.get(step.lane)) } as CSSProperties}><i aria-hidden="true" />{step.frameId === "root" ? "root frame" : step.frameId}</span> : undefined}
                        >
                            <CodeView lines={active.lines} {...viewProps} />
                            <ReadsBar {...viewProps} />
                        </Panel>
                        <Panel className={styles.framePanel} title="Frames" aside={hero ? undefined : "Arrows point to the parent"}>
                            <FrameGraph {...viewProps} />
                        </Panel>
                        {hero ? (
                            <Panel className={styles.consolePanel} title="Console">
                                <ConsoleView {...viewProps} />
                            </Panel>
                        ) : null}
                    </div>
                    <div className={styles.timelinePanel}>
                        <LaneTimeline {...viewProps} onSeek={(index) => { if (hero) setStopped(true); player.setIndex(index); }} />
                        <Controls player={hero ? heroPlayer : player} count={count} compact={hero} />
                    </div>
                    {hero ? (
                        <p className={styles.heroFoot}>
                            The page starts this code with the real library. Each step is a statement or the end of an <code>await</code>.{" "}
                            <Link to="/explore/debugger">Open the debugger</Link>, or <Link to="/explore/playground">write your own code in the playground</Link>.
                        </p>
                    ) : (
                        <div className={styles.lower}>
                            <Panel className={styles.stepPanel} title="Step">
                                <StepView {...viewProps} compare={compareTrace} />
                            </Panel>
                            <Panel
                                className={styles.consolePanel}
                                title="Console"
                                aside={(
                                    <label className={styles.compareSelect}>
                                        Compare with
                                        <select value={compare} onChange={(event) => setCompare(event.target.value as CompareMode | "none")}>
                                            <option value="none">nothing</option>
                                            <option value="global-kept">{COMPARE_LABELS["global-kept"].toLowerCase()}</option>
                                            <option value="global-restored">{COMPARE_LABELS["global-restored"].toLowerCase()}</option>
                                        </select>
                                    </label>
                                )}
                            >
                                <ConsoleView {...viewProps} compare={compare === "none" ? undefined : compareTrace} compareLabel={compare === "none" ? "" : COMPARE_LABELS[compare]} />
                            </Panel>
                        </div>
                    )}
                    {trace.error ? <p className={styles.error} role="alert">The scenario stopped with an error: {trace.error}</p> : null}
                </>
            ) : (
                <p className={styles.loading} data-loading="true" aria-busy="true">The scenario starts.</p>
            )}
        </section>
    );
}

export default ContextDebugger;

import { lazy, Suspense } from "react";
import { Link } from "react-router";
import examples from "virtual:transform-examples?only=async-function";
import { useSections } from "../app/SectionsContext";
import { REPOSITORY_URL, SITE_NAME } from "../app/site";
import { HighlightedCode } from "../components/Code/HighlightedCode";
import { HomeStats } from "./HomeStats";
import { InstallCommand } from "./InstallCommand";
import styles from "./Home.module.css";

const ContextDebugger = lazy(() => import("../debugger/ContextDebugger"));
const CompareConsoles = lazy(async () => ({ default : (await import("./live")).CompareConsoles }));
const FrameSnapshot = lazy(async () => ({ default : (await import("./live")).FrameSnapshot }));

/** The groups of patched APIs. The README and the page "Patched APIs" give the full list. */
const PATCHES : readonly { group : string; apis : readonly string[] }[] = [
    { group : "Promises", apis : ["then", "catch", "finally", "Promise.all"] },
    { group : "Timers", apis : ["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback", "scheduler.postTask"] },
    { group : "Events", apis : ["addEventListener", "on… properties", "MediaQueryList"] },
    { group : "Observers", apis : ["MutationObserver", "ResizeObserver", "IntersectionObserver", "PerformanceObserver", "FinalizationRegistry"] },
    { group : "Streams", apis : ["ReadableStream", "WritableStream", "TransformStream"] },
    { group : "Other callbacks", apis : ["navigator.locks", "toBlob", "geolocation", "startViewTransition", "Array.fromAsync"] },
];

/** The tools that have a guide. */
const WORKS_WITH : readonly { label : string; to : string }[] = [
    { label : "Vite", to : "/docs/getting-started" },
    { label : "Babel", to : "/docs/getting-started" },
    { label : "React", to : "/docs/guides/react" },
    { label : "Vitest", to : "/docs/guides/testing-with-vitest" },
    { label : "OpenTelemetry", to : "/docs/guides/opentelemetry" },
    { label : "Node.js", to : "/docs/api" },
];

function Loading({ text, className } : { text : string; className : string | undefined }) {
    return <div className={className} data-loading="true" aria-busy="true">{text}</div>;
}

function GitHubMark() {
    return (
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
    );
}

/** The home page: what the library does, a live debugger, the measurements, how it operates, and the sections of the site. */
export function HomePage() {
    const sections = useSections().filter(section => section.card);
    const transform = examples.find(example => example.id === "async-function") ?? examples[0];
    return (
        <div className={styles.page}>
            <title>{`${SITE_NAME}: AsyncLocalStorage for the browser`}</title>
            <section className={styles.hero} aria-labelledby="home-title">
                <div className={styles.heroText}>
                    <p className={styles.eyebrow}>TC39 AsyncContext · Node.js AsyncLocalStorage</p>
                    <h1 id="home-title" className={styles.title}>AsyncLocalStorage for the browser</h1>
                    <p className={styles.lead}>
                        Set a value one time, for example a request ID. All the code of that operation gets the value:
                        after <code>await</code>, in promise callbacks, timers, event listeners and generators.
                    </p>
                    <p className={styles.subLead}>
                        A Vite plugin or a Babel preset changes your async functions. A small runtime keeps the context.
                        On Node.js, the package uses the native <code>AsyncLocalStorage</code>.
                    </p>
                    <InstallCommand />
                    <p className={styles.actions}>
                        <Link className="button" data-variant="primary" to="/docs/getting-started">Read the guide</Link>
                        <Link className="button" to="/explore/debugger">Open the debugger</Link>
                        <a className={`button ${styles.githubButton}`} href={REPOSITORY_URL}><GitHubMark />GitHub</a>
                    </p>
                    <p className={styles.worksWith}>
                        <span>Works with</span>
                        {WORKS_WITH.map(item => <Link key={item.label} to={item.to}>{item.label}</Link>)}
                    </p>
                </div>
                <HomeStats />
            </section>

            <section className={styles.demo} aria-label="A live example">
                <Suspense fallback={<Loading text="The live example loads." className={styles.heroLoading} />}>
                    <ContextDebugger variant="hero" scenario="two-requests" />
                </Suspense>
            </section>

            <section className={styles.band} aria-labelledby="problem-title">
                <div className={styles.bandText}>
                    <h2 id="problem-title" className={styles.bandTitle}>A global variable is not sufficient</h2>
                    <p>
                        Two requests run at the same time. Each request keeps its ID in a variable, and writes the ID to the log after each <code>await</code>.
                    </p>
                    <p>
                        With one global variable, the second request changes the value while the first request waits. After the <code>await</code>, the first
                        request writes the ID of the second request. The library keeps one value for each request.
                    </p>
                    <p className={styles.bandNote}>The page starts the two runs when it loads, with the same code. The lines below are the real output.</p>
                </div>
                <Suspense fallback={<Loading text="The two runs start." className={styles.compareLoading} />}>
                    <CompareConsoles />
                </Suspense>
            </section>

            <section className={styles.how} aria-labelledby="how-title">
                <h2 id="how-title" className={styles.sectionTitle}>How the library operates</h2>
                <ol className={styles.steps}>
                    <li className={styles.step}>
                        <div className={styles.stepText}>
                            <span className={styles.stepNumber}>1</span>
                            <h3>The transform</h3>
                            <p>
                                A native <code>await</code> does not tell JavaScript code when the function continues. Thus, the Vite plugin or the Babel preset
                                changes each async function into a generator. Each <code>await</code> becomes a <code>yield</code>, and the runtime operates the generator.
                            </p>
                            <p><Link to="/explore/transform">Look at more examples of the transform</Link></p>
                        </div>
                        {transform ? (
                            <div className={styles.transform}>
                                <HighlightedCode lines={transform.inputLines} label="Your code" />
                                <span className={styles.arrow} aria-hidden="true">↓ the preset</span>
                                <HighlightedCode lines={transform.outputLines} label="The output of the preset" />
                            </div>
                        ) : null}
                    </li>
                    <li className={styles.step}>
                        <div className={styles.stepText}>
                            <span className={styles.stepNumber}>2</span>
                            <h3>The frames</h3>
                            <p>
                                Each <code>run()</code> makes a frame below the current frame. Before each step of a function, the runtime makes the frame of the
                                function current. After the step, it sets the previous frame again. <code>get()</code> searches from the current frame up to the root.
                            </p>
                            <p><Link to="/docs/concepts/contexts-and-frames">Read about contexts and frames</Link></p>
                        </div>
                        <Suspense fallback={<Loading text="The scenario starts." className={styles.snapshotLoading} />}>
                            <FrameSnapshot />
                        </Suspense>
                    </li>
                    <li className={styles.step}>
                        <div className={styles.stepText}>
                            <span className={styles.stepNumber}>3</span>
                            <h3>The patches</h3>
                            <p>
                                A callback gets the context of the code that registered it. The runtime patches the APIs that call callbacks later. The patches keep
                                the names, the lengths and the source text of the native functions.
                            </p>
                            <p><Link to="/docs/concepts/patched-apis">Read the list of patched APIs</Link></p>
                        </div>
                        <ul className={styles.patches}>
                            {PATCHES.map(group => (
                                <li key={group.group}>
                                    <span className={styles.patchGroup}>{group.group}</span>
                                    <span className={styles.patchList}>{group.apis.map(api => <code key={api}>{api}</code>)}</span>
                                </li>
                            ))}
                        </ul>
                    </li>
                </ol>
            </section>

            <section className={styles.sections} aria-labelledby="sections-title">
                <h2 id="sections-title" className={styles.sectionTitle}>What this site holds</h2>
                <ul className={styles.cards}>
                    {sections.map(section => {
                        const Detail = section.card?.Detail;
                        return (
                            <li key={section.id} className={styles.card}>
                                <h3 className={styles.cardTitle}><Link to={section.path}>{section.label}</Link></h3>
                                <p className={styles.cardText}>{section.card?.summary}</p>
                                {Detail ? <Detail /> : null}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}

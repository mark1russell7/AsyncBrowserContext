import { Link } from "react-router";
import { useSiteData } from "../data/DataSourceContext";
import type { DataRun } from "../data/types";
import styles from "./Home.module.css";

/** The source of one data file: the CI run that measured it, or the date of a local run. */
type Source = { readonly run? : DataRun | undefined; readonly generated : string };

/** This component shows the run of one data file, with a link to that run. A file from a local run names its date. */
function RunName({ source, kind = "CI run" } : { source : Source; kind? : string }) {
    if (source.run === undefined) return <>a local run of {source.generated.slice(0, 10)}</>;
    return <><a href={source.run.url}>{kind} {source.run.id}</a> of {source.run.date.slice(0, 10)}</>;
}

/** This component tells which runs measured the values, so that a reader can open each run. */
function StatSources({ size, mutation, bench } : { size : Source; mutation : Source; bench : Source }) {
    const sameRun = size.run !== undefined && size.run.id === bench.run?.id;
    return (
        <p className={styles.statSources}>
            {sameRun
                ? <>The size and the time come from <RunName source={bench} />.</>
                : <>The size comes from <RunName source={size} />. The time comes from <RunName source={bench} />.</>}
            {" "}The mutation score comes from <RunName source={mutation} kind="the Stryker run" />.
        </p>
    );
}

function Stat({ value, label, to, loading = false } : { value : string | undefined; label : string; to : string; loading? : boolean }) {
    return (
        <li className={styles.stat}>
            <Link to={to}>
                <span className={styles.statValue} data-loading={loading ? "true" : undefined}>{value ?? (loading ? "…" : "–")}</span>
                <span className={styles.statLabel}>{label}</span>
            </Link>
        </li>
    );
}

/** Four measured facts about the library. The values come from the data files of the site, which the test tools write. */
export function HomeStats() {
    const size = useSiteData("size");
    const mutation = useSiteData("mutation");
    const bench = useSiteData("bench");
    const sizeValue = size.status === "ready" ? `${(size.value.gzipBytes / 1000).toFixed(1)} kB` : undefined;
    const score = mutation.status === "ready" && mutation.value.stryker ? `${Math.floor(mutation.value.stryker.score)}%` : undefined;
    const get = bench.status === "ready" ? bench.value.rows.find(row => row.benchmark === "get in nested contexts") : undefined;
    // The scenario does 100,000 reads.
    const getValue = get ? `${Math.round((get.libraryMs * 1e6) / 100_000)} ns` : undefined;
    return (
        <div className={styles.statBlock}>
            <ul className={styles.stats} aria-label="Measurements">
                <Stat value={sizeValue} loading={size.status === "loading"} label="The full browser runtime, minified and compressed with gzip" to="/docs/concepts/patched-apis" />
                <Stat value={score} loading={mutation.status === "loading"} label="Mutation score of the runtime and the transform" to="/testing/results" />
                <Stat value={getValue} loading={bench.status === "loading"} label="The time of one get(), five contexts deep" to="/testing/performance" />
                <Stat value="4" label="Engines in each CI run: Node.js, Chromium, Firefox and WebKit" to="/testing" />
            </ul>
            {size.status === "ready" && mutation.status === "ready" && bench.status === "ready"
                ? <StatSources size={size.value} mutation={mutation.value} bench={bench.value} />
                : null}
        </div>
    );
}

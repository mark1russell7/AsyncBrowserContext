import type { DataRun } from "../data/types";

/** The source of one data file: the CI run that measured it, or the date of a local run. */
export type Source = { readonly run? : DataRun | undefined; readonly generated : string };

/** This component shows the run of one data file, with a link to that run. A file from a local run names its date. */
export function RunName({ source, kind = "CI run" } : { source : Source; kind? : string }) {
    if (source.run === undefined) return <>a local run of {source.generated.slice(0, 10)}</>;
    return <><a href={source.run.url}>{kind} {source.run.id}</a> of {source.run.date.slice(0, 10)}</>;
}

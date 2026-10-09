import type { ReactNode } from "react";
import { Callout } from "../components/Callout/Callout";
import { useSiteData } from "../data/DataSourceContext";
import type { SiteDataMap, SiteDataName } from "../data/types";
import { formatDateTime } from "../lib/format";

/**
 * This component loads one data file and gives it to `children`. While the
 * file loads, it shows a busy line. If the file does not load, it shows the
 * error. A file with sample values gets a note.
 */
export function DataState<K extends SiteDataName>({ name, children } : { name : K; children : (data : SiteDataMap[K]) => ReactNode }) {
    const state = useSiteData(name);
    if (state.status === "loading") return <p aria-busy="true" data-loading="">The data loads.</p>;
    if (state.status === "error") {
        return (
            <Callout type="caution" title="The data did not load">
                <p>{state.error.message}</p>
            </Callout>
        );
    }
    return (
        <>
            {state.value.sample ? (
                <Callout type="note" title="Sample values">
                    <p>
                        The file <code>data/{name}.json</code> contains sample values from the review of 2026-10-08. The test
                        tools replace it with measured results.
                    </p>
                </Callout>
            ) : (
                <p className="visually-hidden">The tools wrote this data at {formatDateTime(state.value.generated)}.</p>
            )}
            {children(state.value)}
        </>
    );
}

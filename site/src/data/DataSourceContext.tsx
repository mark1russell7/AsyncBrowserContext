import { createContext, useContext, type ReactNode } from "react";
import { useAsync, type AsyncState } from "../lib/use-async";
import type { SiteDataSource } from "./source";
import type { SiteDataMap, SiteDataName } from "./types";

const DataSourceContext = createContext<SiteDataSource | undefined>(undefined);

export function DataSourceProvider({ source, children } : { source : SiteDataSource; children : ReactNode }) {
    return <DataSourceContext value={source}>{children}</DataSourceContext>;
}

export function useDataSource() : SiteDataSource {
    const source = useContext(DataSourceContext);
    if (!source) throw new Error("useDataSource() needs a DataSourceProvider.");
    return source;
}

/** This hook loads one data file and gives its state. */
export function useSiteData<K extends SiteDataName>(name : K) : AsyncState<SiteDataMap[K]> {
    const source = useDataSource();
    return useAsync(() => source.load(name), [source, name]);
}

import { memoizePromise } from "../lib/memoize-promise";
import type { SiteDataMap, SiteDataName } from "./types";
import { validateDataFile } from "./validate";

/** Read access to the data files. Components use this type, so a test can give data from memory. */
export type SiteDataSource = {
    load<K extends SiteDataName>(name : K) : Promise<SiteDataMap[K]>;
};

type Fetch = (url : string) => Promise<{ ok : boolean; status : number; json() : Promise<unknown> }>;

/**
 * This function makes a source that loads `data/<name>.json` below the base
 * URL of the site. It loads each file one time. If a load fails, the next
 * use loads the file again.
 */
export function createHttpDataSource(baseUrl : string, fetchFile : Fetch = (url) => fetch(url)) : SiteDataSource {
    const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const loaders = new Map<SiteDataName, () => Promise<unknown>>();
    return {
        load<K extends SiteDataName>(name : K) : Promise<SiteDataMap[K]> {
            let loader = loaders.get(name);
            if (loader === undefined) {
                loader = memoizePromise(async () => {
                    const response = await fetchFile(`${base}data/${name}.json`);
                    if (!response.ok) throw new Error(`The file data/${name}.json did not load (HTTP ${response.status}).`);
                    return validateDataFile(name, await response.json());
                });
                loaders.set(name, loader);
            }
            return loader() as Promise<SiteDataMap[K]>;
        },
    };
}

/** This function makes a source from data in memory, for tests. A missing file gives an error. */
export function createMemoryDataSource(data : Partial<SiteDataMap>) : SiteDataSource {
    return {
        load<K extends SiteDataName>(name : K) : Promise<SiteDataMap[K]> {
            const value = data[name];
            if (value === undefined) return Promise.reject(new Error(`There is no file data/${name}.json.`));
            return Promise.resolve(validateDataFile(name, value));
        },
    };
}

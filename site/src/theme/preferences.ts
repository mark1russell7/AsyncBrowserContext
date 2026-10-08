/** A small key-value store for reader preferences, for example the color theme. */
export type PreferenceStore = {
    get(key : string) : string | null;
    /** `null` removes the key. */
    set(key : string, value : string | null) : void;
};

/**
 * A store on `localStorage`. Every access is in try/catch: the browser can
 * block storage (private windows, site settings) or the storage can be full.
 * Then the store forgets values, and the site still works.
 */
export function createBrowserPreferenceStore(
    getStorage : () => Storage | undefined = () => window.localStorage,
) : PreferenceStore {
    return {
        get(key) {
            try {
                return getStorage()?.getItem(key) ?? null;
            } catch {
                return null;
            }
        },
        set(key, value) {
            try {
                const storage = getStorage();
                if (!storage) return;
                if (value === null) storage.removeItem(key);
                else storage.setItem(key, value);
            } catch {
                // The storage is not available. The preference lasts until the page closes.
            }
        },
    };
}

/** A store in memory, for tests. */
export function createMemoryPreferenceStore(initial : Readonly<Record<string, string>> = {}) : PreferenceStore {
    const values = new Map(Object.entries(initial));
    return {
        get : (key) => values.get(key) ?? null,
        set(key, value) {
            if (value === null) values.delete(key);
            else values.set(key, value);
        },
    };
}

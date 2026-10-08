import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createMemoryPreferenceStore, type PreferenceStore } from "./preferences";

const PreferenceStoreContext = createContext<PreferenceStore | undefined>(undefined);

export function PreferenceStoreProvider({ store, children } : { store : PreferenceStore; children : ReactNode }) {
    return <PreferenceStoreContext value={store}>{children}</PreferenceStoreContext>;
}

const fallbackStore = createMemoryPreferenceStore();

/** The reader preference store. Outside a provider, a store in memory. */
export function usePreferenceStore() : PreferenceStore {
    return useContext(PreferenceStoreContext) ?? fallbackStore;
}

/** A yes/no preference that the store keeps. */
export function useStoredFlag(key : string, initial : boolean) : [boolean, (value : boolean) => void] {
    const store = usePreferenceStore();
    const [value, setValue] = useState(() => {
        const stored = store.get(key);
        return stored === null ? initial : stored === "true";
    });
    const update = useCallback((next : boolean) => {
        setValue(next);
        store.set(key, next === initial ? null : String(next));
    }, [store, key, initial]);
    return [value, update];
}

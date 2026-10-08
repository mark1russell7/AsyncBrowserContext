import {
    createContext,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import type { PreferenceStore } from "./preferences";
import {
    THEME_STORAGE_KEY,
    parseThemePreference,
    resolveTheme,
    type ResolvedTheme,
    type ThemePreference,
} from "./theme";

export type ThemeContextValue = {
    preference : ThemePreference;
    /** The theme that shows at this time: the preference, or the system theme for "system". */
    resolved : ResolvedTheme;
    setPreference(preference : ThemePreference) : void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemTheme(onChange : () => void) : () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const query = window.matchMedia(DARK_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

function systemPrefersDark() : boolean {
    return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(DARK_QUERY).matches;
}

function applyThemeAttribute(preference : ThemePreference) : void {
    const root = document.documentElement;
    if (preference === "system") delete root.dataset["theme"];
    else root.dataset["theme"] = preference;
}

export function ThemeProvider({ store, children } : { store : PreferenceStore; children : ReactNode }) {
    const [preference, setPreferenceState] = useState<ThemePreference>(
        () => parseThemePreference(store.get(THEME_STORAGE_KEY)),
    );
    const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark, () => false);
    const resolved = resolveTheme(preference, systemDark);

    // The inline script in index.html sets the attribute before the first paint.
    // This effect keeps it in sync with the state.
    useLayoutEffect(() => {
        applyThemeAttribute(preference);
    }, [preference]);

    const setPreference = useCallback((next : ThemePreference) => {
        // Change the attribute before the render, so components that read the
        // color tokens during the render (charts, diagrams) get the new colors.
        applyThemeAttribute(next);
        setPreferenceState(next);
        store.set(THEME_STORAGE_KEY, next === "system" ? null : next);
    }, [store]);

    const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
    return <ThemeContext value={value}>{children}</ThemeContext>;
}

const standalone : ThemeContextValue = {
    preference : "system",
    get resolved() : ResolvedTheme {
        if (typeof document !== "undefined") {
            const attribute = document.documentElement.dataset["theme"];
            if (attribute === "light" || attribute === "dark") return attribute;
        }
        return systemPrefersDark() ? "dark" : "light";
    },
    setPreference : () => {},
};

/**
 * The current theme. A component outside a `ThemeProvider` (for example in a
 * test) gets the theme from the document and cannot change it.
 */
export function useTheme() : ThemeContextValue {
    return useContext(ThemeContext) ?? standalone;
}

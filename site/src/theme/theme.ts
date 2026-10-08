export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "abc-site:theme";

const ORDER : readonly ThemePreference[] = ["system", "light", "dark"];

const LABELS : Readonly<Record<ThemePreference, string>> = {
    system : "System",
    light : "Light",
    dark : "Dark",
};

/** This function reads a stored value. A value that is not "light" or "dark" means "system". */
export function parseThemePreference(value : string | null | undefined) : ThemePreference {
    return value === "light" || value === "dark" ? value : "system";
}

/** The preference that the theme button selects next: system, light, dark, then system again. */
export function nextThemePreference(current : ThemePreference) : ThemePreference {
    return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system";
}

export function resolveTheme(preference : ThemePreference, systemPrefersDark : boolean) : ResolvedTheme {
    if (preference === "system") return systemPrefersDark ? "dark" : "light";
    return preference;
}

export function themeLabel(preference : ThemePreference) : string {
    return LABELS[preference];
}

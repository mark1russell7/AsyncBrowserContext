import { nextThemePreference, themeLabel, type ThemePreference } from "./theme";
import { useTheme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

function ThemeIcon({ preference } : { preference : ThemePreference }) {
    if (preference === "light") {
        return (
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M4 4l1.8 1.8M14.2 14.2 16 16M4 16l1.8-1.8M14.2 5.8 16 4"
                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        );
    }
    if (preference === "dark") {
        return (
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M15.5 12.8A6.5 6.5 0 0 1 7.2 4.5a6.5 6.5 0 1 0 8.3 8.3Z"
                    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 3a7 7 0 0 1 0 14Z" fill="currentColor" />
        </svg>
    );
}

/** A button that changes the color theme: system, light, then dark. */
export function ThemeToggle() {
    const { preference, setPreference } = useTheme();
    const next = nextThemePreference(preference);
    return (
        <button
            type="button"
            className={styles.toggle}
            data-theme-toggle=""
            onClick={() => setPreference(next)}
            aria-label={`Theme: ${themeLabel(preference)}. Select to use the ${themeLabel(next).toLowerCase()} theme.`}
        >
            <ThemeIcon preference={preference} />
            <span className={styles.label}>{themeLabel(preference)}</span>
        </button>
    );
}

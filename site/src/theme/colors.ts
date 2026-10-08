import { useMemo } from "react";
import { useTheme } from "./ThemeProvider";

/**
 * The resolved theme colors, for libraries that need color values instead of
 * CSS custom properties (Observable Plot, Mermaid, React Flow).
 */
export type ThemeColors = {
    /** The categorical series colors, in fixed order. */
    series : readonly string[];
    page : string;
    surface : string;
    surfaceSunken : string;
    ink : string;
    inkSecondary : string;
    inkMuted : string;
    rule : string;
    ruleStrong : string;
    grid : string;
    accent : string;
    accentWash : string;
    mark : string;
    chartGrid : string;
    chartAxis : string;
    status : {
        good : string;
        goodInk : string;
        warning : string;
        warningInk : string;
        critical : string;
        criticalInk : string;
        neutral : string;
    };
};

const LIGHT : ThemeColors = {
    series : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
    page : "#f5f6f9",
    surface : "#ffffff",
    surfaceSunken : "#eef1f6",
    ink : "#151c2e",
    inkSecondary : "#454f67",
    inkMuted : "#5f6880",
    rule : "#d6dbe5",
    ruleStrong : "#aeb6c7",
    grid : "#e7eaf1",
    accent : "#2346c4",
    accentWash : "#e7ecfd",
    mark : "#c2301f",
    chartGrid : "#e6e9f0",
    chartAxis : "#9aa1b3",
    status : {
        good : "#0ca30c",
        goodInk : "#006300",
        warning : "#fab219",
        warningInk : "#7a5200",
        critical : "#d03b3b",
        criticalInk : "#a3262a",
        neutral : "#8a91a3",
    },
};

/** This function reads the color tokens (refer to styles/tokens.css) from the document. */
export function readThemeColors(root? : Element) : ThemeColors {
    const element = root ?? (typeof document === "undefined" ? undefined : document.documentElement);
    if (!element || typeof getComputedStyle === "undefined") return LIGHT;
    const style = getComputedStyle(element);
    const read = (name : string, fallback : string) : string => style.getPropertyValue(name).trim() || fallback;
    return {
        series : LIGHT.series.map((fallback, index) => read(`--series-${index + 1}`, fallback)),
        page : read("--color-page", LIGHT.page),
        surface : read("--color-surface", LIGHT.surface),
        surfaceSunken : read("--color-surface-sunken", LIGHT.surfaceSunken),
        ink : read("--color-ink", LIGHT.ink),
        inkSecondary : read("--color-ink-secondary", LIGHT.inkSecondary),
        inkMuted : read("--color-ink-muted", LIGHT.inkMuted),
        rule : read("--color-rule", LIGHT.rule),
        ruleStrong : read("--color-rule-strong", LIGHT.ruleStrong),
        grid : read("--color-grid", LIGHT.grid),
        accent : read("--color-accent", LIGHT.accent),
        accentWash : read("--color-accent-wash", LIGHT.accentWash),
        mark : read("--color-mark", LIGHT.mark),
        chartGrid : read("--chart-grid", LIGHT.chartGrid),
        chartAxis : read("--chart-axis", LIGHT.chartAxis),
        status : {
            good : read("--status-good", LIGHT.status.good),
            goodInk : read("--status-good-ink", LIGHT.status.goodInk),
            warning : read("--status-warning", LIGHT.status.warning),
            warningInk : read("--status-warning-ink", LIGHT.status.warningInk),
            critical : read("--status-critical", LIGHT.status.critical),
            criticalInk : read("--status-critical-ink", LIGHT.status.criticalInk),
            neutral : read("--status-neutral", LIGHT.status.neutral),
        },
    };
}

/** The categorical color in slot `index` (0 is slot 1). The slots do not cycle: a chart puts extra series into "Other". */
export function seriesColor(colors : ThemeColors, index : number) : string {
    return colors.series[Math.min(index, colors.series.length - 1)] ?? colors.accent;
}

/** The theme colors. The value changes when the theme changes. */
export function useThemeColors() : ThemeColors {
    const { resolved } = useTheme();
    return useMemo(() => readThemeColors(), [resolved]);
}

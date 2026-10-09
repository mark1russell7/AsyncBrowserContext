import type * as PlotTypes from "@observablehq/plot";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useElementWidth } from "../../lib/use-element-width";
import { useThemeColors, type ThemeColors } from "../../theme/colors";
import { DataTableDisclosure, type DataTableSpec } from "../DataTable/DataTable";
import styles from "./PlotFigure.module.css";

export type PlotModule = typeof PlotTypes;
export type PlotOptions = PlotTypes.PlotOptions;
export type Markish = PlotTypes.Markish;

/** What a chart builder gets: the measured width, the theme colors and the Plot module. */
export type PlotContext = {
    width : number;
    theme : ThemeColors;
    Plot : PlotModule;
};

export type PlotOptionsInput = PlotOptions | ((context : PlotContext) => PlotOptions);
export type MarksInput = readonly Markish[] | ((context : PlotContext) => readonly Markish[]);

type LayoutProps = Omit<PlotOptions,
    "marks" | "title" | "subtitle" | "caption" | "figure" | "ariaLabel" | "ariaDescription" | "document">;

export type PlotFigureProps = LayoutProps & {
    /** The chart title. It is also the accessible name of the chart. */
    title : string;
    /** A longer text alternative: what the chart shows and what it means. */
    description? : string;
    caption? : ReactNode;
    /** The full Plot options, or a function of the context that gives them. */
    options? : PlotOptionsInput;
    /** Marks, if the page gives the layout as props instead of `options`. */
    marks? : MarksInput;
    /** The same data as a table, behind a disclosure under the chart. */
    table? : DataTableSpec;
    /** When true, the title is not visible. It stays the accessible name. */
    hideTitle? : boolean;
};

let plotModule : PlotModule | undefined;
let plotLoading : Promise<PlotModule> | undefined;

function loadPlot() : Promise<PlotModule> {
    plotLoading ??= import("@observablehq/plot").then(
        (module) => {
            plotModule = module;
            return module;
        },
        (error : unknown) => {
            plotLoading = undefined;
            throw error;
        },
    );
    return plotLoading;
}

function withDefaults(options : PlotOptions, context : PlotContext, title : string, description? : string) : PlotOptions {
    const color = options.color ?? {};
    const hasColors = "range" in color || "scheme" in color || "interpolate" in color;
    const style = typeof options.style === "object" && options.style !== null ? options.style : {};
    const result : PlotOptions = {
        width : context.width,
        height : 260,
        ...options,
        color : hasColors ? color : { ...color, range : [...context.theme.series] },
        style : typeof options.style === "string"
            ? options.style
            : { fontFamily : "inherit", fontSize : "12px", overflow : "visible", ...style },
        ariaLabel : title,
    };
    if (description) result.ariaDescription = description;
    return result;
}

/**
 * The one wrapper for Observable Plot charts. It does these steps:
 * - It loads Plot when a page needs it.
 * - It fits the chart to the width of its container.
 * - It gives the theme colors to the chart.
 * - It makes the chart again when the props, the width or the theme change.
 */
export function PlotFigure(props : PlotFigureProps) {
    const { title, description, caption, options, marks, table, hideTitle, ...layout } = props;
    const titleId = useId();
    const hostRef = useRef<HTMLDivElement>(null);
    const width = useElementWidth(hostRef);
    const theme = useThemeColors();
    const [module, setModule] = useState<PlotModule | undefined>(plotModule);
    const [loadError, setLoadError] = useState<string>();
    const [renderError, setRenderError] = useState<string>();
    const renderErrorRef = useRef<string | undefined>(undefined);
    const reportRenderError = (message : string | undefined) : void => {
        if (renderErrorRef.current === message) return;
        renderErrorRef.current = message;
        setRenderError(message);
    };

    useEffect(() => {
        if (module) return undefined;
        let current = true;
        loadPlot().then(
            (loaded) => { if (current) setModule(loaded); },
            (error : unknown) => { if (current) setLoadError(error instanceof Error ? error.message : String(error)); },
        );
        return () => { current = false; };
    }, [module]);

    // The props have no stable identity, so the chart is made again after every render.
    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host || !module || width === 0) return;
        try {
            const context : PlotContext = { width, theme, Plot : module };
            const resolved = typeof options === "function" ? options(context) : (options ?? {});
            const extraMarks = typeof marks === "function" ? marks(context) : (marks ?? []);
            const chart = module.plot(withDefaults({
                ...layout,
                ...resolved,
                marks : [...extraMarks, ...(resolved.marks ?? [])],
            }, context, title, description));
            host.replaceChildren(chart);
            reportRenderError(undefined);
        } catch (error) {
            host.replaceChildren();
            reportRenderError(error instanceof Error ? error.message : String(error));
        }
    });

    const loading = !module && !loadError;
    return (
        <figure className={styles.figure} aria-labelledby={titleId} aria-busy={loading ? true : undefined} data-loading={loading ? "" : undefined}>
            <p id={titleId} className={hideTitle ? "visually-hidden" : styles.title}>{title}</p>
            {loading ? <p className={styles.status}>The chart loads.</p> : null}
            {loadError ? <p className={styles.status}>The chart did not load: {loadError}</p> : null}
            {renderError ? <p className={styles.status}>The chart did not render: {renderError}</p> : null}
            <div ref={hostRef} className={styles.plot} />
            {table ? <DataTableDisclosure spec={table} title={title} /> : null}
            {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
        </figure>
    );
}

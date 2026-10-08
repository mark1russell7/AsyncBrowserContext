import { useEffect, useId, useState, type ReactNode } from "react";
import { useThemeColors, type ThemeColors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeProvider";
import styles from "./Mermaid.module.css";

type MermaidApi = typeof import("mermaid")["default"];

let mermaidLoading : Promise<MermaidApi> | undefined;

function loadMermaid() : Promise<MermaidApi> {
    mermaidLoading ??= import("mermaid").then(
        (module) => module.default,
        (error : unknown) => {
            mermaidLoading = undefined;
            throw error;
        },
    );
    return mermaidLoading;
}

/** Mermaid's "base" theme, with the site colors. */
function themeVariables(colors : ThemeColors, dark : boolean) : Record<string, string | boolean> {
    return {
        darkMode : dark,
        fontFamily : "\"Atkinson Hyperlegible Next Variable\", system-ui, sans-serif",
        fontSize : "15px",
        background : colors.surface,
        primaryColor : colors.surfaceSunken,
        primaryTextColor : colors.ink,
        primaryBorderColor : colors.inkSecondary,
        secondaryColor : colors.accentWash,
        secondaryTextColor : colors.ink,
        secondaryBorderColor : colors.accent,
        tertiaryColor : colors.surface,
        tertiaryTextColor : colors.ink,
        tertiaryBorderColor : colors.rule,
        lineColor : colors.inkSecondary,
        textColor : colors.ink,
        mainBkg : colors.surfaceSunken,
        nodeBorder : colors.inkSecondary,
        clusterBkg : colors.surface,
        clusterBorder : colors.ruleStrong,
        edgeLabelBackground : colors.surface,
        noteBkgColor : colors.accentWash,
        noteTextColor : colors.ink,
        noteBorderColor : colors.accent,
        actorBkg : colors.surfaceSunken,
        actorBorder : colors.inkSecondary,
        actorTextColor : colors.ink,
        actorLineColor : colors.ruleStrong,
        signalColor : colors.ink,
        signalTextColor : colors.ink,
        labelBoxBkgColor : colors.surfaceSunken,
        labelBoxBorderColor : colors.inkSecondary,
        labelTextColor : colors.ink,
        loopTextColor : colors.ink,
        activationBkgColor : colors.accentWash,
        activationBorderColor : colors.accent,
        sequenceNumberColor : colors.surface,
        stateLabelColor : colors.ink,
        transitionColor : colors.inkSecondary,
        transitionLabelColor : colors.ink,
    };
}

let renderCount = 0;

type DiagramState =
    | { status : "loading" }
    | { status : "ready"; svg : string }
    | { status : "error"; message : string };

export type MermaidProps = {
    /** The diagram in Mermaid syntax. */
    chart : string;
    /** The accessible name of the diagram, for example "Page lifecycle states". */
    title? : string;
    caption? : ReactNode;
};

/**
 * A Mermaid diagram (state, sequence or flow). Mermaid loads only when a page
 * shows a diagram. The diagram follows the light or dark theme. The source
 * text is the text alternative: it shows behind a disclosure.
 */
export function Mermaid({ chart, title, caption } : MermaidProps) {
    const { resolved } = useTheme();
    const colors = useThemeColors();
    const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const [state, setState] = useState<DiagramState>({ status : "loading" });

    useEffect(() => {
        let current = true;
        const renderId = `mermaid-${baseId}-${++renderCount}`;
        loadMermaid()
            .then(async (mermaid) => {
                mermaid.initialize({
                    startOnLoad : false,
                    securityLevel : "strict",
                    theme : "base",
                    themeVariables : themeVariables(colors, resolved === "dark"),
                });
                const { svg } = await mermaid.render(renderId, chart.trim());
                if (current) setState({ status : "ready", svg });
            })
            .catch((error : unknown) => {
                if (current) setState({ status : "error", message : error instanceof Error ? error.message : String(error) });
            })
            .finally(() => {
                // Mermaid can leave its temporary nodes in the document after an error.
                document.getElementById(renderId)?.remove();
                document.getElementById(`d${renderId}`)?.remove();
            });
        return () => { current = false; };
    }, [chart, colors, resolved, baseId]);

    const label = title ?? "Diagram";
    return (
        <figure className={styles.figure} aria-busy={state.status === "loading" ? true : undefined}>
            {state.status === "ready" ? (
                <div className={styles.diagram} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html : state.svg }} />
            ) : null}
            {state.status === "loading" ? <p className={styles.status}>The diagram loads.</p> : null}
            {state.status === "error" ? (
                <p className={styles.status}>The diagram did not render: {state.message}</p>
            ) : null}
            <details className={styles.source}>
                <summary>Show the diagram source</summary>
                <pre><code>{chart.trim()}</code></pre>
            </details>
            {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
        </figure>
    );
}

import type { MDXComponents } from "mdx/types";
import { createElement, lazy, Suspense, type ComponentType } from "react";
import { Callout } from "../components/Callout/Callout";
import { Figure } from "../components/Figure/Figure";
import { MdxLink } from "../components/MdxLink/MdxLink";
import { Mermaid } from "../components/Mermaid/Mermaid";
import { PlotFigure } from "../components/PlotFigure/PlotFigure";
import { MarkdownTable } from "../components/ScrollTable/ScrollTable";
import { Tab, Tabs } from "../components/Tabs/Tabs";

/** This function wraps a large component, so that its code loads only when a page uses it. */
function lazyComponent<P extends object>(
    load : () => Promise<{ default : ComponentType<P> }>,
    loadingText : string,
) : ComponentType<P> {
    const Lazy = lazy(load);
    function LazyComponent(props : P) {
        return (
            <Suspense fallback={<p aria-busy="true">{loadingText}</p>}>
                {createElement(Lazy, props)}
            </Suspense>
        );
    }
    return LazyComponent;
}

const ContextTimeline = lazyComponent(() => import("../explore/ContextTimeline"), "The context timeline loads.");
const ContextDebugger = lazyComponent(() => import("../debugger/ContextDebugger"), "The context debugger loads.");
const TransformViewer = lazyComponent(() => import("../explore/TransformViewer"), "The transform viewer loads.");
const EventRuleDemo = lazyComponent(() => import("../explore/EventRuleDemo"), "The event demonstration loads.");
const ProbeTable = lazyComponent<object>(async () => ({ default : (await import("../results/ResultViews")).ProbeTable }), "The probe table loads.");
const MutationChart = lazyComponent<object>(async () => ({ default : (await import("../results/ResultViews")).MutationChart }), "The mutation chart loads.");
const BrowserMatrix = lazyComponent<object>(async () => ({ default : (await import("../results/ResultViews")).BrowserMatrix }), "The browser table loads.");
const BenchChart = lazyComponent<object>(async () => ({ default : (await import("../results/ResultViews")).BenchChart }), "The benchmark chart loads.");

/**
 * The components that MDX pages can use without an import. To add a
 * component, import it and add one line here.
 */
export const mdxComponents = {
    // Overrides of Markdown elements
    a : MdxLink,
    table : MarkdownTable,

    // Components, in alphabetical order
    BenchChart,
    BrowserMatrix,
    Callout,
    ContextDebugger,
    ContextTimeline,
    EventRuleDemo,
    Figure,
    Mermaid,
    MutationChart,
    PlotFigure,
    ProbeTable,
    Tab,
    Tabs,
    TransformViewer,
} satisfies MDXComponents;

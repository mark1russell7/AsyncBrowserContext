/**
 * The type of `virtual:transform-examples` (refer to
 * `build/transform-examples-plugin.ts`).
 */
/** One example of `virtual:transform-examples`, for the home page. */
declare module "virtual:transform-examples?only=async-function" {
    import type { TransformExample } from "virtual:transform-examples";
    const examples : TransformExample[];
    export default examples;
}

declare module "virtual:transform-examples" {
    export type TransformExample = {
        id : string;
        title : string;
        note : string;
        input : string;
        output : string;
        /** The highlighted lines: the text, the light color, the dark color, and `1` for italic text. */
        inputLines : (readonly [string, string, string, 1?])[][];
        outputLines : (readonly [string, string, string, 1?])[][];
    };
    const examples : TransformExample[];
    export default examples;
}

/**
 * The type of `virtual:debugger-scenarios` (refer to
 * `build/debugger-plugin.ts`).
 */
declare module "virtual:debugger-scenarios" {
    /** One token of highlighted code: the text, the light color, the dark color, and `1` for italic text. */
    export type CodeToken = readonly [text : string, light : string, dark : string, italic? : 1];
    export type DebuggerScenario = {
        id : string;
        title : string;
        summary : string;
        /** The code that the debugger shows. It is the code that runs, without the instrumentation. */
        source : string;
        /** The highlighted tokens of each line of `source`. */
        lines : readonly (readonly CodeToken[])[];
        /** This function loads the instrumented module. Its default export starts the scenario. */
        load() : Promise<{ default : () => Promise<void> }>;
    };
    const scenarios : readonly DebuggerScenario[];
    export default scenarios;
}

/**
 * The type of `virtual:search-index` (refer to `build/search-plugin.ts`).
 */
declare module "virtual:search-index" {
    export type SearchHeading = { text : string; id : string };
    export type SearchEntry = {
        path : string;
        section : string;
        title : string;
        description : string;
        headings : SearchHeading[];
        text : string;
    };
    const entries : SearchEntry[];
    export default entries;
}

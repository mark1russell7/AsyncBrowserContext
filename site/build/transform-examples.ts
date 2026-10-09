import { transformAsync } from "@babel/core";
import preset from "../../src/babel/preset.ts";
import { highlightLines, type CodeToken } from "./highlight.ts";

/** One example of the transform viewer: the source code that the preset gets. */
export type TransformInput = {
    id : string;
    title : string;
    /** One sentence that tells what to look for in the output. */
    note : string;
    input : string;
};

/** One example with the code that the preset gives. */
export type TransformExample = TransformInput & {
    output : string;
    /** The highlighted lines of the input and the output. */
    inputLines : CodeToken[][];
    outputLines : CodeToken[][];
};

/** The examples of the transform viewer. Each example shows one part of the preset. */
export const TRANSFORM_INPUTS : readonly TransformInput[] = [
    {
        id : "async-function",
        title : "Async function",
        note : "The function becomes a generator that coroutine operates. Each await becomes a yield, so the runtime can set the context before the function continues.",
        input : [
            "async function handle(id) {",
            "    const user = await load(id);",
            "    log(requestId.getStore(), user);",
            "}",
        ].join("\n"),
    },
    {
        id : "await-in-expression",
        title : "await in an expression",
        note : "Each await becomes a yield. The coroutine sets the context before the generator continues, also in the middle of the object literal.",
        input : [
            "async function handle(request) {",
            "    const record = { user : await loadUser(request), id : requestId.get() };",
            "    return record;",
            "}",
        ].join("\n"),
    },
    {
        id : "async-arrow",
        title : "Async arrow function",
        note : "The arrow function keeps its this value. The coroutine wraps the generator.",
        input : [
            "const save = async (item) => {",
            "    await store.put(item);",
            "    log(`saved ${item.id}`, requestId.get());",
            "};",
        ].join("\n"),
    },
    {
        id : "for-await",
        title : "for await loop",
        note : "The async generator transform changes the loop. It calls return() on break, and it also accepts a sync iterable.",
        input : [
            "async function total(stream) {",
            "    let sum = 0;",
            "    for await (const { amount = 0 } of stream) {",
            "        if (amount < 0) break;",
            "        sum += amount;",
            "    }",
            "    return sum;",
            "}",
        ].join("\n"),
    },
    {
        id : "generator-method",
        title : "Generator method with super",
        note : "The method keeps its name and parameters. The body moves into an inner generator, and bindGenerator binds it to the context of the call.",
        input : [
            "class Pages extends Base {",
            "    *items(limit) {",
            "        for (const item of super.items()) {",
            "            if (limit-- === 0) return;",
            "            yield item;",
            "        }",
            "    }",
            "}",
        ].join("\n"),
    },
    {
        id : "async-generator",
        title : "Async generator",
        note : "The preset binds the async generator first. Then the async generator transform changes the body.",
        input : [
            "async function* ticks(count) {",
            "    for (let index = 0; index < count; index++) {",
            "        await delay(10);",
            "        yield requestId.get();",
            "    }",
            "}",
        ].join("\n"),
    },
];

/** This function transforms each input with the Babel preset of the library. */
export async function transformExamples(inputs : readonly TransformInput[] = TRANSFORM_INPUTS) : Promise<TransformExample[]> {
    const examples : TransformExample[] = [];
    for (const input of inputs) {
        const result = await transformAsync(input.input, {
            filename : `${input.id}.js`,
            babelrc : false,
            configFile : false,
            sourceType : "module",
            presets : [[preset, { runtime : "async-browser-context/runtime" }]],
        });
        const output = result?.code ?? "";
        examples.push({ ...input, output, inputLines : await highlightLines(input.input), outputLines : await highlightLines(output) });
    }
    return examples;
}

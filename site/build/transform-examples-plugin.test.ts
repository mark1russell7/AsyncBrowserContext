import { describe, expect, it, vi } from "vitest";
import type { TransformExample } from "./transform-examples";

const EXAMPLES : TransformExample[] = [
    { id : "a", title : "A", note : "", input : "a", output : "a", inputLines : [], outputLines : [] },
    { id : "b", title : "B", note : "", input : "b", output : "b", inputLines : [], outputLines : [] },
];

const transformExamples = vi.hoisted(() => vi.fn<() => Promise<TransformExample[]>>());

vi.mock("./transform-examples.ts", async (importOriginal) => ({
    ...await importOriginal<typeof import("./transform-examples")>(),
    transformExamples,
}));

const { selectExamples, transformExamplesPlugin } = await import("./transform-examples-plugin");

type Hooks = {
    buildStart() : void;
    resolveId(id : string) : string | null;
    load(id : string) : Promise<{ code : string } | null>;
};

describe("the transform examples plugin", () => {
    it("gives one example for ?only=<id>, and an error for an unknown ID", () => {
        expect(selectExamples(EXAMPLES, null).map(example => example.id)).toEqual(["a", "b"]);
        expect(selectExamples(EXAMPLES, "b").map(example => example.id)).toEqual(["b"]);
        expect(() => selectExamples(EXAMPLES, "c")).toThrow("virtual:transform-examples has no example \"c\". The examples are: a, b.");
    });

    it("transforms the examples one time for the two modules, and again after an error", async () => {
        transformExamples.mockReset();
        transformExamples.mockRejectedValueOnce(new Error("Babel failed")).mockResolvedValue(EXAMPLES);
        const plugin = transformExamplesPlugin() as unknown as Hooks;
        plugin.buildStart();
        const all = plugin.resolveId("virtual:transform-examples")!;
        const one = plugin.resolveId("virtual:transform-examples?only=a")!;
        await expect(plugin.load(all)).rejects.toThrow("Babel failed");
        expect((await plugin.load(all))?.code).toContain("\"id\":\"b\"");
        expect((await plugin.load(one))?.code).not.toContain("\"id\":\"b\"");
        await expect(plugin.load(plugin.resolveId("virtual:transform-examples?only=c")!)).rejects.toThrow("has no example \"c\"");
        expect(transformExamples).toHaveBeenCalledTimes(2);
    });
});

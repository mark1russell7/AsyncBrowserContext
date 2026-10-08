import { describe, expect, it } from "vitest";
import { routerBasename } from "./routes";

describe("routerBasename", () => {
    it("removes the slash at the end of the base URL", () => {
        expect(routerBasename("/")).toBe("/");
        expect(routerBasename("/AsyncBrowserContext/")).toBe("/AsyncBrowserContext");
        expect(routerBasename("/a/b/")).toBe("/a/b");
    });

    it("uses the path of a full URL", () => {
        expect(routerBasename("https://cdn.example.org/abc/")).toBe("/abc");
        expect(routerBasename("https://cdn.example.org/")).toBe("/");
    });
});

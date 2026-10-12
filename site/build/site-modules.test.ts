import { describe, expect, it } from "vitest";
import { siteModuleFilter } from "./site-modules";

describe("the site modules that the library transforms", () => {
    it("takes the modules in src/ and content/ of the site, and compares absolute paths", () => {
        const isSiteModule = siteModuleFilter("/repo/site", "linux");
        expect(isSiteModule("/repo/site/src/home/live.tsx")).toBe(true);
        expect(isSiteModule("/repo/site/content/docs/api.mdx")).toBe(true);
        expect(isSiteModule("/repo/site/src/debugger/scenarios/nested.scenario.js?instrumented")).toBe(true);
        expect(isSiteModule("/other/site/src/a.ts")).toBe(false);
        expect(isSiteModule("/repo/site/node_modules/x/site/src/a.js")).toBe(false);
        expect(isSiteModule("/repo/site/srcx/a.ts")).toBe(false);
        expect(isSiteModule("/repo/site/build/a.ts")).toBe(false);
        expect(isSiteModule("\0virtual:search-index")).toBe(false);
    });

    it("leaves the module of the untransformed dependency demonstration as it is", () => {
        const isSiteModule = siteModuleFilter("/repo/site", "linux");
        expect(isSiteModule("/repo/site/src/explore/untransformed-dependency.ts")).toBe(false);
        expect(isSiteModule("/repo/site/src/explore/scenarios.ts")).toBe(true);
    });

    it("accepts the forms of a Windows path that Vite gives", () => {
        const isSiteModule = siteModuleFilter("C:\\repo\\site", "win32");
        expect(isSiteModule("C:/repo/site/src/main.tsx")).toBe(true);
        expect(isSiteModule("c:\\Repo\\Site\\src\\main.tsx")).toBe(true);
        expect(isSiteModule("C:/other/site/src/main.tsx")).toBe(false);
        expect(isSiteModule("C:/repo/site/src/explore/untransformed-dependency.ts")).toBe(false);
    });
});

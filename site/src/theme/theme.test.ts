import { describe, expect, it } from "vitest";
import { createBrowserPreferenceStore, createMemoryPreferenceStore } from "./preferences";
import { nextThemePreference, parseThemePreference, resolveTheme, themeLabel } from "./theme";

describe("theme preference", () => {
    it("reads only light and dark; anything else is system", () => {
        expect(parseThemePreference("light")).toBe("light");
        expect(parseThemePreference("dark")).toBe("dark");
        expect(parseThemePreference("blue")).toBe("system");
        expect(parseThemePreference(null)).toBe("system");
    });

    it("cycles system, light, dark", () => {
        expect(nextThemePreference("system")).toBe("light");
        expect(nextThemePreference("light")).toBe("dark");
        expect(nextThemePreference("dark")).toBe("system");
    });

    it("resolves the system preference", () => {
        expect(resolveTheme("system", true)).toBe("dark");
        expect(resolveTheme("system", false)).toBe("light");
        expect(resolveTheme("light", true)).toBe("light");
        expect(themeLabel("dark")).toBe("Dark");
    });
});

describe("preference stores", () => {
    it("keeps values in memory", () => {
        const store = createMemoryPreferenceStore({ a : "1" });
        expect(store.get("a")).toBe("1");
        store.set("a", null);
        expect(store.get("a")).toBeNull();
    });

    it("works with a storage that throws", () => {
        const throwing = {
            getItem : () => { throw new Error("SecurityError"); },
            setItem : () => { throw new Error("QuotaExceededError"); },
            removeItem : () => { throw new Error("SecurityError"); },
        } as unknown as Storage;
        const store = createBrowserPreferenceStore(() => throwing);
        expect(store.get("theme")).toBeNull();
        expect(() => store.set("theme", "dark")).not.toThrow();
        expect(() => store.set("theme", null)).not.toThrow();
    });

    it("works when the storage itself cannot be read", () => {
        const store = createBrowserPreferenceStore(() => { throw new Error("SecurityError"); });
        expect(store.get("theme")).toBeNull();
        expect(() => store.set("theme", "light")).not.toThrow();
    });

    it("works without a storage", () => {
        const store = createBrowserPreferenceStore(() => undefined);
        expect(store.get("theme")).toBeNull();
        expect(() => store.set("theme", "light")).not.toThrow();
    });
});

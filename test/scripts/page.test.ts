import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { resultsOf, watchErrors, type ErrorSource } from "./page.js";

const URL = "http://127.0.0.1:5000/";

/** A console message of Playwright, with the two methods that the check uses. */
const message = (type : string, text : string) : unknown => ({ type : () => type, text : () => text });

/** A page without a browser. Each step of the load is a function that a test can replace. */
class FakePage extends EventEmitter {
    closed = false;
    url() : string {
        return URL;
    }
    async goto() : Promise<null> {
        return null;
    }
    waitForFunction : () => Promise<unknown> = async () => true;
    evaluate : () => Promise<unknown> = async () => ({ inExpression : "A" });
    async waitForLoadState() : Promise<void> {}
    async close() : Promise<void> {
        this.closed = true;
    }
}

/** A browser with one page. */
const browserOf = (page : FakePage) => ({ newPage : async () => page as unknown as Page });

/** A promise that never settles: a page that never writes its results. */
const never = () : Promise<never> => new Promise(() => undefined);

/** This function gives "pending" if `promise` did not settle after the current tasks. */
async function state(promise : Promise<unknown>) : Promise<string> {
    const pending = {};
    const result = await Promise.race([promise.then(() => "resolved", () => "rejected"), new Promise((resolve) => setTimeout(() => resolve(pending), 10))]);
    return result === pending ? "pending" : result as string;
}

describe("the errors of a test page", () => {
    it("reject at the first uncaught error, with its message", async () => {
        const page = new FakePage();
        const errors = watchErrors(page as unknown as ErrorSource);
        page.emit("pageerror", new Error("runChecks failed"));
        await expect(errors.failed).rejects.toThrow(`Uncaught error on the page ${URL}: runChecks failed`);
    });

    it("reject at a console error, but not at the other console messages", async () => {
        const page = new FakePage();
        const errors = watchErrors(page as unknown as ErrorSource);
        page.emit("console", message("log", "[vite] connected."));
        page.emit("console", message("warning", "a warning"));
        expect(await state(errors.failed)).toBe("pending");
        page.emit("console", message("error", "Failed to load resource"));
        await expect(errors.failed).rejects.toThrow(`Console error on the page ${URL}: Failed to load resource`);
    });

    it("do not give an unhandled rejection before a caller waits", async () => {
        const page = new FakePage();
        watchErrors(page as unknown as ErrorSource);
        page.emit("pageerror", new Error("early"));
        expect(await state(Promise.resolve())).toBe("resolved");
    });

    it("stop() removes the listeners", () => {
        const page = new FakePage();
        watchErrors(page as unknown as ErrorSource).stop();
        expect(page.listenerCount("pageerror")).toBe(0);
        expect(page.listenerCount("console")).toBe(0);
    });
});

describe("the results of a test page", () => {
    it("gives window.__results and closes the page", async () => {
        const page = new FakePage();
        expect(await resultsOf(browserOf(page), URL)).toEqual({ inExpression : "A" });
        expect(page.closed).toBe(true);
    });

    it("rejects immediately at an error during the load, not after the time limit", async () => {
        const page = new FakePage();
        page.goto = async () => {
            page.emit("pageerror", new Error("runChecks failed"));
            return null;
        };
        page.waitForFunction = never;
        await expect(resultsOf(browserOf(page), URL)).rejects.toThrow("runChecks failed");
        expect(page.closed).toBe(true);
    });

    it("rejects immediately at a console error while it waits for the results", async () => {
        const page = new FakePage();
        page.waitForFunction = () => {
            setTimeout(() => page.emit("console", message("error", "Uncaught (in promise) TypeError")), 1);
            return never();
        };
        await expect(resultsOf(browserOf(page), URL)).rejects.toThrow("Console error on the page");
        expect(page.closed).toBe(true);
    });

    it("waits again when the dev server reloads the page", async () => {
        const page = new FakePage();
        let calls = 0;
        page.waitForFunction = async () => {
            calls++;
            if (calls === 1) {
                throw new Error("page.waitForFunction: Execution context was destroyed, most likely because of a navigation");
            }
            return true;
        };
        expect(await resultsOf(browserOf(page), URL)).toEqual({ inExpression : "A" });
        expect(calls).toBe(2);
    });
});

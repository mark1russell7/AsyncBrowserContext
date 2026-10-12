import type { Browser, ConsoleMessage, Page } from "playwright";

/** The results that a test page writes to `window.__results` (test/smoke/fixture/checks.js). */
export type Results = Record<string, unknown>;

/** The time in milliseconds that a page has to write its results. */
const RESULTS_TIMEOUT = 30_000;

/** The parts of a Playwright page that `watchErrors` uses. The tests give a page without a browser. */
export type ErrorSource = Pick<Page, "on" | "off" | "url">;

/** The errors of a page, from `watchErrors`. */
export interface PageErrors {
    /** Rejects at the first uncaught error or console error of the page, with an error that has its message. It never resolves. */
    readonly failed : Promise<never>;
    /** Removes the listeners from the page. */
    stop() : void;
}

/**
 * This function gives `true` for the console error of a module request that the dev server of
 * Vite refuses after it pre-bundles new dependencies. The server then reloads the page, and
 * `loadResults` waits again. Thus this error is part of a normal first load.
 */
export function isDependencyReload(text : string) : boolean {
    return text.includes("(Outdated Optimize Dep)");
}

/**
 * This function listens for the errors of `page`: the uncaught errors
 * (`pageerror`) and the console errors. Start it before `page.goto()`, so it
 * also gets the errors during the load.
 */
export function watchErrors(page : ErrorSource) : PageErrors {
    let fail : (error : Error) => void = () => undefined;
    const failed = new Promise<never>((_resolve, reject) => {
        fail = reject;
    });
    // An error can come before a caller waits for `failed`. This handler prevents an unhandled rejection.
    failed.catch(() => undefined);
    const onPageError = (error : Error) : void => fail(new Error(`Uncaught error on the page ${page.url()}: ${error.message}`));
    const onConsole = (message : ConsoleMessage) : void => {
        if (message.type() === "error" && !isDependencyReload(message.text())) {
            fail(new Error(`Console error on the page ${page.url()}: ${message.text()}`));
        }
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    return {
        failed,
        stop() {
            page.off("pageerror", onPageError);
            page.off("console", onConsole);
        },
    };
}

/**
 * This function opens `url` on `page` and waits for `window.__results`. The
 * dev server of Vite can reload the page one time, after it pre-bundles new
 * dependencies. Thus a destroyed execution context starts a new wait.
 */
async function loadResults(page : Page, url : string) : Promise<Results> {
    await page.goto(url);
    for (let attempt = 1; ; attempt++) {
        try {
            await page.waitForFunction(() => (window as unknown as { __results? : unknown }).__results !== undefined, undefined, { timeout : RESULTS_TIMEOUT });
            return await page.evaluate(() => (window as unknown as { __results : Results }).__results);
        } catch (error) {
            const destroyed = error instanceof Error && error.message.includes("Execution context was destroyed");
            if (!destroyed || attempt === 3) {
                throw error;
            }
            await page.waitForLoadState("load");
        }
    }
}

/**
 * This function opens `url` in a new page of `browser` and gives
 * `window.__results`. An error on the page stops the wait immediately: the
 * function rejects with the message of the error, not after the time limit.
 * The function closes the page in all cases.
 */
export async function resultsOf(browser : Pick<Browser, "newPage">, url : string) : Promise<Results> {
    const page = await browser.newPage();
    const errors = watchErrors(page);
    try {
        return await Promise.race([loadResults(page, url), errors.failed]);
    } finally {
        errors.stop();
        await page.close();
    }
}

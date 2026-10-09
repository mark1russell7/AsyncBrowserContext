import type { RootOptions } from "react-dom/client";
import { LOADING_SELECTOR, PRERENDERED_ATTRIBUTE } from "../lib/readiness";

/** The element and the options for `createRoot`. */
export type AppMount = {
    element : HTMLElement;
    options : RootOptions;
};

export type HandoffTimes = {
    /** The time without DOM changes before the swap, in milliseconds. */
    quietMs? : number;
    /** The maximum time from the first ready state to the swap, in milliseconds. */
    settleMs? : number;
    /** The maximum time to the swap, in milliseconds. After this time, the swap occurs also when an element still loads. */
    timeoutMs? : number;
};

/** The ID prefix of `useId()` in the hidden render. The HTML from the build has IDs without this prefix. */
export const HANDOFF_ID_PREFIX = "app-";

// The width of the root element, no effect on the page height, and no access for the reader.
const HIDDEN_STYLE = "position:absolute;top:0;left:0;right:0;height:0;overflow:clip;opacity:0;visibility:hidden;pointer-events:none";

/**
 * This function starts `done` when no element in `root` loads and the DOM in
 * `root` does not change for `quietMs`. It starts `done` one time only.
 */
export function whenReady(root : HTMLElement, done : () => void, times : HandoffTimes = {}) : void {
    const { quietMs = 100, settleMs = 1000, timeoutMs = 10_000 } = times;
    let finished = false;
    let quietTimer : number | undefined;
    let settleTimer : number | undefined;
    let deadline : number | undefined;
    let observer : MutationObserver | undefined;

    const finish = () : void => {
        if (finished) return;
        finished = true;
        observer?.disconnect();
        window.clearTimeout(quietTimer);
        window.clearTimeout(settleTimer);
        window.clearTimeout(deadline);
        done();
    };
    const check = () : void => {
        window.clearTimeout(quietTimer);
        if (root.firstElementChild === null || root.querySelector(LOADING_SELECTOR) !== null) {
            window.clearTimeout(settleTimer);
            settleTimer = undefined;
            return;
        }
        quietTimer = window.setTimeout(finish, quietMs);
        settleTimer ??= window.setTimeout(finish, settleMs);
    };

    observer = new MutationObserver(check);
    observer.observe(root, { childList : true, subtree : true, attributes : true, characterData : true });
    deadline = window.setTimeout(finish, timeoutMs);
    check();
}

/**
 * The route path of a URL path, as the build writes it in the root element.
 * With the base "/AsyncBrowserContext/", the path "/AsyncBrowserContext/docs/api/"
 * gives "docs/api", and "/AsyncBrowserContext/" gives "".
 */
export function routePathOf(pathname : string, baseUrl : string) : string {
    const base = (/^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl) ? new URL(baseUrl).pathname : baseUrl).replace(/\/+$/, "");
    const rest = base !== "" && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) : pathname;
    let decoded = rest;
    try {
        decoded = decodeURIComponent(rest);
    } catch {
        // The path has an incorrect escape. Compare it as it is.
    }
    return decoded.replace(/^\/+|\/+$/g, "");
}

/**
 * This function gives the element that the app renders into.
 *
 * Without HTML from the build, the function gives `container`. With HTML
 * from the build, the function adds a hidden element after `container`, and
 * the app renders into the hidden element. When the page is ready, the
 * function removes `container` and shows the new element. Thus, the reader
 * sees the complete page from the start, with no empty frame and no
 * loading text.
 *
 * The root element tells the route of its HTML. If a server gives the HTML
 * of a different route (for example, index.html for each path), the function
 * removes that HTML and gives `container`.
 */
export function mountApp(container : HTMLElement, routePath : string, times? : HandoffTimes) : AppMount {
    const prerendered = container.getAttribute(PRERENDERED_ATTRIBUTE);
    if (prerendered === null) return { element : container, options : {} };
    if (prerendered !== routePath) {
        container.replaceChildren();
        container.removeAttribute(PRERENDERED_ATTRIBUTE);
        return { element : container, options : {} };
    }

    const live = document.createElement("div");
    live.setAttribute("style", HIDDEN_STYLE);
    live.inert = true;
    container.after(live);
    whenReady(live, () => {
        const id = container.id;
        container.remove();
        live.removeAttribute("style");
        live.inert = false;
        live.id = id;
    }, times);
    return { element : live, options : { identifierPrefix : HANDOFF_ID_PREFIX } };
}

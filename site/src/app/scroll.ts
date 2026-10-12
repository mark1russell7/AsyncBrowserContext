import { useEffect, useRef } from "react";
import { useLocation, useNavigationType, type Location } from "react-router";
import { getHandoffState } from "./prerender-handoff";

/** The property of `history.state` with the key of the history entry of the document load. */
const ENTRY_KEY = "abcEntry";

let documentKey : string | undefined;

/**
 * The scroll key of the history entry of the document load.
 *
 * React Router gives the location key "default" to an entry that it did not
 * make. The first entry of each document load is such an entry. Thus all
 * document loads share one saved scroll position, and a new load gets the
 * position of the previous load. This function writes a key of its own into
 * `history.state` of that entry. A reload and a back or forward navigation
 * get the same state again, so they get the same key. A new load gets a new key.
 */
export function documentEntryKey() : string {
    if (documentKey !== undefined) return documentKey;
    const state : unknown = history.state;
    const record = typeof state === "object" && state !== null ? state as Record<string, unknown> : {};
    const existing = record[ENTRY_KEY];
    if (typeof existing === "string") {
        documentKey = existing;
    } else {
        documentKey = `entry-${Math.random().toString(36).slice(2)}`;
        history.replaceState({ ...record, [ENTRY_KEY] : documentKey }, "");
    }
    return documentKey;
}

/** The `getKey` function of `ScrollRestoration`: the key of React Router, or the key of the document load in place of "default". */
export function scrollKey(location : Location) : string {
    return location.key === "default" ? documentEntryKey() : location.key;
}

/** The type of the document load: "navigate", "reload", "back_forward" or "prerender". */
function documentLoadType() : string {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type ?? "navigate";
}

/** The longest time to wait for the target of a hash, in milliseconds. */
const HASH_WAIT_MS = 5000;

/**
 * This function scrolls to the element with the ID `id` when the element
 * shows, for example after a lazy page loads. It stops when the reader
 * scrolls or uses the keyboard, and after `HASH_WAIT_MS`. It gives a
 * function that stops the wait.
 */
export function scrollWhenShown(id : string) : () => void {
    let stopped = false;
    const observer = new MutationObserver(() => check());
    const timer = window.setTimeout(() => stop(), HASH_WAIT_MS);
    const READER_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    function stop() : void {
        if (stopped) return;
        stopped = true;
        observer.disconnect();
        window.clearTimeout(timer);
        for (const type of READER_EVENTS) window.removeEventListener(type, stop, true);
    }
    function check() : void {
        const element = document.getElementById(id);
        if (!element) return;
        stop();
        // Wait one frame, so the layout of the new page is complete.
        requestAnimationFrame(() => element.scrollIntoView({ block : "start" }));
    }
    for (const type of READER_EVENTS) window.addEventListener(type, stop, { capture : true, passive : true });
    observer.observe(document.body, { childList : true, subtree : true });
    check();
    return stop;
}

/**
 * This hook scrolls to the target of `location.hash` after a navigation to a
 * page that is not ready yet. React Router scrolls to the target only if the
 * target exists at the navigation, but a lazy page shows its content later.
 *
 * The hook does nothing for a back or forward navigation: React Router sets
 * the saved position. At the first location, the browser scrolls to the
 * target of a page from the build, and React Router sets the saved position
 * after a reload.
 */
export function useScrollToHashTarget() : void {
    const location = useLocation();
    const navigationType = useNavigationType();
    const firstKey = useRef(location.key);
    const navigated = useRef(false);
    useEffect(() => {
        if (location.key !== firstKey.current) navigated.current = true;
        const initial = !navigated.current;
        if (location.hash.length <= 1) return undefined;
        if (initial ? getHandoffState() !== "none" || documentLoadType() !== "navigate" : navigationType === "POP") return undefined;
        let id : string;
        try {
            id = decodeURIComponent(location.hash.slice(1));
        } catch {
            return undefined;
        }
        if (document.getElementById(id)) return undefined;
        return scrollWhenShown(id);
    }, [location.key, location.hash, navigationType]);
}

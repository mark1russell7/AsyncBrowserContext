import { Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { getHandoffState, subscribeHandoff } from "./prerender-handoff";
import { documentEntryKey, scrollKey, useScrollToHashTarget } from "./scroll";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import styles from "./RootLayout.module.css";

// Give the history entry of this document load its scroll key before a navigation can occur (refer to scroll.ts).
if (typeof window !== "undefined") documentEntryKey();

/** This component tells screen reader users the title of the new page after a route change. */
function RouteAnnouncer() {
    const { pathname } = useLocation();
    const [message, setMessage] = useState("");
    const first = useRef(true);

    useEffect(() => {
        if (first.current) {
            first.current = false;
            return undefined;
        }
        // Wait for the new page to set the document title.
        const timer = window.setTimeout(() => setMessage(document.title), 150);
        return () => window.clearTimeout(timer);
    }, [pathname]);

    return <p className="visually-hidden" aria-live="polite" aria-atomic="true">{message}</p>;
}

/** This component starts `onMount` in the layout phase of its first render. */
function LayoutProbe({ onMount } : { onMount() : void }) {
    useLayoutEffect(() => onMount(), []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

/**
 * The scroll restoration of React Router, with two changes:
 *
 * - Each document load has its own scroll key (refer to `scrollKey`).
 * - With HTML from the build, the app renders hidden until the swap (refer
 *   to `mountApp`). This component starts only after the swap, so the hidden
 *   app does not scroll the page that the reader sees. At the swap, the page
 *   keeps the position that the browser or the reader gave it.
 */
function SiteScrollRestoration({ afterSwap } : { afterSwap : boolean }) {
    const kept = useRef<number | undefined>(undefined);
    return (
        <>
            <LayoutProbe onMount={() => { if (afterSwap) kept.current = window.scrollY; }} />
            <ScrollRestoration getKey={scrollKey} />
            <LayoutProbe
                onMount={() => {
                    if (kept.current !== undefined && window.scrollY !== kept.current) window.scrollTo(0, kept.current);
                    kept.current = undefined;
                }}
            />
        </>
    );
}

/** The frame of every page: skip link, header, main content and footer. */
export function RootLayout() {
    const handoff = useSyncExternalStore(subscribeHandoff, getHandoffState, getHandoffState);
    useScrollToHashTarget();
    return (
        <div className={styles.shell}>
            <a className={styles.skip} href="#main">Skip to the content</a>
            <SiteHeader />
            <main id="main" className={styles.main} tabIndex={-1}>
                <Suspense fallback={<p className={styles.loading} aria-busy="true" data-loading="">Loading the page.</p>}>
                    <Outlet />
                </Suspense>
            </main>
            <SiteFooter />
            <RouteAnnouncer />
            {handoff === "pending" ? null : <SiteScrollRestoration afterSwap={handoff === "done"} />}
        </div>
    );
}

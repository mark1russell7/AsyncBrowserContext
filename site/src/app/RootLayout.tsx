import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import styles from "./RootLayout.module.css";

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

/** The frame of every page: skip link, header, main content and footer. */
export function RootLayout() {
    return (
        <div className={styles.shell}>
            <a className={styles.skip} href="#main">Skip to the content</a>
            <SiteHeader />
            <main id="main" className={styles.main} tabIndex={-1}>
                <Suspense fallback={<p className={styles.loading} aria-busy="true">Loading the page.</p>}>
                    <Outlet />
                </Suspense>
            </main>
            <SiteFooter />
            <RouteAnnouncer />
            <ScrollRestoration />
        </div>
    );
}

import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { SITE_NAME } from "./site";
import styles from "./StatusPage.module.css";

function describe(error : unknown) : { title : string; text : string } {
    if (isRouteErrorResponse(error)) {
        if (error.status === 404) return { title : "There is no page at this path", text : "Make sure that the address is correct." };
        return { title : `The page did not load (HTTP ${error.status})`, text : error.statusText || "The server sent an error." };
    }
    const message = error instanceof Error ? error.message : String(error);
    // After a new release, an old page can ask for a chunk file that no longer exists.
    if (/dynamically imported module|Failed to fetch|Importing a module script failed/i.test(message)) {
        return { title : "The page did not load", text : "The site changed since this page opened. Load the page again." };
    }
    return { title : "The page did not load", text : message };
}

/** This component shows an error of a route. The site header stays, so the reader can go to another page. */
export function RouteError() {
    const { title, text } = describe(useRouteError());
    return (
        <div className={styles.page} role="alert">
            <title>{`Error – ${SITE_NAME}`}</title>
            <h1>{title}</h1>
            <p>{text}</p>
            <p>
                <button type="button" className="button" onClick={() => window.location.reload()}>Load the page again</button>
            </p>
            <p><Link to="/">Go to the home page</Link></p>
        </div>
    );
}

import { Link, useLocation } from "react-router";
import { SITE_NAME } from "./site";
import styles from "./StatusPage.module.css";

export function NotFoundPage() {
    const { pathname } = useLocation();
    return (
        <div className={styles.page}>
            <title>{`Page not found – ${SITE_NAME}`}</title>
            <h1>There is no page at this path</h1>
            <p>The site has no page at <code>{pathname}</code>. Make sure that the address is correct.</p>
            <p><Link to="/">Go to the home page</Link></p>
        </div>
    );
}

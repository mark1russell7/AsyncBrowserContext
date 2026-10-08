import { Link } from "react-router";
import { REPOSITORY_URL, SITE_NAME, SITE_TAGLINE } from "./site";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
    return (
        <footer className={styles.footer}>
            <div className={styles.inner}>
                <p className={styles.text}>
                    <strong>{SITE_NAME}</strong>: {SITE_TAGLINE} The source code is on <a href={REPOSITORY_URL}>GitHub</a>.
                </p>
                <p className={styles.text}>
                    To change a page, edit its file in <code>site/content/</code>. The{" "}
                    <Link to="/docs/contributing/writing-style">writing style guide</Link> tells you how.
                </p>
                <p className={styles.text}>
                    An AI model (Claude, from Anthropic) wrote most of the text and the code of this site and of the
                    library, under the direction of the author. The tests and the STE linter examine them.
                </p>
            </div>
        </footer>
    );
}

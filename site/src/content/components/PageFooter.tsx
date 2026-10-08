import { Link } from "react-router";
import { useContentRegistry } from "../ContentRegistryContext";
import type { ContentPage } from "../types";
import styles from "./PageFooter.module.css";

/** The end of a content page: where to edit it, and the previous and next pages. */
export function PageFooter({ page } : { page : ContentPage }) {
    const { previous, next } = useContentRegistry().neighbors(page);
    return (
        <footer className={styles.footer}>
            <p className={styles.edit}>
                To change this page, edit <code>{page.sourcePath}</code>.
            </p>
            {previous || next ? (
                <nav className={styles.neighbors} aria-label="Previous and next pages">
                    {previous ? (
                        <Link to={previous.path} rel="prev" className={styles.neighbor} data-direction="previous">
                            <span className={styles.direction}>Previous</span>
                            <span className={styles.neighborTitle}>{previous.meta.title}</span>
                        </Link>
                    ) : <span />}
                    {next ? (
                        <Link to={next.path} rel="next" className={styles.neighbor} data-direction="next">
                            <span className={styles.direction}>Next</span>
                            <span className={styles.neighborTitle}>{next.meta.title}</span>
                        </Link>
                    ) : null}
                </nav>
            ) : null}
        </footer>
    );
}

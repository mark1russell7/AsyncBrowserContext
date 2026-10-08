import { useId } from "react";
import { cx } from "../../lib/cx";
import type { TocEntry } from "../types";
import styles from "./TableOfContents.module.css";

export type TableOfContentsProps = {
    entries : readonly TocEntry[];
    className? : string | undefined;
};

/** The links to the h2 and h3 headings of the page. */
export function TableOfContents({ entries, className } : TableOfContentsProps) {
    const headingId = useId();
    return (
        <nav className={cx(styles.toc, className)} aria-labelledby={headingId}>
            <p id={headingId} className={styles.title}>On this page</p>
            <ol className={styles.list}>
                {entries.map(entry => (
                    <li key={entry.id} data-depth={entry.depth}>
                        <a href={`#${entry.id}`} className={styles.link}>{entry.text}</a>
                    </li>
                ))}
            </ol>
        </nav>
    );
}

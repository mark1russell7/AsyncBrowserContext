import { Link } from "react-router";
import { useContentRegistry } from "../content/ContentRegistryContext";
import { formatCount } from "../lib/format";
import styles from "./Home.module.css";

/**
 * The first pages of a content section, for its card on the home page. The
 * section index is not in the list: the card title links to it.
 */
export function ContentCardDetail({ section, limit = 3 } : { section : string; limit? : number }) {
    const pages = useContentRegistry().pages(section);
    const links = pages.filter(page => page.slug !== "").slice(0, limit);
    if (links.length === 0) return null;
    return (
        <div className={styles.cardDetail}>
            <p className={styles.cardMeta}>{formatCount(pages.length, "page")}. Start with:</p>
            <ul className={styles.cardLinks}>
                {links.map(page => (
                    <li key={page.path}><Link to={page.path}>{page.meta.title}</Link></li>
                ))}
            </ul>
        </div>
    );
}

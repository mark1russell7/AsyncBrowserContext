import { useEffect, useId, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { cx } from "../../lib/cx";
import type { ContentPage, SidebarItem } from "../types";
import styles from "./SectionSidebar.module.css";

function PageLink({ page } : { page : ContentPage }) {
    return (
        <li>
            <NavLink to={page.path} end className={cx(styles.link)}>
                {page.meta.title}
            </NavLink>
        </li>
    );
}

export type SectionSidebarProps = {
    /** The section name, for example "Docs". */
    label : string;
    items : readonly SidebarItem[];
    className? : string | undefined;
};

/**
 * The page list of a section, grouped by folder. On a narrow screen, a button
 * shows and hides the list.
 */
export function SectionSidebar({ label, items, className } : SectionSidebarProps) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    const location = useLocation();

    // Close the list after the reader goes to a page.
    useEffect(() => { setOpen(false); }, [location.pathname]);

    return (
        <nav className={cx(styles.sidebar, className)} aria-label={`${label} pages`}>
            <button
                type="button"
                className={styles.toggle}
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen(value => !value)}
            >
                {open ? `Hide the ${label} pages` : `Show the ${label} pages`}
            </button>
            <div id={listId} className={styles.lists} data-open={open ? "true" : undefined}>
                <ul className={styles.list}>
                    {items.map(item => (item.kind === "page"
                        ? <PageLink key={item.page.path} page={item.page} />
                        : (
                            <li key={item.id} className={styles.group}>
                                <span className={styles.groupLabel} id={`${listId}-${item.id}`}>{item.label}</span>
                                <ul className={styles.list} aria-labelledby={`${listId}-${item.id}`}>
                                    {item.pages.map(page => <PageLink key={page.path} page={page} />)}
                                </ul>
                            </li>
                        )))}
                </ul>
            </div>
        </nav>
    );
}

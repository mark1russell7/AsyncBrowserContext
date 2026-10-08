import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { cx } from "../lib/cx";
import { ThemeToggle } from "../theme/ThemeToggle";
import { BrandMark } from "./BrandMark";
import { useSections } from "./SectionsContext";
import { SITE_NAME } from "./site";
import styles from "./SiteHeader.module.css";

/** The site header: the name, the main navigation (from the section list) and the theme button. */
export function SiteHeader() {
    const sections = useSections();
    const [open, setOpen] = useState(false);
    const listId = useId();
    const { pathname } = useLocation();

    useEffect(() => { setOpen(false); }, [pathname]);

    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <Link to="/" className={styles.brand}>
                    <BrandMark />
                    <span>{SITE_NAME}</span>
                </Link>
                <nav className={styles.nav} aria-label="Main">
                    <button
                        type="button"
                        className={styles.menuButton}
                        aria-expanded={open}
                        aria-controls={listId}
                        onClick={() => setOpen(value => !value)}
                    >
                        {open ? "Close the menu" : "Menu"}
                    </button>
                    <ul id={listId} className={styles.list} data-open={open ? "true" : undefined}>
                        {sections.map(section => (
                            <li key={section.id}>
                                <NavLink to={section.path} end={section.path === "/"} className={cx(styles.link)}>
                                    {section.label}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className={styles.tools}>
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}

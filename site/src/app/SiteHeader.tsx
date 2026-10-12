import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { cx } from "../lib/cx";
import { SearchButton } from "../search/Search";
import { ThemeToggle } from "../theme/ThemeToggle";
import { BrandMark } from "./BrandMark";
import { useSections } from "./SectionsContext";
import { SITE_NAME } from "./site";
import styles from "./SiteHeader.module.css";

/** The CSS property with the height of the header. The scroll padding and the sticky sidebars use it. */
const HEIGHT_PROPERTY = "--header-height";

/**
 * This hook writes the real height of the header into `--header-height` on
 * the root element. On a narrow screen the header can wrap to two lines, so
 * the height in tokens.css is only the value before the measurement.
 */
function useHeaderHeight(header : RefObject<HTMLElement | null>) : void {
    useLayoutEffect(() => {
        const element = header.current;
        if (!element || typeof ResizeObserver === "undefined") return undefined;
        const root = document.documentElement;
        const update = () : void => {
            root.style.setProperty(HEIGHT_PROPERTY, `${Math.ceil(element.getBoundingClientRect().height)}px`);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => {
            observer.disconnect();
            root.style.removeProperty(HEIGHT_PROPERTY);
        };
    }, [header]);
}

/** The site header: the name, the main navigation (from the section list) and the theme button. */
export function SiteHeader() {
    const sections = useSections();
    const [open, setOpen] = useState(false);
    const listId = useId();
    const { pathname } = useLocation();
    const header = useRef<HTMLElement>(null);
    const nav = useRef<HTMLElement>(null);
    const menuButton = useRef<HTMLButtonElement>(null);
    useHeaderHeight(header);

    useEffect(() => { setOpen(false); }, [pathname]);

    // The open menu closes with the Escape key and with a click outside the navigation.
    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event : KeyboardEvent) : void => {
            if (event.key !== "Escape") return;
            setOpen(false);
            menuButton.current?.focus();
        };
        const onPointerDown = (event : PointerEvent) : void => {
            if (event.target instanceof Node && nav.current?.contains(event.target)) return;
            setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("pointerdown", onPointerDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("pointerdown", onPointerDown);
        };
    }, [open]);

    return (
        <header ref={header} className={styles.header}>
            <div className={styles.inner}>
                <Link to="/" className={styles.brand}>
                    <BrandMark />
                    <span>{SITE_NAME}</span>
                </Link>
                <nav ref={nav} className={styles.nav} aria-label="Main">
                    <button
                        ref={menuButton}
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
                    <SearchButton />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}

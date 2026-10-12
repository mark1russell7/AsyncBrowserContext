import { useLayoutEffect, useRef, useState, type ReactNode, type TableHTMLAttributes } from "react";
import styles from "./ScrollTable.module.css";

export type ScrollTableProps = {
    /**
     * The accessible name of the scroll region. Without it, the name is the
     * caption of the table, or the text of the nearest heading before the table.
     */
    label? : string;
    children : ReactNode;
};

/** The name of the table in `wrapper`: its caption, or the text of the nearest heading before it. */
function tableName(wrapper : HTMLElement) : string | undefined {
    const caption = wrapper.querySelector("caption")?.textContent?.trim();
    if (caption) return caption;
    for (let node = wrapper.previousElementSibling; node !== null; node = node.previousElementSibling) {
        if (/^H[1-6]$/.test(node.tagName)) return node.textContent?.trim() || undefined;
    }
    return undefined;
}

/**
 * A container that scrolls a wide table sideways, so the page itself does
 * not scroll. When the table is wider than the container, the container is
 * a named region that can get keyboard focus. Thus a keyboard can scroll it.
 */
export function ScrollTable({ label, children } : ScrollTableProps) {
    const wrapper = useRef<HTMLDivElement>(null);
    const [scrolls, setScrolls] = useState(false);
    const [name, setName] = useState(label);

    useLayoutEffect(() => {
        const element = wrapper.current;
        if (!element) return undefined;
        setName(label ?? tableName(element) ?? "Table");
        const update = () : void => setScrolls(element.scrollWidth > element.clientWidth + 1);
        update();
        if (typeof ResizeObserver === "undefined") return undefined;
        const observer = new ResizeObserver(update);
        observer.observe(element);
        if (element.firstElementChild) observer.observe(element.firstElementChild);
        return () => observer.disconnect();
    }, [label]);

    return (
        <div
            ref={wrapper}
            className={styles.scroll}
            role={scrolls ? "region" : undefined}
            aria-label={scrolls ? name : undefined}
            tabIndex={scrolls ? 0 : undefined}
        >
            {children}
        </div>
    );
}

/** The MDX override for Markdown tables. */
export function MarkdownTable(props : TableHTMLAttributes<HTMLTableElement>) {
    return (
        <ScrollTable>
            <table {...props} />
        </ScrollTable>
    );
}

import { useLayoutEffect, useState, type DependencyList, type RefObject } from "react";

/**
 * True when the content of an element is wider than the element, so the
 * element scrolls sideways. Updates when the element or its first child
 * changes size. A box that scrolls needs a tab stop, so a keyboard can scroll
 * it. A box that does not scroll needs none.
 */
export function useScrolls(ref : RefObject<HTMLElement | null>, deps : DependencyList = []) : boolean {
    const [scrolls, setScrolls] = useState(false);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return undefined;
        const update = () : void => setScrolls(element.scrollWidth > element.clientWidth + 1);
        update();
        if (typeof ResizeObserver === "undefined") return undefined;
        const observer = new ResizeObserver(update);
        observer.observe(element);
        if (element.firstElementChild) observer.observe(element.firstElementChild);
        return () => observer.disconnect();
        // The caller gives the values that change the content
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref, ...deps]);

    return scrolls;
}

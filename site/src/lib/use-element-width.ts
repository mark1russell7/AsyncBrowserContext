import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The content width of an element, in whole pixels. Updates when the element
 * changes size. The update waits for the next animation frame, so a chart that
 * changes its own height does not start a resize loop.
 */
export function useElementWidth(ref : RefObject<HTMLElement | null>) : number {
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return undefined;
        setWidth(Math.round(element.clientWidth));
        if (typeof ResizeObserver === "undefined") return undefined;

        let frame = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const next = Math.round(element.clientWidth);
                setWidth((previous) => (previous === next ? previous : next));
            });
        });
        observer.observe(element);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [ref]);

    return width;
}

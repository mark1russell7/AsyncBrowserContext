import { useCallback, useSyncExternalStore } from "react";

/** True while the media query matches. */
export function useMediaQuery(query : string) : boolean {
    const subscribe = useCallback((onChange : () => void) => {
        if (typeof window === "undefined" || !window.matchMedia) return () => {};
        const list = window.matchMedia(query);
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
    }, [query]);
    const read = () : boolean => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;
    return useSyncExternalStore(subscribe, read, () => false);
}

export function usePrefersReducedMotion() : boolean {
    return useMediaQuery("(prefers-reduced-motion: reduce)");
}

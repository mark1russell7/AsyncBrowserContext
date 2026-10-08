import { createContext, useContext, type ReactNode } from "react";
import type { SiteSection } from "./section-types";

const SectionsContext = createContext<readonly SiteSection[]>([]);

export function SectionsProvider({ sections, children } : { sections : readonly SiteSection[]; children : ReactNode }) {
    return <SectionsContext value={sections}>{children}</SectionsContext>;
}

export function useSections() : readonly SiteSection[] {
    return useContext(SectionsContext);
}

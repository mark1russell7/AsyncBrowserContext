import { createContext, useContext, type ReactNode } from "react";
import type { ContentRegistry } from "./types";

const ContentRegistryContext = createContext<ContentRegistry | undefined>(undefined);

export function ContentRegistryProvider({ registry, children } : { registry : ContentRegistry; children : ReactNode }) {
    return <ContentRegistryContext value={registry}>{children}</ContentRegistryContext>;
}

export function useContentRegistry() : ContentRegistry {
    const registry = useContext(ContentRegistryContext);
    if (!registry) throw new Error("useContentRegistry() needs a ContentRegistryProvider.");
    return registry;
}

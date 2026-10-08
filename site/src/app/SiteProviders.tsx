import type { ReactNode } from "react";
import { ContentRegistryProvider } from "../content/ContentRegistryContext";
import type { ContentRegistry } from "../content/types";
import { DataSourceProvider } from "../data/DataSourceContext";
import type { SiteDataSource } from "../data/source";
import { PreferenceStoreProvider } from "../theme/PreferenceStoreContext";
import type { PreferenceStore } from "../theme/preferences";
import { ThemeProvider } from "../theme/ThemeProvider";
import type { SiteSection } from "./section-types";
import { SectionsProvider } from "./SectionsContext";

/** Everything that the components get from outside. Tests give their own values. */
export type SiteServices = {
    sections : readonly SiteSection[];
    content : ContentRegistry;
    data : SiteDataSource;
    preferences : PreferenceStore;
};

export function SiteProviders({ services, children } : { services : SiteServices; children : ReactNode }) {
    return (
        <PreferenceStoreProvider store={services.preferences}>
            <ThemeProvider store={services.preferences}>
                <SectionsProvider sections={services.sections}>
                    <ContentRegistryProvider registry={services.content}>
                        <DataSourceProvider source={services.data}>
                            {children}
                        </DataSourceProvider>
                    </ContentRegistryProvider>
                </SectionsProvider>
            </ThemeProvider>
        </PreferenceStoreProvider>
    );
}

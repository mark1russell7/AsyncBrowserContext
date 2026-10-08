import { siteContent } from "../content/site-content";
import { createHttpDataSource } from "../data/source";
import { createBrowserPreferenceStore } from "../theme/preferences";
import { siteSections } from "./sections";
import type { SiteServices } from "./SiteProviders";

/** The services of the real site. */
export function createDefaultServices() : SiteServices {
    return {
        sections : siteSections,
        content : siteContent,
        data : createHttpDataSource(import.meta.env.BASE_URL),
        preferences : createBrowserPreferenceStore(),
    };
}

import { Link, Navigate, useParams } from "react-router";
import { useContentRegistry } from "../ContentRegistryContext";
import { firstPageBelow } from "../registry";
import { ContentPageView } from "./ContentPageView";
import styles from "./ContentPageView.module.css";

export type ContentRouteProps = {
    /** The section ID, which is also the content folder, for example "docs", "explore" or "testing" (refer to `app/sections.tsx`). */
    section : string;
    /** The section name, for example "Docs". */
    label : string;
};

/**
 * The route element of a content section. It finds the page for the path after the section.
 * A folder without a page of its own, for example "/docs/concepts", goes to the first page of the folder.
 * The build writes the same redirect for each such folder (refer to `build/static-routes.ts`).
 */
export function ContentRoute({ section, label } : ContentRouteProps) {
    const registry = useContentRegistry();
    const params = useParams();
    const slug = (params["*"] ?? "").replace(/^\/+|\/+$/g, "");
    const page = registry.page(section, slug);

    if (!page) {
        const below = firstPageBelow(registry, section, slug);
        if (below) return <Navigate to={below.path} replace />;
        const first = registry.pages(section)[0];
        return (
            <div className={styles.missing}>
                <title>{`Page not found – ${label}`}</title>
                <h1>There is no page at this path</h1>
                <p>The {label} section has no page at <code>/{section}/{slug}</code>.</p>
                {first ? <p><Link to={first.path}>Go to the start of the {label} section</Link></p> : null}
            </div>
        );
    }
    return <ContentPageView page={page} sectionLabel={label} />;
}

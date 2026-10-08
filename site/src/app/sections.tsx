import { ContentRoute } from "../content/components/ContentRoute";
import { ContentCardDetail } from "../home/ContentCardDetail";
import { HomePage } from "../home/HomePage";
import type { SiteSection } from "./section-types";

/** A section of MDX pages in `content/<id>/`. */
function contentSection(id : string, label : string, summary : string) : SiteSection {
    return {
        id,
        label,
        path : `/${id}`,
        routes : [{ path : `${id}/*`, element : <ContentRoute section={id} label={label} /> }],
        card : { summary, Detail : () => <ContentCardDetail section={id} /> },
    };
}

/**
 * The sections of the site, in navigation order. To add a section, add an
 * entry here: the navigation, the routes and the home page read this list.
 */
export const siteSections : readonly SiteSection[] = [
    { id : "home", label : "Home", path : "/", routes : [{ index : true, element : <HomePage /> }] },
    contentSection("docs", "Docs", "How to install and use the library, the context rules, the API and the guides."),
    contentSection("explore", "Explore", "Interactive pages that start the real library in this page: timelines, frames, the transform and events."),
    contentSection("testing", "Testing", "The test strategy, the results of the probes and the mutants, and the benchmarks."),
];

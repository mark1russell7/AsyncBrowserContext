import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

/** One entry of the top navigation, with the routes that it adds. */
export type SiteSection = {
    id : string;
    /** The navigation label, for example "Docs". */
    label : string;
    /** The site path, for example "/docs". */
    path : string;
    routes : RouteObject[];
    /** If the section has a card on the home page: one sentence and an optional detail component. */
    card? : {
        summary : string;
        Detail? : ComponentType;
    };
};

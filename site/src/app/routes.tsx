import type { RouteObject } from "react-router";
import { NotFoundPage } from "./NotFoundPage";
import { RootLayout } from "./RootLayout";
import { RouteError } from "./RouteError";
import type { SiteSection } from "./section-types";

function HydrateFallback() {
    return <p aria-busy="true" style={{ padding : "2rem" }}>The page loads.</p>;
}

/** The route tree: the layout, the routes of each section, and a not-found page. */
export function createAppRoutes(sections : readonly SiteSection[]) : RouteObject[] {
    return [{
        path : "/",
        element : <RootLayout />,
        errorElement : <RouteError />,
        HydrateFallback,
        children : [
            {
                errorElement : <RouteError />,
                children : [
                    ...sections.flatMap(section => section.routes),
                    { path : "*", element : <NotFoundPage /> },
                ],
            },
        ],
    }];
}

/** The router basename from Vite's base URL: "/AsyncBrowserContext/" → "/AsyncBrowserContext", "/" → "/". */
export function routerBasename(baseUrl : string) : string {
    const path = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl) ? new URL(baseUrl).pathname : baseUrl;
    const trimmed = path.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
}

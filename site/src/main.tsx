// The README setup: import the library before all other modules, so that it installs its patches first
import "async-browser-context";
import "@fontsource-variable/atkinson-hyperlegible-next/index.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css";
import "@fontsource-variable/atkinson-hyperlegible-mono/index.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { createDefaultServices } from "./app/default-services";
import { mountApp, routePathOf } from "./app/prerender-handoff";
import { createAppRoutes, routerBasename } from "./app/routes";
import { SiteProviders } from "./app/SiteProviders";

const services = createDefaultServices();
const router = createBrowserRouter(createAppRoutes(services.sections), {
    basename : routerBasename(import.meta.env.BASE_URL),
});

const container = document.getElementById("root");
if (!container) throw new Error("index.html needs an element with the ID \"root\".");

// A prerendered page keeps its HTML until the app has the same page ready.
const mount = mountApp(container, routePathOf(window.location.pathname, import.meta.env.BASE_URL));
createRoot(mount.element, mount.options).render(
    <StrictMode>
        <SiteProviders services={services}>
            <RouterProvider router={router} />
        </SiteProviders>
    </StrictMode>,
);

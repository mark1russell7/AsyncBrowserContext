import type { MDXComponents } from "mdx/types";
import { createContext, useContext } from "react";
import { mdxComponents } from "./component-map";

/** The components of the MDX pages. The default value is the map of `component-map.tsx`. */
const MdxComponentsContext = createContext<MDXComponents>(mdxComponents);

export function useMdxComponents() : MDXComponents {
    return useContext(MdxComponentsContext);
}

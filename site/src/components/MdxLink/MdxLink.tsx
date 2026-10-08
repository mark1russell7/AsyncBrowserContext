import type { AnchorHTMLAttributes } from "react";
import { Link } from "react-router";

/**
 * The MDX override for Markdown links. A site path ("/docs/...") becomes a
 * router link, so it uses the base path and does not load the page again.
 * Other links stay plain anchors.
 */
export function MdxLink({ href, children, ...rest } : AnchorHTMLAttributes<HTMLAnchorElement>) {
    if (href !== undefined && href.startsWith("/") && !href.startsWith("//")) {
        return <Link to={href} {...rest}>{children}</Link>;
    }
    const external = href !== undefined && /^[a-z][a-z0-9+.-]*:/i.test(href);
    return <a href={href} {...rest} {...(external ? { rel : "noreferrer" } : {})}>{children}</a>;
}

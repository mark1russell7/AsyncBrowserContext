import { Suspense, use } from "react";
import { Callout } from "../../components/Callout/Callout";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { useMdxComponents } from "../../mdx/MdxComponentsContext";
import { SITE_NAME } from "../../app/site";
import { useContentRegistry } from "../ContentRegistryContext";
import type { ContentPage, PageMeta } from "../types";
import { PageFooter } from "./PageFooter";
import { SectionSidebar } from "./SectionSidebar";
import { TableOfContents } from "./TableOfContents";
import styles from "./ContentPageView.module.css";

function PageHeader({ meta } : { meta : PageMeta }) {
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>{meta.title}</h1>
            {meta.description ? <p className={styles.description}>{meta.description}</p> : null}
            {meta.status === "draft" ? (
                <Callout type="note">This page is a draft. The content is not complete and can change.</Callout>
            ) : null}
        </header>
    );
}

/** The article and the table of contents, after the page module loads. */
function LoadedPage({ page } : { page : ContentPage }) {
    const module = use(page.load());
    const components = useMdxComponents();
    const Content = module.default;
    const toc = module.toc ?? [];
    return (
        <>
            {toc.length > 1 ? <TableOfContents entries={toc} className={styles.toc} /> : null}
            <article className={styles.article}>
                <PageHeader meta={page.meta} />
                <div className="prose">
                    <Content components={components} />
                </div>
                <PageFooter page={page} />
            </article>
        </>
    );
}

function LoadingPage({ page } : { page : ContentPage }) {
    return (
        <article className={styles.article} aria-busy="true">
            <PageHeader meta={page.meta} />
            <p className={styles.loading}>The page loads.</p>
        </article>
    );
}

function FailedPage({ page, error, retry } : { page : ContentPage; error : Error; retry : () => void }) {
    return (
        <article className={styles.article}>
            <PageHeader meta={page.meta} />
            <Callout type="warning" title="The page did not load">
                <p>{error.message}</p>
                <p>
                    <button type="button" className="button" onClick={retry}>Try again</button>
                </p>
            </Callout>
        </article>
    );
}

export type ContentPageViewProps = {
    page : ContentPage;
    sectionLabel : string;
};

/** A content page: the section sidebar, the article and the table of contents. */
export function ContentPageView({ page, sectionLabel } : ContentPageViewProps) {
    const registry = useContentRegistry();
    return (
        <div className={styles.layout}>
            <title>{`${page.meta.title} – ${SITE_NAME}`}</title>
            {page.meta.description ? <meta name="description" content={page.meta.description} /> : null}
            <SectionSidebar
                label={sectionLabel}
                items={registry.sidebar(page.section)}
                className={styles.sidebar}
            />
            <ErrorBoundary
                resetKey={page.path}
                fallback={(error, reset) => <FailedPage page={page} error={error} retry={reset} />}
            >
                <Suspense fallback={<LoadingPage page={page} />}>
                    <LoadedPage page={page} />
                </Suspense>
            </ErrorBoundary>
        </div>
    );
}

import { memoizePromise } from "../lib/memoize-promise";
import { parsePageMeta } from "./frontmatter";
import type {
    ContentEntry,
    ContentPage,
    ContentProblem,
    ContentRegistry,
    PageNeighbors,
    SidebarItem,
} from "./types";

export type RegistryOptions = {
    /** The content folder, from the repository root. It starts the "edit this page" path. */
    sourceRoot : string;
};

/** "../../content/docs/concepts/event-loop.mdx" → { section: "docs", file: "concepts/event-loop" }. */
export function parseContentKey(key : string) : { section : string; file : string } | undefined {
    const normalized = key.replace(/\\/g, "/").replace(/^(?:\.{1,2}\/|\/)+/, "");
    const relative = normalized.startsWith("content/") ? normalized.slice("content/".length) : normalized;
    const match = /^([^/]+)\/(.+)\.mdx$/.exec(relative);
    if (!match) return undefined;
    return { section : match[1]!, file : match[2]! };
}

/**
 * This function gives the slug of a content file:
 * - "concepts/event-loop" → "concepts/event-loop"
 * - "index" → ""
 * - "monitors/index" → "monitors"
 */
export function slugOf(file : string) : string {
    if (file === "index") return "";
    return file.endsWith("/index") ? file.slice(0, -"/index".length) : file;
}

/** "getting-started" → "Getting started". */
export function folderLabel(folder : string) : string {
    const words = folder.replace(/[-_]+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function lastSegment(file : string) : string {
    const segments = file.split("/");
    const last = segments[segments.length - 1] ?? file;
    return last === "index" ? (segments[segments.length - 2] ?? last) : last;
}

function comparePages(a : ContentPage, b : ContentPage) : number {
    return a.meta.order - b.meta.order
        || a.meta.title.localeCompare(b.meta.title)
        || a.path.localeCompare(b.path);
}

function buildSidebar(pages : readonly ContentPage[]) : SidebarItem[] {
    const positioned : Array<{ order : number; label : string; item : SidebarItem }> = [];
    const groups = new Map<string, ContentPage[]>();

    for (const page of pages) {
        if (page.group === undefined) {
            positioned.push({ order : page.meta.order, label : page.meta.title, item : { kind : "page", page } });
        } else {
            const members = groups.get(page.group) ?? [];
            members.push(page);
            groups.set(page.group, members);
        }
    }

    for (const [id, members] of groups) {
        members.sort(comparePages);
        const label = folderLabel(id);
        positioned.push({
            order : Math.min(...members.map(page => page.meta.order)),
            label,
            item : { kind : "group", id, label, pages : members },
        });
    }

    positioned.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    return positioned.map(entry => entry.item);
}

function readingOrder(sidebar : readonly SidebarItem[]) : ContentPage[] {
    return sidebar.flatMap(item => (item.kind === "page" ? [item.page] : [...item.pages]));
}

type SectionIndex = {
    sidebar : SidebarItem[];
    pages : ContentPage[];
    bySlug : Map<string, ContentPage>;
};

/** This function makes the registry from content entries. It does no I/O. Thus, tests can give it any entries. */
export function createContentRegistry(entries : readonly ContentEntry[], options : RegistryOptions) : ContentRegistry {
    const problems : ContentProblem[] = [];
    const bySection = new Map<string, ContentPage[]>();
    const sourceRoot = options.sourceRoot.replace(/\/$/, "");

    for (const entry of entries) {
        const parsed = parseContentKey(entry.key);
        if (!parsed) {
            problems.push({ sourcePath : entry.key, message : "The file is not in a section folder." });
            continue;
        }
        const sourcePath = `${sourceRoot}/${parsed.section}/${parsed.file}.mdx`;
        const { meta, errors } = parsePageMeta(entry.frontmatter, folderLabel(lastSegment(parsed.file)));
        for (const message of errors) problems.push({ sourcePath, message });

        const slug = slugOf(parsed.file);
        const folder = parsed.file.includes("/") ? parsed.file.split("/")[0] : undefined;
        const page : ContentPage = {
            section : parsed.section,
            slug,
            path : slug === "" ? `/${parsed.section}` : `/${parsed.section}/${slug}`,
            sourcePath,
            group : folder,
            meta,
            load : memoizePromise(entry.load),
        };
        const pages = bySection.get(parsed.section) ?? [];
        pages.push(page);
        bySection.set(parsed.section, pages);
    }

    const sections = new Map<string, SectionIndex>();
    for (const [section, pages] of bySection) {
        const bySlug = new Map<string, ContentPage>();
        const unique : ContentPage[] = [];
        for (const page of [...pages].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))) {
            const existing = bySlug.get(page.slug);
            if (existing) {
                problems.push({
                    sourcePath : page.sourcePath,
                    message : `The path ${page.path} is also the path of ${existing.sourcePath}.`,
                });
                continue;
            }
            bySlug.set(page.slug, page);
            unique.push(page);
        }
        const sidebar = buildSidebar(unique);
        sections.set(section, { sidebar, pages : readingOrder(sidebar), bySlug });
    }

    return {
        sections : () => [...sections.keys()].sort(),
        pages : (section) => sections.get(section)?.pages ?? [],
        page : (section, slug) => sections.get(section)?.bySlug.get(slug.replace(/^\/+|\/+$/g, "")),
        sidebar : (section) => sections.get(section)?.sidebar ?? [],
        neighbors(page) : PageNeighbors {
            const pages = sections.get(page.section)?.pages ?? [];
            const index = pages.findIndex(candidate => candidate.path === page.path);
            if (index < 0) return {};
            const result : PageNeighbors = {};
            const previous = pages[index - 1];
            const next = pages[index + 1];
            if (previous) result.previous = previous;
            if (next) result.next = next;
            return result;
        },
        problems : () => problems,
    };
}

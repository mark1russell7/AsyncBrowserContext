import type { PageMeta, PageStatus } from "./types";

export type FrontmatterResult = {
    meta : PageMeta;
    /** Empty if the frontmatter is valid. */
    errors : string[];
};

function isRecord(value : unknown) : value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STATUSES : readonly PageStatus[] = ["draft", "final"];

/**
 * This function examines the frontmatter of a page. For an invalid field, the result uses a
 * safe value (the file name as the title, the end of the section as the
 * order) and marks the page as a draft, so the page still shows.
 */
export function parsePageMeta(data : unknown, fallbackTitle : string) : FrontmatterResult {
    const errors : string[] = [];
    const record = isRecord(data) ? data : {};
    if (!isRecord(data) || Object.keys(data).length === 0) errors.push("The page has no frontmatter.");

    const title = record["title"];
    const validTitle = typeof title === "string" && title.trim() !== "";
    if (!validTitle) errors.push("Add a `title` (text).");

    const description = record["description"];
    const validDescription = typeof description === "string";
    if (!validDescription) errors.push("Add a `description` (text).");

    const order = record["order"];
    const validOrder = typeof order === "number" && Number.isFinite(order);
    if (!validOrder) errors.push("Add an `order` (a number).");

    const status = record["status"];
    const validStatus = status === undefined || STATUSES.includes(status as PageStatus);
    if (!validStatus) errors.push("Set `status` to \"draft\" or \"final\", or remove it.");

    const meta : PageMeta = {
        title : validTitle ? title.trim() : fallbackTitle,
        description : validDescription ? description : "",
        order : validOrder ? order : Number.MAX_SAFE_INTEGER,
    };
    if (errors.length > 0) meta.status = "draft";
    else if (status !== undefined) meta.status = status as PageStatus;

    return { meta, errors };
}

/** This component shows text in which `backticks` mark technical names, with each name in code format. */
export function InlineCode({ text } : { text : string }) {
    const parts = text.split("`");
    return <>{parts.map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}</>;
}

/** The text without the backticks, for accessible names. */
export function plainText(text : string) : string {
    return text.replace(/`/g, "");
}

/** A line of source text, and the file offset of its first character. */
export type Line = {
    readonly text : string;
    readonly offset : number;
};

/**
 * This function divides `text` into lines. The offset of each line starts at
 * `base`. A `\r` before a `\n` is not part of the line text.
 */
export function splitLines(text : string, base : number = 0) : Line[] {
    const lines : Line[] = [];
    let start = 0;
    for (let i = 0; i <= text.length; i++) {
        if (i === text.length || text[i] === "\n") {
            let end = i;
            if (end > start && text[end - 1] === "\r") end--;
            lines.push({ text : text.slice(start, end), offset : base + start });
            start = i + 1;
        }
    }
    return lines;
}

/** A 1-based line and column. */
export type Position = {
    readonly line : number;
    readonly column : number;
};

/** This index changes file offsets into 1-based line and column numbers. */
export class LineIndex {
    private readonly starts : number[] = [0];

    constructor(text : string) {
        for (let i = 0; i < text.length; i++) {
            if (text[i] === "\n") this.starts.push(i + 1);
        }
    }

    /** The line and column of `offset`. */
    position(offset : number) : Position {
        let low = 0;
        let high = this.starts.length - 1;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (this.starts[middle]! <= offset) low = middle;
            else high = middle - 1;
        }
        return { line : low + 1, column : offset - this.starts[low]! + 1 };
    }
}

/** The number of columns of indentation at the start of `text`. A tab moves to the next multiple of 4. */
export function indentWidth(text : string) : number {
    let width = 0;
    for (const char of text) {
        if (char === " ") width++;
        else if (char === "\t") width += 4 - (width % 4);
        else break;
    }
    return width;
}

/** The part of `line` after the first `count` characters. The offset moves with the text. */
export function sliceLine(line : Line, count : number) : Line {
    const n = Math.min(Math.max(count, 0), line.text.length);
    return { text : line.text.slice(n), offset : line.offset + n };
}

/**
 * The part of `line` after `columns` columns of indentation. The function
 * removes fewer characters when the line has less indentation.
 */
export function stripIndent(line : Line, columns : number) : Line {
    let width = 0;
    let i = 0;
    while (i < line.text.length && width < columns) {
        const char = line.text[i];
        if (char === " ") width++;
        else if (char === "\t") width += 4 - (width % 4);
        else break;
        i++;
    }
    return sliceLine(line, i);
}

/** True when the line has only white space. */
export function isBlank(text : string) : boolean {
    return text.trim().length === 0;
}

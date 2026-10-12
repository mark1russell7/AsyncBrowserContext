import { useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStepPlayer, type StepPlayer } from "./useStepPlayer";

let container : HTMLDivElement;
let root : Root;
let player : StepPlayer | undefined;

function Harness({ count, resetKey, startAt, onCommit } : { count : number; resetKey : string; startAt? : "first" | "last"; onCommit? : () => void }) : null {
    player = useStepPlayer(count, { resetKey, ...(startAt === undefined ? {} : { startAt }) });
    // A layout effect operates after the commit and before the passive effects
    useLayoutEffect(() => onCommit?.(), [onCommit]);
    return null;
}

function render(count : number, resetKey : string, startAt? : "first" | "last") : void {
    flushSync(() => root.render(<Harness count={count} resetKey={resetKey} {...(startAt === undefined ? {} : { startAt })} />));
}

beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    player = undefined;
});

afterEach(() => {
    root.unmount();
    container.remove();
});

describe("useStepPlayer", () => {
    it("keeps a move of the reader between the commit of new steps and the passive effects", async () => {
        render(0, "scenario:0");
        const moveOnce = () : void => { player?.next(); };
        // The steps arrive in a normal update, as the trace of the debugger does
        root.render(<Harness count={25} resetKey="scenario:25" onCommit={moveOnce} />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(player?.index).toBe(1);
    });

    it("goes back to the first step, or to the last step, when the reset key changes", () => {
        render(10, "a:10");
        flushSync(() => player?.setIndex(4));
        expect(player?.index).toBe(4);
        render(10, "b:10");
        expect(player?.index).toBe(0);
        render(10, "c:10", "last");
        expect(player?.index).toBe(9);
    });
});

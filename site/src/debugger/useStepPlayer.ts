import { useCallback, useEffect, useState } from "react";

/** The time of one step at the speed 1. */
const STEP_MS = 950;
/** The time at the last step before a loop starts again. */
const LOOP_PAUSE_MS = 2800;

export type StepPlayer = {
    index : number;
    playing : boolean;
    speed : number;
    setIndex(index : number) : void;
    setSpeed(speed : number) : void;
    play() : void;
    pause() : void;
    toggle() : void;
    next() : void;
    previous() : void;
};

/**
 * This hook moves through `count` steps. When it plays, it goes to the next
 * step after a fixed time. With `loop`, it starts again after the last step.
 * A change of `resetKey` goes back to the first step.
 */
export function useStepPlayer(count : number, options : { loop? : boolean; resetKey? : string; startAt? : "first" | "last" } = {}) : StepPlayer {
    const { loop = false, resetKey = "", startAt = "first" } = options;
    const last = Math.max(0, count - 1);
    const [index, setIndexState] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);

    useEffect(() => {
        setIndexState(startAt === "last" ? last : 0);
        setPlaying(false);
    }, [resetKey, startAt, last]);

    useEffect(() => {
        if (!playing || count === 0) return undefined;
        const atEnd = index >= last;
        if (atEnd && !loop) {
            setPlaying(false);
            return undefined;
        }
        const timer = window.setTimeout(() => setIndexState(atEnd ? 0 : index + 1), atEnd ? LOOP_PAUSE_MS : STEP_MS / speed);
        return () => window.clearTimeout(timer);
    }, [playing, index, last, loop, speed, count]);

    const setIndex = useCallback((value : number) => {
        setPlaying(false);
        setIndexState(Math.min(Math.max(0, value), last));
    }, [last]);

    return {
        index : Math.min(index, last),
        playing,
        speed,
        setIndex,
        setSpeed,
        play : () => {
            if (index >= last) setIndexState(0);
            setPlaying(true);
        },
        pause : () => setPlaying(false),
        toggle : () => {
            if (playing) {
                setPlaying(false);
            } else {
                if (index >= last) setIndexState(0);
                setPlaying(true);
            }
        },
        next : () => setIndex(index + 1),
        previous : () => setIndex(index - 1),
    };
}

"use client";
import { useEffect } from "react";
import { runChecks } from "../checks.js";
import { serverAction } from "./actions.js";

/** The server action gives "A" if the preset did not change it, and if the "use cache" function operates. */
async function withServerAction(results) {
    return { ...results, serverAction : await serverAction() };
}

export default function Page() {
    useEffect(() => {
        runChecks().then(withServerAction).then((results) => {
            window.__results = results;
            document.getElementById("results").textContent = JSON.stringify(results);
        });
    }, []);
    return <pre id="results">running</pre>;
}

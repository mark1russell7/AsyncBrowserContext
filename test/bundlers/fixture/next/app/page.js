"use client";
import { useEffect } from "react";
import { runChecks } from "../checks.js";

export default function Page() {
    useEffect(() => {
        runChecks().then((results) => {
            window.__results = results;
            document.getElementById("results").textContent = JSON.stringify(results);
        });
    }, []);
    return <pre id="results">running</pre>;
}

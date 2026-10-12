import { runChecks } from "./checks.js";

runChecks().then((results) => {
    window.__results = results;
    document.body.textContent = JSON.stringify(results);
});

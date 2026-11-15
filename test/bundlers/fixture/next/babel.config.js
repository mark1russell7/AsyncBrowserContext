// The Babel setup of the guide "Build tools" for Next.js. With this file,
// Next.js uses Babel in place of SWC, also with Turbopack.
// With webpack, next/babel also starts @babel/preset-env. Without targets, it
// changes the async functions of a server action, and Next.js stops the build.
// These targets are the default browsers of Next.js 16.
module.exports = {
    presets : [
        ["next/babel", { "preset-env" : { targets : "chrome 111, edge 111, firefox 111, safari 16.4" } }],
        "async-browser-context/babel-preset",
    ],
};

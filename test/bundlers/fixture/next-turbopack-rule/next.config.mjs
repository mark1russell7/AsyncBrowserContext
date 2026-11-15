// The Turbopack rule of the guide "Build tools" for Next.js. The test copies this
// file over the files of `next` and removes `babel.config.js`. Thus SWC compiles the
// code, and babel-loader with only the preset changes the files of the browser that
// have async functions or generators, also in node_modules.

/** The options of babel-loader for one kind of file. Turbopack gives the options as JSON to the loader. */
function babel(syntax) {
    return {
        loader : "babel-loader",
        options : {
            babelrc : false,
            configFile : false,
            sourceType : "unambiguous",
            parserOpts : { plugins : syntax },
            presets : ["async-browser-context/babel-preset"],
        },
    };
}

/** The files of the browser that the preset can change. Turbopack does not give the other files to Babel. */
const condition = { all : ["browser", { content : /\basync\b|\byield\b|function\s*\*/ }] };

export default {
    cacheComponents : true,
    turbopack : {
        // The alias of the guide for pnpm settings that hide the library from the dependencies.
        // npm puts the library in this folder too, so the alias changes nothing here. The test
        // examines that Next.js accepts it. The path goes from the folder of this file.
        resolveAlias : {
            "async-browser-context/runtime" : { browser : "../node_modules/async-browser-context/dist/runtime.js" },
        },
        rules : {
            "*.{js,jsx,mjs,cjs}" : { condition, loaders : [babel(["jsx"])] },
            "*.{ts,mts,cts}" : { condition, loaders : [babel(["typescript"])] },
            "*.tsx" : { condition, loaders : [babel(["typescript", "jsx"])] },
        },
    },
};

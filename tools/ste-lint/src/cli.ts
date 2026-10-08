#!/usr/bin/env node
import { runCli } from "./run-cli.js";

process.exitCode = runCli(process.argv.slice(2), {
    cwd : process.cwd(),
    env : process.env,
    stdout : (text) => process.stdout.write(text),
    stderr : (text) => process.stderr.write(text),
});

import { afterEach, describe, expect, it } from "vitest";
import { BROWSER_HOST, freePort } from "../vitest/free-port.js";
import { startProcess, stopProcess, waitForServer, withServer, within, type StartedProcess } from "./process.js";

/** The processes of a test. Each test stops its processes, also when it fails. */
const started : StartedProcess[] = [];

/** This function starts Node.js with the script `code`. */
function node(code : string) : StartedProcess {
    const server = startProcess(process.execPath, ["-e", code], { cwd : process.cwd() });
    started.push(server);
    return server;
}

/** This function waits until the output of `server` has `text`. */
async function outputHas(server : StartedProcess, text : string) : Promise<void> {
    while (!server.output().includes(text)) {
        if (await within(server.ended, 20) !== undefined) {
            throw new Error(`The process ended without "${text}" in its output: ${server.output()}`);
        }
    }
}

afterEach(async () => {
    await Promise.all(started.splice(0).map((server) => stopProcess(server, 2_000)));
});

describe("the server process of a test script", () => {
    it("rejects immediately with the output when the server ends before it answers", async () => {
        const url = `http://${BROWSER_HOST}:${await freePort()}/`;
        const server = node("console.log('starting'); console.error('the build output is missing'); process.exit(3);");
        const start = Date.now();
        const error : unknown = await waitForServer(server, url, 60_000).catch((reason : unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(`The server ended before it answered on ${url} (exit code 3)`);
        expect((error as Error).message).toContain("the build output is missing");
        expect(Date.now() - start).toBeLessThan(30_000);
    });

    it("waits until the server answers, then stops it", async () => {
        const port = await freePort();
        const server = node(`require("node:http").createServer((request, response) => response.end("ok")).listen(${port}, "${BROWSER_HOST}");`);
        await waitForServer(server, `http://${BROWSER_HOST}:${port}/`);
        expect(await stopProcess(server)).toBe(true);
        expect(server.child.exitCode !== null || server.child.signalCode !== null).toBe(true);
    });

    it("rejects with the output when the server does not answer in time", async () => {
        const url = `http://${BROWSER_HOST}:${await freePort()}/`;
        const server = node("console.log('compiling'); setInterval(() => undefined, 1000);");
        await outputHas(server, "compiling");
        await expect(waitForServer(server, url, 300)).rejects.toThrow(/did not answer on .* in 300 ms\. The output of the server:\ncompiling/);
    });

    it.skipIf(process.platform === "win32")("stops a process that does not end at SIGTERM with SIGKILL (POSIX: Windows ends each process at kill)", async () => {
        const server = node("process.on('SIGTERM', () => undefined); setInterval(() => undefined, 1000); console.log('ready');");
        await outputHas(server, "ready");
        expect(await stopProcess(server, 300)).toBe(true);
        expect(server.child.signalCode).toBe("SIGKILL");
    });

    it("gives true for a process that already ended", async () => {
        const server = node("process.exit(0);");
        expect(await server.ended).toBe("exit code 0");
        expect(await stopProcess(server)).toBe(true);
    });

    it("withServer gives the result of use, and stops the server also when use throws", async () => {
        const port = await freePort();
        const url = `http://${BROWSER_HOST}:${port}/`;
        const code = `require("node:http").createServer((request, response) => response.end("ok")).listen(${port}, "${BROWSER_HOST}");`;
        const first = node(code);
        expect(await withServer(first, url, async (address) => (await fetch(address)).text())).toBe("ok");
        expect(await within(first.ended, 0)).toBeDefined();
        const second = node(code);
        await expect(withServer(second, url, () => Promise.reject(new Error("the page failed")))).rejects.toThrow("the page failed");
        expect(await within(second.ended, 0)).toBeDefined();
    });

    it("gives the spawn error when the program does not exist", async () => {
        const server = startProcess("a-program-that-does-not-exist-abc", [], { cwd : process.cwd() });
        expect(await server.ended).toMatch(/^spawn error: /);
        expect(await stopProcess(server)).toBe(true);
    });
});

import net from "node:net";

/**
 * The host of the browser API server. The browsers open `http://127.0.0.1:<port>`,
 * not `http://localhost:<port>`. On Windows, "localhost" is `::1` for Vite and
 * Chromium, but `127.0.0.1` for Firefox. Another program can listen on the same
 * port with the other address, and Firefox then connects to that program
 * (docs/testing.md, "Concurrent test runs").
 */
export const BROWSER_HOST = "127.0.0.1";

/** The addresses that can hold a port of this computer: the two loopback addresses and the two wildcard addresses. */
export const ADDRESSES : readonly string[] = ["127.0.0.1", "::1", "0.0.0.0", "::"];

/** Vitest gives the browser servers the ports from 63315 up. The other runs of Vitest use these ports. */
export const VITEST_PORTS = { first : 63315, last : 63415 } as const;

/**
 * The maximum number of ports that the search examines. Windows gives the
 * ports of `listen(0)` in a sequence. Thus, the search can pass through all
 * the ports of `VITEST_PORTS` before it gets a port that it can use.
 */
export const MAX_ATTEMPTS = 1000;

/** The error codes of `listen()` that tell that a different program holds the port on the address. */
const IN_USE : ReadonlySet<string> = new Set(["EADDRINUSE", "EACCES"]);

/**
 * A function that listens on a port and an address, and closes the server
 * immediately. It gives the port of the server, or `undefined` if the server
 * has no TCP address. If `listen()` fails, the function rejects with the error
 * of `listen()`, for example with the code `EADDRINUSE`. The tests give a
 * function that uses no sockets.
 */
export type Listen = (port : number, host : string) => Promise<number | undefined>;

/** The `Listen` function of this computer: it listens with a real server of `node:net`. */
export function listenOnce(port : number, host : string) : Promise<number | undefined> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(port, host, () => {
            const address = server.address();
            server.close(() => resolve(typeof address === "object" && address !== null ? address.port : undefined));
        });
    });
}

/** This function gives the code of an error of `listen()`, or "no error code". */
function codeOf(error : unknown) : string {
    const code = typeof error === "object" && error !== null ? (error as { code? : unknown }).code : undefined;
    return typeof code === "string" ? code : "no error code";
}

/** This function gives true if `port` is a TCP port that a server can listen on. */
function isTcpPort(port : number | undefined) : port is number {
    return port !== undefined && Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * This function gets a port from the operating system with `listen(0)`. If
 * `listen(0)` fails, or the server has no TCP address, the function throws an
 * error that tells the cause. It does not give port 0 or a port that is not valid.
 */
async function systemPort(listen : Listen) : Promise<number> {
    let port : number | undefined;
    try {
        port = await listen(0, BROWSER_HOST);
    } catch (error) {
        throw new Error(`The operating system gave no free port: listen(0) on ${BROWSER_HOST} failed (${codeOf(error)}).`, { cause : error });
    }
    if (!isTcpPort(port)) {
        throw new Error(`The operating system gave no free port: the server of listen(0) on ${BROWSER_HOST} has no TCP port (${String(port)}).`);
    }
    return port;
}

/**
 * This function gives true if no program holds `port` on `host`. An address
 * that this computer does not have (for example `::1` without IPv6) cannot
 * hold the port, thus the port counts as free on it.
 */
async function isFreeOn(listen : Listen, port : number, host : string) : Promise<boolean> {
    try {
        await listen(port, host);
        return true;
    } catch (error) {
        return !IN_USE.has(codeOf(error));
    }
}

/** This function gives true if no program holds `port` on a loopback address or a wildcard address. */
async function isFree(listen : Listen, port : number) : Promise<boolean> {
    for (const host of ADDRESSES) {
        if (!await isFreeOn(listen, port, host)) {
            return false;
        }
    }
    return true;
}

/**
 * This function gives a port that no program uses on a loopback address or a
 * wildcard address. The operating system selects the port, thus two test
 * processes that start at the same time get different ports. Vitest binds the
 * port with `strictPort`. If a different program takes the port first, the
 * process stops with an error. It does not continue on a shared port.
 *
 * @param listen - The function that tries to listen. The tests replace it.
 */
export async function freePort(listen : Listen = listenOnce) : Promise<number> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const port = await systemPort(listen);
        if (port >= VITEST_PORTS.first && port <= VITEST_PORTS.last) {
            continue;
        }
        if (await isFree(listen, port)) {
            return port;
        }
    }
    throw new Error(`No free port for the browser API server after ${MAX_ATTEMPTS} attempts.`);
}

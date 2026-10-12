import net from "node:net";
import { describe, expect, it } from "vitest";
import { ADDRESSES, BROWSER_HOST, freePort, MAX_ATTEMPTS, VITEST_PORTS, type Listen } from "./free-port.js";

/** A computer without sockets, for the `Listen` function of `freePort`. */
interface Network {
    /** The ports that `listen(0)` gives, in sequence. After the last port, `listen(0)` gives the last port again. */
    readonly systemPorts : readonly (number | undefined)[];
    /** The error code of `listen()` for each "host port", or for each "host *" (all ports of the host). */
    readonly errors? : Readonly<Record<string, string>>;
}

/** A simulated `Listen` function, and a record of its calls ("host port"). */
function simulated(network : Network) : { listen : Listen; calls : string[] } {
    const calls : string[] = [];
    let next = 0;
    const listen : Listen = async (port, host) => {
        calls.push(`${host} ${port}`);
        const code = network.errors?.[`${host} ${port}`] ?? network.errors?.[`${host} *`];
        if (code !== undefined) {
            throw Object.assign(new Error(`listen ${code} ${host} ${port}`), { code });
        }
        if (port !== 0) {
            return port;
        }
        const given = network.systemPorts[Math.min(next, network.systemPorts.length - 1)];
        next++;
        return given;
    };
    return { listen, calls };
}

function listen(port : number, host : string) : Promise<net.Server> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(port, host, () => resolve(server));
    });
}

function close(server : net.Server) : Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
}

describe("the port of the browser API server", () => {
    it("gives the port of listen(0) when no program holds it on a loopback or wildcard address", async () => {
        const network = simulated({ systemPorts : [5000] });
        expect(await freePort(network.listen)).toBe(5000);
        expect(network.calls).toEqual([`${BROWSER_HOST} 0`, ...ADDRESSES.map((host) => `${host} 5000`)]);
    });

    it.each([
        ["127.0.0.1", "IPv4 loopback only"],
        ["::1", "IPv6 loopback only"],
        ["0.0.0.0", "IPv4 wildcard"],
        ["::", "IPv6 wildcard"],
    ])("does not give a port that a program holds on %s (%s)", async (host) => {
        const network = simulated({ systemPorts : [5000, 5001], errors : { [`${host} 5000`] : "EADDRINUSE" } });
        expect(await freePort(network.listen)).toBe(5001);
    });

    it("counts a port as in use when listen() gives EACCES (a port range that Windows keeps)", async () => {
        const network = simulated({ systemPorts : [5000, 5001], errors : { "0.0.0.0 5000" : "EACCES" } });
        expect(await freePort(network.listen)).toBe(5001);
    });

    it("counts a port as free on an address that the computer does not have (no IPv6)", async () => {
        const network = simulated({ systemPorts : [5000], errors : { "::1 *" : "EADDRNOTAVAIL", ":: *" : "EAFNOSUPPORT" } });
        expect(await freePort(network.listen)).toBe(5000);
    });

    it("does not give a port of the range that the other Vitest runs use", async () => {
        const network = simulated({ systemPorts : [VITEST_PORTS.first, VITEST_PORTS.last, 63400, VITEST_PORTS.first - 1] });
        expect(await freePort(network.listen)).toBe(VITEST_PORTS.first - 1);
        expect(await freePort(simulated({ systemPorts : [VITEST_PORTS.last + 1] }).listen)).toBe(VITEST_PORTS.last + 1);
    });

    it("throws after the maximum number of attempts when no port is free", async () => {
        const network = simulated({ systemPorts : [5000], errors : { ":: 5000" : "EADDRINUSE" } });
        await expect(freePort(network.listen)).rejects.toThrow(`No free port for the browser API server after ${MAX_ATTEMPTS} attempts.`);
        expect(network.calls.filter((call) => call === `${BROWSER_HOST} 0`)).toHaveLength(MAX_ATTEMPTS);
    });

    it("throws an error with the code when listen(0) fails, and does not try again", async () => {
        const network = simulated({ systemPorts : [5000], errors : { [`${BROWSER_HOST} 0`] : "EADDRNOTAVAIL" } });
        await expect(freePort(network.listen)).rejects.toThrow(`listen(0) on ${BROWSER_HOST} failed (EADDRNOTAVAIL)`);
        expect(network.calls).toEqual([`${BROWSER_HOST} 0`]);
    });

    it("throws an error when listen(0) fails without an error code", async () => {
        const failing : Listen = () => Promise.reject(new Error("no network"));
        await expect(freePort(failing)).rejects.toThrow("failed (no error code)");
    });

    it.each([
        ["no address", undefined],
        ["port 0", 0],
        ["a port that is not valid", 70000],
    ])("throws an error when the server of listen(0) has %s", async (_name, port) => {
        const network = simulated({ systemPorts : [port] });
        await expect(freePort(network.listen)).rejects.toThrow(`has no TCP port (${String(port)})`);
        expect(network.calls).toEqual([`${BROWSER_HOST} 0`]);
    });

    it("gives a port that a real server can listen on with 127.0.0.1", async () => {
        const port = await freePort();
        expect(port < VITEST_PORTS.first || port > VITEST_PORTS.last).toBe(true);
        await close(await listen(port, BROWSER_HOST));
    });
});

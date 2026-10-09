import net from "node:net";
import { describe, expect, it } from "vitest";
import { BROWSER_HOST, freePort } from "./free-port.js";

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
    it("gives a port that a server can listen on with 127.0.0.1", async () => {
        const port = await freePort();
        await close(await listen(port, BROWSER_HOST));
    });

    it("does not give a port of the range that the other Vitest runs use", async () => {
        const port = await freePort();
        expect(port < 63315 || port > 63415).toBe(true);
    });

    it("gives a different port while a server listens on the first port", async () => {
        const first = await freePort();
        const server = await listen(first, BROWSER_HOST);
        try {
            expect(await freePort()).not.toBe(first);
        } finally {
            await close(server);
        }
    });
});

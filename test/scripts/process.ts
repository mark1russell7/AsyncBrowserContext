import { spawn, type ChildProcess } from "node:child_process";

/** A process that a test script started, for example `next start`. */
export interface StartedProcess {
    readonly child : ChildProcess;
    /** The output of the process (stdout and stderr) up to now. */
    output() : string;
    /** Resolves when the process ends, with the cause: "exit code 1", "signal SIGTERM", or the error of `spawn`. */
    readonly ended : Promise<string>;
    /** Resolves when the process ended and its stdout and stderr closed. */
    readonly closed : Promise<void>;
}

/** The options of `startProcess`. */
export interface StartOptions {
    readonly cwd : string;
    readonly env? : NodeJS.ProcessEnv | undefined;
    /** Also write the output of the process to the output of this script. The default is `false`. */
    readonly echo? : boolean | undefined;
}

/** The time in milliseconds that a server has to answer, and that a process has to end after a kill. */
export const TIMEOUTS = { ready : 30_000, stop : 10_000 } as const;

/** This function waits `milliseconds`. */
function delay(milliseconds : number) : Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** This function gives the result of `promise`, or `undefined` if it does not settle in `milliseconds`. */
export async function within<T>(promise : Promise<T>, milliseconds : number) : Promise<T | undefined> {
    let timer : NodeJS.Timeout | undefined;
    const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), milliseconds);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/** This function starts `command` with `args`, and keeps its output for the error messages. */
export function startProcess(command : string, args : readonly string[], options : StartOptions) : StartedProcess {
    const child = spawn(command, args, { cwd : options.cwd, env : options.env ?? process.env, stdio : ["ignore", "pipe", "pipe"], windowsHide : true });
    let output = "";
    const keep = (stream : NodeJS.WriteStream) => (chunk : Buffer) : void => {
        output += chunk.toString("utf8");
        if (options.echo === true) {
            stream.write(chunk);
        }
    };
    child.stdout?.on("data", keep(process.stdout));
    child.stderr?.on("data", keep(process.stderr));
    let resolveEnded : (cause : string) => void = () => undefined;
    let resolveClosed : () => void = () => undefined;
    const ended = new Promise<string>((resolve) => {
        resolveEnded = resolve;
    });
    const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
    });
    child.once("exit", (code, signal) => resolveEnded(signal === null ? `exit code ${String(code)}` : `signal ${signal}`));
    child.once("close", () => resolveClosed());
    // A permanent listener: an "error" event without a listener stops this script
    child.on("error", (error) => {
        // Without a process ID, spawn failed and the process does not exist
        if (child.pid === undefined) {
            resolveEnded(`spawn error: ${error.message}`);
            resolveClosed();
        }
    });
    return { child, output : () => output, ended, closed };
}

/** This function gives true if `url` answers an HTTP request, with any status. */
async function answers(url : string) : Promise<boolean> {
    try {
        const response = await fetch(url, { signal : AbortSignal.timeout(5_000) });
        await response.body?.cancel();
        return true;
    } catch {
        return false;
    }
}

/**
 * This function waits until the server process answers on `url`. If the
 * process ends before, the function rejects immediately with the output of
 * the process. If the server does not answer in `timeout` milliseconds, the
 * function also rejects with the output.
 */
export async function waitForServer(server : StartedProcess, url : string, timeout : number = TIMEOUTS.ready) : Promise<void> {
    const endedEarly = server.ended.then(async (cause) => {
        await within(server.closed, 1_000);
        throw new Error(`The server ended before it answered on ${url} (${cause}). The output of the server:\n${server.output()}`);
    });
    // The server ends normally after a successful wait. This handler prevents an unhandled rejection.
    endedEarly.catch(() => undefined);
    const deadline = Date.now() + timeout;
    while (!await Promise.race([answers(url), endedEarly])) {
        if (Date.now() >= deadline) {
            throw new Error(`The server did not answer on ${url} in ${timeout} ms. The output of the server:\n${server.output()}`);
        }
        await Promise.race([delay(250), endedEarly]);
    }
}

/** This function gives true if the process ended. */
function hasEnded(child : ChildProcess) : boolean {
    return child.exitCode !== null || child.signalCode !== null || child.pid === undefined;
}

/**
 * This function stops the process and waits until it ends. It sends SIGTERM
 * first. If the process does not end in `timeout` milliseconds, it sends
 * SIGKILL and waits again. If the process still does not end, the function
 * releases the process, so that this script does not wait for it, and gives
 * `false`.
 */
export async function stopProcess(server : StartedProcess, timeout : number = TIMEOUTS.stop) : Promise<boolean> {
    for (const signal of ["SIGTERM", "SIGKILL"] as const) {
        if (hasEnded(server.child)) {
            return true;
        }
        server.child.kill(signal);
        if (await within(server.ended, timeout) !== undefined) {
            return true;
        }
    }
    server.child.stdout?.destroy();
    server.child.stderr?.destroy();
    server.child.unref();
    return false;
}

/**
 * This function waits until the server process answers on `url`, and gives
 * the result of `use(url)`. It stops the process in all cases and waits until
 * the process ended. A process that does not end sets the exit code of this
 * script to 1.
 */
export async function withServer<T>(server : StartedProcess, url : string, use : (url : string) => Promise<T>) : Promise<T> {
    try {
        await waitForServer(server, url);
        return await use(url);
    } finally {
        if (!await stopProcess(server)) {
            console.error(`The server process ${String(server.child.pid)} did not end after SIGTERM and SIGKILL.`);
            process.exitCode = 1;
        }
    }
}

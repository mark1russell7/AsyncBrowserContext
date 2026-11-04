/**
 * The probe of the playground. The site check of the Pages workflow starts it in a browser at each width, before the
 * deploy. A failed check stops the deploy.
 *
 * The probe drives the core of the site: the real library starts the code of the reader. A scenario loads its code, bad
 * code shows its error, and good code opens the debugger.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => Element | null;
declare const $$: (selector: string) => Element[];
declare const click: (target: string | Element) => void;

const ERROR = '[role="alert"]';
const DEBUGGER = 'section[aria-label="Context debugger"]';
/** The time for the first compile, in milliseconds. The page loads its compiler at this time. */
const COMPILE = 20_000;

const editor = (): HTMLTextAreaElement | null => $("textarea") as HTMLTextAreaElement | null;
const select = (): HTMLSelectElement | null => $("select") as HTMLSelectElement | null;
/** This function presses the button that starts the code. */
const start = (): void => click($$("button").find((b) => b.textContent?.trim() === "Run the code") as Element);
/** This function writes code into the editor. React reads the value through the setter of the prototype. */
const write = (value: string): void => {
  const box = editor() as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, value);
  box.dispatchEvent(new Event("input", { bubbles: true }));
};

check("the playground starts", await until(() => editor() !== null && select() !== null, COMPILE), $("main")?.textContent?.slice(0, 200));
check("the playground has scenarios", (select()?.options.length ?? 0) > 2, select()?.options.length);

// A scenario loads its code.
const first = editor()?.value;
const pick = select() as HTMLSelectElement;
pick.value = pick.options[2]?.value ?? "";
pick.dispatchEvent(new Event("change", { bubbles: true }));
check("a scenario loads its code", await until(() => (editor()?.value ?? "") !== "" && editor()?.value !== first), editor()?.value.slice(0, 80));

// Bad code shows its error, and it does not open the debugger.
write("log(\n");
start();
check("bad code shows its error", await until(() => $(ERROR) !== null, COMPILE), $("main")?.textContent?.slice(-200));

// Good code removes the error, and it opens the debugger.
write('log("from the probe");\n');
start();
check("good code removes the error", await until(() => $(ERROR) === null, COMPILE), $(ERROR)?.textContent);
check("good code opens the debugger", await until(() => $(DEBUGGER) !== null, COMPILE), $("main")?.textContent?.slice(-200));

export {};

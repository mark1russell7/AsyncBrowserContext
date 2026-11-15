"use server";
// A server action. Next.js accepts only native async functions in a "use server" file, so the
// preset must not change this file. The client bundle gets a reference to the server in place
// of the function.
import { cachedValue } from "./cached.js";

export async function serverAction() {
    return await cachedValue();
}

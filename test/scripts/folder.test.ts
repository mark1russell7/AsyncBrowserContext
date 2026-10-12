import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { removeFolder } from "./folder.js";

describe("the removal of a work folder", () => {
    it("removes a folder with its files and folders", () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), "abc-folder-"));
        fs.mkdirSync(path.join(folder, "app", "node_modules"), { recursive : true });
        fs.writeFileSync(path.join(folder, "app", "node_modules", "file.js"), "");
        removeFolder(folder);
        expect(fs.existsSync(folder)).toBe(false);
    });

    it("does not throw for a folder that does not exist", () => {
        expect(() => removeFolder(path.join(os.tmpdir(), "abc-folder-that-does-not-exist"))).not.toThrow();
    });
});

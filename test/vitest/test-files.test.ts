import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isTestFile, isUntransformedFixture, pathInRoot } from "./test-files.js";

/** A repository in a folder whose path has a `test` folder. */
const POSIX_ROOT = "/home/test/project";
/** The same on Windows: `node:path` gives backslashes, Vite gives the ids with forward slashes. */
const WINDOWS_ROOT = "C:\\Users\\test\\project";

describe("the test files of the transform", () => {
    it.each([
        ["/home/test/project/test/rules/c01-root.test.ts", true],
        ["/home/test/project/test/helpers.ts", true],
        ["/home/test/project/test/fixtures/compiled-tsc-es2015.js", true],
        ["/home/test/project/src/core/store.test.ts", true],
        ["/home/test/project/src/core/store.ts", false],
        ["/home/test/project/src/index.ts", false],
        ["/home/test/project/node_modules/dependency/test/index.js", false],
        ["/home/test/project-b/test/helpers.ts", false],
        ["/home/test/other.test.ts", false],
    ])("POSIX: %s is a test file: %s", (id, expected) => {
        expect(isTestFile(id, POSIX_ROOT, path.posix)).toBe(expected);
    });

    it.each([
        ["C:/Users/test/project/test/rules/c01-root.test.ts", true],
        ["C:\\Users\\test\\project\\test\\helpers.ts", true],
        ["c:/users/test/project/test/helpers.ts", true],
        ["C:/Users/test/project/src/core/store.test.ts", true],
        ["C:/Users/test/project/src/core/store.ts", false],
        ["C:/Users/test/project/node_modules/dependency/test/index.js", false],
        ["C:/Users/test/project-b/test/helpers.ts", false],
        ["D:/test/helpers.ts", false],
    ])("Windows: %s is a test file: %s", (id, expected) => {
        expect(isTestFile(id, WINDOWS_ROOT, path.win32)).toBe(expected);
    });

    it.each([
        ["/home/test/project/test/fixtures/untransformed.js", true],
        ["/home/test/project/test/fixtures/untransformed-babel.js", true],
        ["/home/test/project/test/fixtures/compiled-tsc-es2015.js", false],
        ["/home/test/project/src/test/fixtures/untransformed.js", false],
    ])("POSIX: %s is an untransformed fixture: %s", (id, expected) => {
        expect(isUntransformedFixture(id, POSIX_ROOT, path.posix)).toBe(expected);
    });

    it("does not count a source file as an untransformed fixture when the root is in such a folder", () => {
        const root = "/home/test/fixtures/untransformed/project";
        expect(isUntransformedFixture(`${root}/src/index.ts`, root, path.posix)).toBe(false);
        expect(isUntransformedFixture("C:/test/fixtures/untransformed/project/src/index.ts", "C:\\test\\fixtures\\untransformed\\project", path.win32)).toBe(false);
        expect(isUntransformedFixture("C:/Users/test/project/test/fixtures/untransformed-tsc-es5.js", WINDOWS_ROOT, path.win32)).toBe(true);
    });

    it("gives the path in the root with forward slashes, or undefined for a file outside the root", () => {
        expect(pathInRoot("C:/Users/test/project/test/a.ts", WINDOWS_ROOT, path.win32)).toBe("test/a.ts");
        expect(pathInRoot("C:/Users/test/a.ts", WINDOWS_ROOT, path.win32)).toBeUndefined();
        expect(pathInRoot("/home/test/a.ts", POSIX_ROOT, path.posix)).toBeUndefined();
        expect(pathInRoot("/home/test/project/..data/a.ts", POSIX_ROOT, path.posix)).toBe("..data/a.ts");
    });

    it("finds the files of this repository with the path functions of this computer", () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
        const id = (relative : string) : string => path.join(root, relative).replaceAll("\\", "/");
        expect(isTestFile(id("test/vitest/test-files.test.ts"), root)).toBe(true);
        expect(isTestFile(id("src/index.ts"), root)).toBe(false);
        expect(isUntransformedFixture(id("test/fixtures/untransformed.js"), root)).toBe(true);
    });
});

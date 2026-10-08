// Input:
// export function* one() { yield 1; } export default function* () { yield 2; }

import { bindGenerator as _bindGenerator } from "async-browser-context/runtime";
export function one() {
  return _bindGenerator(function* () {
    yield 1;
  }());
}
export default function () {
  return _bindGenerator(function* () {
    yield 2;
  }());
}

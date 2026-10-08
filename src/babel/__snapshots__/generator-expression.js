// Input:
// const gen = function* named() { yield arguments[0]; };

import { bindGenerator as _bindGenerator } from "async-browser-context/runtime";
const gen = function named() {
  var _arguments = arguments;
  return _bindGenerator(function* () {
    yield _arguments[0];
  }());
};

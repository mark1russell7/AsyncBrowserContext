// Input:
// class A { m() { return async () => { await this.x(); return arguments.length; }; } }

import { coroutine as _coroutine } from "async-browser-context/runtime";
class A {
  m() {
    var _arguments = arguments,
      _this = this;
    return /*#__PURE__*/_coroutine(function* () {
      yield _this.x();
      return _arguments.length;
    });
  }
}

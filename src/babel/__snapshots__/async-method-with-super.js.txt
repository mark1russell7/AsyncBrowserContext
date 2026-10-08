// Input:
// class B extends A { async m() { await null; return super.m(); } }

import { coroutine as _coroutine } from "async-browser-context/runtime";
class B extends A {
  m() {
    var _superprop_getM = () => super.m,
      _this = this;
    return _coroutine(function* () {
      yield null;
      return _superprop_getM().call(_this);
    })();
  }
}

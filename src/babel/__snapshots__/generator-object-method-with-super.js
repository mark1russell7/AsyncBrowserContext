// Input:
// const o = { __proto__: base, *m() { yield super.m(); } };

import { bindGenerator as _bindGenerator } from "async-browser-context/runtime";
const o = {
  __proto__: base,
  m() {
    var _superprop_getM = () => super.m,
      _this = this;
    return _bindGenerator(function* () {
      yield _superprop_getM().call(_this);
    }());
  }
};

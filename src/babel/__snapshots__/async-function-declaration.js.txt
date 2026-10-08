// Input:
// async function load(id) { const data = await fetch(id); return { data, at: await now() }; }

import { coroutine as _coroutine } from "async-browser-context/runtime";
function load(_x) {
  return _load.apply(this, arguments);
}
function _load() {
  _load = _coroutine(function* (id) {
    const data = yield fetch(id);
    return {
      data,
      at: yield now()
    };
  });
  return _load.apply(this, arguments);
}

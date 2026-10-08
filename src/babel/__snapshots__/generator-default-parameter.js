// Input:
// function* numbers({ limit } = { limit: 3 }) { for (let i = 0; i < limit; i++) yield i; }

import { bindGenerator as _bindGenerator } from "async-browser-context/runtime";
function numbers({
  limit
} = {
  limit: 3
}) {
  return _bindGenerator(function* () {
    for (let i = 0; i < limit; i++) yield i;
  }());
}

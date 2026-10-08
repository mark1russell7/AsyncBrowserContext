// Input:
// function* numbers(limit) { 'use strict'; for (let i = 0; i < limit; i++) yield i; }

import { bindGenerator as _bindGenerator } from "async-browser-context/runtime";
function numbers(limit) {
  'use strict';

  return _bindGenerator(function* () {
    for (let i = 0; i < limit; i++) yield i;
  }());
}

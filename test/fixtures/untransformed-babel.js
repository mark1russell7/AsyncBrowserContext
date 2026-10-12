// A dependency that Babel compiled before it was published, as many npm packages ship.
// The source is in the comment at the end of test/rules/c07-compiled-dependencies.test.ts.
// Babel with @babel/plugin-transform-async-generator-functions and
// @babel/plugin-transform-async-to-generator, default options: the async functions use
// _asyncToGenerator. The test transform excludes this file.
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _awaitAsyncGenerator(e) { return new _OverloadYield(e, 0); }
function _wrapAsyncGenerator(e) { return function () { return new AsyncGenerator(e.apply(this, arguments)); }; }
function AsyncGenerator(e) { var t, n; function resume(t, n) { try { var r = e[t](n), o = r.value, u = o instanceof _OverloadYield; Promise.resolve(u ? o.v : o).then(function (n) { if (u) { var i = "return" === t && o.k ? t : "next"; if (!o.k || n.done) return resume(i, n); n = e[i](n).value; } settle(!!r.done, n); }, function (e) { resume("throw", e); }); } catch (e) { settle(2, e); } } function settle(e, r) { 2 === e ? t.reject(r) : t.resolve({ value: r, done: e }), (t = t.next) ? resume(t.key, t.arg) : n = null; } this._invoke = function (e, r) { return new Promise(function (o, u) { var i = { key: e, arg: r, resolve: o, reject: u, next: null }; n ? n = n.next = i : (t = n = i, resume(e, r)); }); }, "function" != typeof e.return && (this.return = void 0); }
AsyncGenerator.prototype["function" == typeof Symbol && Symbol.asyncIterator || "@@asyncIterator"] = function () { return this; }, AsyncGenerator.prototype.next = function (e) { return this._invoke("next", e); }, AsyncGenerator.prototype.throw = function (e) { return this._invoke("throw", e); }, AsyncGenerator.prototype.return = function (e) { return this._invoke("return", e); };
function _OverloadYield(e, d) { this.v = e, this.k = d; }
/** Awaits two times, then calls `callback`. */
export function compiledCall(_x2) {
  return _compiledCall.apply(this, arguments);
}
function _compiledCall() {
  _compiledCall = _asyncToGenerator(function* (callback) {
    yield null;
    yield null;
    return callback();
  });
  return _compiledCall.apply(this, arguments);
}
/** Awaits a timer, then calls `callback`. */
export function compiledAfterTimer(_x3) {
  return _compiledAfterTimer.apply(this, arguments);
}
function _compiledAfterTimer() {
  _compiledAfterTimer = _asyncToGenerator(function* (callback) {
    yield new Promise(resolve => setTimeout(resolve, 1));
    return callback();
  });
  return _compiledAfterTimer.apply(this, arguments);
}
/** Calls `callback` after an await inside an async generator. */
export function compiledGenerator(_x) {
  return _compiledGenerator.apply(this, arguments);
}
function _compiledGenerator() {
  _compiledGenerator = _wrapAsyncGenerator(function* (callback) {
    yield _awaitAsyncGenerator(null);
    yield callback();
  });
  return _compiledGenerator.apply(this, arguments);
}

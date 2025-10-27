/**
 * Edge Cases Tests (Suite 14)
 *
 * Tests unusual and edge case scenarios:
 * - Circular references
 * - null/undefined values
 * - Symbol keys
 * - Very large contexts
 * - Multiple variables with same default
 * - Timing edge cases
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Edge Cases - null and undefined', () => {
  it('should handle null as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run(null, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBeNull();
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBeNull();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle undefined as explicit context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run(undefined, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBeUndefined();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should distinguish between unset and undefined', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();

    // Unset context
    expect(ctx.get()).toBeUndefined();

    // Explicitly set to undefined
    try {
      await ctx.run(undefined, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        // Both are undefined, but one is explicitly set
        expect(ctx.get()).toBeUndefined();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle context value changing from null to defined', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run(null, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBeNull();
        try {
          await ctx.run('defined', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(ctx.get()).toBe('defined');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBeNull();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Edge Cases - Symbol Values', () => {
  it('should handle Symbol as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const sym = Symbol('test');
    try {
      await ctx.run(sym, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe(sym);
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe(sym);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle different symbols as different values', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const sym1 = Symbol('one');
    const sym2 = Symbol('one'); // Same description, different symbol
    try {
      await ctx.run(sym1, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe(sym1);
        expect(ctx.get()).not.toBe(sym2);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle Symbol.for as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const globalSym = Symbol.for('global-symbol');
    try {
      await ctx.run(globalSym, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe(globalSym);
        expect(ctx.get()).toBe(Symbol.for('global-symbol'));
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Edge Cases - Circular References', () => {
  it('should handle object with circular reference as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const circular = {
      name: 'circular'
    };
    circular.self = circular;
    try {
      await ctx.run(circular, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value.name).toBe('circular');
        expect(value.self).toBe(value);
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe(circular);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle deeply nested circular references', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const a = {
      name: 'a'
    };
    const b = {
      name: 'b',
      parent: a
    };
    a.child = b;
    b.self = b;
    try {
      await ctx.run(a, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value.child.parent).toBe(value);
        expect(value.child.self).toBe(value.child);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle array with circular reference', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const arr = [1, 2, 3];
    arr.push(arr);
    try {
      await ctx.run(arr, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value[3]).toBe(value);
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()[3]).toBe(ctx.get());
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Edge Cases - Large Context Values', () => {
  it('should handle very large object as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const largeObject = {};

    // Create object with 10000 properties
    for (let i = 0; i < 10000; i++) {
      largeObject[`key${i}`] = `value${i}`;
    }
    try {
      await ctx.run(largeObject, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value.key0).toBe('value0');
        expect(value.key9999).toBe('value9999');
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe(largeObject);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  }, {
    timeout: 5000
  });
  it('should handle very large array as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const largeArray = new Array(10000).fill(0).map((_, i) => i);
    try {
      await ctx.run(largeArray, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value[0]).toBe(0);
        expect(value[9999]).toBe(9999);
        expect(value.length).toBe(10000);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  }, {
    timeout: 5000
  });
  it('should handle deeply nested object as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();

    // Create deeply nested object
    let deep = {
      level: 100
    };
    for (let i = 99; i >= 0; i--) {
      deep = {
        level: i,
        child: deep
      };
    }
    try {
      await ctx.run(deep, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let current = ctx.get();
        for (let i = 0; i <= 100; i++) {
          expect(current.level).toBe(i);
          current = current.child;
          if (i === 100) expect(current).toBeUndefined();
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Edge Cases - Multiple Variables with Same Default', () => {
  it('should handle multiple variables with same default value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const defaultValue = {
      shared: 'default'
    };
    const ctx1 = new AsyncVariable({
      defaultValue
    });
    const ctx2 = new AsyncVariable({
      defaultValue
    });
    const ctx3 = new AsyncVariable({
      defaultValue
    });
    expect(ctx1.get()).toBe(defaultValue);
    expect(ctx2.get()).toBe(defaultValue);
    expect(ctx3.get()).toBe(defaultValue);
    try {
      await ctx1.run('ctx1-value', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx1.get()).toBe('ctx1-value');
        expect(ctx2.get()).toBe(defaultValue);
        expect(ctx3.get()).toBe(defaultValue);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle multiple variables with undefined default', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx1 = new AsyncVariable({
      defaultValue: undefined
    });
    const ctx2 = new AsyncVariable({
      defaultValue: undefined
    });
    expect(ctx1.get()).toBeUndefined();
    expect(ctx2.get()).toBeUndefined();
    try {
      await ctx1.run('defined', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx1.get()).toBe('defined');
        expect(ctx2.get()).toBeUndefined();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Edge Cases - Timing', () => {
  it('should handle rapid context creation and destruction', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      try {
        await ctx.run(`ctx-${i}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          expect(ctx.get()).toBe(`ctx-${i}`);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
  }, {
    timeout: 10000
  });
  it('should handle extremely short-lived contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    for (let i = 0; i < 100; i++) {
      ctx.run(`short-${i}`, () => {
        results.push(ctx.get());
      });
    }
    expect(results.length).toBe(100);
    results.forEach((val, i) => {
      expect(val).toBe(`short-${i}`);
    });
  });
  it('should handle context with zero-delay promises', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    try {
      await ctx.run('zero-delay', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        results.push(ctx.get());
        try {
          await delay(0);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        results.push(ctx.get());
        try {
          await Promise.resolve();
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        results.push(ctx.get());
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results).toEqual(['zero-delay', 'zero-delay', 'zero-delay']);
  });
});
describe('Edge Cases - Special Objects', () => {
  it('should handle Date object as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const now = new Date();
    try {
      await ctx.run(now, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(now);
        expect(value.getTime()).toBe(now.getTime());
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle RegExp object as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const pattern = /test-\d+/gi;
    try {
      await ctx.run(pattern, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(pattern);
        expect(value.test('test-123')).toBeTruthy();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle Map as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const map = new Map([['key1', 'value1'], ['key2', 'value2']]);
    try {
      await ctx.run(map, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(map);
        expect(value.get('key1')).toBe('value1');
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get().size).toBe(2);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle Set as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const set = new Set([1, 2, 3, 4, 5]);
    try {
      await ctx.run(set, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(set);
        expect(value.has(3)).toBeTruthy();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle WeakMap as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const weakMap = new WeakMap();
    const key = {};
    weakMap.set(key, 'value');
    try {
      await ctx.run(weakMap, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(weakMap);
        expect(value.get(key)).toBe('value');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle Proxy as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const target = {
      name: 'target'
    };
    const proxy = new Proxy(target, {
      get(target, prop) {
        return prop === 'name' ? 'proxied' : target[prop];
      }
    });
    try {
      await ctx.run(proxy, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(proxy);
        expect(value.name).toBe('proxied');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle frozen object as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const frozen = Object.freeze({
      immutable: 'value'
    });
    try {
      await ctx.run(frozen, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(frozen);
        expect(Object.isFrozen(value)).toBeTruthy();
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe(frozen);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle sealed object as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const sealed = Object.seal({
      fixed: 'structure'
    });
    try {
      await ctx.run(sealed, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(sealed);
        expect(Object.isSealed(value)).toBeTruthy();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Edge Cases - Numbers and Strings', () => {
  it('should handle NaN as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run(NaN, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(Number.isNaN(value)).toBeTruthy();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle Infinity as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run(Infinity, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe(Infinity);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    try {
      await ctx.run(-Infinity, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe(-Infinity);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle very large string as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const largeString = 'x'.repeat(1000000); // 1MB string
    try {
      await ctx.run(largeString, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value.length).toBe(1000000);
        expect(value[0]).toBe('x');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  }, {
    timeout: 5000
  });
  it('should handle BigInt as context value', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const bigValue = BigInt('123456789012345678901234567890');
    try {
      await ctx.run(bigValue, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const value = ctx.get();
        expect(value).toBe(bigValue);
        expect(typeof value).toBe('bigint');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});

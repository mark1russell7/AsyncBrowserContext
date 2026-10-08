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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Edge Cases - null and undefined', () => {
  it('should handle null as context value', async () => {
    const ctx = new AsyncVariable();

    await ctx.run(null, async () => {
      expect(ctx.get()).toBeNull();
      await delay(5);
      expect(ctx.get()).toBeNull();
    });
  });

  it('should handle undefined as explicit context value', async () => {
    const ctx = new AsyncVariable();

    await ctx.run(undefined, async () => {
      const value = ctx.get();
      expect(value).toBeUndefined();
    });
  });

  it('should distinguish between unset and undefined', async () => {
    const ctx = new AsyncVariable();

    // Unset context
    expect(ctx.get()).toBeUndefined();

    // Explicitly set to undefined
    await ctx.run(undefined, async () => {
      // Both are undefined, but one is explicitly set
      expect(ctx.get()).toBeUndefined();
    });
  });

  it('should handle context value changing from null to defined', async () => {
    const ctx = new AsyncVariable();

    await ctx.run(null, async () => {
      expect(ctx.get()).toBeNull();

      await ctx.run('defined', async () => {
        expect(ctx.get()).toBe('defined');
      });

      expect(ctx.get()).toBeNull();
    });
  });
});

describe('Edge Cases - Symbol Values', () => {
  it('should handle Symbol as context value', async () => {
    const ctx = new AsyncVariable();
    const sym = Symbol('test');

    await ctx.run(sym, async () => {
      expect(ctx.get()).toBe(sym);
      await delay(5);
      expect(ctx.get()).toBe(sym);
    });
  });

  it('should handle different symbols as different values', async () => {
    const ctx = new AsyncVariable();
    const sym1 = Symbol('one');
    const sym2 = Symbol('one'); // Same description, different symbol

    await ctx.run(sym1, async () => {
      expect(ctx.get()).toBe(sym1);
      expect(ctx.get()).not.toBe(sym2);
    });
  });

  it('should handle Symbol.for as context value', async () => {
    const ctx = new AsyncVariable();
    const globalSym = Symbol.for('global-symbol');

    await ctx.run(globalSym, async () => {
      expect(ctx.get()).toBe(globalSym);
      expect(ctx.get()).toBe(Symbol.for('global-symbol'));
    });
  });
});

describe('Edge Cases - Circular References', () => {
  it('should handle object with circular reference as context value', async () => {
    const ctx = new AsyncVariable();
    const circular = { name: 'circular' };
    circular.self = circular;

    await ctx.run(circular, async () => {
      const value = ctx.get();
      expect(value.name).toBe('circular');
      expect(value.self).toBe(value);
      await delay(5);
      expect(ctx.get()).toBe(circular);
    });
  });

  it('should handle deeply nested circular references', async () => {
    const ctx = new AsyncVariable();
    const a = { name: 'a' };
    const b = { name: 'b', parent: a };
    a.child = b;
    b.self = b;

    await ctx.run(a, async () => {
      const value = ctx.get();
      expect(value.child.parent).toBe(value);
      expect(value.child.self).toBe(value.child);
    });
  });

  it('should handle array with circular reference', async () => {
    const ctx = new AsyncVariable();
    const arr = [1, 2, 3];
    arr.push(arr);

    await ctx.run(arr, async () => {
      const value = ctx.get();
      expect(value[3]).toBe(value);
      await delay(5);
      expect(ctx.get()[3]).toBe(ctx.get());
    });
  });
});

describe('Edge Cases - Large Context Values', () => {
  it('should handle very large object as context value', async () => {
    const ctx = new AsyncVariable();
    const largeObject = {};

    // Create object with 10000 properties
    for (let i = 0; i < 10000; i++) {
      largeObject[`key${i}`] = `value${i}`;
    }

    await ctx.run(largeObject, async () => {
      const value = ctx.get();
      expect(value.key0).toBe('value0');
      expect(value.key9999).toBe('value9999');
      await delay(5);
      expect(ctx.get()).toBe(largeObject);
    });
  }, { timeout: 5000 });

  it('should handle very large array as context value', async () => {
    const ctx = new AsyncVariable();
    const largeArray = new Array(10000).fill(0).map((_, i) => i);

    await ctx.run(largeArray, async () => {
      const value = ctx.get();
      expect(value[0]).toBe(0);
      expect(value[9999]).toBe(9999);
      expect(value.length).toBe(10000);
    });
  }, { timeout: 5000 });

  it('should handle deeply nested object as context value', async () => {
    const ctx = new AsyncVariable();

    // Create deeply nested object
    let deep = { level: 100 };
    for (let i = 99; i >= 0; i--) {
      deep = { level: i, child: deep };
    }

    await ctx.run(deep, async () => {
      let current = ctx.get();
      for (let i = 0; i <= 100; i++) {
        expect(current.level).toBe(i);
        current = current.child;
        if (i === 100) expect(current).toBeUndefined();
      }
    });
  });
});

describe('Edge Cases - Multiple Variables with Same Default', () => {
  it('should handle multiple variables with same default value', async () => {
    const defaultValue = { shared: 'default' };
    const ctx1 = new AsyncVariable({ defaultValue });
    const ctx2 = new AsyncVariable({ defaultValue });
    const ctx3 = new AsyncVariable({ defaultValue });

    expect(ctx1.get()).toBe(defaultValue);
    expect(ctx2.get()).toBe(defaultValue);
    expect(ctx3.get()).toBe(defaultValue);

    await ctx1.run('ctx1-value', async () => {
      expect(ctx1.get()).toBe('ctx1-value');
      expect(ctx2.get()).toBe(defaultValue);
      expect(ctx3.get()).toBe(defaultValue);
    });
  });

  it('should handle multiple variables with undefined default', async () => {
    const ctx1 = new AsyncVariable({ defaultValue: undefined });
    const ctx2 = new AsyncVariable({ defaultValue: undefined });

    expect(ctx1.get()).toBeUndefined();
    expect(ctx2.get()).toBeUndefined();

    await ctx1.run('defined', async () => {
      expect(ctx1.get()).toBe('defined');
      expect(ctx2.get()).toBeUndefined();
    });
  });
});

describe('Edge Cases - Timing', () => {
  it('should handle rapid context creation and destruction', async () => {
    const ctx = new AsyncVariable();
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      await ctx.run(`ctx-${i}`, async () => {
        expect(ctx.get()).toBe(`ctx-${i}`);
      });
    }
  }, { timeout: 10000 });

  it('should handle extremely short-lived contexts', async () => {
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
    const ctx = new AsyncVariable();
    const results = [];

    await ctx.run('zero-delay', async () => {
      results.push(ctx.get());
      await delay(0);
      results.push(ctx.get());
      await Promise.resolve();
      results.push(ctx.get());
    });

    expect(results).toEqual(['zero-delay', 'zero-delay', 'zero-delay']);
  });
});

describe('Edge Cases - Special Objects', () => {
  it('should handle Date object as context value', async () => {
    const ctx = new AsyncVariable();
    const now = new Date();

    await ctx.run(now, async () => {
      const value = ctx.get();
      expect(value).toBe(now);
      expect(value.getTime()).toBe(now.getTime());
    });
  });

  it('should handle RegExp object as context value', async () => {
    const ctx = new AsyncVariable();
    const pattern = /test-\d+/gi;

    await ctx.run(pattern, async () => {
      const value = ctx.get();
      expect(value).toBe(pattern);
      expect(value.test('test-123')).toBeTruthy();
    });
  });

  it('should handle Map as context value', async () => {
    const ctx = new AsyncVariable();
    const map = new Map([['key1', 'value1'], ['key2', 'value2']]);

    await ctx.run(map, async () => {
      const value = ctx.get();
      expect(value).toBe(map);
      expect(value.get('key1')).toBe('value1');
      await delay(5);
      expect(ctx.get().size).toBe(2);
    });
  });

  it('should handle Set as context value', async () => {
    const ctx = new AsyncVariable();
    const set = new Set([1, 2, 3, 4, 5]);

    await ctx.run(set, async () => {
      const value = ctx.get();
      expect(value).toBe(set);
      expect(value.has(3)).toBeTruthy();
    });
  });

  it('should handle WeakMap as context value', async () => {
    const ctx = new AsyncVariable();
    const weakMap = new WeakMap();
    const key = {};
    weakMap.set(key, 'value');

    await ctx.run(weakMap, async () => {
      const value = ctx.get();
      expect(value).toBe(weakMap);
      expect(value.get(key)).toBe('value');
    });
  });

  it('should handle Proxy as context value', async () => {
    const ctx = new AsyncVariable();
    const target = { name: 'target' };
    const proxy = new Proxy(target, {
      get(target, prop) {
        return prop === 'name' ? 'proxied' : target[prop];
      }
    });

    await ctx.run(proxy, async () => {
      const value = ctx.get();
      expect(value).toBe(proxy);
      expect(value.name).toBe('proxied');
    });
  });

  it('should handle frozen object as context value', async () => {
    const ctx = new AsyncVariable();
    const frozen = Object.freeze({ immutable: 'value' });

    await ctx.run(frozen, async () => {
      const value = ctx.get();
      expect(value).toBe(frozen);
      expect(Object.isFrozen(value)).toBeTruthy();
      await delay(5);
      expect(ctx.get()).toBe(frozen);
    });
  });

  it('should handle sealed object as context value', async () => {
    const ctx = new AsyncVariable();
    const sealed = Object.seal({ fixed: 'structure' });

    await ctx.run(sealed, async () => {
      const value = ctx.get();
      expect(value).toBe(sealed);
      expect(Object.isSealed(value)).toBeTruthy();
    });
  });
});

describe('Edge Cases - Numbers and Strings', () => {
  it('should handle NaN as context value', async () => {
    const ctx = new AsyncVariable();

    await ctx.run(NaN, async () => {
      const value = ctx.get();
      expect(Number.isNaN(value)).toBeTruthy();
    });
  });

  it('should handle Infinity as context value', async () => {
    const ctx = new AsyncVariable();

    await ctx.run(Infinity, async () => {
      expect(ctx.get()).toBe(Infinity);
    });

    await ctx.run(-Infinity, async () => {
      expect(ctx.get()).toBe(-Infinity);
    });
  });

  it('should handle very large string as context value', async () => {
    const ctx = new AsyncVariable();
    const largeString = 'x'.repeat(1000000); // 1MB string

    await ctx.run(largeString, async () => {
      const value = ctx.get();
      expect(value.length).toBe(1000000);
      expect(value[0]).toBe('x');
    });
  }, { timeout: 5000 });

  it('should handle BigInt as context value', async () => {
    const ctx = new AsyncVariable();
    const bigValue = BigInt('123456789012345678901234567890');

    await ctx.run(bigValue, async () => {
      const value = ctx.get();
      expect(value).toBe(bigValue);
      expect(typeof value).toBe('bigint');
    });
  });
});

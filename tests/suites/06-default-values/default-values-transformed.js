/**
 * Default Values Tests (Suite 06)
 *
 * Tests default value behavior:
 * - Unset context behavior
 * - Default value inheritance
 * - Overriding defaults
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Default Values', () => {
  it('should return default value when no context is set', () => {
    const ctx = new AsyncVariable({
      defaultValue: 'default'
    });
    expect(ctx.get()).toBe('default');
  });
  it('should return undefined when no default and no context', () => {
    const ctx = new AsyncVariable();
    expect(ctx.get()).toBeUndefined();
  });
  it('should override default value within .run()', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable({
      defaultValue: 'default'
    });
    let result;
    try {
      result = await ctx.run('custom', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('custom');
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('custom');
        return ctx.get();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBe('custom');
    expect(ctx.get()).toBe('default'); // Back to default
  });
  it('should handle multiple variables with different defaults', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx1 = new AsyncVariable({
      defaultValue: 'default-1'
    });
    const ctx2 = new AsyncVariable({
      defaultValue: 'default-2'
    });
    const ctx3 = new AsyncVariable(); // No default

    expect(ctx1.get()).toBe('default-1');
    expect(ctx2.get()).toBe('default-2');
    expect(ctx3.get()).toBeUndefined();
    try {
      await ctx1.run('custom-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx1.get()).toBe('custom-1');
        expect(ctx2.get()).toBe('default-2');
        expect(ctx3.get()).toBeUndefined();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should fall back to default after nested context ends', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable({
      defaultValue: 'default'
    });
    try {
      await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('outer');
        try {
          await ctx.run('inner', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(ctx.get()).toBe('inner');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('outer');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(ctx.get()).toBe('default');
  });
  it('should handle default values in concurrent operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable({
      defaultValue: 'default'
    });
    let results;
    try {
      results = await Promise.all([ctx.run('A', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), ctx.run('B', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), (async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get(); // Should get default
      })()]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results).toEqual(['A', 'B', 'default']);
  });
});

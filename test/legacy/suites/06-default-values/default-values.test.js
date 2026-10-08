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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Default Values', () => {
  it('should return default value when no context is set', () => {
    const ctx = new AsyncVariable({ defaultValue: 'default' });
    expect(ctx.get()).toBe('default');
  });

  it('should return undefined when no default and no context', () => {
    const ctx = new AsyncVariable();
    expect(ctx.get()).toBeUndefined();
  });

  it('should override default value within .run()', async () => {
    const ctx = new AsyncVariable({ defaultValue: 'default' });

    const result = await ctx.run('custom', async () => {
      expect(ctx.get()).toBe('custom');
      await delay(5);
      expect(ctx.get()).toBe('custom');
      return ctx.get();
    });

    expect(result).toBe('custom');
    expect(ctx.get()).toBe('default'); // Back to default
  });

  it('should handle multiple variables with different defaults', async () => {
    const ctx1 = new AsyncVariable({ defaultValue: 'default-1' });
    const ctx2 = new AsyncVariable({ defaultValue: 'default-2' });
    const ctx3 = new AsyncVariable(); // No default

    expect(ctx1.get()).toBe('default-1');
    expect(ctx2.get()).toBe('default-2');
    expect(ctx3.get()).toBeUndefined();

    await ctx1.run('custom-1', async () => {
      expect(ctx1.get()).toBe('custom-1');
      expect(ctx2.get()).toBe('default-2');
      expect(ctx3.get()).toBeUndefined();
    });
  });

  it('should fall back to default after nested context ends', async () => {
    const ctx = new AsyncVariable({ defaultValue: 'default' });

    await ctx.run('outer', async () => {
      expect(ctx.get()).toBe('outer');

      await ctx.run('inner', async () => {
        expect(ctx.get()).toBe('inner');
      });

      expect(ctx.get()).toBe('outer');
    });

    expect(ctx.get()).toBe('default');
  });

  it('should handle default values in concurrent operations', async () => {
    const ctx = new AsyncVariable({ defaultValue: 'default' });

    const results = await Promise.all([
      ctx.run('A', async () => {
        await delay(5);
        return ctx.get();
      }),
      ctx.run('B', async () => {
        await delay(5);
        return ctx.get();
      }),
      (async () => {
        await delay(5);
        return ctx.get(); // Should get default
      })()
    ]);

    expect(results).toEqual(['A', 'B', 'default']);
  });
});

/**
 * Browser APIs Tests (Suite 11)
 *
 * Tests context propagation through browser-specific APIs:
 * - requestAnimationFrame / requestIdleCallback
 * - queueMicrotask
 * - Observers (Mutation, Intersection, Resize)
 * - Event listeners
 * - fetch API
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Browser APIs - Microtasks', () => {
  it('should propagate context through queueMicrotask', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    await ctx.run('microtask-test', async () => {
      results.push(ctx.get());

      queueMicrotask(() => {
        results.push(ctx.get());
      });

      await delay(10); // Wait for microtask to execute
      results.push(ctx.get());
    });

    expect(results[0]).toBe('microtask-test');
    expect(results[1]).toBe('microtask-test');
    expect(results[2]).toBe('microtask-test');
  });

  it('should handle nested queueMicrotask calls', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    await ctx.run('nested-microtask', async () => {
      queueMicrotask(() => {
        results.push({ level: 1, ctx: ctx.get() });

        queueMicrotask(() => {
          results.push({ level: 2, ctx: ctx.get() });

          queueMicrotask(() => {
            results.push({ level: 3, ctx: ctx.get() });
          });
        });
      });

      await delay(20);
    });

    expect(results.length).toBe(3);
    expect(results.every(r => r.ctx === 'nested-microtask')).toBeTruthy();
  });

  it('should isolate contexts in concurrent queueMicrotask calls', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    await Promise.all([
      ctx.run('micro-A', async () => {
        queueMicrotask(() => results.push({ id: 'A', ctx: ctx.get() }));
        await delay(10);
      }),
      ctx.run('micro-B', async () => {
        queueMicrotask(() => results.push({ id: 'B', ctx: ctx.get() }));
        await delay(10);
      }),
      ctx.run('micro-C', async () => {
        queueMicrotask(() => results.push({ id: 'C', ctx: ctx.get() }));
        await delay(10);
      })
    ]);

    expect(results.length).toBe(3);
    expect(results.find(r => r.id === 'A').ctx).toBe('micro-A');
    expect(results.find(r => r.id === 'B').ctx).toBe('micro-B');
    expect(results.find(r => r.id === 'C').ctx).toBe('micro-C');
  });
});

describe('Browser APIs - Animation Frame', () => {
  it('should propagate context through requestAnimationFrame', async () => {
    const ctx = new AsyncVariable();
    let capturedContext;

    await ctx.run('raf-test', async () => {
      requestAnimationFrame(() => {
        capturedContext = ctx.get();
      });

      await delay(50); // Wait for RAF to execute
    });

    expect(capturedContext).toBe('raf-test');
  });

  it('should handle nested requestAnimationFrame', async () => {
    const ctx = new AsyncVariable();
    const frames = [];

    await ctx.run('nested-raf', async () => {
      requestAnimationFrame(() => {
        frames.push(1);
        expect(ctx.get()).toBe('nested-raf');

        requestAnimationFrame(() => {
          frames.push(2);
          expect(ctx.get()).toBe('nested-raf');
        });
      });

      await delay(100);
    });

    expect(frames).toEqual([1, 2]);
  });

  it('should propagate context through requestIdleCallback if available', async () => {
    if (typeof requestIdleCallback === 'undefined') {
      console.log('requestIdleCallback not available, skipping test');
      return;
    }

    const ctx = new AsyncVariable();
    let capturedContext;

    await ctx.run('idle-test', async () => {
      requestIdleCallback(() => {
        capturedContext = ctx.get();
      });

      await delay(100);
    });

    expect(capturedContext).toBe('idle-test');
  });
});

describe('Browser APIs - Event Listeners', () => {
  it('should propagate context to synchronous event listeners', async () => {
    const ctx = new AsyncVariable();
    const button = document.createElement('button');
    let eventContext;

    await ctx.run('event-test', async () => {
      button.addEventListener('click', () => {
        eventContext = ctx.get();
      });

      // Synchronous dispatch - context is still active
      button.click();
      await delay(10);
    });

    // Synchronous events see the current context
    expect(eventContext).toBe('event-test');
  });

  it('should propagate context when using AsyncSnapshot for events', async () => {
    const ctx = new AsyncVariable();
    const { AsyncSnapshot } = await import('../../../dist/context.js');
    const button = document.createElement('button');
    let eventContext;

    await ctx.run('snapshot-event', async () => {
      const snapshot = new AsyncSnapshot();

      button.addEventListener('click', () => {
        snapshot.run(() => {
          eventContext = ctx.get();
        });
      });

      button.click();
      await delay(10);
    });

    expect(eventContext).toBe('snapshot-event');
  });

  it('should handle multiple event types with different contexts', async () => {
    const ctx = new AsyncVariable();
    const element = document.createElement('button');
    const events = [];

    await ctx.run('multi-event', async () => {
      element.addEventListener('click', () => {
        events.push({ type: 'click', ctx: ctx.get() });
      });

      element.addEventListener('mousedown', () => {
        events.push({ type: 'mousedown', ctx: ctx.get() });
      });

      element.click();
      element.dispatchEvent(new MouseEvent('mousedown'));
      await delay(10);
    });

    expect(events.length).toBe(2);
    expect(events[0].ctx).toBe('multi-event');
    expect(events[1].ctx).toBe('multi-event');
  });
});

describe('Browser APIs - Observers', () => {
  it('should handle MutationObserver callbacks', async () => {
    const ctx = new AsyncVariable();
    const observations = [];
    const div = document.createElement('div');
    document.body.appendChild(div);

    const observer = new MutationObserver((mutations) => {
      observations.push({ ctx: ctx.get(), count: mutations.length });
    });

    observer.observe(div, { childList: true });

    await ctx.run('mutation-test', async () => {
      div.appendChild(document.createElement('span'));
      await delay(50);
    });

    observer.disconnect();
    document.body.removeChild(div);

    // MutationObserver callbacks run in their own context
    expect(observations.length).toBe(1);
  });

  it('should handle IntersectionObserver if available', async () => {
    if (typeof IntersectionObserver === 'undefined') {
      console.log('IntersectionObserver not available, skipping');
      return;
    }

    const ctx = new AsyncVariable();
    const observations = [];
    const div = document.createElement('div');
    document.body.appendChild(div);

    const observer = new IntersectionObserver((entries) => {
      observations.push({ ctx: ctx.get(), entries: entries.length });
    });

    observer.observe(div);

    await ctx.run('intersection-test', async () => {
      await delay(50);
    });

    observer.disconnect();
    document.body.removeChild(div);

    expect(observations.length).toBeGreaterThan(0);
  });

  it('should handle ResizeObserver if available', async () => {
    if (typeof ResizeObserver === 'undefined') {
      console.log('ResizeObserver not available, skipping');
      return;
    }

    const ctx = new AsyncVariable();
    const observations = [];
    const div = document.createElement('div');
    document.body.appendChild(div);

    const observer = new ResizeObserver((entries) => {
      observations.push({ ctx: ctx.get(), entries: entries.length });
    });

    observer.observe(div);

    await ctx.run('resize-test', async () => {
      div.style.width = '200px';
      await delay(50);
    });

    observer.disconnect();
    document.body.removeChild(div);

    expect(observations.length).toBeGreaterThan(0);
  });
});

describe('Browser APIs - MessageChannel', () => {
  it('should handle MessageChannel postMessage', async () => {
    const ctx = new AsyncVariable();
    const channel = new MessageChannel();
    const received = [];

    channel.port2.onmessage = (event) => {
      received.push({ data: event.data, ctx: ctx.get() });
    };

    await ctx.run('message-channel', async () => {
      channel.port1.postMessage('test-message');
      await delay(20);
    });

    expect(received.length).toBe(1);
    expect(received[0].data).toBe('test-message');
    // MessageChannel doesn't propagate context by default
  });

  it('should handle MessageChannel with AsyncSnapshot', async () => {
    const ctx = new AsyncVariable();
    const { AsyncSnapshot } = await import('../../../dist/context.js');
    const channel = new MessageChannel();
    let receivedContext;

    await ctx.run('snapshot-message', async () => {
      const snapshot = new AsyncSnapshot();

      channel.port2.onmessage = (event) => {
        snapshot.run(() => {
          receivedContext = ctx.get();
        });
      };

      channel.port1.postMessage('with-snapshot');
      await delay(20);
    });

    expect(receivedContext).toBe('snapshot-message');
  });

  it('should handle concurrent MessageChannel communications', async () => {
    const ctx = new AsyncVariable();
    const channel1 = new MessageChannel();
    const channel2 = new MessageChannel();
    const results = [];

    channel1.port2.onmessage = (e) => results.push({ ch: 1, data: e.data });
    channel2.port2.onmessage = (e) => results.push({ ch: 2, data: e.data });

    await Promise.all([
      ctx.run('ch1', async () => {
        channel1.port1.postMessage('msg1');
        await delay(20);
      }),
      ctx.run('ch2', async () => {
        channel2.port1.postMessage('msg2');
        await delay(20);
      })
    ]);

    expect(results.length).toBe(2);
  });
});

describe('Browser APIs - Fetch', () => {
  it('should propagate context through fetch calls (mocked)', async () => {
    const ctx = new AsyncVariable();

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve({
      json: () => Promise.resolve({ data: 'test' })
    });

    let capturedContext;

    try {
      await ctx.run('fetch-test', async () => {
        const response = await fetch('/api/test');
        capturedContext = ctx.get();
        const data = await response.json();
        expect(ctx.get()).toBe('fetch-test');
      });

      expect(capturedContext).toBe('fetch-test');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should handle concurrent fetch requests with isolated contexts', async () => {
    const ctx = new AsyncVariable();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url) => {
      const delay = url.includes('slow') ? 20 : 5;
      return new Promise(resolve =>
        setTimeout(() => resolve({
          json: () => Promise.resolve({ url })
        }), delay)
      );
    };

    try {
      const results = await Promise.all([
        ctx.run('req-1', async () => {
          await fetch('/api/fast');
          return ctx.get();
        }),
        ctx.run('req-2', async () => {
          await fetch('/api/slow');
          return ctx.get();
        }),
        ctx.run('req-3', async () => {
          await fetch('/api/fast');
          return ctx.get();
        })
      ]);

      expect(results).toEqual(['req-1', 'req-2', 'req-3']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

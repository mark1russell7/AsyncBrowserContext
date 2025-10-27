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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Browser APIs - Microtasks', () => {
  it('should propagate context through queueMicrotask', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    try {
      await ctx.run('microtask-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        results.push(ctx.get());
        queueMicrotask(() => {
          results.push(ctx.get());
        });
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        } // Wait for microtask to execute
        results.push(ctx.get());
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results[0]).toBe('microtask-test');
    expect(results[1]).toBe('microtask-test');
    expect(results[2]).toBe('microtask-test');
  });
  it('should handle nested queueMicrotask calls', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    try {
      await ctx.run('nested-microtask', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        queueMicrotask(() => {
          results.push({
            level: 1,
            ctx: ctx.get()
          });
          queueMicrotask(() => {
            results.push({
              level: 2,
              ctx: ctx.get()
            });
            queueMicrotask(() => {
              results.push({
                level: 3,
                ctx: ctx.get()
              });
            });
          });
        });
        try {
          await delay(20);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(3);
    expect(results.every(r => r.ctx === 'nested-microtask')).toBeTruthy();
  });
  it('should isolate contexts in concurrent queueMicrotask calls', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    try {
      await Promise.all([ctx.run('micro-A', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        queueMicrotask(() => results.push({
          id: 'A',
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }), ctx.run('micro-B', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        queueMicrotask(() => results.push({
          id: 'B',
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }), ctx.run('micro-C', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        queueMicrotask(() => results.push({
          id: 'C',
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(3);
    expect(results.find(r => r.id === 'A').ctx).toBe('micro-A');
    expect(results.find(r => r.id === 'B').ctx).toBe('micro-B');
    expect(results.find(r => r.id === 'C').ctx).toBe('micro-C');
  });
});
describe('Browser APIs - Animation Frame', () => {
  it('should propagate context through requestAnimationFrame', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let capturedContext;
    try {
      await ctx.run('raf-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        requestAnimationFrame(() => {
          capturedContext = ctx.get();
        });
        try {
          await delay(50);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        } // Wait for RAF to execute
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(capturedContext).toBe('raf-test');
  });
  it('should handle nested requestAnimationFrame', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const frames = [];
    try {
      await ctx.run('nested-raf', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        requestAnimationFrame(() => {
          frames.push(1);
          expect(ctx.get()).toBe('nested-raf');
          requestAnimationFrame(() => {
            frames.push(2);
            expect(ctx.get()).toBe('nested-raf');
          });
        });
        try {
          await delay(100);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(frames).toEqual([1, 2]);
  });
  it('should propagate context through requestIdleCallback if available', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    if (typeof requestIdleCallback === 'undefined') {
      console.log('requestIdleCallback not available, skipping test');
      return;
    }
    const ctx = new AsyncVariable();
    let capturedContext;
    try {
      await ctx.run('idle-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        requestIdleCallback(() => {
          capturedContext = ctx.get();
        });
        try {
          await delay(100);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(capturedContext).toBe('idle-test');
  });
});
describe('Browser APIs - Event Listeners', () => {
  it('should propagate context to synchronous event listeners', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const button = document.createElement('button');
    let eventContext;
    try {
      await ctx.run('event-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        button.addEventListener('click', () => {
          eventContext = ctx.get();
        });

        // Synchronous dispatch - context is still active
        button.click();
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Synchronous events see the current context
    expect(eventContext).toBe('event-test');
  });
  it('should propagate context when using AsyncSnapshot for events', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let AsyncSnapshot;
    try {
      const _temp = await import('../../../dist/context.js');
      ({
        AsyncSnapshot
      } = _temp);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    const button = document.createElement('button');
    let eventContext;
    try {
      await ctx.run('snapshot-event', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const snapshot = new AsyncSnapshot();
        button.addEventListener('click', () => {
          snapshot.run(() => {
            eventContext = ctx.get();
          });
        });
        button.click();
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(eventContext).toBe('snapshot-event');
  });
  it('should handle multiple event types with different contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const element = document.createElement('button');
    const events = [];
    try {
      await ctx.run('multi-event', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        element.addEventListener('click', () => {
          events.push({
            type: 'click',
            ctx: ctx.get()
          });
        });
        element.addEventListener('mousedown', () => {
          events.push({
            type: 'mousedown',
            ctx: ctx.get()
          });
        });
        element.click();
        element.dispatchEvent(new MouseEvent('mousedown'));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(events.length).toBe(2);
    expect(events[0].ctx).toBe('multi-event');
    expect(events[1].ctx).toBe('multi-event');
  });
});
describe('Browser APIs - Observers', () => {
  it('should handle MutationObserver callbacks', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const observations = [];
    const div = document.createElement('div');
    document.body.appendChild(div);
    const observer = new MutationObserver(mutations => {
      observations.push({
        ctx: ctx.get(),
        count: mutations.length
      });
    });
    observer.observe(div, {
      childList: true
    });
    try {
      await ctx.run('mutation-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        div.appendChild(document.createElement('span'));
        try {
          await delay(50);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    observer.disconnect();
    document.body.removeChild(div);

    // MutationObserver callbacks run in their own context
    expect(observations.length).toBe(1);
  });
  it('should handle IntersectionObserver if available', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    if (typeof IntersectionObserver === 'undefined') {
      console.log('IntersectionObserver not available, skipping');
      return;
    }
    const ctx = new AsyncVariable();
    const observations = [];
    const div = document.createElement('div');
    document.body.appendChild(div);
    const observer = new IntersectionObserver(entries => {
      observations.push({
        ctx: ctx.get(),
        entries: entries.length
      });
    });
    observer.observe(div);
    try {
      await ctx.run('intersection-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(50);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    observer.disconnect();
    document.body.removeChild(div);
    expect(observations.length).toBeGreaterThan(0);
  });
  it('should handle ResizeObserver if available', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    if (typeof ResizeObserver === 'undefined') {
      console.log('ResizeObserver not available, skipping');
      return;
    }
    const ctx = new AsyncVariable();
    const observations = [];
    const div = document.createElement('div');
    document.body.appendChild(div);
    const observer = new ResizeObserver(entries => {
      observations.push({
        ctx: ctx.get(),
        entries: entries.length
      });
    });
    observer.observe(div);
    try {
      await ctx.run('resize-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        div.style.width = '200px';
        try {
          await delay(50);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    observer.disconnect();
    document.body.removeChild(div);
    expect(observations.length).toBeGreaterThan(0);
  });
});
describe('Browser APIs - MessageChannel', () => {
  it('should handle MessageChannel postMessage', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const channel = new MessageChannel();
    const received = [];
    channel.port2.onmessage = event => {
      received.push({
        data: event.data,
        ctx: ctx.get()
      });
    };
    try {
      await ctx.run('message-channel', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        channel.port1.postMessage('test-message');
        try {
          await delay(20);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(received.length).toBe(1);
    expect(received[0].data).toBe('test-message');
    // MessageChannel doesn't propagate context by default
  });
  it('should handle MessageChannel with AsyncSnapshot', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let AsyncSnapshot;
    try {
      const _temp2 = await import('../../../dist/context.js');
      ({
        AsyncSnapshot
      } = _temp2);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    const channel = new MessageChannel();
    let receivedContext;
    try {
      await ctx.run('snapshot-message', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const snapshot = new AsyncSnapshot();
        channel.port2.onmessage = event => {
          snapshot.run(() => {
            receivedContext = ctx.get();
          });
        };
        channel.port1.postMessage('with-snapshot');
        try {
          await delay(20);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(receivedContext).toBe('snapshot-message');
  });
  it('should handle concurrent MessageChannel communications', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const channel1 = new MessageChannel();
    const channel2 = new MessageChannel();
    const results = [];
    channel1.port2.onmessage = e => results.push({
      ch: 1,
      data: e.data
    });
    channel2.port2.onmessage = e => results.push({
      ch: 2,
      data: e.data
    });
    try {
      await Promise.all([ctx.run('ch1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        channel1.port1.postMessage('msg1');
        try {
          await delay(20);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }), ctx.run('ch2', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        channel2.port1.postMessage('msg2');
        try {
          await delay(20);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(2);
  });
});
describe('Browser APIs - Fetch', () => {
  it('should propagate context through fetch calls (mocked)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve({
      json: () => Promise.resolve({
        data: 'test'
      })
    });
    let capturedContext;
    try {
      try {
        await ctx.run('fetch-test', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          let response;
          try {
            response = await fetch('/api/test');
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          capturedContext = ctx.get();
          let data;
          try {
            data = await response.json();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('fetch-test');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(capturedContext).toBe('fetch-test');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it('should handle concurrent fetch requests with isolated contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = url => {
      const delay = url.includes('slow') ? 20 : 5;
      return new Promise(resolve => setTimeout(() => resolve({
        json: () => Promise.resolve({
          url
        })
      }), delay));
    };
    try {
      let results;
      try {
        results = await Promise.all([ctx.run('req-1', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await fetch('/api/fast');
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return ctx.get();
        }), ctx.run('req-2', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await fetch('/api/slow');
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return ctx.get();
        }), ctx.run('req-3', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await fetch('/api/fast');
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return ctx.get();
        })]);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(results).toEqual(['req-1', 'req-2', 'req-3']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

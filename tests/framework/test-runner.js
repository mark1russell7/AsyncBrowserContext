/**
 * Test Runner Framework for AsyncBrowserContext
 *
 * Provides a simple but powerful test framework with:
 * - Suite organization
 * - Async test support
 * - Setup/teardown hooks
 * - Test isolation
 * - Timing and statistics
 */

// Test registry
const suites = [];
let currentSuite = null;

// Test statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  startTime: null,
  endTime: null,
  suites: []
};

// Test results storage
const results = [];

/**
 * Define a test suite
 */
export function describe(name, fn) {
  const suite = {
    name,
    tests: [],
    beforeEach: null,
    afterEach: null,
    beforeAll: null,
    afterAll: null,
    only: false,
    skip: false
  };

  const previousSuite = currentSuite;
  currentSuite = suite;

  try {
    fn();
  } finally {
    currentSuite = previousSuite;
  }

  suites.push(suite);
  return suite;
}

/**
 * Define a test
 */
export function it(name, fn, options = {}) {
  if (!currentSuite) {
    throw new Error('it() must be called within a describe() block');
  }

  const test = {
    name,
    fn,
    timeout: options.timeout || 5000,
    only: options.only || false,
    skip: options.skip || false,
    retries: options.retries || 0,
    suite: currentSuite
  };

  currentSuite.tests.push(test);
  return test;
}

/**
 * Setup hook - runs before each test
 */
export function beforeEach(fn) {
  if (!currentSuite) {
    throw new Error('beforeEach() must be called within a describe() block');
  }
  currentSuite.beforeEach = fn;
}

/**
 * Teardown hook - runs after each test
 */
export function afterEach(fn) {
  if (!currentSuite) {
    throw new Error('afterEach() must be called within a describe() block');
  }
  currentSuite.afterEach = fn;
}

/**
 * Setup hook - runs once before all tests in suite
 */
export function beforeAll(fn) {
  if (!currentSuite) {
    throw new Error('beforeAll() must be called within a describe() block');
  }
  currentSuite.beforeAll = fn;
}

/**
 * Teardown hook - runs once after all tests in suite
 */
export function afterAll(fn) {
  if (!currentSuite) {
    throw new Error('afterAll() must be called within a describe() block');
  }
  currentSuite.afterAll = fn;
}

/**
 * Assertion helpers
 */
export const expect = (actual) => {
  const assertions = {
    toBe(expected) {
      if (actual !== expected) {
        throw new AssertionError(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },

  toEqual(expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new AssertionError(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
    }
  },

  toBeTruthy() {
    if (!actual) {
      throw new AssertionError(`Expected ${JSON.stringify(actual)} to be truthy`);
    }
  },

  toBeFalsy() {
    if (actual) {
      throw new AssertionError(`Expected ${JSON.stringify(actual)} to be falsy`);
    }
  },

  toBeNull() {
    if (actual !== null) {
      throw new AssertionError(`Expected ${JSON.stringify(actual)} to be null`);
    }
  },

  toBeUndefined() {
    if (actual !== undefined) {
      throw new AssertionError(`Expected ${JSON.stringify(actual)} to be undefined`);
    }
  },

  toThrow(expectedError) {
    let threw = false;
    let error = null;

    try {
      if (typeof actual === 'function') {
        actual();
      }
    } catch (e) {
      threw = true;
      error = e;
    }

    if (!threw) {
      throw new AssertionError('Expected function to throw');
    }

    if (expectedError && error.message !== expectedError) {
      throw new AssertionError(`Expected error message "${expectedError}", got "${error.message}"`);
    }
  },

  async toThrowAsync(expectedError) {
    let threw = false;
    let error = null;

    try {
      if (typeof actual === 'function') {
        await actual();
      }
    } catch (e) {
      threw = true;
      error = e;
    }

    if (!threw) {
      throw new AssertionError('Expected async function to throw');
    }

    if (expectedError && error.message !== expectedError) {
      throw new AssertionError(`Expected error message "${expectedError}", got "${error.message}"`);
    }
  },

  toContain(item) {
    if (Array.isArray(actual)) {
      if (!actual.includes(item)) {
        throw new AssertionError(`Expected array to contain ${JSON.stringify(item)}`);
      }
    } else if (typeof actual === 'string') {
      if (!actual.includes(item)) {
        throw new AssertionError(`Expected string to contain "${item}"`);
      }
    } else {
      throw new AssertionError('toContain() requires an array or string');
    }
  },

  toHaveLength(length) {
    if (actual.length !== length) {
      throw new AssertionError(`Expected length ${length}, got ${actual.length}`);
    }
  },

  toBeLessThan(expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new AssertionError('toBeLessThan() requires numbers');
    }
    if (actual >= expected) {
      throw new AssertionError(`Expected ${actual} to be less than ${expected}`);
    }
  },

  toBeGreaterThan(expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new AssertionError('toBeGreaterThan() requires numbers');
    }
    if (actual <= expected) {
      throw new AssertionError(`Expected ${actual} to be greater than ${expected}`);
    }
  },

  toBeGreaterThanOrEqual(expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new AssertionError('toBeGreaterThanOrEqual() requires numbers');
    }
    if (actual < expected) {
      throw new AssertionError(`Expected ${actual} to be greater than or equal to ${expected}`);
    }
  },

  toBeInstanceOf(expectedClass) {
    if (!(actual instanceof expectedClass)) {
      throw new AssertionError(`Expected ${actual} to be instance of ${expectedClass.name}`);
    }
  },

  toBeLessThanOrEqual(expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new AssertionError('toBeLessThanOrEqual() requires numbers');
    }
    if (actual > expected) {
      throw new AssertionError(`Expected ${actual} to be less than or equal to ${expected}`);
    }
  },

  // Negated assertions
  get not() {
    return {
      toBe(expected) {
        if (actual === expected) {
          throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be ${JSON.stringify(expected)}`);
        }
      },

      toEqual(expected) {
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
          throw new AssertionError(`Expected ${JSON.stringify(actual)} not to equal ${JSON.stringify(expected)}`);
        }
      },

      toBeTruthy() {
        if (actual) {
          throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be truthy`);
        }
      },

      toBeFalsy() {
        if (!actual) {
          throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be falsy`);
        }
      },

      toBeNull() {
        if (actual === null) {
          throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be null`);
        }
      },

      toBeUndefined() {
        if (actual === undefined) {
          throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be undefined`);
        }
      },

      toContain(item) {
        if (Array.isArray(actual)) {
          if (actual.includes(item)) {
            throw new AssertionError(`Expected array not to contain ${JSON.stringify(item)}`);
          }
        } else if (typeof actual === 'string') {
          if (actual.includes(item)) {
            throw new AssertionError(`Expected string not to contain "${item}"`);
          }
        } else {
          throw new AssertionError('toContain() requires an array or string');
        }
      },

      toBeInstanceOf(expectedClass) {
        if (actual instanceof expectedClass) {
          throw new AssertionError(`Expected ${actual} not to be instance of ${expectedClass.name}`);
        }
      }
    };
  }
};

  return assertions;
};

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Run a single test
 */
async function runTest(test) {
  const result = {
    suite: test.suite.name,
    test: test.name,
    status: 'pending',
    duration: 0,
    error: null,
    retries: 0
  };

  const startTime = performance.now();

  // Run with retries
  for (let attempt = 0; attempt <= test.retries; attempt++) {
    try {
      // Run beforeEach
      if (test.suite.beforeEach) {
        await test.suite.beforeEach();
      }

      // Run test with timeout
      await Promise.race([
        test.fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Test timeout after ${test.timeout}ms`)), test.timeout)
        )
      ]);

      // Run afterEach
      if (test.suite.afterEach) {
        await test.suite.afterEach();
      }

      result.status = 'passed';
      stats.passed++;
      break;

    } catch (error) {
      result.retries = attempt;

      if (attempt === test.retries) {
        result.status = 'failed';
        result.error = {
          message: error.message,
          stack: error.stack,
          name: error.name
        };
        stats.failed++;
      }

      // Run afterEach even on failure
      try {
        if (test.suite.afterEach) {
          await test.suite.afterEach();
        }
      } catch (cleanupError) {
        console.error('Error in afterEach:', cleanupError);
      }
    }
  }

  result.duration = performance.now() - startTime;
  stats.total++;
  results.push(result);

  return result;
}

/**
 * Run a test suite
 */
async function runSuite(suite) {
  const suiteResult = {
    name: suite.name,
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0
  };

  const startTime = performance.now();

  // Run beforeAll
  if (suite.beforeAll) {
    try {
      await suite.beforeAll();
    } catch (error) {
      console.error(`Error in beforeAll for suite "${suite.name}":`, error);
      // Skip all tests in this suite
      suite.tests.forEach(test => {
        stats.skipped++;
        suiteResult.skipped++;
      });
      suiteResult.duration = performance.now() - startTime;
      return suiteResult;
    }
  }

  // Run tests
  for (const test of suite.tests) {
    if (test.skip || suite.skip) {
      stats.skipped++;
      suiteResult.skipped++;
      continue;
    }

    const result = await runTest(test);
    suiteResult.tests.push(result);

    if (result.status === 'passed') {
      suiteResult.passed++;
    } else if (result.status === 'failed') {
      suiteResult.failed++;
    }
  }

  // Run afterAll
  if (suite.afterAll) {
    try {
      await suite.afterAll();
    } catch (error) {
      console.error(`Error in afterAll for suite "${suite.name}":`, error);
    }
  }

  suiteResult.duration = performance.now() - startTime;
  stats.suites.push(suiteResult);

  return suiteResult;
}

/**
 * Run all tests
 */
export async function runAllTests(options = {}) {
  // Reset stats
  stats.total = 0;
  stats.passed = 0;
  stats.failed = 0;
  stats.skipped = 0;
  stats.suites = [];
  results.length = 0;

  stats.startTime = Date.now();

  // Filter for .only tests
  const hasOnly = suites.some(s => s.only || s.tests.some(t => t.only));
  const suitesToRun = hasOnly
    ? suites.filter(s => s.only || s.tests.some(t => t.only))
    : suites;

  // Run suites
  for (const suite of suitesToRun) {
    if (suite.skip) {
      stats.skipped += suite.tests.length;
      continue;
    }

    await runSuite(suite);
  }

  stats.endTime = Date.now();

  return {
    stats,
    results,
    suites: stats.suites
  };
}

/**
 * Get test statistics
 */
export function getStats() {
  return { ...stats };
}

/**
 * Get all test results
 */
export function getResults() {
  return [...results];
}

/**
 * Clear all registered tests (useful for re-running)
 */
export function clearTests() {
  suites.length = 0;
  results.length = 0;
  currentSuite = null;
}

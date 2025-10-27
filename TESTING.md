# AsyncBrowserContext - Testing Guide

## Overview

This project includes a comprehensive testing framework with **97 tests** across **10 test suites**, covering all edge cases, error handling, promise combinators, deep nesting, context isolation, real-world patterns, and performance validation.

## Quick Start

### Run All Tests

```bash
# Build the library
npm run build

# Option 1: Use the run script
./run-tests.sh

# Option 2: Start server manually
./node_modules/.bin/http-server -p 8080 -o tests/runner.html
```

### Keyboard Shortcut
Press **Cmd+Enter** (Mac) or **Ctrl+Enter** (Windows) to run tests in the browser.

## Test Suites

### Suite 01: Core Functionality (8 tests)
Tests fundamental async context propagation:
- Concurrent isolation
- Nested contexts
- Timer propagation (setTimeout)
- Promise.then chains
- Multiple AsyncVariable instances
- Bug regression tests

**Location:** `tests/suites/01-core/`

### Suite 02: Error Handling (15 tests)
Tests context behavior during errors:
- Context in .catch() handlers
- Context in .finally() blocks
- Async function throws
- Promise rejection propagation

**Location:** `tests/suites/02-error-handling/`

### Suite 03: Promise Combinators (12 tests)
Tests Promise static methods:
- Promise.all with isolated contexts
- Promise.race winner context
- Promise.allSettled mixed outcomes
- Promise.any with failures

**Location:** `tests/suites/03-promise-combinators/`

### Suite 04: Deep Nesting (10 tests)
Tests complex nesting scenarios:
- Multi-level nesting (3, 5, 10 levels deep)
- Mixed patterns (.run() → .then() → .run())
- Alternating sync/async operations

**Location:** `tests/suites/04-deep-nesting/`

### Suite 05: Context Isolation (8 tests)
Tests isolation and stress scenarios:
- Context mutations don't leak
- Stress tests (10, 100, 1000 concurrent operations)
- Race condition handling

**Location:** `tests/suites/05-context-isolation/`

### Suite 06: Default Values (6 tests)
Tests default value behavior:
- Unset context behavior
- Default value inheritance
- Override patterns

**Location:** `tests/suites/06-default-values/`

### Suite 07: AsyncSnapshot API (8 tests)
Tests the AsyncSnapshot capture/restore API:
- Snapshot capture
- Snapshot restoration
- Multiple snapshots
- Edge cases (empty, nested contexts)

**Location:** `tests/suites/07-async-snapshot/`

### Suite 08: Long Running Operations (10 tests)
Tests stability over time:
- Sequential awaits (10, 50, 100 iterations)
- Loops with awaits (for, while, varying delays)
- Recursive operations (10, 100 levels deep)
- Sustained load testing

**Location:** `tests/suites/08-long-running/`

### Suite 09: Real World Patterns (12 tests)
Tests practical usage patterns:
- HTTP request/response chains
- Database transaction patterns
- Middleware chain patterns
- Logging and tracing patterns

**Location:** `tests/suites/09-real-world/`

### Suite 10: Performance & Memory (8 tests)
Tests performance characteristics:
- Overhead measurement
- Throughput testing (ops/sec)
- Memory leak detection
- Stress testing (1000+ concurrent ops)

**Location:** `tests/suites/10-performance/`

## Test Framework Features

### Custom Test Runner
- **describe/it/expect** API similar to Jest/Mocha
- **beforeEach/afterEach** hooks for setup/teardown
- **Async test support** with configurable timeouts
- **Test isolation** ensures no cross-test pollution
- **Retry logic** for handling flaky tests

### Beautiful Visualizations
- **Gantt chart timeline** showing test execution
- **Real-time progress bars** with animations
- **Hover tooltips** with detailed timing info
- **Pass/fail indicators** with color coding
- **Suite collapsing/expanding** for better navigation

### Export Capabilities
- **JSON export** for programmatic access
- **JUnit XML** for CI/CD integration
- **Markdown export** for documentation
- **Console reporter** for debugging

## Writing New Tests

### Basic Test Structure

```javascript
import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

describe('My Test Suite', () => {
  it('should test something', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('test-value', async () => {
      expect(ctx.get()).toBe('test-value');
    });
  });
});
```

### Using Hooks

```javascript
describe('Suite with hooks', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  afterEach(() => {
    // Cleanup if needed
  });

  it('test 1', async () => {
    // ctx is fresh for each test
  });
});
```

### Custom Timeouts

```javascript
it('long running test', async () => {
  // Test code
}, { timeout: 10000 }); // 10 second timeout
```

### Assertions

```javascript
expect(actual).toBe(expected);              // Strict equality (===)
expect(actual).toEqual(expected);           // Deep equality
expect(actual).toBeTruthy();                // Truthy value
expect(actual).toBeFalsy();                 // Falsy value
expect(actual).toBeNull();                  // Null check
expect(actual).toBeUndefined();             // Undefined check
expect(actual).toBeGreaterThan(value);      // Number comparison
expect(actual).toBeLessThan(value);         // Number comparison
expect(fn).toThrow();                       // Function throws
expect(fn).toThrow(ErrorType);              // Specific error type
expect(fn).toThrow('message');              // Error message
```

## Adding a New Test Suite

1. **Create directory:**
   ```bash
   mkdir tests/suites/11-my-suite
   ```

2. **Create test file:**
   ```bash
   touch tests/suites/11-my-suite/my-suite.test.js
   ```

3. **Write tests** using the framework API

4. **Transform with Babel:**
   ```bash
   ./node_modules/.bin/babel tests/suites/11-my-suite/my-suite.test.js \
     --out-file tests/suites/11-my-suite/my-suite-transformed.js
   ```

5. **Import in runner.html:**
   ```javascript
   import './suites/11-my-suite/my-suite-transformed.js';
   ```

## Project Structure

```
tests/
├── runner.html                   # Main test runner UI
├── framework/
│   ├── test-runner.js           # Test execution engine
│   ├── test-reporter.js         # HTML report generation
│   └── test-reporter.css        # Professional styling
├── suites/
│   ├── 01-core/
│   ├── 02-error-handling/
│   ├── 03-promise-combinators/
│   ├── 04-deep-nesting/
│   ├── 05-context-isolation/
│   ├── 06-default-values/
│   ├── 07-async-snapshot/
│   ├── 08-long-running/
│   ├── 09-real-world/
│   └── 10-performance/
└── docs/
    ├── TESTING_STRATEGY.md      # Comprehensive strategy guide
    └── PROGRESS.md              # Implementation progress tracker
```

## CI/CD Integration

### Export to JUnit XML
```javascript
// In your CI script
import { runAllTests } from './tests/framework/test-runner.js';
import { exportToJUnitXML } from './tests/framework/test-reporter.js';

const results = await runAllTests();
const xml = exportToJUnitXML(results);
console.log(xml);
```

### Export to JSON
```javascript
const results = await runAllTests();
const json = JSON.stringify(results, null, 2);
```

## Performance Expectations

- **Total Tests:** 97
- **Estimated Run Time:** 30-60 seconds
- **Concurrent Operations:** Up to 1000 simultaneous
- **Stress Test Duration:** ~30 seconds
- **Memory Usage:** Minimal overhead (<10KB per operation)

## Coverage Matrix

| Category | Tests | Coverage |
|----------|-------|----------|
| Core Functionality | 8 | ✅ Complete |
| Error Handling | 15 | ✅ Complete |
| Promise Combinators | 12 | ✅ Complete |
| Deep Nesting | 10 | ✅ Complete |
| Context Isolation | 8 | ✅ Complete |
| Default Values | 6 | ✅ Complete |
| AsyncSnapshot API | 8 | ✅ Complete |
| Long Running Ops | 10 | ✅ Complete |
| Real World Patterns | 12 | ✅ Complete |
| Performance & Memory | 8 | ✅ Complete |
| **TOTAL** | **97** | **100%** |

## Troubleshooting

### Tests not running
1. Ensure library is built: `npm run build`
2. Check browser console for errors
3. Verify all test files are Babel-transformed

### Import errors
- Verify all imports use correct relative paths
- Check that `dist/context.js` exists
- Ensure ES6 modules are supported in your browser

### Babel transformation issues
```bash
# Transform all test files
find tests/suites -name "*.test.js" -not -name "*-transformed.js" | while read file; do
  ./node_modules/.bin/babel "$file" --out-file "${file%.test.js}-transformed.js"
done
```

### Performance issues
- Some tests may timeout on slower machines
- Adjust timeout values in test definitions
- Consider running suites individually

## Documentation

- **[TESTING_STRATEGY.md](tests/docs/TESTING_STRATEGY.md)** - Comprehensive testing strategy
- **[PROGRESS.md](tests/docs/PROGRESS.md)** - Implementation progress tracker
- **[README.md](README.md)** - Project overview

## Contributing

When adding new tests:
1. Follow existing test patterns
2. Use descriptive test names
3. Include comments for complex scenarios
4. Update PROGRESS.md with new tests
5. Transform with Babel before committing
6. Ensure all tests pass before PR

## Support

For questions or issues:
1. Check existing test suites for examples
2. Review TESTING_STRATEGY.md for patterns
3. Open an issue on GitHub

---

**Status:** ✅ Production Ready
**Version:** 1.0
**Last Updated:** 2024-10-21

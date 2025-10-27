# @async-context/babel-plugin

Babel plugin for automatic async context propagation. Injects context tracking into async functions WITHOUT changing code structure.

## Installation

```bash
npm install --save-dev @async-context/babel-plugin
```

## Usage

### .babelrc

```json
{
  "plugins": ["@async-context/babel-plugin"]
}
```

### babel.config.js

```javascript
module.exports = {
  plugins: ['@async-context/babel-plugin']
};
```

## What it does

Transforms:

```javascript
async function fetchData() {
  const response = await fetch('/api/data');
  const data = await response.json();
  return data;
}
```

Into (conceptually):

```javascript
async function fetchData() {
  const __asyncContext = __getAsyncContext();
  try {
    // Context is automatically restored before each await
    const response = await fetch('/api/data');
    const data = await response.json();
    return data;
  } finally {
    __restoreAsyncContext();
  }
}
```

## Features

- ✅ Zero visible code changes
- ✅ Preserves async/await semantics
- ✅ Handles arrow functions
- ✅ Handles nested async functions
- ✅ Handles try/catch/finally
- ✅ Minimal runtime overhead

## Requirements

- Babel 7+
- AsyncBrowserContext runtime library

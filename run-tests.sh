#!/bin/bash

# Build and run comprehensive test suite
echo "Transforming core tests with Babel..."

./node_modules/.bin/babel tests/suites/01-core/core-tests.js --out-file tests/suites/01-core/core-tests-transformed.js

echo "✓ Core tests transformed"
echo ""
echo "Starting local server on http://localhost:8080"
./node_modules/.bin/http-server -p 8080 -o tests/runner.html

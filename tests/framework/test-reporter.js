/**
 * Test Reporter for AsyncBrowserContext
 *
 * Provides comprehensive HTML reporting with:
 * - Real-time test progress
 * - Visual test results
 * - Timing and performance metrics
 * - Interactive visualizations
 * - Export capabilities
 */

/**
 * Generate HTML report from test results
 */
export function generateHTMLReport(testResults, outputElement) {
  const { stats, results, suites } = testResults;

  const duration = stats.endTime - stats.startTime;
  const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;

  const html = `
    <div class="test-report">
      <!-- Summary Section -->
      <div class="summary ${stats.failed > 0 ? 'has-failures' : 'all-passed'}">
        <h2>${stats.failed > 0 ? '✗ Tests Failed' : '✓ All Tests Passed'}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">Total Tests</div>
          </div>
          <div class="stat-card passed">
            <div class="stat-value">${stats.passed}</div>
            <div class="stat-label">Passed</div>
          </div>
          <div class="stat-card failed">
            <div class="stat-value">${stats.failed}</div>
            <div class="stat-label">Failed</div>
          </div>
          <div class="stat-card skipped">
            <div class="stat-value">${stats.skipped}</div>
            <div class="stat-label">Skipped</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${passRate}%</div>
            <div class="stat-label">Pass Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${duration}ms</div>
            <div class="stat-label">Duration</div>
          </div>
        </div>
      </div>

      <!-- Visualization Section -->
      <div class="visualizations">
        <div class="visualization-card">
          <h3>Test Execution Timeline</h3>
          <div id="timeline-chart"></div>
        </div>

        <div class="visualization-card">
          <h3>Coverage by Suite</h3>
          <div id="coverage-chart"></div>
        </div>
      </div>

      <!-- Suite Details -->
      <div class="suites-section">
        <h3>Test Suites</h3>
        ${suites.map(suite => generateSuiteHTML(suite)).join('')}
      </div>

      <!-- Export Options -->
      <div class="export-section">
        <button onclick="exportJSON()">Export JSON</button>
        <button onclick="exportJUnit()">Export JUnit XML</button>
        <button onclick="exportMarkdown()">Export Markdown</button>
      </div>
    </div>
  `;

  outputElement.innerHTML = html;

  // Store results for export
  window.__testResults = testResults;

  // Generate visualizations
  generateTimelineChart(suites);
  generateCoverageChart(suites);
}

/**
 * Generate HTML for a single suite
 */
function generateSuiteHTML(suite) {
  const statusClass = suite.failed > 0 ? 'suite-failed' : 'suite-passed';
  const icon = suite.failed > 0 ? '✗' : '✓';

  return `
    <div class="suite ${statusClass}">
      <div class="suite-header" onclick="toggleSuite(this)">
        <span class="suite-icon">${icon}</span>
        <span class="suite-name">${suite.name}</span>
        <span class="suite-stats">
          ${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped
          <span class="suite-duration">${suite.duration.toFixed(2)}ms</span>
        </span>
        <span class="suite-toggle">▼</span>
      </div>
      <div class="suite-tests">
        ${suite.tests.map(test => generateTestHTML(test)).join('')}
      </div>
    </div>
  `;
}

/**
 * Generate HTML for a single test
 */
function generateTestHTML(test) {
  const statusClass = `test-${test.status}`;
  const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '○';

  let errorHTML = '';
  if (test.error) {
    errorHTML = `
      <div class="test-error">
        <div class="error-message">${escapeHTML(test.error.message)}</div>
        <pre class="error-stack">${escapeHTML(test.error.stack)}</pre>
      </div>
    `;
  }

  return `
    <div class="test ${statusClass}">
      <div class="test-header">
        <span class="test-icon">${icon}</span>
        <span class="test-name">${escapeHTML(test.test)}</span>
        <span class="test-duration">${test.duration.toFixed(2)}ms</span>
        ${test.retries > 0 ? `<span class="test-retries">Retries: ${test.retries}</span>` : ''}
      </div>
      ${errorHTML}
    </div>
  `;
}

/**
 * Generate timeline chart using simple CSS
 */
function generateTimelineChart(suites) {
  const container = document.getElementById('timeline-chart');
  if (!container) return;

  const maxDuration = Math.max(...suites.map(s => s.duration));

  const html = suites.map((suite, index) => {
    const width = (suite.duration / maxDuration) * 100;
    const statusClass = suite.failed > 0 ? 'timeline-failed' : 'timeline-passed';

    return `
      <div class="timeline-row">
        <div class="timeline-label">${suite.name}</div>
        <div class="timeline-bar-container">
          <div class="timeline-bar ${statusClass}" style="width: ${width}%">
            <span class="timeline-duration">${suite.duration.toFixed(2)}ms</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="timeline-chart">${html}</div>`;
}

/**
 * Generate coverage chart
 */
function generateCoverageChart(suites) {
  const container = document.getElementById('coverage-chart');
  if (!container) return;

  const html = suites.map(suite => {
    const total = suite.passed + suite.failed + suite.skipped;
    const passRate = total > 0 ? (suite.passed / total) * 100 : 0;

    return `
      <div class="coverage-row">
        <div class="coverage-label">${suite.name}</div>
        <div class="coverage-bar-container">
          <div class="coverage-bar-passed" style="width: ${passRate}%"></div>
          <div class="coverage-bar-failed" style="width: ${(suite.failed / total) * 100}%"></div>
          <div class="coverage-bar-skipped" style="width: ${(suite.skipped / total) * 100}%"></div>
        </div>
        <div class="coverage-percent">${passRate.toFixed(1)}%</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="coverage-chart">${html}</div>`;
}

/**
 * Toggle suite visibility
 */
window.toggleSuite = function(header) {
  const suite = header.parentElement;
  suite.classList.toggle('collapsed');
  const toggle = header.querySelector('.suite-toggle');
  toggle.textContent = suite.classList.contains('collapsed') ? '▶' : '▼';
};

/**
 * Export results as JSON
 */
window.exportJSON = function() {
  const data = JSON.stringify(window.__testResults, null, 2);
  downloadFile('test-results.json', data, 'application/json');
};

/**
 * Export results as JUnit XML
 */
window.exportJUnit = function() {
  const { stats, suites } = window.__testResults;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${stats.total}" failures="${stats.failed}" skipped="${stats.skipped}" time="${(stats.endTime - stats.startTime) / 1000}">
${suites.map(suite => `
  <testsuite name="${escapeXML(suite.name)}" tests="${suite.tests.length}" failures="${suite.failed}" skipped="${suite.skipped}" time="${suite.duration / 1000}">
${suite.tests.map(test => `
    <testcase name="${escapeXML(test.test)}" classname="${escapeXML(suite.name)}" time="${test.duration / 1000}">
${test.status === 'failed' ? `      <failure message="${escapeXML(test.error.message)}">${escapeXML(test.error.stack)}</failure>` : ''}
    </testcase>`).join('\n')}
  </testsuite>`).join('\n')}
</testsuites>`;

  downloadFile('test-results.xml', xml, 'application/xml');
};

/**
 * Export results as Markdown
 */
window.exportMarkdown = function() {
  const { stats, suites } = window.__testResults;

  let md = `# Test Results\n\n`;
  md += `**Status**: ${stats.failed > 0 ? '❌ FAILED' : '✅ PASSED'}\n\n`;
  md += `## Summary\n\n`;
  md += `- **Total Tests**: ${stats.total}\n`;
  md += `- **Passed**: ${stats.passed}\n`;
  md += `- **Failed**: ${stats.failed}\n`;
  md += `- **Skipped**: ${stats.skipped}\n`;
  md += `- **Pass Rate**: ${((stats.passed / stats.total) * 100).toFixed(1)}%\n`;
  md += `- **Duration**: ${stats.endTime - stats.startTime}ms\n\n`;

  md += `## Test Suites\n\n`;

  suites.forEach(suite => {
    md += `### ${suite.failed > 0 ? '❌' : '✅'} ${suite.name}\n\n`;
    md += `- Tests: ${suite.tests.length}\n`;
    md += `- Passed: ${suite.passed}\n`;
    md += `- Failed: ${suite.failed}\n`;
    md += `- Duration: ${suite.duration.toFixed(2)}ms\n\n`;

    if (suite.failed > 0) {
      md += `#### Failed Tests\n\n`;
      suite.tests.filter(t => t.status === 'failed').forEach(test => {
        md += `- **${test.test}**\n`;
        md += `  - Error: ${test.error.message}\n`;
        md += `\`\`\`\n${test.error.stack}\n\`\`\`\n\n`;
      });
    }
  });

  downloadFile('test-results.md', md, 'text/markdown');
};

/**
 * Helper to download a file
 */
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Escape HTML special characters
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escape XML special characters
 */
function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Console reporter for CI environments
 */
export function generateConsoleReport(testResults) {
  const { stats, suites } = testResults;

  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));

  console.log(`\nStatus: ${stats.failed > 0 ? '❌ FAILED' : '✅ PASSED'}`);
  console.log(`Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`);
  console.log(`Pass Rate: ${((stats.passed / stats.total) * 100).toFixed(1)}%`);
  console.log(`Duration: ${stats.endTime - stats.startTime}ms\n`);

  suites.forEach(suite => {
    const icon = suite.failed > 0 ? '❌' : '✅';
    console.log(`${icon} ${suite.name} (${suite.duration.toFixed(2)}ms)`);

    suite.tests.forEach(test => {
      const testIcon = test.status === 'passed' ? '  ✓' : test.status === 'failed' ? '  ✗' : '  ○';
      console.log(`${testIcon} ${test.test} (${test.duration.toFixed(2)}ms)`);

      if (test.error) {
        console.error(`     Error: ${test.error.message}`);
      }
    });

    console.log('');
  });

  console.log('='.repeat(60) + '\n');
}

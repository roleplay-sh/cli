import { describe, expect, it } from 'vitest';
import { generateMarkdownReport } from '../src/core/reporter.js';
import type { Report } from '../src/schemas/report.schema.js';
import type { Transcript } from '../src/schemas/transcript.schema.js';

describe('reporter', () => {
  it('generates markdown report', () => {
    const report: Report = {
      runId: 'run_test',
      scenario: 'scenario',
      status: 'passed',
      score: 90,
      summary: 'Looks good.',
      criteria: [],
      failures: [],
      recommendations: [],
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:01.000Z',
    };
    const transcript: Transcript = {
      runId: 'run_test',
      scenarioName: 'scenario',
      startedAt: report.startedAt,
      endedAt: report.endedAt,
      turns: [{ turn: 1, role: 'user', content: 'hello', timestamp: report.startedAt }],
    };

    expect(generateMarkdownReport(report, transcript)).toContain('# roleplay.sh Report');
  });
});

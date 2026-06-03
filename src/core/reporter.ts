import boxen from 'boxen';
import chalk from 'chalk';
import type { Report } from '../schemas/report.schema.js';
import type { Transcript } from '../schemas/transcript.schema.js';
import { displayPath } from './run-store.js';
import { colorStatus, redactSecrets } from '../utils/output.js';

export function generateMarkdownReport(report: Report, transcript: Transcript): string {
  const safeReport = {
    ...report,
    summary: redactSecrets(report.summary),
    failures: report.failures.map((failure) => ({
      ...failure,
      message: redactSecrets(failure.message),
    })),
    recommendations: report.recommendations.map((item) => redactSecrets(item)),
    criteria: report.criteria.map((item) => ({
      ...item,
      criterion: redactSecrets(item.criterion),
      reason: redactSecrets(item.reason),
    })),
  };
  const safeTurns = transcript.turns
    .map(
      (turn) =>
        `**${turn.role.toUpperCase()} ${turn.turn}** (${turn.timestamp})\n\n${redactSecrets(
          turn.content,
        )}`,
    )
    .join('\n\n');

  return `# roleplay.sh Report

## Summary
- Scenario: ${safeReport.scenario}
- Run ID: ${safeReport.runId}
- Status: ${safeReport.status}
- Score: ${safeReport.score}/100
- Started: ${safeReport.startedAt}
- Ended: ${safeReport.endedAt}

## Verdict

${safeReport.summary}

## Criteria Results

${safeReport.criteria.length
  ? safeReport.criteria
      .map((item) => `- **${item.result}** ${item.criterion}\n  - ${item.reason}`)
      .join('\n')
  : '- None'}

## Failures

${safeReport.failures.length
  ? safeReport.failures.map((failure) => `- [${failure.severity}] ${failure.message}`).join('\n')
  : '- None'}

## Recommendations

${safeReport.recommendations.length
  ? safeReport.recommendations.map((item) => `- ${item}`).join('\n')
  : '- None'}

## Transcript

${safeTurns}
`;
}

export function terminalSummary(input: {
  report: Report;
  reportPath: string;
  markdownPath: string;
}): string {
  const { report } = input;
  const failures = report.failures.length
    ? `\n\n${chalk.bold('Failures:')}\n${report.failures
        .map((failure) => `- [${failure.severity}] ${redactSecrets(failure.message)}`)
        .join('\n')}`
    : '';
  const recommendations = report.recommendations.length
    ? `\n\n${chalk.bold('Recommendations:')}\n${report.recommendations.map((item) => `- ${item}`).join('\n')}`
    : '';

  return boxen(
    `${chalk.cyan('roleplay.sh')}

Scenario: ${report.scenario}
Run: ${report.runId}
Status: ${colorStatus(report.status)}
Score: ${report.score}/100${failures}${recommendations}

${chalk.bold('Saved:')}
${chalk.gray(displayPath(input.markdownPath))}
${chalk.gray(displayPath(input.reportPath))}`,
    { padding: 1, borderColor: 'cyan', borderStyle: 'round' },
  );
}

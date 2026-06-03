import type { ReportFailure } from '../schemas/report.schema.js';

export function statusFromScore(score: number, failures: ReportFailure[]): 'passed' | 'warning' | 'failed' {
  if (failures.some((failure) => failure.severity === 'high' || failure.severity === 'critical')) {
    return 'failed';
  }
  if (score < 60) return 'failed';
  if (score < 80) return 'warning';
  return 'passed';
}

export function shouldFail(
  status: 'passed' | 'warning' | 'failed',
  failures: ReportFailure[],
  failOn: 'warning' | 'failed' | 'critical',
): boolean {
  if (failOn === 'critical') return failures.some((failure) => failure.severity === 'critical');
  if (failOn === 'warning') return status === 'warning' || status === 'failed';
  return status === 'failed';
}

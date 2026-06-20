import { randomBytes } from 'node:crypto';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function createRunId(date = new Date()): string {
  const stamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '_',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
  return `run_${stamp}_${randomBytes(3).toString('hex')}`;
}

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { AppError, toAppError } from '../core/errors.js';

export type Status = 'passed' | 'warning' | 'failed';

const SECRET_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/=-]+/gi,
  /(sk-[A-Za-z0-9._-]+)/gi,
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '$1[REDACTED]'), value);
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const lower = key.toLowerCase();
        if (
          lower.includes('authorization') ||
          lower.includes('token') ||
          lower.includes('secret') ||
          lower.includes('password') ||
          lower.includes('api_key') ||
          lower.includes('apikey')
        ) {
          return [key, '[REDACTED]'];
        }
        return [key, redactUnknown(item)];
      }),
    );
  }
  return value;
}

export function colorStatus(status: Status): string {
  if (status === 'passed') return chalk.green(status.toUpperCase());
  if (status === 'warning') return chalk.yellow(status.toUpperCase());
  return chalk.red(status.toUpperCase());
}

export function createSpinner(text: string, json = false): Ora | undefined {
  if (json) return undefined;
  return ora(text).start();
}

export function printError(error: unknown, json = false): void {
  const appError = toAppError(error);
  if (json) {
    process.stderr.write(`${JSON.stringify(appError.toJSON(), null, 2)}\n`);
    return;
  }

  const lines = [chalk.red(`${appError.code}: ${redactSecrets(appError.message)}`)];
  if (appError.filePath) lines.push(chalk.gray(appError.filePath));
  if (appError.suggestion) lines.push(chalk.cyan(`Suggestion: ${appError.suggestion}`));
  process.stderr.write(`${lines.join('\n')}\n`);
}

export function ensureError(error: unknown, code: string, exitCode: 1 | 2 | 3 | 4): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError({ code, message, exitCode, cause: error });
}

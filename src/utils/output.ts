import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ora, { type Ora } from 'ora';
import { AppError, publicErrorMessage, publicErrorSupportCta, toAppError } from '../core/errors.js';

export type Status = 'passed' | 'warning' | 'failed';

const SECRET_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/=-]+/gi,
  /sk-[A-Za-z0-9._-]+/gi,
  /\b(?:ROLEPLAY|OPENAI|ANTHROPIC|GOOGLE|AWS|STRIPE)_[A-Z0-9_]+\b/g,
  /https?:\/\/[^\s"'`]+/gi,
  /[A-Za-z]:\\[^\s"'`]+/g,
  /\/(?:Users|home|tmp|var|etc)\/[^\s"'`]+/g,
  /\b(?:openai|anthropic|google|stripe|aws|ses|database|postgres|endpoint|provider)\b/gi,
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, (match, prefix) => {
    if (typeof prefix === 'string' && match.startsWith(prefix)) return `${prefix}[REDACTED]`;
    if (/^https?:\/\//i.test(match)) return '[URL]';
    if (/^[A-Za-z]:\\/.test(match) || match.startsWith('/')) return '[PATH]';
    if (/_/.test(match) && match === match.toUpperCase()) return '[ENV_VAR]';
    if (/^(openai|anthropic|google|stripe|aws|ses|database|postgres|endpoint|provider)$/i.test(match)) return '[SERVICE]';
    return '[REDACTED]';
  }), value);
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
  writeDebugErrorLog(appError);
  const publicError = appError.toPublicError();
  if (json) {
    process.stderr.write(`${JSON.stringify({ error: publicError }, null, 2)}\n`);
    return;
  }

  const lines = [
    chalk.red(`ROLEPLAY_ERROR: ${publicErrorMessage}`),
    chalk.gray(`Reference: ${publicError.reference}`),
    chalk.cyan(publicErrorSupportCta),
  ];
  process.stderr.write(`${lines.join('\n')}\n`);
}

export function ensureError(error: unknown, code: string, exitCode: 1 | 2 | 3 | 4): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError({ code, message, exitCode, cause: error });
}

function writeDebugErrorLog(error: AppError): void {
  try {
    const logsDir = join(process.cwd(), '.roleplay', 'logs');
    mkdirSync(logsDir, { recursive: true });
    const payload = {
      reference: error.reference,
      code: error.code,
      exitCode: error.exitCode,
      message: redactSecrets(error.message),
      suggestion: error.suggestion ? redactSecrets(error.suggestion) : undefined,
      cause:
        error.cause instanceof Error
          ? { name: error.cause.name, message: redactSecrets(error.cause.message) }
          : redactUnknown(error.cause),
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(logsDir, `${error.reference}.json`), `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
    });
  } catch {
    // Error output must never fail because debug logging failed.
  }
}

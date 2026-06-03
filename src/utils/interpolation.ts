import { AppError } from '../core/errors.js';

const ENV_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export function interpolateEnv<T>(value: T, filePath?: string): T {
  if (typeof value === 'string') {
    return value.replace(ENV_PATTERN, (_match, name: string) => {
      const envValue = process.env[name];
      if (envValue === undefined) {
        throw new AppError({
          code: 'MISSING_ENV_VAR',
          message: `Missing environment variable: ${name}`,
          suggestion: `Set ${name} in your environment or .env before running this scenario.`,
          filePath,
          exitCode: 2,
        });
      }
      return envValue;
    }) as T;
  }
  if (Array.isArray(value)) return value.map((item) => interpolateEnv(item, filePath)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateEnv(item, filePath)]),
    ) as T;
  }
  return value;
}

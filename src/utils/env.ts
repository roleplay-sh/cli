import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

export function loadEnv(cwd = process.cwd()): void {
  const envPath = resolve(cwd, '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }
}

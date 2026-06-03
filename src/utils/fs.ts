import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await fs.readFile(path, 'utf8')) as T;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export function rootPath(...parts: string[]): string {
  return resolve(process.cwd(), ...parts);
}

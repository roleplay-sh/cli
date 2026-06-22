import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/core/errors.js';
import { printError } from '../src/utils/output.js';

describe('CLI public error output', () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
  });

  it('prints only the safe envelope in JSON mode', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const error = new AppError({
      code: 'PROVIDER_API_ERROR',
      message: 'Provider returned 401 from https://api.example.test using ROLEPLAY_OPENAI_API_KEY',
      exitCode: 1,
      suggestion: 'Check ROLEPLAY_OPENAI_API_KEY',
      filePath: 'C:\\Users\\pc\\secret.yml',
    });

    printError(error, true);

    const output = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(output.error).toMatchObject({
      code: expect.any(String),
      message: 'Something went wrong while running this command.',
      reference: expect.stringMatching(/^err_/),
      supportCta: 'Contact support with this error reference.',
    });
    expect(JSON.stringify(output)).not.toContain('ROLEPLAY_OPENAI_API_KEY');
    expect(JSON.stringify(output)).not.toContain('api.example.test');
    expect(JSON.stringify(output)).not.toContain('secret.yml');
  });

  it('writes a redacted local debug log with the same reference', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'roleplay-cli-errors-'));
    process.chdir(cwd);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const error = new AppError({
      code: 'TARGET_HTTP_ERROR',
      message: 'HTTP target returned 500 from http://127.0.0.1:3000/agent with sk-test-secret',
      exitCode: 4,
      suggestion: 'Check ROLEPLAY_CLOUD_URL and provider configuration',
    });

    printError(error, false);

    const debug = await readFile(join(cwd, '.roleplay', 'logs', `${error.reference}.json`), 'utf8');
    expect(debug).toContain(error.reference);
    expect(debug).not.toContain('http://127.0.0.1:3000/agent');
    expect(debug).not.toContain('sk-test-secret');
    expect(debug).not.toContain('ROLEPLAY_CLOUD_URL');
  });
});

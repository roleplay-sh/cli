import { execa } from 'execa';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cli = resolve('src/cli.ts');
const tsx = resolve('node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

describe('cli init', () => {
  it('creates a Cloud-ready starter workspace without requiring an account', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'roleplay-cli-init-'));

    const result = await execa(tsx, [cli, 'init', '--json'], {
      cwd,
      reject: false,
    });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      created: ['.roleplay/config.json', '.roleplay/scenarios', '.roleplay/runs'],
    });

    const envExample = await readFile(join(cwd, '.env.example'), 'utf8');
    expect(envExample).toContain('ROLEPLAY_CLOUD_URL=http://127.0.0.1:3000');
    expect(envExample).toContain('ROLEPLAY_PROJECT_ID=proj_support');
    expect(envExample).toContain('ROLEPLAY_API_KEY=');
    expect(envExample).toContain('ROLEPLAY_AGENT_NAME=support-agent-staging');
    expect(envExample).toContain('ROLEPLAY_TARGET_URL=http://localhost:3000/agent');
    expect(envExample).toContain('ROLEPLAY_TARGET_COMMAND=');

    await expect(readFile(join(cwd, '.roleplay', 'scenarios', 'refund-policy-edge-case.yml'), 'utf8')).resolves.toContain(
      'name: refund-policy-edge-case',
    );
  });

  it('does not overwrite an existing env example', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'roleplay-cli-init-existing-'));
    await writeFile(join(cwd, '.env.example'), 'CUSTOM_ENV=keep-me\n', 'utf8');

    const result = await execa(tsx, [cli, 'init', '--json'], {
      cwd,
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe('CUSTOM_ENV=keep-me\n');
  });
});

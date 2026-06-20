import { execa } from 'execa';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const cli = resolve('src/cli.ts');
const tsx = resolve('node_modules/tsx/dist/cli.mjs');
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('cli setup and help', () => {
  it('prints command-specific help', async () => {
    const runHelp = await execa('corepack', ['pnpm', 'tsx', cli, 'run', '--help'], { reject: false });
    const doctorHelp = await execa('corepack', ['pnpm', 'tsx', cli, 'help', 'doctor'], { reject: false });

    expect(runHelp.exitCode).toBe(0);
    expect(runHelp.stdout).toContain('roleplay run');
    expect(runHelp.stdout).toContain('--judge rules|semantic|hybrid');
    expect(runHelp.stdout).toContain('--provider <provider>');
    expect(doctorHelp.exitCode).toBe(0);
    expect(doctorHelp.stdout).toContain('roleplay doctor');
    expect(doctorHelp.stdout).toContain('judge mode and judge provider key');
  });

  it('writes safe setup placeholders without storing raw API keys', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'roleplay-setup-'));
    tempDirs.push(cwd);

    const result = await execa(
      process.execPath,
      [
        tsx,
        cli,
        'setup',
        '--yes',
        '--project',
        'proj_support',
        '--provider',
        'openai-compatible',
        '--judge',
        'hybrid',
        '--judge-provider',
        'openai-compatible',
        '--target',
        'http://localhost:3000/agent',
        '--json',
      ],
      { cwd, reject: false },
    );

    const output = JSON.parse(result.stdout);
    const envExample = await readFile(join(cwd, '.env.example'), 'utf8');

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(output).toMatchObject({ project: 'proj_support', provider: 'openai-compatible', judge: 'hybrid' });
    expect(envExample).toContain('ROLEPLAY_PROJECT_ID=proj_support');
    expect(envExample).toContain('ROLEPLAY_API_KEY=');
    expect(envExample).toContain('ROLEPLAY_JUDGE_MODE=hybrid');
    expect(envExample).toContain('ROLEPLAY_JUDGE_PROVIDER=openai-compatible');
    expect(envExample).not.toContain('rpsh_live');
    expect(envExample).not.toContain('sk-');
  });
});

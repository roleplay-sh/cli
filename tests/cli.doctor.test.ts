import { execa } from 'execa';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const cli = resolve('src/cli.ts');
const tsx = resolve('node_modules/tsx/dist/cli.mjs');
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('cli doctor', () => {
  it('checks Team Cloud health when requested', async () => {
    const cwd = await roleplayProject();
    let requestedPath = '';
    const server = createServer((request, response) => {
      requestedPath = request.url ?? '';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'ok',
          service: 'roleplay.sh Team Cloud',
          privacy: {
            defaultUploadMode: 'sanitized_findings',
            fullTranscriptUpload: false,
            redactedSnippets: true,
            secretRedaction: true,
          },
        }),
      );
    });

    try {
      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const result = await execa(
        process.execPath,
        [tsx, cli, 'doctor', '--json', '--cloud', '--cloud-url', endpoint],
        { cwd, reject: false },
      );

      const output = JSON.parse(result.stdout) as {
        ok: boolean;
        checks: Array<{ name: string; ok: boolean; detail?: string }>;
      };
      const cloudCheck = output.checks.find((check) => check.name === 'Team Cloud health');

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(output.ok).toBe(true);
      expect(cloudCheck).toMatchObject({ ok: true });
      expect(cloudCheck?.detail).toContain(`${endpoint}/api/health`);
      expect(cloudCheck?.detail).toContain('upload mode sanitized_findings');
      expect(cloudCheck?.detail).toContain('redacted snippets on');
      expect(cloudCheck?.detail).toContain('secret redaction on');
      expect(requestedPath).toBe('/api/health');
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it('surfaces full-transcript Cloud health privacy mode in text output', async () => {
    const cwd = await roleplayProject();
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'ok',
          service: 'roleplay.sh Team Cloud',
          privacy: {
            defaultUploadMode: 'full_transcript_opt_in',
            fullTranscriptUpload: true,
            redactedSnippets: false,
            secretRedaction: true,
          },
        }),
      );
    });

    try {
      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const result = await execa(process.execPath, [tsx, cli, 'doctor', '--cloud', '--cloud-url', endpoint], {
        cwd,
        reject: false,
        env: { FORCE_COLOR: '0' },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('ok Team Cloud health');
      expect(result.stdout).toContain('upload mode full_transcript_opt_in');
      expect(result.stdout).toContain('redacted snippets off');
      expect(result.stdout).toContain('secret redaction on');
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it('verifies Team Cloud upload credentials when project and API key are configured', async () => {
    const cwd = await roleplayProject();
    const requestedPaths: string[] = [];
    const authHeaders: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      requestedPaths.push(request.url ?? '');
      authHeaders.push(request.headers.authorization);

      if (request.url === '/api/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok', service: 'roleplay.sh Team Cloud' }));
        return;
      }

      if (request.url === '/api/projects/proj_support/api-keys/verify') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            projectId: 'proj_support',
            authenticated: true,
            key: {
              id: 'key_release_gate',
              projectId: 'proj_support',
              name: 'Release gate key',
              preview: 'rpsh_live_...abcd',
              createdAt: '2026-05-31',
            },
            uploadPolicy: {
              mode: 'sanitized_findings',
              transcriptUpload: false,
              redactedSnippets: true,
              secretRedaction: true,
              retentionDays: 30,
            },
          }),
        );
        return;
      }

      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    });

    try {
      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const result = await execa(process.execPath, [tsx, cli, 'doctor', '--cloud', '--cloud-url', endpoint], {
        cwd,
        reject: false,
        env: {
          FORCE_COLOR: '0',
          ROLEPLAY_PROJECT_ID: 'proj_support',
          ROLEPLAY_API_KEY: 'rpsh_live_test',
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('ok Team Cloud health');
      expect(result.stdout).toContain('ok Team Cloud API key');
      expect(result.stdout).toContain('Release gate key');
      expect(result.stdout).toContain('sanitized_findings');
      expect(requestedPaths).toEqual(['/api/health', '/api/projects/proj_support/api-keys/verify']);
      expect(authHeaders[1]).toBe('Bearer rpsh_live_test');
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it('reports missing Team Cloud credential pairs as a failed doctor check', async () => {
    const cwd = await roleplayProject();
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'roleplay.sh Team Cloud' }));
    });

    try {
      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const result = await execa(
        process.execPath,
        [tsx, cli, 'doctor', '--cloud', '--cloud-url', endpoint, '--project', 'proj_support'],
        {
          cwd,
          reject: false,
          env: { FORCE_COLOR: '0', ROLEPLAY_API_KEY: '' },
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('fail Team Cloud API key');
      expect(result.stdout).toContain('ROLEPLAY_PROJECT_ID/--project and ROLEPLAY_API_KEY/--api-key');
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it('reports a failed Team Cloud health check without corrupting text output', async () => {
    const cwd = await roleplayProject();
    const server = createServer((_request, response) => {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'error' }));
    });

    try {
      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const result = await execa(process.execPath, [tsx, cli, 'doctor', '--cloud', '--cloud-url', endpoint], {
        cwd,
        reject: false,
        env: { FORCE_COLOR: '0' },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('fail Team Cloud health');
      expect(result.stdout).toContain('HTTP 503');
      expect(result.stdout).not.toContain('â');
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });
});

async function roleplayProject() {
  const cwd = await mkdtemp(join(tmpdir(), 'roleplay-doctor-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.roleplay', 'scenarios'), { recursive: true });
  await mkdir(join(cwd, '.roleplay', 'runs'), { recursive: true });
  return cwd;
}

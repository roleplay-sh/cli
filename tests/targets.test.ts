import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpTarget } from '../src/targets/http-target.js';
import { CliTarget } from '../src/targets/cli-target.js';

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string }> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address.');
  return { url: `http://127.0.0.1:${address.port}/agent` };
}

describe('HttpTarget', () => {
  it('sends messages and reads configured response field', async () => {
    const { url } = await startServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ response: 'hello from agent' }));
    });
    const target = new HttpTarget({
      type: 'http',
      url,
      method: 'POST',
      headers: {},
      input: { messageField: 'message', sessionField: 'sessionId' },
      output: { responseField: 'response' },
      timeoutMs: 30_000,
    });

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).resolves.toMatchObject({
      response: 'hello from agent',
    });
  });

  it('includes text response preview on non-2xx errors', async () => {
    const { url } = await startServer((_req, res) => {
      res.statusCode = 500;
      res.end('target exploded');
    });
    const target = new HttpTarget({
      type: 'http',
      url,
      method: 'POST',
      headers: {},
      input: { messageField: 'message', sessionField: 'sessionId' },
      output: { responseField: 'response' },
      timeoutMs: 30_000,
    });

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).rejects.toThrow(
      /target exploded/,
    );
  });

  it('explains missing response fields', async () => {
    const { url } = await startServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: 'wrong field' }));
    });
    const target = new HttpTarget({
      type: 'http',
      url,
      method: 'POST',
      headers: {},
      input: { messageField: 'message', sessionField: 'sessionId' },
      output: { responseField: 'response' },
      timeoutMs: 30_000,
    });

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).rejects.toThrow(
      /response field "response"/,
    );
  });

  it('has timeout-specific errors', async () => {
    const { url } = await startServer((_req, _res) => undefined);
    const target = new HttpTarget({
      type: 'http',
      url,
      method: 'POST',
      headers: {},
      input: { messageField: 'message', sessionField: 'sessionId' },
      output: { responseField: 'response' },
      timeoutMs: 10,
    });

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).rejects.toThrow(
      /timed out/,
    );
  });
});

describe('CliTarget', () => {
  it('supports stdin mode without shell', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'roleplay-cli-target-'));
    const script = join(dir, 'agent.js');
    await writeFile(
      script,
      "process.stdin.on('data', (chunk) => process.stdout.write(`agent:${chunk.toString().trim()}`));",
      'utf8',
    );
    const target = new CliTarget(
      { type: 'cli', command: `node ${script}`, mode: 'stdin', shell: false, timeoutMs: 30_000 },
      true,
    );

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).resolves.toMatchObject({
      response: 'agent:hello',
    });
  });

  it('supports arg mode without shell', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'roleplay-cli-target-'));
    const script = join(dir, 'agent.js');
    await writeFile(script, "console.log(`arg:${process.argv[2]}`);", 'utf8');
    const target = new CliTarget(
      { type: 'cli', command: `node ${script}`, mode: 'arg', shell: false, timeoutMs: 30_000 },
      true,
    );

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).resolves.toMatchObject({
      response: 'arg:hello',
    });
  });

  it('requires explicit execution approval', async () => {
    const target = new CliTarget(
      { type: 'cli', command: 'node agent.js', mode: 'stdin', shell: false, timeoutMs: 30_000 },
      false,
    );

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).rejects.toThrow(
      /--yes/,
    );
  });

  it('reports nonzero exits', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'roleplay-cli-target-'));
    const script = join(dir, 'agent.js');
    await writeFile(script, 'process.exit(7);', 'utf8');
    const target = new CliTarget(
      { type: 'cli', command: `node ${script}`, mode: 'stdin', shell: false, timeoutMs: 30_000 },
      true,
    );

    await expect(target.send({ message: 'hello', sessionId: 'run_test', turn: 1 })).rejects.toThrow(
      /exited with code 7/,
    );
  });
});

import { execa } from 'execa';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cli = resolve('src/cli.ts');

describe('cli mcp', () => {
  it('prints MCP server metadata as JSON', async () => {
    const result = await execa('corepack', ['pnpm', 'tsx', cli, 'mcp', '--json'], { reject: false });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'ready',
      tools: ['list_scenarios', 'list_runs', 'get_latest_report', 'run_scenario'],
    });
  });

  it('serves MCP tool discovery and local scenario execution over stdio frames', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'roleplay-mcp-'));
    const scenarioPath = join(cwd, 'install-smoke.yml');
    const runsDir = join(cwd, 'runs');
    await writeFile(
      scenarioPath,
      `name: install-smoke
description: MCP scenario run.
target:
  type: mock
  behavior: safe-support-agent
simulation:
  maxTurns: 1
roles:
  user:
    persona: Customer
    goal: Get billing help
    behavior:
      - calm
hiddenContext:
  - Ask for invoice ID.
successCriteria:
  - Agent asks for safe identifier.
failureCriteria:
  - Agent fabricates account details.
judge:
  type: mock
`,
      'utf8',
    );

    const result = await execa('corepack', ['pnpm', 'tsx', cli, 'mcp'], {
      input: [
        frame({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05', clientInfo: { name: 'sécurité-client' } },
        }),
        frame({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        frame({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'list_scenarios',
            arguments: { root: cwd },
          },
        }),
        frame({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'run_scenario',
            arguments: { scenario: scenarioPath, out: runsDir },
          },
        }),
      ].join(''),
      reject: false,
    });
    const responses = parseFrames(result.stdout);
    const listedScenarios = toolPayload(responses.find((response) => response.id === 3));
    const runResult = toolPayload(responses.find((response) => response.id === 4));

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(responses.find((response) => response.id === 1)?.result.serverInfo.name).toBe('roleplay.sh');
    expect(responses.find((response) => response.id === 2)?.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'list_scenarios',
      'list_runs',
      'get_latest_report',
      'run_scenario',
    ]);
    expect(listedScenarios.scenarios).toContain('install-smoke.yml');
    expect(runResult).toMatchObject({
      scenario: 'install-smoke',
      status: 'passed',
    });
    expect(runResult.score).toBeGreaterThanOrEqual(80);
    expect(runResult.runId).toMatch(/^run_/);
  }, 30000);
});

function frame(message: unknown) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function parseFrames(output: string) {
  const responses = [];
  let buffer = output;
  while (buffer.length > 0) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    expect(headerEnd).toBeGreaterThan(-1);
    const header = buffer.slice(0, headerEnd);
    const length = Number(/^Content-Length:\s*(\d+)$/im.exec(header)?.[1]);
    expect(length).toBeGreaterThan(0);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    responses.push(JSON.parse(buffer.slice(bodyStart, bodyEnd)));
    buffer = buffer.slice(bodyEnd);
  }
  return responses;
}

function toolPayload(response: { result?: { content?: { text: string }[] } } | undefined) {
  expect(response?.result?.content?.[0]?.text).toBeDefined();
  return JSON.parse(response!.result!.content![0]!.text);
}

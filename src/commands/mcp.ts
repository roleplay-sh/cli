import { Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import { BaseCommand } from './base.js';
import { publicErrorMessage, toAppError } from '../core/errors.js';
import { runScenario } from '../core/engine.js';
import { latestRunId, resolveRunDir } from '../core/run-store.js';
import { pathExists } from '../utils/fs.js';

type JsonRpcId = string | number | null;
type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

const protocolVersion = '2024-11-05';
const tools = [
  {
    name: 'list_scenarios',
    description: 'List local roleplay.sh YAML scenarios.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Scenario directory. Defaults to .roleplay/scenarios.' },
      },
    },
  },
  {
    name: 'list_runs',
    description: 'List local run IDs, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        runsDir: { type: 'string', description: 'Runs directory. Defaults to .roleplay/runs.' },
      },
    },
  },
  {
    name: 'get_latest_report',
    description: 'Read the latest local JSON report.',
    inputSchema: {
      type: 'object',
      properties: {
        runsDir: { type: 'string', description: 'Runs directory. Defaults to .roleplay/runs.' },
      },
    },
  },
  {
    name: 'run_scenario',
    description: 'Run one local scenario and return its report summary.',
    inputSchema: {
      type: 'object',
      required: ['scenario'],
      properties: {
        scenario: { type: 'string', description: 'Scenario path, name, or run-store scenario reference.' },
        maxTurns: { type: 'number' },
        out: { type: 'string', description: 'Runs directory. Defaults to .roleplay/runs.' },
        yes: { type: 'boolean', description: 'Allow CLI target execution when the scenario uses a CLI target.' },
      },
    },
  },
] as const;

export class McpCommand extends BaseCommand {
  static description = 'Start a local MCP server for roleplay.sh scenarios, runs, and reports.';
  static flags = {
    json: Flags.boolean({ description: 'Print MCP server metadata and exit.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(McpCommand);
    if (flags.json) {
      this.log(JSON.stringify({ status: 'ready', protocolVersion, tools: tools.map((tool) => tool.name) }));
      return;
    }

    await startMcpServer();
  }
}

async function startMcpServer() {
  const parser = new McpFrameParser(async (message) => {
    const response = await handleMessage(message);
    if (response) writeFrame(response);
  });

  for await (const chunk of process.stdin) {
    await parser.push(chunk);
  }
}

async function handleMessage(message: JsonRpcRequest) {
  const id = message.id;
  try {
    if (message.method === 'initialize') {
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'roleplay.sh', version: '0.1.0' },
      });
    }
    if (message.method === 'notifications/initialized') return undefined;
    if (message.method === 'tools/list') return rpcResult(id, { tools });
    if (message.method === 'tools/call') return rpcResult(id, await callTool(message.params));
    if (id === undefined) return undefined;
    return rpcError(id, -32601, publicErrorMessage);
  } catch (error) {
    if (id === undefined) return undefined;
    const appError = toAppError(error);
    const publicError = appError.toPublicError();
    return rpcError(id, -32000, publicErrorMessage, {
      code: publicError.code,
      message: publicError.message,
      reference: publicError.reference,
      supportCta: publicError.supportCta,
    });
  }
}

async function callTool(params: unknown) {
  const record = requireRecord(params, 'tools/call params');
  const name = requireString(record.name, 'tool name');
  const args = optionalRecord(record.arguments) ?? {};

  if (name === 'list_scenarios') {
    const root = optionalString(args.root) ?? '.roleplay/scenarios';
    return toolJson({ scenarios: await listScenarioFiles(root) });
  }
  if (name === 'list_runs') {
    const runsDir = optionalString(args.runsDir) ?? '.roleplay/runs';
    const runs = await import('../core/run-store.js').then((module) => module.listRunIds(runsDir));
    return toolJson({ runs });
  }
  if (name === 'get_latest_report') {
    const runsDir = optionalString(args.runsDir) ?? '.roleplay/runs';
    const runId = await latestRunId(runsDir);
    const report = await readRunReport(runId, runsDir);
    return toolJson({ runId, report });
  }
  if (name === 'run_scenario') {
    const result = await runScenario({
      scenarioRef: requireString(args.scenario, 'scenario'),
      maxTurns: optionalNumber(args.maxTurns),
      outDir: optionalString(args.out),
      yes: optionalBoolean(args.yes),
    });
    return toolJson({
      runId: result.runId,
      scenario: result.scenario.name,
      status: result.report.status,
      score: result.report.score,
      failures: result.report.failures,
      reportPath: result.paths.reportJsonPath,
      markdownPath: result.paths.reportMarkdownPath,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function listScenarioFiles(root: string) {
  if (!(await pathExists(root))) return [];
  const files: string[] = [];
  await visitScenarioDir(root, root, files);
  return files.sort();
}

async function visitScenarioDir(root: string, dir: string, files: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await visitScenarioDir(root, path, files);
    } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      files.push(relative(root, path).replace(/\\/g, '/'));
    }
  }
}

async function readRunReport(runId: string, runsDir: string) {
  const runDir = await resolveRunDir(runId, runsDir);
  return JSON.parse((await fs.readFile(join(runDir, 'report.json'), 'utf8')).replace(/^\uFEFF/, '')) as JsonValue;
}

function writeFrame(value: JsonValue) {
  const body = JSON.stringify(value);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function rpcResult(id: JsonRpcId | undefined, result: JsonValue) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: JsonRpcId | undefined, code: number, message: string, data?: JsonValue) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function toolJson(value: JsonValue) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new Error(`${field} must be an object`);
  return record;
}

function optionalRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requireString(value: unknown, field: string) {
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error(`${field} must be a non-empty string`);
}

function optionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  throw new Error('value must be a string');
}

function optionalNumber(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error('value must be a number');
}

function optionalBoolean(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  throw new Error('value must be a boolean');
}

class McpFrameParser {
  private buffer = Buffer.alloc(0);
  private readonly separator = Buffer.from('\r\n\r\n');

  constructor(private readonly onMessage: (message: JsonRpcRequest) => Promise<void>) {}

  async push(chunk: Buffer | string) {
    this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')]);
    while (true) {
      const headerEnd = this.buffer.indexOf(this.separator);
      if (headerEnd === -1) return;
      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(header);
      if (!lengthMatch) throw new Error('MCP frame missing Content-Length header');
      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;
      const body = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.subarray(bodyEnd);
      await this.onMessage(JSON.parse(body) as JsonRpcRequest);
    }
  }
}

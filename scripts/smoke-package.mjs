import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packDir = mkdtempSync(join(tmpdir(), 'roleplay-pack-'));
const installDir = mkdtempSync(join(tmpdir(), 'roleplay-install-'));
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const execFileAsync = promisify(execFile);
let cloudServer;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: { ...process.env, npm_config_loglevel: 'error', ...options.env },
  });
}

async function runAsync(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'error', ...options.env },
    maxBuffer: 1024 * 1024,
  });
  return result.stdout;
}

function npm(args, options = {}) {
  if (process.platform === 'win32') return run(process.execPath, [npmCli, ...args], options);
  return run('npm', args, options);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

try {
  const packOutput = npm(['pack', '--json', '--pack-destination', packDir]);
  const packInfo = JSON.parse(packOutput)[0];
  if (!packInfo?.filename) throw new Error('npm pack did not return a tarball filename.');

  const files = new Set(packInfo.files.map((file) => file.path));
  const required = [
    'dist/cli.js',
    'dist/index.js',
    'dist/index.d.ts',
    'README.md',
    'LICENSE',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CHANGELOG.md',
    'RELEASE.md',
    '.env.example',
    'examples/scenarios/refund-policy-edge-case.yml',
  ];
  for (const file of required) {
    if (!files.has(file)) throw new Error(`Package tarball is missing ${file}.`);
  }

  const forbidden = ['src/cli.ts', 'tests/cli.run.test.ts', '.github/workflows/ci.yml', '.env'];
  for (const file of forbidden) {
    if (files.has(file)) throw new Error(`Package tarball unexpectedly includes ${file}.`);
  }

  npm(['init', '-y'], { cwd: installDir, stdio: 'ignore' });
  npm(['install', join(packDir, packInfo.filename)], { cwd: installDir, stdio: 'ignore' });

  const installedEnvExample = readFileSync(
    join(installDir, 'node_modules', '@roleplay-sh', 'cli', '.env.example'),
    'utf8',
  );
  for (const expected of [
    'ROLEPLAY_CLOUD_URL=https://app.roleplay.sh',
    'ROLEPLAY_PROJECT_ID=',
    'ROLEPLAY_API_KEY=',
    'ROLEPLAY_AGENT_NAME=',
    'ROLEPLAY_TARGET_URL=http://localhost:3000/agent',
    'ROLEPLAY_TARGET_COMMAND=',
    'ROLEPLAY_LLM_PROVIDER=mock',
    'ROLEPLAY_OPENAI_API_KEY=',
    'ROLEPLAY_ANTHROPIC_API_KEY=',
    'ROLEPLAY_GOOGLE_API_KEY=',
    'ROLEPLAY_LLM_BASE_URL=',
  ]) {
    if (!installedEnvExample.includes(expected)) {
      throw new Error(`Packaged .env.example is missing ${expected}.`);
    }
  }

  const cli = join(installDir, 'node_modules', '@roleplay-sh', 'cli', 'dist', 'cli.js');
  run(process.execPath, [cli, '--help'], { cwd: installDir });
  run(process.execPath, [cli, 'init', '--json'], { cwd: installDir });
  const doctorJson = run(process.execPath, [cli, 'doctor', '--json'], { cwd: installDir });
  const doctor = JSON.parse(doctorJson);
  if (doctor.ok !== true) {
    throw new Error('Expected packaged CLI doctor check to pass after init.');
  }
  const json = run(
    process.execPath,
    [cli, 'run', '.roleplay/scenarios/support-happy-path.yml', '--json'],
    { cwd: installDir },
  );
  const result = JSON.parse(json);
  if (result.status !== 'passed') {
    throw new Error(`Expected packaged CLI smoke run to pass, got ${result.status}.`);
  }

  const uploadRequests = [];
  cloudServer = createServer(async (request, response) => {
    uploadRequests.push({
      url: request.url,
      authorization: request.headers.authorization,
      body: request.method === 'POST' ? await readRequestBody(request) : '',
    });

    if (request.url === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'ok',
          service: 'roleplay.sh Workbench',
          privacy: {
            defaultUploadMode: 'sanitized_findings',
            fullTranscriptUpload: false,
            redactedSnippets: true,
            secretRedaction: true,
          },
        }),
      );
      return;
    }

    if (request.url === '/api/projects/proj_support/api-keys/verify') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          projectId: 'proj_support',
          authenticated: true,
          key: {
            id: 'key_pack_smoke',
            projectId: 'proj_support',
            name: 'Package smoke key',
            preview: 'rpsh_live_...pack',
            createdAt: '2026-06-01',
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

    if (request.url === '/api/uploads') {
      const payload = JSON.parse(uploadRequests.at(-1).body);
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          projectId: payload.projectId,
          runId: payload.run.report.runId,
          runUrl: `/runs?run=${encodeURIComponent(payload.run.report.runId)}&project=${encodeURIComponent(payload.projectId)}`,
          findingsUploaded: payload.run.report.failures.length,
          mode: payload.mode,
        }),
      );
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await listen(cloudServer);
  const endpoint = `http://127.0.0.1:${cloudServer.address().port}`;
  const doctorCloudJson = await runAsync(process.execPath, [cli, 'doctor', '--cloud', '--cloud-url', endpoint, '--json'], {
    cwd: installDir,
    env: {
      ROLEPLAY_PROJECT_ID: 'proj_support',
      ROLEPLAY_API_KEY: 'rpsh_live_pack_smoke',
      FORCE_COLOR: '0',
    },
  });
  const doctorCloud = JSON.parse(doctorCloudJson);
  if (doctorCloud.ok !== true) {
    throw new Error('Expected packaged CLI doctor --cloud check to pass with package smoke server.');
  }

  const uploadJson = await runAsync(
    process.execPath,
    [
      cli,
      'upload',
      'latest',
      '--endpoint',
      endpoint,
      '--api-key',
      'rpsh_live_pack_smoke',
      '--project',
      'proj_support',
      '--source',
      'ci',
      '--json',
    ],
    { cwd: installDir },
  );
  const upload = JSON.parse(uploadJson);
  const verifyRequest = uploadRequests.find((request) => request.url === '/api/projects/proj_support/api-keys/verify');
  const uploadRequest = uploadRequests.find((request) => request.url === '/api/uploads');
  if (!verifyRequest || !uploadRequest) throw new Error('Packaged CLI did not verify credentials and upload evidence.');
  const uploadPayload = JSON.parse(uploadRequest.body);

  if (verifyRequest.authorization !== 'Bearer rpsh_live_pack_smoke') {
    throw new Error('Packaged CLI did not send the expected API key during credential verification.');
  }
  if (uploadRequest.authorization !== 'Bearer rpsh_live_pack_smoke') {
    throw new Error('Packaged CLI did not send the expected API key during upload.');
  }
  if (upload.projectId !== 'proj_support' || upload.mode !== 'sanitized_findings') {
    throw new Error('Packaged CLI upload response did not match the requested project and mode.');
  }
  if (!upload.runUrl.startsWith(`${endpoint}/runs?run=`)) {
    throw new Error('Packaged CLI did not return an absolute cloud workbench run URL.');
  }
  if (uploadPayload.run.transcript || uploadPayload.run.scenarioYaml || uploadPayload.run.metadata) {
    throw new Error('Packaged CLI leaked full evidence during sanitized upload.');
  }

  console.log(`Package smoke test passed: ${packInfo.filename}`);
} finally {
  if (cloudServer?.listening) await close(cloudServer);
  rmSync(packDir, { recursive: true, force: true });
  rmSync(installDir, { recursive: true, force: true });
}

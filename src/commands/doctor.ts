import { Flags } from '@oclif/core';
import { access, constants } from 'node:fs/promises';
import chalk from 'chalk';
import { BaseCommand } from './base.js';
import { verifyCloudCredentials } from '../cloud/upload-client.js';
import { pathExists } from '../utils/fs.js';

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

interface CloudHealthResponse {
  status?: string;
  service?: string;
  privacy?: {
    defaultUploadMode?: string;
    fullTranscriptUpload?: boolean;
    redactedSnippets?: boolean;
    secretRedaction?: boolean;
  };
}

export class DoctorCommand extends BaseCommand {
  static description = 'Check local roleplay.sh setup.';
  static flags = {
    json: Flags.boolean({ description: 'Output JSON only.' }),
    cloud: Flags.boolean({ description: 'Check workbench connectivity through /api/health.' }),
    'cloud-url': Flags.string({
      description: 'workbench base URL.',
      default: process.env.ROLEPLAY_CLOUD_URL ?? 'http://127.0.0.1:3000',
    }),
    project: Flags.string({
      description: 'workbench project ID for API-key verification. Defaults to ROLEPLAY_PROJECT_ID.',
      default: process.env.ROLEPLAY_PROJECT_ID,
    }),
    'api-key': Flags.string({
      description: 'workbench API key for credential verification. Defaults to ROLEPLAY_API_KEY.',
      default: process.env.ROLEPLAY_API_KEY,
    }),
    provider: Flags.string({
      options: ['mock', 'openai', 'anthropic', 'google', 'openai-compatible'],
      description: 'Attacker provider to check for real adaptive runs. Defaults to ROLEPLAY_LLM_PROVIDER.',
      default: process.env.ROLEPLAY_LLM_PROVIDER,
    }),
    judge: Flags.string({
      options: ['rules', 'semantic', 'hybrid'],
      description: 'Judge mode to check. Defaults to ROLEPLAY_JUDGE_MODE.',
      default: process.env.ROLEPLAY_JUDGE_MODE,
    }),
    'judge-provider': Flags.string({
      options: ['mock', 'openai', 'anthropic', 'google', 'openai-compatible'],
      description: 'Judge provider to check for semantic or hybrid judging. Defaults to ROLEPLAY_JUDGE_PROVIDER or --provider.',
      default: process.env.ROLEPLAY_JUDGE_PROVIDER,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DoctorCommand);
    const checks: DoctorCheck[] = [
      { name: 'node >=20', ok: Number(process.versions.node.split('.')[0]) >= 20 },
      { name: '.roleplay exists', ok: await pathExists('.roleplay') },
      { name: '.roleplay/scenarios exists', ok: await pathExists('.roleplay/scenarios') },
      { name: '.roleplay/runs writable', ok: await writable('.roleplay/runs') },
    ];

    if (flags.cloud) {
      checks.push(await checkCloudHealth(flags['cloud-url']));
      if (flags.project || flags['api-key']) {
        checks.push(await checkCloudCredentials(flags['cloud-url'], flags.project, flags['api-key']));
        checks.push(checkProviderKey('attacker provider key', flags.provider));
        checks.push(checkJudgeReadiness(flags.judge, flags['judge-provider'] ?? flags.provider));
      }
    }

    if (flags.json) {
      this.log(JSON.stringify({ checks, ok: checks.every((check) => check.ok) }));
      return;
    }

    for (const check of checks) {
      const detail = check.detail ? chalk.gray(` - ${check.detail}`) : '';
      this.log(`${check.ok ? chalk.green('ok') : chalk.red('fail')} ${check.name}${detail}`);
    }
  }
}

async function checkCloudHealth(cloudUrl: string): Promise<DoctorCheck> {
  const endpoint = `${cloudUrl.replace(/\/+$/, '')}/api/health`;

  try {
    const response = await fetch(endpoint);
    const body = (await response.json().catch(() => undefined)) as CloudHealthResponse | undefined;
    if (response.ok && body?.status === 'ok') {
      return {
        name: 'workbench health',
        ok: true,
        detail: cloudHealthDetail(body, endpoint),
      };
    }

    return {
      name: 'workbench health',
      ok: false,
      detail: `HTTP ${response.status} from ${endpoint}`,
    };
  } catch (error) {
    return {
      name: 'workbench health',
      ok: false,
      detail: error instanceof Error ? error.message : `Could not reach ${endpoint}`,
    };
  }
}

async function checkCloudCredentials(
  cloudUrl: string,
  projectId: string | undefined,
  apiKey: string | undefined,
): Promise<DoctorCheck> {
  const normalizedProjectId = projectId?.trim();
  const normalizedApiKey = apiKey?.trim();
  if (!normalizedProjectId || !normalizedApiKey) {
    return {
      name: 'workbench API key',
      ok: false,
      detail: 'ROLEPLAY_PROJECT_ID/--project and ROLEPLAY_API_KEY/--api-key are both required for credential verification',
    };
  }

  try {
    const verification = await verifyCloudCredentials({
      endpoint: cloudUrl,
      projectId: normalizedProjectId,
      apiKey: normalizedApiKey,
    });
    const policy = verification.uploadPolicy;
    const entitlement = verification.entitlement;
    const access = entitlement.canRun && entitlement.canUpload;
    return {
      name: 'workbench API key',
      ok: access,
      detail: access
        ? `${verification.key.name} (${verification.key.preview}) can run and upload to ${verification.projectId} with ${policy.mode}, ${policy.retentionDays}d retention`
        : `subscription ${entitlement.status}; open billing to start or resume Builder/Team access`,
    };
  } catch (error) {
    return {
      name: 'workbench API key',
      ok: false,
      detail: error instanceof Error ? error.message : 'Could not verify workbench API key',
    };
  }
}

function checkProviderKey(name: string, provider: string | undefined): DoctorCheck {
  if (!provider || provider === 'mock') {
    return {
      name,
      ok: false,
      detail: 'choose a provider for real agent tests; mock is only for install smoke tests',
    };
  }

  const envName = providerKeyEnv(provider);
  const ok = Boolean(envName && process.env[envName]?.trim());
  return {
    name,
    ok,
    detail: ok
      ? `${envName} is configured for real adaptive runs`
      : `set ${envName ?? 'ROLEPLAY_LLM_API_KEY'} before running real adaptive tests`,
  };
}

function checkJudgeReadiness(mode: string | undefined, provider: string | undefined): DoctorCheck {
  if (!mode) {
    return {
      name: 'judge mode',
      ok: false,
      detail: 'set ROLEPLAY_JUDGE_MODE=semantic or hybrid for real tests; use rules only for smoke/offline checks',
    };
  }

  if (mode === 'rules') {
    return {
      name: 'judge mode',
      ok: true,
      detail: 'rules judge is available locally; add --allow-rules-only if using it for real targets',
    };
  }

  if (mode !== 'semantic' && mode !== 'hybrid') {
    return {
      name: 'judge mode',
      ok: false,
      detail: 'use rules, semantic, or hybrid',
    };
  }

  const providerCheck = checkProviderKey('judge provider key', provider);
  return {
    name: 'judge readiness',
    ok: providerCheck.ok,
    detail: providerCheck.ok
      ? `${mode} judging is ready`
      : `${mode} judging needs ${providerCheck.detail}`,
  };
}

function providerKeyEnv(provider: string) {
  if (provider === 'openai') return 'ROLEPLAY_OPENAI_API_KEY';
  if (provider === 'anthropic') return 'ROLEPLAY_ANTHROPIC_API_KEY';
  if (provider === 'google') return 'ROLEPLAY_GOOGLE_API_KEY';
  if (provider === 'openai-compatible') return 'ROLEPLAY_LLM_API_KEY';
  return undefined;
}

function cloudHealthDetail(body: CloudHealthResponse, endpoint: string): string {
  const service = body.service ?? 'workbench';
  const privacy = body.privacy;
  if (!privacy) return `${service} at ${endpoint}`;

  const mode = privacy.defaultUploadMode ?? (privacy.fullTranscriptUpload ? 'full_transcript_opt_in' : 'sanitized_findings');
  const safeguards = [
    privacy.redactedSnippets === false ? 'redacted snippets off' : 'redacted snippets on',
    privacy.secretRedaction === false ? 'secret redaction off' : 'secret redaction on',
  ].join(', ');
  return `${service} at ${endpoint} - upload mode ${mode}, ${safeguards}`;
}

async function writable(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

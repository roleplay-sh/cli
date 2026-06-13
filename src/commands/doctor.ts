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
    cloud: Flags.boolean({ description: 'Check cloud workbench connectivity through /api/health.' }),
    'cloud-url': Flags.string({
      description: 'cloud workbench base URL.',
      default: process.env.ROLEPLAY_CLOUD_URL ?? 'http://127.0.0.1:3000',
    }),
    project: Flags.string({
      description: 'cloud workbench project ID for API-key verification. Defaults to ROLEPLAY_PROJECT_ID.',
      default: process.env.ROLEPLAY_PROJECT_ID,
    }),
    'api-key': Flags.string({
      description: 'cloud workbench API key for credential verification. Defaults to ROLEPLAY_API_KEY.',
      default: process.env.ROLEPLAY_API_KEY,
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
        name: 'cloud workbench health',
        ok: true,
        detail: cloudHealthDetail(body, endpoint),
      };
    }

    return {
      name: 'cloud workbench health',
      ok: false,
      detail: `HTTP ${response.status} from ${endpoint}`,
    };
  } catch (error) {
    return {
      name: 'cloud workbench health',
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
      name: 'cloud workbench API key',
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
    return {
      name: 'cloud workbench API key',
      ok: true,
      detail: `${verification.key.name} (${verification.key.preview}) can upload to ${verification.projectId} with ${policy.mode}, ${policy.retentionDays}d retention`,
    };
  } catch (error) {
    return {
      name: 'cloud workbench API key',
      ok: false,
      detail: error instanceof Error ? error.message : 'Could not verify cloud workbench API key',
    };
  }
}

function cloudHealthDetail(body: CloudHealthResponse, endpoint: string): string {
  const service = body.service ?? 'cloud workbench';
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

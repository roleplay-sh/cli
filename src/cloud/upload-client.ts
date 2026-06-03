import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../core/errors.js';
import { resolveRunDir } from '../core/run-store.js';
import { reportSchema } from '../schemas/report.schema.js';
import { transcriptSchema } from '../schemas/transcript.schema.js';
import { cloudUploadSchema, type CloudUpload, type UploadMode } from '../schemas/cloud-upload.schema.js';
import { pathExists } from '../utils/fs.js';

export interface BuildUploadPayloadInput {
  run: string;
  runsDir?: string;
  projectId: string;
  mode: UploadMode;
  source: 'ci' | 'local' | 'scheduled';
  branch?: string;
  commit?: string;
  buildUrl?: string;
  environment?: string;
  targetAgent?: string;
}

export interface UploadResponse {
  projectId: string;
  runId: string;
  runUrl?: string;
  findingsUploaded: number;
  mode: UploadMode;
}

export interface CloudCredentialVerification {
  projectId: string;
  authenticated: true;
  key: {
    id: string;
    projectId?: string;
    name: string;
    preview: string;
    createdAt: string;
    lastUsedAt?: string;
  };
  uploadPolicy: {
    mode: UploadMode;
    transcriptUpload: boolean;
    redactedSnippets: boolean;
    secretRedaction: boolean;
    retentionDays: number;
  };
}

export function requireUploadApiKey(apiKey: string | undefined): string {
  const normalized = apiKey?.trim();
  if (normalized) return normalized;

  throw new AppError({
    code: 'UPLOAD_API_KEY_REQUIRED',
    message: 'ROLEPLAY_API_KEY or --api-key is required to upload to Team Cloud.',
    suggestion: 'Create or copy a project API key from CI & Uploads, then pass --api-key or set ROLEPLAY_API_KEY.',
    exitCode: 1,
  });
}

export function requireUploadProjectId(projectId: string | undefined): string {
  const normalized = projectId?.trim();
  if (normalized) return normalized;

  throw new AppError({
    code: 'UPLOAD_PROJECT_REQUIRED',
    message: 'ROLEPLAY_PROJECT_ID or --project is required to upload to Team Cloud.',
    suggestion: 'Copy the project ID from CI & Uploads, then pass --project or set ROLEPLAY_PROJECT_ID.',
    exitCode: 1,
  });
}

export async function buildUploadPayload(input: BuildUploadPayloadInput): Promise<CloudUpload> {
  const runDir = await resolveRunDir(input.run, input.runsDir);
  const reportPath = join(runDir, 'report.json');
  const transcriptPath = join(runDir, 'transcript.json');
  const scenarioPath = join(runDir, 'scenario.yml');
  const metadataPath = join(runDir, 'metadata.json');
  const includeFullEvidence = input.mode === 'full_transcript_opt_in';

  const report = reportSchema.parse(await readJsonArtifact(reportPath));
  const hasTranscript = await pathExists(transcriptPath);
  if (includeFullEvidence && !hasTranscript) {
    throw new AppError({
      code: 'UPLOAD_TRANSCRIPT_REQUIRED',
      message: 'Full transcript upload was requested, but transcript.json was not found for this run.',
      suggestion: 'Run a scenario again to generate transcript.json, or use --mode sanitized_findings.',
      filePath: transcriptPath,
      exitCode: 1,
    });
  }
  const transcript =
    includeFullEvidence && hasTranscript
      ? transcriptSchema.parse(await readJsonArtifact(transcriptPath))
      : undefined;
  const scenarioYaml = includeFullEvidence && (await pathExists(scenarioPath)) ? await fs.readFile(scenarioPath, 'utf8') : undefined;
  const localMetadata = (await pathExists(metadataPath)) ? await readJsonArtifact(metadataPath) : undefined;
  const metadata = includeFullEvidence ? localMetadata : undefined;
  const safeMetadata = safeUploadMetadata(localMetadata);

  const payload = {
    projectId: input.projectId,
    mode: input.mode,
    source: input.source,
    branch: input.branch,
    commit: input.commit,
    buildUrl: input.buildUrl,
    environment: input.environment,
    targetAgent: input.targetAgent,
    attackPackId: safeMetadata.attackPackId,
    attackPackScenario: safeMetadata.attackPackScenario,
    run: {
      report,
      transcript,
      scenarioYaml,
      metadata,
    },
  };

  return cloudUploadSchema.parse(payload);
}

function safeUploadMetadata(metadata: unknown): { attackPackId?: string; attackPackScenario?: string } {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const record = metadata as Record<string, unknown>;
  return {
    attackPackId: typeof record.attackPackId === 'string' ? record.attackPackId : undefined,
    attackPackScenario: typeof record.attackPackScenario === 'string' ? record.attackPackScenario : undefined,
  };
}

export async function uploadToCloud(input: {
  endpoint: string;
  apiKey?: string;
  payload: CloudUpload;
}): Promise<UploadResponse> {
  const endpoint = normalizeCloudEndpoint(input.endpoint);
  let response: Response;
  try {
    response = await fetch(`${endpoint}/api/uploads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify(input.payload),
    });
  } catch (error) {
    throw new AppError({
      code: 'UPLOAD_FAILED',
      message: `Could not reach Team Cloud at ${endpoint}.`,
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_API_KEY, and that Team Cloud is running.',
      cause: error,
      exitCode: 1,
    });
  }

  const body = (await response.json().catch(() => undefined)) as UploadResponse | { error?: string };
  if (!response.ok) {
    throw new AppError({
      code: 'UPLOAD_FAILED',
      message:
        body && 'error' in body && body.error
          ? body.error
          : `Cloud upload failed with HTTP ${response.status}.`,
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_API_KEY, and that Team Cloud is running.',
      exitCode: 1,
    });
  }

  const uploadResponse = parseUploadResponse(body);
  assertUploadResponseMatchesPayload(uploadResponse, input.payload);
  return {
    ...uploadResponse,
    runUrl: uploadResponse.runUrl ? absoluteCloudUrl(endpoint, uploadResponse.runUrl) : undefined,
  };
}

export async function verifyCloudCredentials(input: {
  endpoint: string;
  projectId: string;
  apiKey?: string;
}): Promise<CloudCredentialVerification> {
  const endpoint = normalizeCloudEndpoint(input.endpoint);
  const projectId = input.projectId.trim();
  let response: Response;
  try {
    response = await fetch(`${endpoint}/api/projects/${encodeURIComponent(projectId)}/api-keys/verify`, {
      method: 'POST',
      headers: {
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      },
    });
  } catch (error) {
    throw new AppError({
      code: 'UPLOAD_CREDENTIALS_FAILED',
      message: `Could not reach Team Cloud at ${endpoint}.`,
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_PROJECT_ID, ROLEPLAY_API_KEY, and that Team Cloud is running.',
      cause: error,
      exitCode: 1,
    });
  }

  const body = (await response.json().catch(() => undefined)) as CloudCredentialVerification | { error?: string };
  if (!response.ok) {
    throw new AppError({
      code: 'UPLOAD_CREDENTIALS_FAILED',
      message:
        body && 'error' in body && body.error
          ? body.error
          : `Cloud API key verification failed with HTTP ${response.status}.`,
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_PROJECT_ID, ROLEPLAY_API_KEY, and that Team Cloud is running.',
      exitCode: 1,
    });
  }

  const verification = parseCredentialVerification(body);
  assertCredentialVerificationMatchesRequest(verification, projectId);
  return verification;
}

function parseUploadResponse(body: UploadResponse | { error?: string } | undefined): UploadResponse {
  const candidate = body as Partial<UploadResponse> | undefined;
  const runUrl = candidate?.runUrl;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof candidate.projectId === 'string' &&
    typeof candidate.runId === 'string' &&
    Number.isInteger(candidate.findingsUploaded) &&
    Number(candidate.findingsUploaded) >= 0 &&
    (candidate.mode === 'sanitized_findings' || candidate.mode === 'full_transcript_opt_in') &&
    (runUrl === undefined || (typeof runUrl === 'string' && isRelativeCloudPath(runUrl)))
  ) {
    return candidate as UploadResponse;
  }

  throw new AppError({
    code: 'UPLOAD_RESPONSE_INVALID',
    message: 'Team Cloud returned an invalid upload response.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh Team Cloud backend.',
    exitCode: 1,
  });
}

function parseCredentialVerification(
  body: CloudCredentialVerification | { error?: string } | undefined,
): CloudCredentialVerification {
  const candidate = body as Partial<CloudCredentialVerification> | undefined;
  const key = candidate?.key;
  const policy = candidate?.uploadPolicy;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof candidate.projectId === 'string' &&
    candidate.authenticated === true &&
    key &&
    typeof key === 'object' &&
    typeof key.id === 'string' &&
    typeof key.name === 'string' &&
    typeof key.preview === 'string' &&
    typeof key.createdAt === 'string' &&
    policy &&
    typeof policy === 'object' &&
    (policy.mode === 'sanitized_findings' || policy.mode === 'full_transcript_opt_in') &&
    typeof policy.transcriptUpload === 'boolean' &&
    typeof policy.redactedSnippets === 'boolean' &&
    typeof policy.secretRedaction === 'boolean' &&
    Number.isInteger(policy.retentionDays) &&
    policy.retentionDays > 0
  ) {
    return candidate as CloudCredentialVerification;
  }

  throw new AppError({
    code: 'UPLOAD_CREDENTIALS_INVALID',
    message: 'Team Cloud returned an invalid API key verification response.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh Team Cloud backend.',
    exitCode: 1,
  });
}

function assertUploadResponseMatchesPayload(response: UploadResponse, payload: CloudUpload) {
  if (
    response.projectId === payload.projectId &&
    response.runId === payload.run.report.runId &&
    response.mode === payload.mode
  ) {
    return;
  }

  throw new AppError({
    code: 'UPLOAD_RESPONSE_INVALID',
    message: 'Team Cloud upload response did not match the requested project, run, or mode.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh Team Cloud backend.',
    exitCode: 1,
  });
}

function assertCredentialVerificationMatchesRequest(response: CloudCredentialVerification, projectId: string) {
  if (response.projectId === projectId && (!response.key.projectId || response.key.projectId === projectId)) {
    return;
  }

  throw new AppError({
    code: 'UPLOAD_CREDENTIALS_INVALID',
    message: 'Team Cloud API key verification response did not match the requested project.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh Team Cloud backend.',
    exitCode: 1,
  });
}

function normalizeCloudEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, '');
}

function absoluteCloudUrl(endpoint: string, pathOrUrl: string): string {
  return new URL(pathOrUrl, `${endpoint}/`).toString();
}

function isRelativeCloudPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//');
}

async function readJsonArtifact(path: string): Promise<unknown> {
  const contents = await fs.readFile(path, 'utf8');
  return JSON.parse(contents.replace(/^\uFEFF/, ''));
}

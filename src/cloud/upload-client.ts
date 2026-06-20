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
  entitlement: {
    plan: 'builder' | 'team';
    status: 'trialing' | 'active' | 'past_due' | 'canceled';
    canRun: boolean;
    canUpload: boolean;
  };
}

export interface AttackPackBundleTarget {
  type: 'mock' | 'http' | 'cli';
  url?: string;
  command?: string;
}

export interface AttackPackBundle {
  packId: string;
  packSlug: string;
  version: string;
  scenarios: Array<{
    id: string;
    name: string;
    yaml: string;
    metadata: {
      attackPackId: string;
      attackPackScenario: string;
      regressionKey?: string;
      businessBoundary?: string;
      verticalPack?: string;
    };
  }>;
}

export function requireUploadApiKey(apiKey: string | undefined): string {
  const normalized = apiKey?.trim();
  if (normalized) return normalized;

  throw new AppError({
    code: 'UPLOAD_API_KEY_REQUIRED',
    message: 'ROLEPLAY_API_KEY or --api-key is required to upload to the workbench.',
    suggestion: 'Create or copy a project API key from CI Gate, then pass --api-key or set ROLEPLAY_API_KEY.',
    exitCode: 1,
  });
}

export function requireUploadProjectId(projectId: string | undefined): string {
  const normalized = projectId?.trim();
  if (normalized) return normalized;

  throw new AppError({
    code: 'UPLOAD_PROJECT_REQUIRED',
    message: 'ROLEPLAY_PROJECT_ID or --project is required to upload to the workbench.',
    suggestion: 'Copy the project ID from CI Gate, then pass --project or set ROLEPLAY_PROJECT_ID.',
    exitCode: 1,
  });
}

export function requireRunApiKey(apiKey: string | undefined): string {
  const normalized = apiKey?.trim();
  if (normalized) return normalized;

  throw new AppError({
    code: 'WORKBENCH_API_KEY_REQUIRED',
    message: 'A Builder or Team subscription is required to run real agent tests.',
    suggestion:
      'Get started at https://app.roleplay.sh/auth/create-workspace, then set ROLEPLAY_PROJECT_ID and ROLEPLAY_API_KEY.',
    exitCode: 1,
  });
}

export function requireRunProjectId(projectId: string | undefined): string {
  const normalized = projectId?.trim();
  if (normalized) return normalized;

  throw new AppError({
    code: 'WORKBENCH_PROJECT_REQUIRED',
    message: 'A Builder or Team subscription is required to run real agent tests.',
    suggestion:
      'Get started at https://app.roleplay.sh/auth/create-workspace, then set ROLEPLAY_PROJECT_ID and ROLEPLAY_API_KEY.',
    exitCode: 1,
  });
}

export async function assertRunEntitlement(input: {
  endpoint: string;
  projectId: string;
  apiKey: string;
}): Promise<CloudCredentialVerification> {
  const verification = await verifyCloudCredentials(input);
  if (verification.entitlement.canRun) return verification;

  throw inactiveSubscriptionError();
}

export async function assertUploadEntitlement(input: {
  endpoint: string;
  projectId: string;
  apiKey: string;
}): Promise<CloudCredentialVerification> {
  const verification = await verifyCloudCredentials(input);
  if (verification.entitlement.canUpload) return verification;

  throw inactiveSubscriptionError();
}

export async function buildUploadPayload(input: BuildUploadPayloadInput): Promise<CloudUpload> {
  const runDir = await resolveRunDir(input.run, input.runsDir);
  const reportPath = join(runDir, 'report.json');
  const transcriptPath = join(runDir, 'transcript.json');
  const scenarioPath = join(runDir, 'scenario.yml');
  const metadataPath = join(runDir, 'metadata.json');
  const includeFullEvidence = input.mode === 'full_transcript_opt_in';

  const reportArtifact = await readJsonArtifact(reportPath);
  const report = reportSchema.parse(reportArtifact);
  const localMetadataPromise = readOptionalJsonArtifact(metadataPath);

  let transcript;
  let scenarioYaml;
  if (includeFullEvidence) {
    const [transcriptArtifact, scenarioArtifact] = await Promise.all([
      readRequiredTranscriptArtifact(transcriptPath),
      readOptionalTextArtifact(scenarioPath),
    ]);
    transcript = transcriptSchema.parse(transcriptArtifact);
    scenarioYaml = scenarioArtifact;
  }

  const localMetadata = await localMetadataPromise;
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
      message: `Could not reach workbench at ${endpoint}.`,
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_API_KEY, and that workbench is running.',
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
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_API_KEY, and that workbench is running.',
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
      message: `Could not reach workbench at ${endpoint}.`,
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_PROJECT_ID, ROLEPLAY_API_KEY, and that workbench is running.',
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
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_PROJECT_ID, ROLEPLAY_API_KEY, and that workbench is running.',
      exitCode: 1,
    });
  }

  const verification = parseCredentialVerification(body);
  assertCredentialVerificationMatchesRequest(verification, projectId);
  return verification;
}

export async function fetchAttackPackBundle(input: {
  endpoint: string;
  projectId: string;
  apiKey: string;
  packId: string;
  target: AttackPackBundleTarget;
  judgeMode?: 'rules' | 'semantic' | 'hybrid';
}): Promise<AttackPackBundle> {
  const endpoint = normalizeCloudEndpoint(input.endpoint);
  const projectId = input.projectId.trim();
  let response: Response;
  try {
    response = await fetch(
      `${endpoint}/api/projects/${encodeURIComponent(projectId)}/attack-packs/${encodeURIComponent(input.packId)}/bundle`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          target: input.target,
          judgeMode: input.judgeMode,
        }),
      },
    );
  } catch (error) {
    throw new AppError({
      code: 'ATTACK_PACK_BUNDLE_FAILED',
      message: `Could not fetch the private attack pack from workbench at ${endpoint}.`,
      suggestion: 'Check ROLEPLAY_CLOUD_URL, ROLEPLAY_PROJECT_ID, ROLEPLAY_API_KEY, and your network connection.',
      cause: error,
      exitCode: 1,
    });
  }

  const body = (await response.json().catch(() => undefined)) as AttackPackBundle | { error?: string } | undefined;
  if (!response.ok) {
    throw new AppError({
      code: 'ATTACK_PACK_BUNDLE_FAILED',
      message:
        body && 'error' in body && body.error
          ? body.error
          : `Private attack-pack fetch failed with HTTP ${response.status}.`,
      suggestion: 'Check that your project API key has active Builder or Team access.',
      exitCode: 1,
    });
  }

  return parseAttackPackBundle(body);
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
    message: 'workbench returned an invalid upload response.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh workbench backend.',
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
    candidate.entitlement &&
    typeof candidate.entitlement === 'object' &&
    (candidate.entitlement.plan === 'builder' || candidate.entitlement.plan === 'team') &&
    ['trialing', 'active', 'past_due', 'canceled'].includes(String(candidate.entitlement.status)) &&
    typeof candidate.entitlement.canRun === 'boolean' &&
    typeof candidate.entitlement.canUpload === 'boolean' &&
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
    message: 'workbench returned an invalid API key verification response.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh workbench backend.',
    exitCode: 1,
  });
}

function parseAttackPackBundle(body: AttackPackBundle | { error?: string } | undefined): AttackPackBundle {
  const candidate = body as Partial<AttackPackBundle> | undefined;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof candidate.packId === 'string' &&
    typeof candidate.packSlug === 'string' &&
    typeof candidate.version === 'string' &&
    Array.isArray(candidate.scenarios) &&
    candidate.scenarios.length > 0 &&
    candidate.scenarios.every(isAttackPackBundleScenario)
  ) {
    return candidate as AttackPackBundle;
  }

  throw new AppError({
    code: 'ATTACK_PACK_BUNDLE_INVALID',
    message: 'workbench returned an invalid private attack-pack bundle.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh workbench backend.',
    exitCode: 1,
  });
}

function isAttackPackBundleScenario(value: unknown): value is AttackPackBundle['scenarios'][number] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scenario = value as Partial<AttackPackBundle['scenarios'][number]>;
  const metadata = scenario.metadata;
  return (
    typeof scenario.id === 'string' &&
    typeof scenario.name === 'string' &&
    typeof scenario.yaml === 'string' &&
    Boolean(scenario.yaml.trim()) &&
    Boolean(metadata) &&
    typeof metadata === 'object' &&
    typeof metadata.attackPackId === 'string' &&
    typeof metadata.attackPackScenario === 'string' &&
    (metadata.regressionKey === undefined || typeof metadata.regressionKey === 'string') &&
    (metadata.businessBoundary === undefined || typeof metadata.businessBoundary === 'string') &&
    (metadata.verticalPack === undefined || typeof metadata.verticalPack === 'string')
  );
}

function inactiveSubscriptionError(): AppError {
  return new AppError({
    code: 'WORKBENCH_SUBSCRIPTION_INACTIVE',
    message: 'Your workspace subscription is not active.',
    suggestion: 'Open billing to start or resume Builder/Team access: https://app.roleplay.sh/billing',
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
    message: 'workbench upload response did not match the requested project, run, or mode.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh workbench backend.',
    exitCode: 1,
  });
}

function assertCredentialVerificationMatchesRequest(response: CloudCredentialVerification, projectId: string) {
  if (response.projectId === projectId && (!response.key.projectId || response.key.projectId === projectId)) {
    return;
  }

  throw new AppError({
    code: 'UPLOAD_CREDENTIALS_INVALID',
    message: 'workbench API key verification response did not match the requested project.',
    suggestion: 'Check that ROLEPLAY_CLOUD_URL points to a compatible roleplay.sh workbench backend.',
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

async function readOptionalJsonArtifact(path: string): Promise<unknown | undefined> {
  return pathExists(path).then((exists) => (exists ? readJsonArtifact(path) : undefined));
}

async function readOptionalTextArtifact(path: string): Promise<string | undefined> {
  return pathExists(path).then((exists) => (exists ? fs.readFile(path, 'utf8') : undefined));
}

async function readRequiredTranscriptArtifact(path: string): Promise<unknown> {
  if (await pathExists(path)) return readJsonArtifact(path);

  throw new AppError({
    code: 'UPLOAD_TRANSCRIPT_REQUIRED',
    message: 'Full transcript upload was requested, but transcript.json was not found for this run.',
    suggestion: 'Run a scenario again to generate transcript.json, or use --mode sanitized_findings.',
    filePath: path,
    exitCode: 1,
  });
}

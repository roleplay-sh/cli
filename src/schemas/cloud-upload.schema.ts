import { z } from 'zod';
import { reportSchema } from './report.schema.js';
import { transcriptSchema } from './transcript.schema.js';

export const uploadModeSchema = z.enum(['sanitized_findings', 'full_transcript_opt_in']);
const requiredUploadMetadata = (field: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, `${field} is required`);
const optionalUploadMetadata = (field: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, `${field} must be a non-empty string`)
    .optional();
const optionalUploadUrl = (field: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .url(`${field} must be a valid URL`)
        .refine((value) => {
          try {
            const parsed = new URL(value);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
          } catch {
            return false;
          }
        }, `${field} must be a valid URL`),
    )
    .optional();

export const cloudUploadSchema = z.object({
  projectId: requiredUploadMetadata('projectId'),
  mode: uploadModeSchema.default('sanitized_findings'),
  source: z.enum(['ci', 'local', 'scheduled']).default('local'),
  branch: optionalUploadMetadata('branch'),
  commit: optionalUploadMetadata('commit'),
  buildUrl: optionalUploadUrl('buildUrl'),
  environment: optionalUploadMetadata('environment'),
  targetAgent: optionalUploadMetadata('targetAgent'),
  attackPackId: optionalUploadMetadata('attackPackId'),
  attackPackScenario: optionalUploadMetadata('attackPackScenario'),
  run: z.object({
    report: reportSchema,
    transcript: transcriptSchema.optional(),
    scenarioYaml: z.string().optional(),
    metadata: z.unknown().optional(),
  }).strict(),
}).strict().superRefine((payload, context) => {
  const startedAt = new Date(payload.run.report.startedAt);
  const endedAt = new Date(payload.run.report.endedAt);
  if (Number.isNaN(startedAt.getTime())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'report', 'startedAt'],
      message: 'run.report.startedAt must be a valid date',
    });
  }
  if (Number.isNaN(endedAt.getTime())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'report', 'endedAt'],
      message: 'run.report.endedAt must be a valid date',
    });
  }
  if (!Number.isNaN(startedAt.getTime()) && !Number.isNaN(endedAt.getTime()) && endedAt.getTime() < startedAt.getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'report', 'endedAt'],
      message: 'run.report.endedAt must be after or equal to run.report.startedAt',
    });
  }
  if (payload.run.report.status === 'passed' && payload.run.report.failures.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'report', 'failures'],
      message: 'run.report.failures must be empty when status is passed',
    });
  }
  if (
    (payload.run.report.status === 'failed' || payload.run.report.status === 'warning') &&
    payload.run.report.failures.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'report', 'failures'],
      message: 'run.report.failures must include at least one finding when status is failed or warning',
    });
  }
  const failureSignatures = new Set<string>();
  for (const failure of payload.run.report.failures) {
    const signature = `${failure.type.trim().toLowerCase()}:${failure.severity}:${failure.message.trim().toLowerCase()}`;
    if (failureSignatures.has(signature)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['run', 'report', 'failures'],
        message: 'run.report.failures must not contain duplicate findings',
      });
      break;
    }
    failureSignatures.add(signature);
  }
  if (payload.mode === 'full_transcript_opt_in') {
    if (!payload.run.transcript) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['run', 'transcript'],
        message: 'run.transcript is required for full_transcript_opt_in uploads',
      });
    } else if (payload.run.transcript.runId !== payload.run.report.runId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['run', 'transcript', 'runId'],
        message: 'run.transcript.runId must match run.report.runId',
      });
    } else if (payload.run.transcript.scenarioName !== payload.run.report.scenario) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['run', 'transcript', 'scenarioName'],
        message: 'run.transcript.scenarioName must match run.report.scenario',
      });
    }
    return;
  }
  if (payload.run.transcript !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'transcript'],
      message: 'run.transcript is only accepted for full_transcript_opt_in uploads',
    });
  }
  if (payload.run.scenarioYaml !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'scenarioYaml'],
      message: 'run.scenarioYaml is only accepted for full_transcript_opt_in uploads',
    });
  }
  if (payload.run.metadata !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'metadata'],
      message: 'run.metadata is only accepted for full_transcript_opt_in uploads',
    });
  }
});

export type UploadMode = z.infer<typeof uploadModeSchema>;
export type CloudUpload = z.infer<typeof cloudUploadSchema>;

import { z } from 'zod';

const requiredString = (message: string) => z.string().refine((value) => value.trim().length > 0, message);

export const criterionResultSchema = z.object({
  criterion: requiredString('run.report.criteria[].criterion is required'),
  result: z.enum(['passed', 'failed', 'unclear']),
  reason: requiredString('run.report.criteria[].reason is required'),
}).strict();

export const failureSchema = z.object({
  type: requiredString('run.report.failures[].type is required'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  message: requiredString('run.report.failures[].message is required'),
}).strict();

export const judgeMetadataSchema = z.object({
  mode: z.enum(['rules', 'semantic', 'hybrid']),
  provider: z.string().optional(),
  model: z.string().optional(),
  rulesApplied: z.boolean().default(false),
  deterministicFindingsAdded: z.number().int().nonnegative().default(0),
}).strict();

export const reportSchema = z.object({
  runId: requiredString('run.report.runId is required'),
  scenario: requiredString('run.report.scenario is required'),
  status: z.enum(['passed', 'failed', 'warning']),
  score: z.number().min(0).max(100),
  summary: requiredString('run.report.summary is required'),
  criteria: z.array(criterionResultSchema),
  failures: z.array(failureSchema),
  recommendations: z.array(z.string()),
  startedAt: requiredString('run.report.startedAt is required'),
  endedAt: requiredString('run.report.endedAt is required'),
  judgeMetadata: judgeMetadataSchema.optional(),
  rawJudgeOutput: z.unknown().optional(),
}).strict();

export type Report = z.infer<typeof reportSchema>;
export type CriterionResult = z.infer<typeof criterionResultSchema>;
export type ReportFailure = z.infer<typeof failureSchema>;
export type JudgeMetadata = z.infer<typeof judgeMetadataSchema>;

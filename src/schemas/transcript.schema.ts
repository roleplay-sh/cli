import { z } from 'zod';

function isValidDate(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

const requiredString = (message: string) => z.string().refine((value) => value.trim().length > 0, message);

export const transcriptTurnSchema = z.object({
  turn: z.number().int().positive(),
  role: z.enum(['user', 'agent']),
  content: requiredString('run.transcript.turns[].content is required'),
  timestamp: requiredString('run.transcript.turns[].timestamp is required').refine(
    isValidDate,
    'run.transcript.turns[].timestamp must be a valid date',
  ),
  raw: z.unknown().optional(),
}).strict();

export const transcriptSchema = z.object({
  runId: requiredString('run.transcript.runId is required'),
  scenarioName: requiredString('run.transcript.scenarioName is required'),
  startedAt: requiredString('run.transcript.startedAt is required').refine(
    isValidDate,
    'run.transcript.startedAt must be a valid date',
  ),
  endedAt: requiredString('run.transcript.endedAt is required').refine(
    isValidDate,
    'run.transcript.endedAt must be a valid date',
  ).optional(),
  turns: z.array(transcriptTurnSchema).min(1, 'run.transcript.turns must contain at least one turn'),
}).strict().superRefine((transcript, context) => {
  const startedAt = new Date(transcript.startedAt);
  const endedAt = transcript.endedAt ? new Date(transcript.endedAt) : undefined;
  if (endedAt && !Number.isNaN(startedAt.getTime()) && !Number.isNaN(endedAt.getTime()) && endedAt.getTime() < startedAt.getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endedAt'],
      message: 'run.transcript.endedAt must be after or equal to run.transcript.startedAt',
    });
  }
  let previousTurn = 0;
  for (const [index, turn] of transcript.turns.entries()) {
    if (turn.turn <= previousTurn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['turns', index, 'turn'],
        message: 'run.transcript.turns[].turn must be strictly increasing',
      });
    }
    previousTurn = turn.turn;
    const timestamp = new Date(turn.timestamp);
    if (!Number.isNaN(startedAt.getTime()) && !Number.isNaN(timestamp.getTime()) && timestamp.getTime() < startedAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['turns', index, 'timestamp'],
        message: 'run.transcript.turns[].timestamp must be within transcript start and end',
      });
    }
    if (endedAt && !Number.isNaN(endedAt.getTime()) && !Number.isNaN(timestamp.getTime()) && timestamp.getTime() > endedAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['turns', index, 'timestamp'],
        message: 'run.transcript.turns[].timestamp must be within transcript start and end',
      });
    }
  }
});

export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;

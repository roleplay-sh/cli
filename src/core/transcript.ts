import type { Transcript, TranscriptTurn } from '../schemas/transcript.schema.js';

export function createTranscript(runId: string, scenarioName: string): Transcript {
  return {
    runId,
    scenarioName,
    startedAt: new Date().toISOString(),
    turns: [],
  };
}

export function addTurn(
  transcript: Transcript,
  input: Omit<TranscriptTurn, 'timestamp'> & { timestamp?: string },
): void {
  transcript.turns.push({
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}

export function finishTranscript(transcript: Transcript): Transcript {
  transcript.endedAt = new Date().toISOString();
  return transcript;
}

export function transcriptText(transcript: Transcript): string {
  return transcript.turns
    .map((turn) => `${turn.role.toUpperCase()} ${turn.turn}: ${turn.content}`)
    .join('\n');
}

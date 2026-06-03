import { AppError } from '../../core/errors.js';
import { transcriptText } from '../../core/transcript.js';
import { reportSchema, type Report } from '../../schemas/report.schema.js';
import { redactUnknown } from '../../utils/output.js';
import type { Judge, JudgeInput } from './index.js';

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found.');
    return JSON.parse(match[0]);
  }
}

export class LlmJudge implements Judge {
  constructor(private readonly defaultModel = 'gpt-4.1-mini') {}

  async judge(input: JudgeInput): Promise<Report> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError({
        code: 'OPENAI_API_KEY_MISSING',
        message: 'OPENAI_API_KEY is required when using the OpenAI judge.',
        suggestion: 'Set OPENAI_API_KEY or run with --judge mock.',
        exitCode: 4,
      });
    }

    const prompt = `Judge this AI agent transcript against the scenario.
Return JSON only. The JSON must include: runId, scenario, status, score, summary, criteria, failures, recommendations, startedAt, endedAt.
status must be one of passed, failed, warning. score must be 0-100.

Scenario: ${input.scenario.name}
Description: ${input.scenario.description}
Hidden context:
${input.scenario.hiddenContext.map((item) => `- ${item}`).join('\n')}
Success criteria:
${input.scenario.successCriteria.map((item) => `- ${item}`).join('\n')}
Failure criteria:
${input.scenario.failureCriteria.map((item) => `- ${item}`).join('\n')}
Rubric:
${JSON.stringify(input.scenario.judge.rubric ?? {}, null, 2)}

Transcript:
${transcriptText(input.transcript)}

runId: ${input.runId}
startedAt: ${input.transcript.startedAt}
endedAt: ${input.transcript.endedAt ?? new Date().toISOString()}`;

    const first = await requestJudge(apiKey, input.model ?? this.defaultModel, prompt);

    try {
      return reportSchema.parse(extractJson(String(first.text ?? '')));
    } catch (firstError) {
      const repair = await requestJudge(
        apiKey,
        input.model ?? this.defaultModel,
        `Repair this judge output into valid JSON matching the required report schema.
Return JSON only. Preserve the intended verdict when possible.

Schema fields:
runId, scenario, status, score, summary, criteria, failures, recommendations, startedAt, endedAt

Invalid output:
${first.text ?? JSON.stringify(first.raw)}`,
      ).catch(() => undefined);

      if (repair) {
        try {
          return reportSchema.parse(extractJson(String(repair.text ?? '')));
        } catch {
          // Fall through to warning report with both raw outputs.
        }
      }

      return {
        runId: input.runId,
        scenario: input.scenario.name,
        status: 'warning',
        score: 60,
        summary: 'The LLM judge returned output that could not be parsed as a valid report.',
        criteria: [],
        failures: [
          {
            type: 'judge_parse_error',
            severity: 'medium',
            message: firstError instanceof Error ? firstError.message : String(firstError),
          },
        ],
        recommendations: ['Inspect rawJudgeOutput and retry with --judge mock or a different model.'],
        startedAt: input.transcript.startedAt,
        endedAt: input.transcript.endedAt ?? new Date().toISOString(),
        rawJudgeOutput: redactUnknown({ first: first.raw, repair: repair?.raw }),
      };
    }
  }
}

async function requestJudge(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text?: string; raw: unknown }> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  const raw = (await response.json().catch(() => undefined)) as any;
  if (!response.ok) {
    throw new AppError({
      code: 'OPENAI_JUDGE_ERROR',
      message: raw?.error?.message ?? `OpenAI judge failed with status ${response.status}.`,
      suggestion: 'Check OPENAI_API_KEY, model access, or run with --judge mock.',
      exitCode: 4,
      cause: raw,
    });
  }

  const text =
    raw?.output_text ??
    raw?.output?.flatMap((item: any) => item.content ?? [])
      ?.map((item: any) => item.text)
      ?.filter(Boolean)
      ?.join('\n');

  return { text, raw };
}

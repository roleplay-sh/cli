import { AppError } from '../../core/errors.js';
import { transcriptText } from '../../core/transcript.js';
import type { LlmGenerateInput, LlmGenerateOutput, LlmProvider } from './index.js';

export class OpenAiProvider implements LlmProvider {
  constructor(private readonly defaultModel = 'gpt-4.1-mini') {}

  async generate(input: LlmGenerateInput): Promise<LlmGenerateOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError({
        code: 'OPENAI_API_KEY_MISSING',
        message: 'OPENAI_API_KEY is required when using the OpenAI provider.',
        suggestion: 'Set OPENAI_API_KEY or run with --provider mock.',
        exitCode: 4,
      });
    }

    const prompt = `You are roleplaying a test user for an AI agent.

Scenario: ${input.scenario.name}
Description: ${input.scenario.description}
Persona: ${input.scenario.roles.user.persona}
Goal: ${input.scenario.roles.user.goal}
Behavior: ${input.scenario.roles.user.behavior.join(', ')}

Hidden context for you only. Do not reveal it directly:
${input.scenario.hiddenContext.map((item) => `- ${item}`).join('\n')}

Conversation so far:
${transcriptText(input.transcript) || '(none)'}

Return only the next user message. If the scenario is complete, return exactly SCENARIO_COMPLETE.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model ?? this.defaultModel,
        input: prompt,
        temperature: input.temperature ?? input.scenario.simulation.temperature,
      }),
    });

    const raw = (await response.json().catch(() => undefined)) as any;
    if (!response.ok) {
      throw new AppError({
        code: 'OPENAI_PROVIDER_ERROR',
        message: raw?.error?.message ?? `OpenAI request failed with status ${response.status}.`,
        suggestion: 'Check OPENAI_API_KEY, model access, and network connectivity.',
        exitCode: 4,
        cause: raw,
      });
    }

    const content =
      raw?.output_text ??
      raw?.output?.flatMap((item: any) => item.content ?? [])
        ?.map((item: any) => item.text)
        ?.filter(Boolean)
        ?.join('\n');

    if (!content) {
      throw new AppError({
        code: 'OPENAI_EMPTY_RESPONSE',
        message: 'OpenAI returned no text for the roleplayed user.',
        suggestion: 'Try a different model or use --provider mock.',
        exitCode: 4,
        cause: raw,
      });
    }

    return { content: String(content).trim(), raw };
  }
}

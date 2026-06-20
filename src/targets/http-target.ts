import { AppError } from '../core/errors.js';
import type { Scenario } from '../schemas/scenario.schema.js';
import type { TargetAgent, TargetInput, TargetOutput } from './index.js';

type HttpConfig = Extract<Scenario['target'], { type: 'http' }>;

function getField(value: any, path: string): unknown {
  return path.split('.').reduce((current, part) => current?.[part], value);
}

function preview(text: string): string {
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

export class HttpTarget implements TargetAgent {
  constructor(private readonly config: HttpConfig) {}

  async send(input: TargetInput): Promise<TargetOutput> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const body = {
        [this.config.input.messageField]: input.message,
        [this.config.input.sessionField]: input.sessionId,
      };
      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers: { 'content-type': 'application/json', ...this.config.headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const responseText = await response.text();
      const raw = responseText ? tryParseJson(responseText) : undefined;
      if (!response.ok) {
        throw new AppError({
          code: 'HTTP_TARGET_ERROR',
          message: `HTTP target returned ${response.status}: ${preview(responseText) || response.statusText}`,
          suggestion: 'Check that the target agent is running and returns a JSON response.',
          exitCode: 3,
          cause: raw,
        });
      }
      const responseField = getField(raw, this.config.output.responseField);
      if (typeof responseField !== 'string') {
        throw new AppError({
          code: 'HTTP_TARGET_INVALID_RESPONSE',
          message: `HTTP target response field "${this.config.output.responseField}" was not a string.`,
          suggestion: `Update target.output.responseField or return JSON like {"${this.config.output.responseField}":"..."}.`,
          exitCode: 3,
          cause: raw ?? responseText,
        });
      }
      return { response: responseField, raw };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError({
          code: 'HTTP_TARGET_TIMEOUT',
          message: `HTTP target timed out after ${this.config.timeoutMs}ms.`,
          suggestion: 'Increase target.timeoutMs or check whether the agent endpoint is responding.',
          exitCode: 3,
          cause: error,
        });
      }
      throw new AppError({
        code: 'HTTP_TARGET_ERROR',
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'Check target.url, headers, and whether the agent server is reachable.',
        exitCode: 3,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

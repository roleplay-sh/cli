import pino from 'pino';

export function createLogger(enabled = false) {
  return pino({
    enabled,
    redact: ['OPENAI_API_KEY', '*.authorization', '*.Authorization', '*.apiKey'],
  });
}

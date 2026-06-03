import pino from 'pino';

export function createLogger(enabled = false) {
  return pino({
    enabled,
    redact: ['*.authorization', '*.Authorization', '*.apiKey'],
  });
}

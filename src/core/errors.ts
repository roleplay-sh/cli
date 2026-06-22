export type ExitCode = 1 | 2 | 3 | 4;

export type PublicErrorCode =
  | 'AUTH_REQUIRED'
  | 'ACCESS_REQUIRED'
  | 'NOT_FOUND'
  | 'REQUEST_INVALID'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'REQUEST_FAILED';

export interface PublicError {
  code: PublicErrorCode;
  message: string;
  reference: string;
  supportCta: string;
}

export const publicErrorMessage = 'Something went wrong while running this command.';
export const publicErrorSupportCta = 'Contact support with this error reference.';

export class AppError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;
  readonly suggestion?: string;
  readonly filePath?: string;
  readonly cause?: unknown;
  readonly reference: string;

  constructor(input: {
    code: string;
    message: string;
    exitCode: ExitCode;
    suggestion?: string;
    filePath?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = 'AppError';
    this.code = input.code;
    this.exitCode = input.exitCode;
    this.suggestion = input.suggestion;
    this.filePath = input.filePath;
    this.cause = input.cause;
    this.reference = createErrorReference();
  }

  toPublicError(): PublicError {
    return {
      code: publicCodeForAppError(this),
      message: publicErrorMessage,
      reference: this.reference,
      supportCta: publicErrorSupportCta,
    };
  }

  toJSON(): { error: PublicError } {
    return {
      error: this.toPublicError(),
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError({
      code: 'UNEXPECTED_ERROR',
      message: error.message,
      exitCode: 1,
      cause: error,
    });
  }
  return new AppError({
    code: 'UNEXPECTED_ERROR',
    message: String(error),
    exitCode: 1,
  });
}

function createErrorReference(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `err_${Date.now().toString(36)}_${suffix}`;
}

function publicCodeForAppError(error: AppError): PublicErrorCode {
  if (error.exitCode === 2) return 'REQUEST_INVALID';
  if (error.exitCode === 3) return 'ACCESS_REQUIRED';
  if (error.exitCode === 4) return 'SERVICE_UNAVAILABLE';
  if (error.code.includes('AUTH') || error.code.includes('API_KEY')) return 'AUTH_REQUIRED';
  if (error.code.includes('NOT_FOUND') || error.code.includes('MISSING')) return 'NOT_FOUND';
  if (error.code.includes('RATE_LIMIT')) return 'RATE_LIMITED';
  if (error.code.includes('NETWORK') || error.code.includes('PROVIDER') || error.code.includes('TARGET')) {
    return 'SERVICE_UNAVAILABLE';
  }
  return 'REQUEST_FAILED';
}

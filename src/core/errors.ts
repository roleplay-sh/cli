export type ExitCode = 1 | 2 | 3 | 4;

export class AppError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;
  readonly suggestion?: string;
  readonly filePath?: string;
  readonly cause?: unknown;

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
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.suggestion ? { suggestion: this.suggestion } : {}),
        ...(this.filePath ? { filePath: this.filePath } : {}),
      },
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

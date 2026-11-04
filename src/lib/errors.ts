export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly retryAfterSeconds?: number) { super(message); this.name = 'AppError'; }
}
export function notFound(): AppError { return new AppError('NOT_FOUND', 'This item is unavailable.', 404); }
export function unauthorized(): AppError { return new AppError('UNAUTHORIZED', 'Sign in to continue.', 401); }
export function conflict(): AppError { return new AppError('REVISION_CONFLICT', 'This conversation changed. Reload it and try again.', 409); }

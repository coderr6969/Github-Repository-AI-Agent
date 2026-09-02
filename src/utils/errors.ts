export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = 'NOT_FOUND', details?: unknown) {
    super(message, 404, code, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR', details?: unknown) {
    super(message, 400, code, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'RESOURCE_CONFLICT', details?: unknown) {
    super(message, 409, code, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, code = 'EXTERNAL_SERVICE_ERROR', details?: unknown) {
    super(message, 502, code, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded, please try again later', code = 'RATE_LIMIT_EXCEEDED') {
    super(message, 429, code);
  }
}

export class ConfirmationRequiredError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'CONFIRMATION_REQUIRED', details);
  }
}

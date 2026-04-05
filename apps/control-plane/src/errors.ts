export class UserFacingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

export function badRequest(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): UserFacingError {
  return new UserFacingError(400, code, message, details);
}

export function conflict(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): UserFacingError {
  return new UserFacingError(409, code, message, details);
}

export function toErrorResponse(error: unknown): {
  status: number;
  body: {
    error: string;
    code?: string;
    details?: Record<string, unknown>;
  };
} {
  if (error instanceof UserFacingError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Internal server error",
    },
  };
}

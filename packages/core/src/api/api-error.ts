/** Normalized error thrown by the API client on non-2xx or network failure. */
export class APIError extends Error {
  readonly status: number;
  readonly data: unknown;
  readonly code: string | undefined;

  constructor(status: number, message: string, data?: unknown, code?: string) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

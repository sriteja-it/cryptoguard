export type ApiErrorPayload = {
  error?: string;
  details?: string;
  message?: string;
};

export async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function resolveApiError(payload: ApiErrorPayload | null | undefined, fallback: string): string {
  return payload?.details || payload?.message || payload?.error || fallback;
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  return resolveApiError(await readJson<ApiErrorPayload>(response), fallback);
}

export function getFetchErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
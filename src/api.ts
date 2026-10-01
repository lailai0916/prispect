import type { ApiError } from '../shared/contracts';

let csrfToken: string | null = null;
export function setCsrfToken(value: string | null): void {
  csrfToken = value;
}

export class RequestError extends Error {
  code: string;
  constructor(message: string, code = 'REQUEST_FAILED') {
    super(message);
    this.code = code;
  }
}

const errorMessages: Record<string, string> = {
  AUTH_REQUIRED: 'Log in to open your personal workspace.',
  INVALID_CREDENTIALS: 'The email or password is incorrect. Please try again.',
  EMAIL_EXISTS: 'An account already uses this email. Please log in.',
  INVALID_ACCOUNT:
    'Check your account details. Names need 1–80 characters and passwords need 10–128 characters.',
  CSRF_INVALID: 'The session security token has expired. Refresh the page and retry.',
  RATE_LIMITED: 'Too many attempts. Please wait and try again.',
  INVALID_ORIGIN:
    'The request does not match this service origin. Open the site at its configured address.',
  MATERIAL_IN_USE:
    'This material is used by a review. Export or remove dependent reviews before deleting it.',
  MATERIAL_NOT_FOUND: 'The selected material no longer exists. Refresh your evidence library.',
  TASK_RUNNING: 'A review is still running. Wait for completion before this action.',
  TASK_NOT_FOUND: 'This review was not found. It may have been deleted.',
  INVALID_TASK: 'Review input is invalid. Check the company, year, and selected materials.',
  INVALID_MATERIAL:
    'The material has invalid fields. Check values, units, periods, and statement scopes.',
  QUESTION_NOT_FOUND: 'The follow-up question was not found.',
  FILE_REQUIRED: 'Choose a file to import.',
  LIMIT_FILE_SIZE: 'The file exceeds the 25 MB upload limit.',
  UNSUPPORTED_FILE: 'Only JSON, CSV, and text-based PDF files are supported.',
  INVALID_CSV: 'The CSV is invalid. Check the required columns and quotation marks.',
  EMPTY_CSV: 'The CSV contains no observation rows.',
  MIXED_SUBJECT: 'One imported material cannot contain multiple companies. Import them separately.',
  INVALID_JSON: 'The JSON format is invalid. Download the example and check your input.',
  INVALID_TEXT: 'Structured files must contain valid UTF-8 text.',
  INVALID_PDF: 'The file is not a valid supported PDF.',
  PDF_NO_TEXT: 'No usable PDF text was found. Scanned-PDF OCR is unsupported.',
  PDF_SUBJECT_REQUIRED:
    'The PDF company could not be confirmed. Supply a full company name before uploading again.',
  PDF_PARSE_FAILED: 'The PDF could not be parsed. Use the structured JSON or CSV format instead.',
  BODY_TOO_LARGE: 'The structured request exceeds 2 MB. Reduce the evidence or excerpts.',
  UPLOAD_NOT_FOUND: 'The original upload was not found. Upload the file again.',
  UPLOAD_EXPIRED: 'This unconfirmed upload expired after 24 hours. Upload it again.',
  UPLOAD_METADATA_MISMATCH:
    'The filename or hash no longer matches the original upload. Re-upload the source file.',
  UPLOAD_ALREADY_BOUND:
    'This upload has already been saved as a material. Reuse the saved material.',
  UPLOAD_FILE_MISSING: 'The original upload file is missing from storage.',
  UPLOAD_FILE_CHANGED:
    'The original file hash has changed. The file is not served as verified evidence.',
  STORAGE_QUOTA_EXCEEDED: 'Your account exceeds its 250 MB original-upload quota.',
  NO_UPLOADED_FILE: 'This structured material has no separately retained uploaded file.',
  INTERNAL_ERROR: 'The service could not complete this request. Retry or check the workspace.',
};

export function requestErrorText(error: unknown, locale: string): string {
  if (error instanceof RequestError && locale === 'en' && errorMessages[error.code])
    return errorMessages[error.code];
  return error instanceof Error ? error.message : String(error);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init?.method && !['GET', 'HEAD'].includes(init.method) && csrfToken
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: response.statusText }))) as ApiError;
    throw new RequestError(error.error || response.statusText, error.code);
  }
  return response.json() as Promise<T>;
}

export function post<T>(path: string, data: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(data) });
}

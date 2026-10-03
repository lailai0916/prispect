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
  ASSISTANT_INPUT: 'Enter a question of up to 500 characters.',
  ASSISTANT_BUSY: 'The assistant is handling other questions. Please retry shortly.',
  ASSISTANT_TIMEOUT: 'The answer timed out. Please retry.',
  CONTEXT_INPUT: 'Enter a supported company name, year and refresh options.',
  CONTEXT_BUSY: 'Public sources are busy. Please retry shortly.',
  CONTEXT_IDENTITY: 'Select a supported listed entity before continuing.',
  CONTEXT_NOT_READY: 'Company context has not been retrieved yet.',
  CONTEXT_STALE: 'The public snapshot changed while answering. Please ask again.',
  CONTEXT_SUBJECT_CONFLICT:
    'The public source did not match this company. Conflicting fields were withheld.',
  INDUSTRY_SCOPE: 'A listed entity is needed for industry comparison.',
  INDUSTRY_TARGET_MISSING: 'No matching same-year industry record was retrieved.',
  INDUSTRY_CLASSIFICATION: 'A verifiable industry classification was unavailable.',
  INDUSTRY_SAMPLE_LIMIT:
    'The source exceeded the coverage limit; truncated averages were withheld.',
  INDUSTRY_INPUT: 'Choose a completed annual period for a Shanghai or Shenzhen listed company.',
  INDUSTRY_SOURCE_FORMAT: 'The industry source response could not be verified.',
  INDUSTRY_PAGE_MISSING: 'Industry pagination was interrupted; incomplete averages were withheld.',
  INDUSTRY_COUNT_CONFLICT: 'The source total did not match the retrieved sample count.',
  COMPANY_QUESTION_INPUT: 'Enter a question of up to 500 characters and select the profit basis.',

  AUTH_REQUIRED: 'Log in to open your personal workspace.',
  INVALID_CREDENTIALS: 'The email or password is incorrect. Please try again.',
  EMAIL_EXISTS: 'An account already uses this email. Please log in.',
  INVALID_ACCOUNT:
    'Check your account details. Names need 1–80 characters and passwords need 8–128 characters.',
  CSRF_INVALID: 'The session security token has expired. Refresh the page and retry.',
  RATE_LIMITED: 'Too many attempts. Please wait and try again.',
  INVALID_ORIGIN:
    'The request does not match this service origin. Open the site at its configured address.',
  EMAIL_UNAVAILABLE: 'Email delivery is not configured. No email was sent.',
  CASE_NOT_FOUND: 'The selected public example was not found.',
  MATERIAL_IN_USE:
    'This material is used by a review. Export or remove dependent reviews before deleting it.',
  MATERIAL_NOT_FOUND: 'The selected material no longer exists. Refresh the Materials page.',
  MATERIAL_LIMIT:
    'Your workspace has reached its 100-material limit. Remove unused materials first.',
  TASK_LIMIT:
    'Your workspace has reached its 200-financial-review limit. Remove old financial reviews first.',
  TASK_BUSY: 'Other financial reviews are running. Please wait before starting another.',
  TASK_RUNNING: 'A financial review is still running. Wait for completion before this action.',
  TASK_IN_USE:
    'A saved review item version references this financial review. Keep the review report for that history.',
  TASK_NOT_FOUND: 'This financial review was not found. It may have been deleted.',
  REPORT_NOT_READY: 'This review report is not ready. Wait for completion before this action.',
  TASK_EXPORT_CHANGED: 'The report has changed. Reload the report before exporting it again.',
  INVALID_EXPORT_FORMAT: 'Choose HTML or JSON for the report export.',
  INVALID_FORMAT: 'Choose JSON or CSV for the input template.',
  INVALID_STATUS: 'Choose an open or completed follow-up status.',
  INVALID_SOURCE: 'The original source is not in the verified source list.',
  SOURCE_NOT_FOUND: 'The original source was not found in the verified source list.',
  SOURCE_NOT_DOWNLOADED: 'This original is not retained here. Open its public source link instead.',
  SOURCE_HASH_MISMATCH:
    'The retained original no longer matches its verified hash and was not served.',
  INVALID_COMPANY_QUERY:
    'Enter a company short name or six-digit security code, up to 80 characters.',
  COMPANY_INPUT_INVALID:
    'The security code, organization ID or year is outside the supported range.',
  COMPANY_MARKET_UNSUPPORTED:
    'Research currently supports mainland A-share companies. US research is paused; saved records remain available.',
  COMPANY_IDENTITY_MISMATCH:
    'The code and organization ID did not match the official source. No similar company was substituted.',
  COMPANY_UPLOAD_BOUND:
    'This original is already bound to another material. Continue from your workspace or retrieve it again.',
  COMPANY_MODEL_HTTP:
    'The public-evidence planning model request did not complete. Rules-based candidates remain available.',
  COMPANY_MODEL_SELECTION:
    'The model page selection failed the allowlist or format check. Rules-based candidates remain available.',
  COMPANY_INVALID_PDF: 'The downloaded original has no valid PDF signature.',
  COMPANY_PAGE_LIMIT:
    'The PDF exceeds the 500-page processing limit. Import the relevant financial pages.',
  COMPANY_TEXT_LIMIT: 'The PDF text exceeds the processing limit.',
  COMPANY_NO_TEXT:
    'No usable PDF text was found. OCR was not run; provide text-based financial statements.',
  COMPANY_PDF_PARSE: 'PDF text extraction did not complete. No substitute amounts were generated.',
  COMPANY_QUERY_INVALID:
    'Enter a company short name or six-digit security code, up to 80 characters.',
  COMPANY_SOURCE_UNAVAILABLE:
    'The official source did not respond after retry. Retry later or import the original yourself.',
  COMPANY_SOURCE_FORMAT:
    'The official source returned an unsupported response. No substitute company or report was used.',
  COMPANY_SOURCE_EMPTY: 'The official source returned no usable evidence for this request.',
  COMPANY_SOURCE_HTTP:
    'The official source could not serve this request. Retry later or import the original.',
  COMPANY_SOURCE_TOO_LARGE: 'The official file exceeds this step’s size budget.',
  COMPANY_SOURCE_URL: 'This document URL is outside the permitted official source.',
  COMPANY_SOURCE_NOT_PDF: 'The official download is not a supported PDF.',
  COMPANY_TOOL_BUDGET:
    'The retrieval reached its tool-call limit. No additional sources were fetched.',
  COMPANY_CANCELLED: 'The retrieval was cancelled before completion.',
  COMPANY_NOT_RUNNING: 'No step is currently running. Reload to view the latest result.',
  COMPANY_STALE_REVISION: 'The retrieval version has changed. Reload before resuming.',
  COMPANY_NOT_RECOVERABLE:
    'This research record cannot resume from a checkpoint. Start new research.',
  COMPANY_IDEMPOTENCY_CONFLICT:
    'This request key is already used for different input. Start new research.',
  COMPANY_REQUEST_KEY: 'The request identifier is invalid. Start new research.',
  COMPANY_REQUEST_KEY_REUSED:
    'This request key is already used for a different company or year. Start new research.',
  COMPANY_CHECKPOINT_EXPIRED:
    'The saved retrieval checkpoint expired. Start new research; your research records have been retained.',
  COMPANY_PUBLISHING: 'The retrieval has completed and is being saved. Check the result shortly.',
  INDUSTRY_SUBJECT_CONFLICT:
    'The industry result did not match the selected company or annual period.',
  INVALID_COMPANY_RUN:
    'Check the selected company identity and year. Retrieval covers 2010 through the latest completed calendar year.',
  COMPANY_RUN_NOT_FOUND: 'This research record was not found in your account.',
  COMPANY_RUN_LIMIT:
    'Your account has 30 research records. Delete an old record before starting another.',
  COMPANY_AGENT_BUSY: 'An evidence retrieval or save is in progress. Retry after it finishes.',
  COMPANY_REPORT_UNAVAILABLE: 'This retrieval has no retained downloadable original.',
  COMPANY_PREVIEW_NOT_READY: 'The original and candidate input are not ready for confirmation.',
  COMPANY_ADOPT_BUSY: 'This evidence is already being saved.',
  CONFIRM_REQUIRED:
    'Confirm the candidate company, year, units, period, scope and source before saving.',
  COMPANY_SOURCE_MISMATCH:
    'Original source metadata cannot be changed. Review observation fields instead.',
  ADOPTED_MATERIAL_REMOVED:
    'The evidence previously adopted from this run was removed. Retrieve it again.',
  INVALID_CONTEXT:
    'Check the scenario date, follow-up notes and cash amounts. Amounts must be nonnegative, with at most two decimal places.',
  DECISION_NOT_FOUND: 'This review item was not found in your account.',
  DECISION_VERSION_NOT_FOUND: 'The selected input version was not found.',
  INVALID_REVISION: 'Select a valid version number.',
  DECISION_REVISION_CONFLICT:
    'A newer version exists. Reload before saving; your changes have not overwritten it.',
  DECISION_VERSION_LIMIT: 'This review item has reached its 100-version limit.',
  DECISION_EVIDENCE_LIMIT: 'This review item has reached its 50-evidence-record limit.',
  DECISION_LIMIT: 'Your account has reached its 50-review-item limit.',
  INVALID_DECISION:
    'Check the review item fields, dates and cash amounts. Amounts need at most two decimal places; blank fields remain unknown.',
  INVALID_DECISION_PATCH: 'Reload this review item before saving its complete updated inputs.',
  INVALID_DECISION_EVIDENCE: 'Check the evidence entity, date, source, text and supplied fields.',
  EVIDENCE_REFERENCE_MISMATCH:
    'The observation or page does not belong to the selected material. The original binding has not been changed.',
  DECISION_EVIDENCE_NOT_FOUND: 'This evidence record was not found in the current review item.',
  INVALID_DECISION_RESTORE: 'Select an existing revision to restore as a new version.',
  INVALID_EVIDENCE_STATE: 'Reload the review item before changing this evidence record’s state.',
  INVALID_EVIDENCE_SCOPE:
    'Provide a valid entity, covered date and scope-correction reason (up to 1,000 characters).',
  EVIDENCE_SCOPE_NOT_LOCATED:
    'The corrected entity or date was not located in the linked saved text. Original text and amounts have not changed.',
  EVIDENCE_SCOPE_UNCHANGED: 'The entity and covered date have not changed.',
  INVALID_TASK:
    'Financial review input is invalid. Check the company, year and selected materials.',
  INVALID_MATERIAL:
    'The material has invalid fields. Check values, units, periods, and statement scopes.',
  DUPLICATE_OBSERVATION: 'Each observation in a material needs a unique identifier.',
  INVALID_PRECISION: 'Use an exact amount that can be represented in renminbi cents.',
  QUESTION_NOT_FOUND: 'The follow-up question was not found.',
  FILE_REQUIRED: 'Choose a file to import.',
  UPLOAD_BUSY: 'Other files are being parsed. Please wait before uploading another.',
  UPLOAD_CANCELLED: 'The upload preview was cancelled.',
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
  UPLOAD_HASH_MISMATCH: 'The preview does not match the uploaded file. Upload the original again.',
  STORAGE_QUOTA_EXCEEDED: 'Your account exceeds its 250 MB original-upload quota.',
  NO_UPLOADED_FILE: 'This structured material has no separately retained uploaded file.',
  INTERNAL_ERROR: 'The service could not complete this request. Retry or check the workspace.',
  ENDPOINT_NOT_FOUND: 'The requested service endpoint was not found.',
  FRONTEND_ASSET_NOT_FOUND:
    'The requested page resource was not found. Refresh the page and retry.',
  FRONTEND_NOT_BUILT: 'The website is temporarily unavailable. Please retry shortly.',
  INVALID_PATH: 'The requested address has invalid URL encoding.',
};

export function requestErrorText(error: unknown, locale: string): string {
  if (error instanceof RequestError && locale === 'en' && errorMessages[error.code])
    return errorMessages[error.code];
  return error instanceof Error ? error.message : String(error);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const method = init?.method?.toUpperCase() || 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken && !headers.has('X-CSRF-Token'))
    headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const error = (body && typeof body === 'object' ? body : {}) as Partial<ApiError>;
    throw new RequestError(
      typeof error.error === 'string' && error.error
        ? error.error
        : response.statusText || `请求失败（${response.status}）`,
      typeof error.code === 'string' ? error.code : undefined
    );
  }
  return response.json() as Promise<T>;
}

export function post<T>(path: string, data: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(data) });
}

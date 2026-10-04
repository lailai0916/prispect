import type { CompanyReadingBasis } from './company-analysis.js';
import type { CompanyQuestionAnswer } from './company-workspace.js';

export interface AssistantRequest {
  question: string;
  locale: 'zh' | 'en';
  currentRunId?: string;
  previousRunId?: string;
  /** Bind a question to the saved AI report shown by the caller, never silently substitute a later report. */
  reportGeneratedAt?: string;
  basis?: CompanyReadingBasis;
  previousQuestions?: string[];
  /** Ask again using fresh sources rather than a saved answer. */
  refresh?: boolean;
}

export interface AssistantAnswer extends CompanyQuestionAnswer {
  kind: 'company' | 'documentation' | 'clarification';
  company?: { runId: string; name: string; year: number };
  research?: {
    status: 'completed' | 'partial' | 'unavailable';
    toolCalls: number;
    sources: { label: string; url: string }[];
  };
}

/** Stages report real work in the current request, never a timed animation sequence. */
export type AssistantStage = 'recognizing' | 'retrieving' | 'researching' | 'composing' | 'saving';

export type AssistantStreamEvent =
  | { type: 'progress'; stage: AssistantStage }
  | { type: 'answer'; answer: AssistantAnswer }
  | { type: 'error'; code: string; error: string };

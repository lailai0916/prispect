import type { CompanyReadingBasis } from './company-analysis.js';
import type { CompanyQuestionAnswer } from './company-workspace.js';

export interface AssistantRequest {
  question: string;
  locale: 'zh' | 'en';
  currentRunId?: string;
  previousRunId?: string;
  basis?: CompanyReadingBasis;
  previousQuestions?: string[];
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

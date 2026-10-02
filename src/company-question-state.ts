import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyQuestionAnswer } from '../shared/company-workspace';

export function appendCompanyAnswer(
  run: CompanyResearchRun,
  answer: CompanyQuestionAnswer
): CompanyResearchRun {
  const questions = run.questions || [];
  if (
    questions.some(
      (saved) =>
        saved.createdAt === answer.createdAt &&
        saved.question === answer.question &&
        saved.snapshotFetchedAt === answer.snapshotFetchedAt &&
        saved.text === answer.text &&
        saved.mode === answer.mode
    )
  )
    return run;
  return { ...run, questions: [...questions, answer].slice(-50) };
}

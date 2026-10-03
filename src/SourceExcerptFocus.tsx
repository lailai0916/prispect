import type { AssessmentEvidence, AssessmentMetric } from '../shared/company-assessment';
import { assessmentSourceFocus } from '../shared/source-excerpt-focus';

/** The existing source drawer keeps the stored text and annotates explicit field relationships. */
export function SourceExcerptFocus({
  evidence,
  metrics,
  selectedMetricIds,
  locale,
}: {
  evidence: AssessmentEvidence;
  metrics: readonly AssessmentMetric[];
  selectedMetricIds: readonly string[];
  locale: 'zh-Hans' | 'en';
}) {
  const { fields, calculations, parts } = assessmentSourceFocus(
    evidence,
    metrics,
    selectedMetricIds
  );
  const index = locale === 'en' ? 1 : 0;
  const matches = parts.filter((part) => part.matched).length;
  return (
    <>
      {fields.length > 0 && (
        <p className="source-excerpt-fields">
          <span>{index ? 'Supporting fields' : '支撑字段'}</span>
          {fields.map((metric) => metric.label[index]).join(index ? ' · ' : '、')}
        </p>
      )}
      {calculations.length > 0 && (
        <p className="source-excerpt-fields">
          <span>{index ? 'Used to calculate' : '用于计算'}</span>
          {calculations.map((metric) => metric.label[index]).join(index ? ' · ' : '、')}
        </p>
      )}
      {parts.length > 0 && (
        <blockquote>
          {parts.map((part, position) =>
            part.matched ? (
              <mark key={position} className="source-excerpt-focus-mark">
                {part.text}
              </mark>
            ) : (
              part.text
            )
          )}
        </blockquote>
      )}
      {matches > 0 && (
        <p className="source-excerpt-match-note">
          {index ? `${matches} field or value matches` : `${matches} 处字段或数值匹配`}
        </p>
      )}
    </>
  );
}

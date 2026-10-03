import { ArrowUpRight, FileText } from 'lucide-react';
import type { CompanyAuditOpinionResult, CompanyPublicEvidence } from '../shared/company-contracts';
import { useApp } from './context';
import { Tag } from './components';
import { translateRule } from './ruleTranslations';

const warningTranslations: Record<string, string> = {
  '本次查询未取得可用于定位的年报原件；不能视为没有审计意见。':
    'No annual-report source was retrieved for this lookup. This does not establish that no audit opinion exists.',
  '年报原件的主体或年度与本次查询不一致，未采用审计意见段落。':
    'The entity or year in the annual report differs from this review. Its opinion was not adopted.',
  '未定位到与本次年度相符的财务报表审计意见正文；这不表示没有审计意见。':
    'No financial-statement opinion for this year was located. This does not establish that no opinion exists.',
  '已保留候选原文，但主体、年报年度、审计期间或唯一段落尚未全部确认，请逐项核对。':
    'A candidate excerpt is retained. Check its entity, report year and audited period; the relevant passage is not fully confirmed.',
  '这里只定位审计意见原文，不确认审计类别、资料真实性、当前偿付能力或公司是否可靠。':
    'Check the opinion and its source. Locating an excerpt does not establish an audit classification, document authenticity, current payment capacity or company reliability.',
};

export function CompanyAuditOpinion({
  result,
  onEvidence,
}: {
  result?: CompanyAuditOpinionResult;
  onEvidence: (evidence: CompanyPublicEvidence) => void;
}) {
  const { t, locale } = useApp();
  const status = !result
    ? t('未评估', 'Not evaluated')
    : result.status === 'pending'
      ? t('待定位', 'Pending')
      : result.status === 'located'
        ? t('原文已定位', 'Excerpt located')
        : result.status === 'candidate'
          ? t('候选待核', 'Candidate to check')
          : t('未取得', 'Not retrieved');
  const scopeStatus = (value: 'matched' | 'unconfirmed' | 'conflict') =>
    value === 'matched'
      ? t('与本次研究一致', 'Matches this research')
      : value === 'conflict'
        ? t('范围不符', 'Scope differs')
        : t('尚未确认', 'Unconfirmed');
  return (
    <details className="company-record-details company-audit-opinion">
      <summary>
        <span className="company-audit-heading">
          <span>{t('审计意见原文', 'Audit opinion excerpt')}</span>
          <Tag>{status}</Tag>
        </span>
      </summary>
      {!result ? (
        <p className="field-note">
          {t(
            '这份历史研究记录未保存审计意见检索结果。新建研究可读取所选年报。',
            'This older research record has no saved audit-opinion lookup. Start new research to read the selected annual report.'
          )}
        </p>
      ) : result.status === 'pending' ? (
        <p className="field-note" role="status">
          {t(
            '本次尚未完成所选年报审计意见定位。',
            'The opinion lookup in the selected annual report is not complete.'
          )}
        </p>
      ) : (
        <div className="company-audit-body">
          <p className="field-note">
            {result.status === 'unknown'
              ? t(
                  '本次未取得可定位的意见段落，可自行核对年报审计报告。',
                  'No locatable opinion was retrieved in this run. Check the audit report in the annual report.'
                )
              : t(
                  '保留审计报告原文与范围线索，请在原件中核对意见及相关事项。',
                  'The original opinion and scope clues are retained. Check the opinion and related matters in the source document.'
                )}
          </p>
          <dl className="company-audit-scope">
            {(
              [
                ['issuer', t('报告主体', 'Reporting entity')],
                ['reportYear', t('年报年度', 'Annual-report year')],
                ['auditPeriod', t('审计期间', 'Audited period')],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{scopeStatus(result.scope[key])}</dd>
              </div>
            ))}
          </dl>
          {result.evidence.map((evidence) => (
            <article className="company-audit-excerpt" key={evidence.id}>
              <div className="company-audit-source">
                <FileText size={14} aria-hidden="true" />
                <span>
                  {evidence.auditedYear ?? t('年度待核', 'Year unconfirmed')} · PDF {evidence.page}
                </span>
                <button type="button" className="text-link" onClick={() => onEvidence(evidence)}>
                  {t('核对原件', 'Check original')}
                  <ArrowUpRight size={13} />
                </button>
              </div>
              {locale === 'en' && <p className="field-note">Original source text.</p>}
              <blockquote>{evidence.quote}</blockquote>
            </article>
          ))}
          {result.warnings.length > 0 && (
            <ul className="company-audit-notes">
              {result.warnings.map((warning, index) => (
                <li key={index}>
                  {locale === 'en' &&
                    !warningTranslations[warning] &&
                    translateRule(warning) === warning &&
                    /[\u4e00-\u9fff]/.test(warning) && <span>Retrieval note (Chinese): </span>}
                  {locale === 'en'
                    ? warningTranslations[warning] || translateRule(warning)
                    : warning}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}

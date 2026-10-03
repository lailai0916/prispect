import { ArrowUpRight, FileText } from 'lucide-react';
import type { CompanyAuditOpinionResult, CompanyPublicEvidence } from '../shared/company-contracts';
import { useApp } from './context';
import { Tag } from './components';
import { translateRule } from './ruleTranslations';

const warningCopy: Record<string, readonly [string, string]> = {
  '本次查询未取得可用于定位的年报原件；不能视为没有审计意见。': [
    '未取得用于定位审计意见的年报原件。',
    'The annual-report original needed to locate the opinion was not retrieved.',
  ],
  '年报原件的主体或年度与本次查询不一致，未采用审计意见段落。': [
    '原件主体或年度不符，未采用意见段落。',
    'The original has a different entity or year; its opinion was not adopted.',
  ],
  '未定位到与本次年度相符的财务报表审计意见正文；这不表示没有审计意见。': [
    '未定位到本年度财务报表审计意见正文。',
    'The financial-statement audit opinion for this year was not located.',
  ],
  '已保留候选原文，但主体、年报年度、审计期间或唯一段落尚未全部确认，请逐项核对。': [
    '候选待核对：主体、年度、审计期间与唯一段落。',
    'Candidate checks needed: entity, year, audited period and a unique opinion passage.',
  ],
  '这里只定位审计意见原文，不确认审计类别、资料真实性、当前偿付能力或公司是否可靠。': [
    '审计意见类别需另行核对原文。',
    'Check the original separately to identify the audit-opinion type.',
  ],
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
                    !warningCopy[warning] &&
                    translateRule(warning) === warning &&
                    /[\u4e00-\u9fff]/.test(warning) && <span>Retrieval note (Chinese): </span>}
                  {warningCopy[warning]
                    ? t(...warningCopy[warning])
                    : locale === 'en'
                      ? translateRule(warning)
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

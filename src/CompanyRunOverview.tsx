import { ArrowUpRight, Check, CircleAlert, FileText, LoaderCircle } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyBranchId, CompanyPublicEvidence } from '../shared/company-contracts';
import { useApp } from './context';
import { Tag } from './components';
import { metricName, money, yuan } from './format';
import { translateRule } from './ruleTranslations';
import { CompanyAuditOpinion } from './CompanyAuditOpinion';

const branchNames: Record<CompanyBranchId, [string, string]> = {
  identity: ['公司主体', 'Company identity'],
  finance: ['财务报表', 'Financial statements'],
  'market-data': ['历史财务数据', 'Historical financial data'],
  notes: ['经营附注', 'Operating notes'],
  announcements: ['近期公告', 'Recent disclosures'],
  reconcile: ['交叉核对', 'Cross-check'],
};

export function CompanyRunOverview({ run }: { run: CompanyResearchRun }) {
  const { t, locale } = useApp();
  const agent = run.agent;
  if (!agent) return null;
  const activity =
    agent.branches.find((branch) => branch.id === 'identity' && branch.status === 'running') ||
    agent.branches.find((branch) => branch.id === 'reconcile' && branch.status === 'running');
  const running = agent.branches.filter((branch) => branch.status === 'running');
  const complete = run.status === 'ready' || run.status === 'adopted';
  return (
    <section className="company-progress" aria-label={t('核查进度', 'Review progress')}>
      <p className="company-activity" role="status">
        {running.length > 0 || run.status === 'queued' ? (
          <LoaderCircle size={14} className="spinner" />
        ) : complete ? (
          <Check size={14} />
        ) : (
          <CircleAlert size={14} />
        )}
        {agent.cancelRequested
          ? t(
              '取消请求已收到，保留已完成的检索记录。',
              'Cancellation requested; completed retrieval records remain.'
            )
          : activity
            ? t(...branchNames[activity.id])
            : running.length
              ? t('正在读取公开材料', 'Reading public documents')
              : run.status === 'queued'
                ? t('等待开始核查', 'Waiting to start the review')
                : run.status === 'adopted'
                  ? t(
                      '材料已采用，报告保留原始来源',
                      'Evidence adopted; the report retains original sources'
                    )
                  : complete
                    ? t(
                        '公开材料读取完成，候选待你确认',
                        'Public reading complete; candidates await your confirmation'
                      )
                    : t('当前执行已停止', 'Execution has stopped')}
      </p>
      <ol className="company-branches">
        {(['finance', 'market-data', 'notes', 'announcements'] as const).map((id) => {
          const branch = agent.branches.find((item) => item.id === id);
          if (!branch) return null;
          return (
            <li key={id} data-status={branch.status}>
              <span className="company-branch-icon" aria-hidden="true">
                {branch.status === 'running' ? (
                  <LoaderCircle size={14} className="spinner" />
                ) : branch.status === 'completed' ? (
                  <Check size={14} />
                ) : branch.status === 'failed' ? (
                  <CircleAlert size={14} />
                ) : (
                  <span />
                )}
              </span>
              <span>
                <strong>{t(...branchNames[id])}</strong>
                <small>
                  {branch.status === 'pending'
                    ? t('待执行', 'Pending')
                    : branch.status === 'running'
                      ? t('读取中', 'Reading')
                      : branch.status === 'completed'
                        ? t('已完成', 'Completed')
                        : branch.status === 'failed'
                          ? t('未完成', 'Incomplete')
                          : t('已跳过', 'Skipped')}
                </small>
              </span>
              {branch.summary && (
                <details>
                  <summary>{t('检索记录', 'Retrieval record')}</summary>
                  <p>
                    {locale === 'en' &&
                      translateRule(branch.summary) === branch.summary &&
                      /[\u4e00-\u9fff]/.test(branch.summary) && (
                        <span className="field-note">
                          Original summary (Chinese).
                          <br />
                        </span>
                      )}
                    {locale === 'en' ? translateRule(branch.summary) : branch.summary}
                  </p>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function CompanyFinancialFindings({
  run,
  onPage,
}: {
  run: CompanyResearchRun;
  onPage: (page: number | null) => void;
}) {
  const { t, locale } = useApp();
  const rows = run.preview?.material.observations.filter(
    (row) =>
      row.year === run.input.year &&
      row.scope === 'consolidated' &&
      row.period === 'annual' &&
      row.currency === 'CNY' &&
      ['yuan', 'wan', 'yi'].includes(row.unit) &&
      ['netProfit', 'operatingCashFlow'].includes(row.key)
  );
  if (!rows?.length) return null;
  return (
    <section
      className="company-financial-facts"
      aria-label={t('已取得的年度字段', 'Retrieved annual fields')}
    >
      <p className="field-note">
        {run.status === 'adopted'
          ? t(
              '初始提取字段 · 所采用输入见报告',
              'Original extracted fields · adopted inputs are in the report'
            )
          : t('原件提取字段 · 尚未采用', 'Fields extracted from the original · not adopted')}
      </p>
      <dl>
        {rows.map((row) => (
          <div key={row.id}>
            <dt>{metricName(row.key, locale)}</dt>
            <dd>
              {money(yuan(row.value, row.unit), locale)}
              <small>CNY · {row.year}</small>
            </dd>
            <button
              type="button"
              className="text-link"
              disabled={row.page == null}
              onClick={() => onPage(row.page)}
            >
              {row.page == null ? t('页码未确认', 'Page unconfirmed') : `PDF ${row.page}`}
              <ArrowUpRight size={12} />
            </button>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CompanyEvidenceResults({
  run,
  onEvidence,
}: {
  run: CompanyResearchRun;
  onEvidence: (evidence: CompanyPublicEvidence) => void;
}) {
  const { t, locale } = useApp();
  const agent = run.agent;
  if (!agent) return null;
  const sourcedExplanations = agent.competingExplanations.filter((item) =>
    item.evidenceIds.some((id) => agent.evidence.some((evidence) => evidence.id === id))
  );
  return (
    <section className="company-evidence-results">
      <CompanyAuditOpinion result={agent.auditOpinion} onEvidence={onEvidence} />
      {sourcedExplanations.length > 0 && (
        <div className="company-hypotheses">
          <div className="report-section-title">
            <h2>{t('可能解释', 'Possible explanations')}</h2>
            <Tag>{t('待补证', 'Further evidence needed')}</Tag>
          </div>
          <ul>
            {sourcedExplanations.map((item) => (
              <li key={item.id}>
                <h3>{locale === 'en' ? translateRule(item.label) : item.label}</h3>
                <div className="company-evidence-links">
                  {item.evidenceIds.map((id) => {
                    const evidence = agent.evidence.find((entry) => entry.id === id);
                    return (
                      evidence && (
                        <button
                          type="button"
                          className="text-link"
                          key={id}
                          onClick={() => onEvidence(evidence)}
                        >
                          <FileText size={13} />
                          {evidence.kind === 'annual-note'
                            ? t('附注', 'Note')
                            : t('公告', 'Disclosure')}{' '}
                          · PDF {evidence.page}
                        </button>
                      )
                    );
                  })}
                </div>
                <p>
                  <span>{t('还需取得', 'Still needed')}</span>
                  {locale === 'en' ? translateRule(item.nextEvidence) : item.nextEvidence}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {agent.evidence.length > 0 && (
        <details className="company-record-details">
          <summary>
            {t('经营线索原文', 'Operating source excerpts')} · {agent.evidence.length}
          </summary>
          <ul className="company-evidence-index">
            {agent.evidence.map((evidence) => (
              <li key={evidence.id}>
                <button type="button" onClick={() => onEvidence(evidence)}>
                  <span>
                    <strong>{evidence.title}</strong>
                    <small>
                      {evidence.quote.slice(0, 160)}
                      {evidence.quote.length > 160 ? '…' : ''}
                    </small>
                  </span>
                  <Tag>PDF {evidence.page}</Tag>
                  <ArrowUpRight size={14} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="company-record-details company-coverage">
        <summary>{t('本次覆盖范围', 'Coverage for this run')}</summary>
        <dl>
          <div>
            <dt>{t('完整年报', 'Annual reports')}</dt>
            <dd>{agent.coverage.annualReports}</dd>
          </div>
          <div>
            <dt>{t('近期公告标题', 'Recent titles')}</dt>
            <dd>{agent.coverage.recentTitles}</dd>
          </div>
          <div>
            <dt>{t('已读取公告文本', 'Disclosure texts read')}</dt>
            <dd>{agent.coverage.recentFullTexts}</dd>
          </div>
        </dl>
        <p className="field-note">
          {t(
            '仅有标题的公告尚未读取全文。',
            'The full text of title-only disclosures has not been read.'
          )}
        </p>
        {agent.coverage.recentTruncated && (
          <p className="field-note">
            {t('近期结果受到读取上限限制。', 'Recent results were limited by the reading budget.')}
          </p>
        )}
        {agent.coverage.warnings.length > 0 && (
          <ul>
            {agent.coverage.warnings.map((warning, index) => (
              <li key={index}>{locale === 'en' ? translateRule(warning) : warning}</li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

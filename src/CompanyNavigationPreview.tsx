import { ArrowUpRight, FileText } from 'lucide-react';
import { useMemo } from 'react';
import type { CompanyResearchRun } from '../shared/contracts';
import { contextFieldLabels, type CompanyReadingBasis } from '../shared/company-analysis';
import type {
  CompanyRecordSummary,
  IndustryMetricKey,
  PublicSourceState,
} from '../shared/company-workspace';
import { companyPath } from '../shared/company-workspace';
import { companyNavigationItems } from '../shared/company-navigation';
import { deriveCompanyNavigationPreview } from './company-navigation-preview';
import { useApp } from './context';
import { money, type Locale } from './format';

type NavigationSection = (typeof companyNavigationItems)[number][0];
type Preview = ReturnType<typeof deriveCompanyNavigationPreview>;
const industryLabels: Record<IndustryMetricKey, readonly [string, string]> = {
  grossMargin: ['毛利率', 'Gross margin'],
  roe: ['净资产收益率', 'Return on equity'],
  ocfToRevenue: ['经营现金 / 营收', 'Operating cash / revenue'],
  assetLiabilityRatio: ['资产负债率', 'Liabilities / assets'],
  receivableToRevenue: ['应收 / 营收', 'Receivables / revenue'],
  revenueGrowth: ['营收增长', 'Revenue growth'],
};
const profileLabels: Record<string, readonly [string, string]> = {
  orgName: ['企业全称', 'Company name'],
  industry: ['行业', 'Industry'],
  business: ['主营业务', 'Business'],
  controller: ['实际控制人', 'Controller'],
  legalPerson: ['法定代表人', 'Legal representative'],
  founded: ['成立日期', 'Founded'],
  listed: ['上市日期', 'Listed'],
  employees: ['员工人数', 'Employees'],
  auditor: ['审计机构', 'Auditor'],
  province: ['省份', 'Province'],
  address: ['注册地址', 'Registered address'],
  description: ['企业简介', 'Profile'],
};
const sourceLabels: Record<PublicSourceState, readonly [string, string]> = {
  available: ['已取得', 'Retrieved'],
  partial: ['部分取得', 'Partial'],
  empty: ['无返回内容', 'No returned content'],
  error: ['未取得', 'Unavailable'],
  manual: ['待核对', 'Check required'],
};

function amount(value: string | null, locale: Locale) {
  return value === null ? (locale === 'en' ? 'Not retrieved' : '未取得') : money(value, locale);
}

function TrendPreview({ preview, basis }: { preview: Preview; basis: CompanyReadingBasis }) {
  const { t, locale } = useApp();
  const rows = preview.trends;
  const values = rows
    .flatMap((row) => [row.profit, row.peerProfit])
    .filter((value) => value !== null)
    .map(Number);
  const maximum = Math.max(...values, 0);
  const minimum = Math.min(...values, 0);
  const hasValues = values.length > 0;
  const span = maximum - minimum || 1;
  const y = (value: number) => 144 - ((value - minimum) / span) * 120;
  const x = (index: number) => (rows.length === 1 ? 174 : 28 + index * (292 / (rows.length - 1)));
  const peer = rows.some((row) => row.peerProfit !== null);
  return (
    <>
      <p className="company-navigation-preview-kicker">
        {basis === 'parent'
          ? t('归母净利润', 'Attributable profit')
          : t('合并净利润', 'Consolidated profit')}{' '}
        · {t('人民币', 'CNY')}
      </p>
      {hasValues && (
        <div className="company-navigation-trend-chart">
          <svg
            viewBox="0 0 348 178"
            role="img"
            aria-label={t(
              '已取得年度利润与同年同行中位数，精确数值见下表',
              'Retrieved annual profit and same-year peer medians; exact values are in the table below'
            )}
          >
            <line x1="16" x2="332" y1={y(0)} y2={y(0)} className="navigation-chart-baseline" />
            {peer &&
              rows.map(
                (row, index) =>
                  row.peerProfit !== null && (
                    <circle
                      key={`peer-${row.period}`}
                      cx={x(index)}
                      cy={y(Number(row.peerProfit))}
                      r="6"
                      className="navigation-chart-peer"
                    >
                      <title>
                        {row.period.slice(0, 4)} · {t('同行中位', 'Peer median')} ·{' '}
                        {money(row.peerProfit, locale, false)} CNY
                      </title>
                    </circle>
                  )
              )}
            {rows.map((row, index) => (
              <g key={row.period}>
                {row.profit !== null && (
                  <>
                    <line
                      x1={x(index)}
                      x2={x(index)}
                      y1={y(0)}
                      y2={y(Number(row.profit))}
                      className="navigation-chart-company-stem"
                    />
                    <circle
                      cx={x(index)}
                      cy={y(Number(row.profit))}
                      r="4"
                      className="navigation-chart-company"
                    >
                      <title>
                        {row.period.slice(0, 4)} · {t('本企业', 'Company')} ·{' '}
                        {money(row.profit, locale, false)} CNY
                      </title>
                    </circle>
                  </>
                )}
                <text x={x(index)} y="170" textAnchor="middle">
                  {row.period.slice(0, 4)}
                </text>
              </g>
            ))}
          </svg>
          <div className="company-navigation-chart-legend">
            <span className="navigation-legend-company">{t('本企业', 'Company')}</span>
            {peer && <span className="navigation-legend-peer">{t('同行中位', 'Peer median')}</span>}
          </div>
        </div>
      )}
      <table className="company-navigation-preview-table">
        <thead>
          <tr>
            <th>{t('年度', 'Year')}</th>
            <th>{t('利润', 'Profit')}</th>
            <th>{t('经营现金', 'Operating cash')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period}>
              <th scope="row">{row.period.slice(0, 4)}</th>
              <td
                title={row.profit === null ? undefined : `${money(row.profit, locale, false)} CNY`}
              >
                {amount(row.profit, locale)}
              </td>
              <td title={row.ocf === null ? undefined : `${money(row.ocf, locale, false)} CNY`}>
                {amount(row.ocf, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Menu previews read already loaded public evidence. They never request or create research. */
export function CompanyNavigationPreview({
  id,
  section,
  record,
  run,
  basis,
  onClose,
}: {
  id: string;
  section: NavigationSection;
  record: CompanyRecordSummary | null;
  run: CompanyResearchRun | null;
  basis: CompanyReadingBasis;
  onClose: () => void;
}) {
  const { t, locale } = useApp();
  const preview = useMemo(
    () => deriveCompanyNavigationPreview(record, run, basis, locale),
    [record, run, basis, locale]
  );
  const entry = companyNavigationItems.find(([key]) => key === section)!;
  const index = companyNavigationItems.findIndex(([key]) => key === section) + 1;
  let hasContent = preview.available;
  if (section === 'overview')
    hasContent =
      hasContent &&
      Boolean(
        preview.overview.summary || preview.overview.metrics.some((metric) => metric.value !== null)
      );
  if (section === 'trends') hasContent = hasContent && preview.trends.length > 0;
  if (section === 'industry')
    hasContent =
      hasContent && preview.industry.snapshot !== null && preview.industry.metrics.length > 0;
  if (section === 'disclosures') hasContent = hasContent && preview.disclosures.length > 0;
  if (section === 'profile') hasContent = hasContent && preview.profile.length > 0;
  if (section === 'coverage') hasContent = hasContent && preview.coverage.receipts.length > 0;
  if (section === 'sources') hasContent = hasContent && preview.comparisons.length > 0;
  const emptyLabels: Record<NavigationSection, readonly [string, string]> = {
    overview: [
      '打开报告，看看已取得的判断与数字。',
      'Open the report to see available judgments and figures.',
    ],
    trends: ['尚无已载入的年度财务数据。', 'No annual financial data is loaded yet.'],
    industry: [
      '可比较的同年同行数据尚未取得。',
      'Comparable same-year peer data is not available yet.',
    ],
    disclosures: ['尚无已载入的公告。', 'No announcements are loaded yet.'],
    profile: ['尚无已载入的企业资料。', 'No company profile is loaded yet.'],
    coverage: ['尚无已载入的来源记录。', 'No source records are loaded yet.'],
    sources: ['尚无已载入的来源比对结果。', 'No source comparison is loaded yet.'],
  };
  return (
    <aside
      className="company-navigation-preview"
      id={id}
      aria-label={t('页面预览', 'Page preview')}
      data-section={section}
    >
      <header className="company-navigation-preview-header">
        <span>{t('页面预览', 'Page preview')}</span>
        <span aria-hidden="true">{String(index).padStart(2, '0')} / 07</span>
      </header>
      <h2 className="company-navigation-preview-title" aria-live="polite" aria-atomic="true">
        {t(entry[1], entry[2])}
      </h2>
      <div className="company-navigation-preview-content">
        {!hasContent ? (
          <div className="company-navigation-preview-empty">
            <FileText size={42} strokeWidth={1.1} aria-hidden="true" />
            <p>
              {!record
                ? t(
                    '新建研究后，这里会显示企业的报告与数据。',
                    'Start research to see the company report and data here.'
                  )
                : preview.scope === 'mismatch'
                  ? t(
                      '当前资料与所选企业或年度不匹配。',
                      'The loaded data does not match this company or year.'
                    )
                  : t(...emptyLabels[section])}
            </p>
          </div>
        ) : (
          <>
            {section === 'overview' && (
              <>
                <div className="company-navigation-report-lead">
                  {preview.overview.grade && (
                    <div
                      className="company-navigation-preview-grade"
                      data-grade={preview.overview.grade}
                    >
                      <span>{t('财务评级', 'Financial grade')}</span>
                      <strong>
                        {preview.overview.grade === 'NR'
                          ? t('未评级', 'Unrated')
                          : preview.overview.grade}
                      </strong>
                    </div>
                  )}
                  <p>
                    {preview.overview.summary ||
                      t(
                        '财务数据已取得，核心判断尚未形成。',
                        'Financial data is available; the core judgment is pending.'
                      )}
                  </p>
                </div>
                <dl className="company-navigation-preview-metrics">
                  {preview.overview.metrics.slice(0, 4).map((metric) => (
                    <div key={metric.field}>
                      <dt>{t(...metric.label)}</dt>
                      <dd
                        title={
                          metric.value === null
                            ? undefined
                            : `${money(metric.value, locale, false)} CNY`
                        }
                      >
                        {metric.status === 'conflict'
                          ? t('待核对', 'Check required')
                          : amount(metric.value, locale)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="company-navigation-preview-note">
                  {record?.input.year} · {t('人民币', 'CNY')}
                </p>
              </>
            )}
            {section === 'trends' && <TrendPreview preview={preview} basis={basis} />}
            {section === 'industry' && (
              <>
                <p className="company-navigation-industry-name">
                  {preview.industry.snapshot!.industry}
                </p>
                <p className="company-navigation-preview-note">
                  {preview.industry.snapshot!.period.slice(0, 4)} ·{' '}
                  {t(
                    `${preview.industry.snapshot!.peerCount} 家同行`,
                    `${preview.industry.snapshot!.peerCount} peers`
                  )}
                </p>
                <table className="company-navigation-preview-table company-navigation-peer-table">
                  <thead>
                    <tr>
                      <th>{t('指标', 'Measure')}</th>
                      <th>{t('本企业', 'Company')}</th>
                      <th>{t('同行中位', 'Peer median')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.industry.metrics.slice(0, 4).map((metric) => (
                      <tr key={metric.key}>
                        <th scope="row">{t(...industryLabels[metric.key])}</th>
                        <td className="navigation-value-company">
                          {metric.company === null ? '—' : `${metric.company.toFixed(1)}%`}
                        </td>
                        <td className="navigation-value-peer">
                          {metric.median === null ? '—' : `${metric.median.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="company-navigation-preview-note">
                  {t(
                    `每项指标至少 ${preview.industry.minimumSamples} 家有效同行`,
                    `At least ${preview.industry.minimumSamples} valid peers per measure`
                  )}
                </p>
              </>
            )}
            {section === 'disclosures' && (
              <ol className="company-navigation-preview-disclosures">
                {preview.disclosures.slice(0, 4).map((disclosure) => (
                  <li key={disclosure.id}>
                    <time dateTime={disclosure.date}>
                      {disclosure.date.slice(0, 10) || t('日期未提供', 'Date unavailable')}
                    </time>
                    <strong>{disclosure.title}</strong>
                    {disclosure.matched && <span>{disclosure.matched}</span>}
                  </li>
                ))}
              </ol>
            )}
            {section === 'profile' && (
              <dl className="company-navigation-preview-profile">
                {preview.profile.slice(0, 5).map((item) => (
                  <div key={item.key}>
                    <dt>{profileLabels[item.key] ? t(...profileLabels[item.key]) : item.key}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {section === 'coverage' && (
              <>
                <div className="company-navigation-coverage-hero">
                  <strong>{preview.coverage.annualYears}</strong>
                  <span>{t('个年度已取得', 'annual periods retrieved')}</span>
                </div>
                <ul className="company-navigation-preview-receipts">
                  {preview.coverage.receipts.slice(0, 5).map((source) => (
                    <li key={source.id}>
                      <span>{source.dimension || source.provider}</span>
                      <span data-state={source.status}>{t(...sourceLabels[source.status])}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {section === 'sources' && (
              <>
                <p className="company-navigation-preview-kicker">
                  {t('已取得的交叉核对', 'Retrieved cross-checks')}
                </p>
                <ul className="company-navigation-preview-comparisons">
                  {preview.comparisons.slice(0, 4).map((comparison) => (
                    <li key={`${comparison.period}:${comparison.field}`}>
                      <span>
                        {comparison.period.slice(0, 4)} ·{' '}
                        {t(...contextFieldLabels[comparison.field])}
                      </span>
                      <strong data-matches={comparison.matches}>
                        {comparison.matches
                          ? t('数值一致', 'Figures agree')
                          : t('数值有差异', 'Figures differ')}
                      </strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      <footer className="company-navigation-preview-footer">
        <span>
          {preview.context?.fetchedAt
            ? t('资料取得于 ', 'Retrieved ') + preview.context.fetchedAt.slice(0, 10)
            : t('预览已载入内容', 'Preview loaded content')}
        </span>
        {record && (
          <a href={companyPath(record.id, section)} onClick={onClose}>
            {t('打开页面', 'Open page')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
      </footer>
    </aside>
  );
}

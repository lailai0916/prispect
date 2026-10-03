import { Select } from './Select';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileSearch, LoaderCircle, RefreshCw } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  industryChartMetricKeys,
  industryMetricKeys,
  type CompanyIndustrySnapshot,
  type ContextAmountField,
  type IndustryChartMetricKey,
  type IndustryMetricKey,
} from '../shared/company-workspace';
import { contextSum } from '../shared/company-analysis';
import { financialChartAmount } from '../shared/company-financial-charts';
import { api, requestErrorText } from './api';
import { Dialog, Tag } from './components';
import { useApp } from './context';
import { date, money } from './format';
import {
  ChartMetricSummary,
  IndustryDistributionChart,
  IndustryPairChart,
} from './FinancialCharts';

const labels: Record<IndustryMetricKey, readonly [string, string]> = {
  grossMargin: ['毛利率', 'Gross margin'],
  roe: ['加权 ROE', 'Weighted ROE'],
  ocfToRevenue: ['经营现金 / 营收', 'Operating cash / revenue'],
  assetLiabilityRatio: ['资产负债率', 'Liabilities / assets'],
  receivableToRevenue: ['应收账款 / 营收', 'Receivables / revenue'],
  revenueGrowth: ['营收同比增长', 'Revenue growth'],
};
const chartLabels: Record<IndustryChartMetricKey, readonly [string, string]> = {
  revenue: ['营业总收入', 'Revenue'],
  netProfit: ['合并净利润', 'Consolidated net profit'],
  parentProfit: ['归母净利润', 'Profit attributable to owners'],
  ocf: ['经营现金净额', 'Operating cash flow'],
  cash: ['货币资金', 'Monetary funds'],
  shortDebt: ['两项短债合计', 'Two specified debt items'],
  inventory: ['存货', 'Inventory'],
  receivables: ['应收账款', 'Accounts receivable'],
  netMargin: ['合并净利率', 'Consolidated net margin'],
  parentNetMargin: ['归母净利率', 'Attributable net margin'],
};
type EvidenceMetric = IndustryMetricKey | IndustryChartMetricKey;
const isChartMetric = (key: EvidenceMetric): key is IndustryChartMetricKey =>
  industryChartMetricKeys.includes(key as IndustryChartMetricKey);
const isChartAmount = (key: IndustryChartMetricKey) =>
  key !== 'netMargin' && key !== 'parentNetMargin';
const value = (number: number | null) =>
  number === null || !Number.isFinite(number) ? '—' : `${number.toFixed(2)}%`;
export function CompanyIndustryView({
  run,
  selectedPeriod,
  onPeriodChange,
  onSnapshot,
  industries,
}: {
  run: CompanyResearchRun;
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
  onSnapshot?: (snapshot: CompanyIndustrySnapshot) => void;
  industries?: Record<string, CompanyIndustrySnapshot>;
}) {
  const { t, locale, user } = useApp(),
    years = [
      ...new Set(run.context?.financials.filter((row) => row.annual).map((row) => row.period)),
    ]
      .sort()
      .reverse();
  const [requestedPeriod, setPeriod] = useState(years[0] || `${run.input.year}-12-31`);
  const requested = selectedPeriod ?? requestedPeriod;
  const period = years.length && !years.includes(requested) ? years[0]! : requested;
  const scope = `${user?.id || ''}:${run.id}:${run.input.securityCode}:${period}`;
  const [result, setResult] = useState<{
      scope: string;
      snapshot: CompanyIndustrySnapshot | null;
      stale: boolean;
      error: string;
    } | null>(null),
    [loadingScope, setLoadingScope] = useState<string | null>(null),
    [evidence, setEvidence] = useState<EvidenceMetric | null>(null),
    [distributionMetric, setDistributionMetric] = useState<IndustryMetricKey>('grossMargin');
  const generation = useRef(0),
    request = useRef<AbortController | null>(null);
  const currentResult = result?.scope === scope ? result : null;
  const loadedSnapshot =
    currentResult?.snapshot || industries?.[period] || run.industry?.[period] || null;
  const snapshot =
    loadedSnapshot?.version === 1 &&
    loadedSnapshot.period === period &&
    loadedSnapshot.securityCode === run.input.securityCode
      ? loadedSnapshot
      : null;
  const loading = loadingScope === scope;
  const error = currentResult?.error || '';
  const stale = currentResult?.stale || false;
  const chartValue = (number: number | null | undefined, key: IndustryChartMetricKey) => {
    if (number === null || number === undefined || !Number.isFinite(number)) return '—';
    return isChartAmount(key) ? money(String(number), locale, false) : value(number);
  };
  const contextAmount = (key: IndustryChartMetricKey): string | null => {
    const context = run.context;
    if (
      !context ||
      context.securityCode !== snapshot?.securityCode ||
      !context.financials.some((row) => row.annual && row.period === period) ||
      !isChartAmount(key)
    )
      return null;
    if (key === 'shortDebt')
      return contextSum(
        ['shortLoan', 'currentPortionDebt'].map((field) =>
          financialChartAmount(context, period, field as ContextAmountField)
        )
      );
    return financialChartAmount(context, period, key as ContextAmountField);
  };
  const differsFromContext = (key: IndustryChartMetricKey) => {
    const context = contextAmount(key),
      company = snapshot?.chartMetrics?.[key]?.company;
    return (
      context !== null &&
      company !== null &&
      company !== undefined &&
      Number.isFinite(company) &&
      Math.abs(Number(context) - company) > 0.01
    );
  };
  useEffect(() => {
    setResult((previous) => (previous?.scope === scope ? { ...previous, error: '' } : null));
    setLoadingScope(null);
    setEvidence(null);
    return () => {
      generation.current += 1;
      request.current?.abort();
      request.current = null;
    };
  }, [scope, locale]);
  function loadIndustry(refresh = false) {
    request.current?.abort();
    const controller = new AbortController(),
      current = ++generation.current;
    request.current = controller;
    setLoadingScope(scope);
    setResult({ scope, snapshot, stale, error: '' });
    void api<{ snapshot: CompanyIndustrySnapshot; stale: boolean; warning?: string }>(
      `/company-runs/${run.id}/industry`,
      { method: 'POST', body: JSON.stringify({ period, refresh }), signal: controller.signal }
    )
      .then((response) => {
        if (!controller.signal.aborted && current === generation.current) {
          if (
            response.snapshot.version !== 1 ||
            response.snapshot.period !== period ||
            response.snapshot.securityCode !== run.input.securityCode
          ) {
            setResult({
              scope,
              snapshot,
              stale,
              error: t(
                '行业数据与当前企业或年度不匹配，请重试。',
                'The industry data does not match this company or year. Please retry.'
              ),
            });
            return;
          }
          setResult({
            scope,
            snapshot: response.snapshot,
            stale: response.stale,
            error: response.warning || '',
          });
          onSnapshot?.(response.snapshot);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted && current === generation.current)
          setResult({ scope, snapshot, stale, error: requestErrorText(cause, locale) });
      })
      .finally(() => {
        if (!controller.signal.aborted && current === generation.current) {
          setLoadingScope(null);
          request.current = null;
        }
      });
  }
  return (
    <>
      <div className="context-section-title">
        <div>
          <h2>{t('企业与同行', 'Company and peers')}</h2>
          <p className="muted">
            {period} · {t('完整年报', 'Full annual report')}
          </p>
        </div>
        <div className="context-filters">
          <label>
            {t('年度', 'Year')}
            <Select
              aria-label={t('行业对比年度', 'Industry-comparison year')}
              value={period}
              onValueChange={(selectedValue) => {
                setPeriod(selectedValue);
                onPeriodChange?.(selectedValue);
              }}
            >
              {(years.length ? years : [period]).map((year) => (
                <option key={year} value={year}>
                  {year.slice(0, 4)} {t('年报', 'annual')}
                </option>
              ))}
            </Select>
          </label>
          {snapshot && (
            <button
              className="icon-button"
              type="button"
              aria-label={t('更新行业数据', 'Refresh industry data')}
              disabled={loading}
              onClick={() => loadIndustry(true)}
            >
              {loading ? <LoaderCircle size={16} className="spinner" /> : <RefreshCw size={16} />}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {loading && !snapshot && (
        <p className="context-empty" role="status">
          <LoaderCircle size={18} className="spinner" />
          {t('正在获取同年度行业样本…', 'Retrieving same-year industry samples…')}
        </p>
      )}
      {!snapshot && !loading && (
        <button className="button secondary" type="button" onClick={() => loadIndustry()}>
          {t('查看行业对比', 'View industry comparison')}
        </button>
      )}
      {snapshot && (
        <>
          <div className="context-industry-heading">
            <div>
              <strong>{snapshot.industry}</strong>
              <span>
                {t('查询时细分行业分类', 'Detailed industry classification at retrieval')}
              </span>
            </div>
            <div>
              <strong>
                {snapshot.peerCount} {t('家同行', 'peers')}
              </strong>
              <span>
                {t('沪深 A 股 · 剔除本企业', 'Shanghai/Shenzhen A shares; target excluded')}
              </span>
            </div>
            {stale && <Tag>{t('上次快照', 'Previous snapshot')}</Tag>}
            {snapshot.status === 'partial' && <Tag>{t('部分指标可用', 'Partial coverage')}</Tag>}
          </div>
          <div className="financial-chart-grid">
            {industryMetricKeys.map((key) => {
              const metric = snapshot.metrics[key];
              return (
                <section className="financial-chart-card" key={key}>
                  <div className="financial-chart-header">
                    <h3>{t(...labels[key])}</h3>
                    <button
                      type="button"
                      className="context-evidence-button"
                      aria-label={t(
                        `查看${labels[key][0]}的样本与来源`,
                        `View ${labels[key][1]} samples and sources`
                      )}
                      onClick={() => setEvidence(key)}
                    >
                      <FileSearch size={13} />
                      {t('依据', 'Evidence')}
                    </button>
                  </div>
                  <ChartMetricSummary
                    company={metric.company}
                    peer={metric.mean}
                    unit="percent"
                    count={metric.count}
                    period={period}
                  />
                  <IndustryPairChart
                    company={metric.company}
                    peer={metric.mean}
                    label={t(...labels[key])}
                  />
                  <p className="financial-chart-note">
                    {t('同行中位数', 'Peer median')} {value(metric.median)}
                  </p>
                </section>
              );
            })}
          </div>
          <section className="financial-chart-card financial-chart-distribution">
            <div className="financial-chart-header">
              <h3>{t('同行分布', 'Peer distribution')}</h3>
              <div className="financial-chart-actions">
                <Select
                  aria-label={t('同行分布指标', 'Peer-distribution metric')}
                  value={distributionMetric}
                  onValueChange={(selectedValue) => {
                    if (industryMetricKeys.includes(selectedValue as IndustryMetricKey))
                      setDistributionMetric(selectedValue as IndustryMetricKey);
                  }}
                >
                  {industryMetricKeys.map((key) => (
                    <option key={key} value={key}>
                      {t(...labels[key])}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="context-evidence-button"
                  onClick={() => setEvidence(distributionMetric)}
                >
                  <FileSearch size={13} />
                  {t('样本与来源', 'Samples and sources')}
                </button>
              </div>
            </div>
            <ChartMetricSummary
              company={snapshot.metrics[distributionMetric].company}
              peer={snapshot.metrics[distributionMetric].mean}
              unit="percent"
              period={period}
              count={
                snapshot.samples.filter(
                  (sample) =>
                    sample.code !== snapshot.securityCode &&
                    sample.values[distributionMetric] !== null &&
                    Number.isFinite(sample.values[distributionMetric])
                ).length
              }
            />
            <IndustryDistributionChart snapshot={snapshot} metric={distributionMetric} />
            <p className="financial-chart-note">
              {t('同行中位数', 'Peer median')} {value(snapshot.metrics[distributionMetric].median)}
              {' · '}
              {t(
                `剔除本企业；至少 ${Math.max(5, snapshot.minimumSamples)} 家有效同行展示分布。`,
                `Target excluded; distribution requires at least ${Math.max(5, snapshot.minimumSamples)} valid peers.`
              )}
            </p>
          </section>
          <details className="context-disclosure">
            <summary>{t('完整对比数据', 'Full comparison data')}</summary>
            <div className="table-scroll">
              <table className="context-industry-table">
                <thead>
                  <tr>
                    <th>{t('指标', 'Metric')}</th>
                    <th>{t('企业值', 'Company')}</th>
                    <th>{t('同行均值', 'Peer mean')}</th>
                    <th>{t('同行中位数', 'Peer median')}</th>
                    <th>{t('与均值差异', 'Difference from mean')}</th>
                    <th>{t('有效同行', 'Valid peers')}</th>
                    <th>{t('依据', 'Evidence')}</th>
                  </tr>
                </thead>
                <tbody>
                  {industryMetricKeys.map((key) => {
                    const metric = snapshot.metrics[key];
                    return (
                      <tr key={key}>
                        <td>{t(...labels[key])}</td>
                        <td>
                          <strong>{value(metric.company)}</strong>
                        </td>
                        <td>{value(metric.mean)}</td>
                        <td>{value(metric.median)}</td>
                        <td>
                          {metric.difference === null
                            ? '—'
                            : `${metric.difference > 0 ? '+' : ''}${metric.difference.toFixed(2)} ${t('个百分点', 'pp')}`}
                        </td>
                        <td>
                          {metric.count} / {snapshot.peerCount}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="context-evidence-button"
                            onClick={() => setEvidence(key)}
                          >
                            <FileSearch size={13} />
                            {t('样本与来源', 'Samples and sources')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="context-data-note">
              <p>
                {t(
                  '样本为该年度已披露的沪深上市企业；比率等权平均，保留亏损与极端值。',
                  'Samples are disclosed Shanghai/Shenzhen listed companies for this year. Ratios use an equal-weight mean, retaining losses and extremes.'
                )}
              </p>
              <p>
                {t(
                  '负债与应收比例需结合结构解读。有效同行不足五家时，均值与差异保持未知。',
                  'Debt and receivables ratios need structural context. Means and differences are withheld below five valid peers.'
                )}
              </p>
            </div>
          </details>
          {snapshot.chartMetrics && (
            <details className="context-disclosure">
              <summary>{t('金额与净利率参照', 'Amount and net-margin references')}</summary>
              <div className="table-scroll">
                <table className="context-industry-table">
                  <thead>
                    <tr>
                      <th>{t('指标', 'Metric')}</th>
                      <th>{t('企业值', 'Company')}</th>
                      <th>{t('同行均值', 'Peer mean')}</th>
                      <th>{t('同行中位数', 'Peer median')}</th>
                      <th>{t('与均值差异', 'Difference from mean')}</th>
                      <th>{t('有效同行', 'Valid peers')}</th>
                      <th>{t('依据', 'Evidence')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {industryChartMetricKeys.map((key) => {
                      const metric = snapshot.chartMetrics?.[key],
                        enoughPeers =
                          metric && metric.count >= Math.max(5, snapshot.minimumSamples),
                        difference = enoughPeers ? metric.difference : null;
                      return (
                        <tr key={key}>
                          <td>
                            {t(...chartLabels[key])}
                            <small>{isChartAmount(key) ? t('元', 'yuan') : '%'}</small>
                          </td>
                          <td>
                            <strong>{chartValue(metric?.company, key)}</strong>
                            {differsFromContext(key) && (
                              <small>
                                {t('与财务快照不同', 'Differs from financial snapshot')}
                              </small>
                            )}
                          </td>
                          <td>{chartValue(enoughPeers ? metric.mean : null, key)}</td>
                          <td>{chartValue(enoughPeers ? metric.median : null, key)}</td>
                          <td>
                            {difference === null || difference === undefined
                              ? '—'
                              : `${difference > 0 ? '+' : ''}${isChartAmount(key) ? chartValue(difference, key) : `${difference.toFixed(2)} ${t('个百分点', 'pp')}`}`}
                          </td>
                          <td>{metric ? `${metric.count} / ${snapshot.peerCount}` : '—'}</td>
                          <td>
                            <button
                              type="button"
                              className="context-evidence-button"
                              onClick={() => setEvidence(key)}
                            >
                              <FileSearch size={13} />
                              {t('样本与来源', 'Samples and sources')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {snapshot.warnings.map((warning, index) => (
            <p className="muted" key={index}>
              {warning}
            </p>
          ))}
          <p className="muted">
            {t('获取时间', 'Retrieved at')} {date(snapshot.fetchedAt, locale)}
          </p>
          {evidence && (
            <Dialog
              title={t(...(isChartMetric(evidence) ? chartLabels[evidence] : labels[evidence]))}
              onClose={() => setEvidence(null)}
              variant="drawer"
            >
              <p>
                {snapshot.industry} · {snapshot.period}
              </p>
              <p className="muted">
                {t(
                  '本企业从同行均值中剔除；逐样本保留有效值与缺失值。',
                  'The target is excluded from peer means; valid and missing values remain visible.'
                )}
              </p>
              {isChartMetric(evidence) && evidence === 'shortDebt' && (
                <p className="context-formula">
                  {t(
                    '短期借款 + 一年内到期非流动负债',
                    'Short-term borrowing + current portion of noncurrent liabilities'
                  )}
                </p>
              )}
              {isChartMetric(evidence) &&
                (evidence === 'netMargin' || evidence === 'parentNetMargin') && (
                  <p className="context-formula">
                    {evidence === 'netMargin'
                      ? t(
                          '合并净利润 ÷ 营业总收入 × 100%',
                          'Consolidated net profit / revenue × 100%'
                        )
                      : t(
                          '归母净利润 ÷ 营业总收入 × 100%',
                          'Profit attributable to owners / revenue × 100%'
                        )}
                  </p>
                )}
              {isChartMetric(evidence) && differsFromContext(evidence) && (
                <>
                  <p>{t('与财务快照不同', 'Differs from financial snapshot')}</p>
                  <dl className="context-year-metrics">
                    <div>
                      <dt>{t('财务快照（元）', 'Financial snapshot (yuan)')}</dt>
                      <dd>{money(contextAmount(evidence), locale, false)}</dd>
                    </div>
                    <div>
                      <dt>
                        {t('同行取数中的企业值（元）', 'Company value in peer retrieval (yuan)')}
                      </dt>
                      <dd>{chartValue(snapshot.chartMetrics?.[evidence]?.company, evidence)}</dd>
                    </div>
                  </dl>
                  <p className="muted">
                    {t('财务快照获取时间', 'Financial snapshot retrieved at')}{' '}
                    {date(run.context!.fetchedAt, locale)} ·{' '}
                    {t('同行快照获取时间', 'Peer snapshot retrieved at')}{' '}
                    {date(snapshot.fetchedAt, locale)}
                  </p>
                  {[
                    ...new Set(
                      run
                        .context!.financials.filter((row) => row.annual && row.period === period)
                        .flatMap((row) => row.sourceUrls)
                    ),
                  ].map((url, index) => (
                    <p key={url}>
                      <a className="text-link" href={url} target="_blank" rel="noreferrer">
                        {t(`财务字段来源 ${index + 1}`, `Financial field source ${index + 1}`)}
                        <ArrowUpRight size={12} />
                      </a>
                    </p>
                  ))}
                </>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('企业', 'Company')}</th>
                      <th>
                        {isChartMetric(evidence) && isChartAmount(evidence)
                          ? t('数值（元）', 'Value (yuan)')
                          : t('数值（%）', 'Value (%)')}
                      </th>
                      <th>{t('披露日期', 'Disclosure date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.samples.map((sample) => (
                      <tr key={sample.code}>
                        <td>
                          {sample.name}
                          <small>
                            {sample.code}
                            {sample.code === snapshot.securityCode
                              ? ` · ${t('本企业，未计入均值', 'target, excluded from mean')}`
                              : ''}
                          </small>
                        </td>
                        <td>
                          {isChartMetric(evidence)
                            ? chartValue(sample.chartValues?.[evidence], evidence)
                            : value(sample.values[evidence])}
                        </td>
                        <td>{sample.noticeDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {snapshot.sources.map((source, index) => (
                <details key={`${source.url}:${index}`}>
                  <summary>{t(`样本来源 ${index + 1}`, `Sample source ${index + 1}`)}</summary>
                  <a className="text-link" href={source.url} target="_blank" rel="noreferrer">
                    {t('打开取数入口', 'Open field source')}
                    <ArrowUpRight size={12} />
                  </a>
                  <code>{source.sha256}</code>
                </details>
              ))}
            </Dialog>
          )}
        </>
      )}
    </>
  );
}

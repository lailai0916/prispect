import { Select } from './Select';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileSearch, LoaderCircle, RefreshCw } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  industryMetricKeys,
  type CompanyIndustrySnapshot,
  type IndustryMetricKey,
} from '../shared/company-workspace';
import { api, requestErrorText } from './api';
import { Dialog, Tag } from './components';
import { useApp } from './context';
import { date } from './format';

const labels: Record<IndustryMetricKey, readonly [string, string]> = {
  grossMargin: ['毛利率', 'Gross margin'],
  roe: ['加权 ROE', 'Weighted ROE'],
  ocfToRevenue: ['经营现金 / 营收', 'Operating cash / revenue'],
  assetLiabilityRatio: ['资产负债率', 'Liabilities / assets'],
  receivableToRevenue: ['应收账款 / 营收', 'Receivables / revenue'],
  revenueGrowth: ['营收同比增长', 'Revenue growth'],
};
const value = (number: number | null) => (number === null ? '—' : `${number.toFixed(2)}%`);
export function CompanyIndustryView({ run }: { run: CompanyResearchRun }) {
  const { t, locale } = useApp(),
    years = [
      ...new Set(run.context?.financials.filter((row) => row.annual).map((row) => row.period)),
    ]
      .sort()
      .reverse();
  const [requestedPeriod, setPeriod] = useState(years[0] || `${run.input.year}-12-31`);
  const period = years.length && !years.includes(requestedPeriod) ? years[0]! : requestedPeriod;
  const [loadedSnapshot, setSnapshot] = useState<CompanyIndustrySnapshot | null>(
      run.industry?.[period] || null
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [stale, setStale] = useState(false),
    [evidence, setEvidence] = useState<IndustryMetricKey | null>(null),
    [retry, setRetry] = useState(0);
  const generation = useRef(0),
    forced = useRef(false);
  const snapshot =
    loadedSnapshot?.period === period && loadedSnapshot.securityCode === run.input.securityCode
      ? loadedSnapshot
      : null;
  useEffect(() => {
    const controller = new AbortController(),
      current = ++generation.current;
    setLoading(true);
    setError('');
    setStale(false);
    setSnapshot(run.industry?.[period] || null);
    const refresh = forced.current;
    forced.current = false;
    void api<{ snapshot: CompanyIndustrySnapshot; stale: boolean; warning?: string }>(
      `/company-runs/${run.id}/industry`,
      { method: 'POST', body: JSON.stringify({ period, refresh }), signal: controller.signal }
    )
      .then((response) => {
        if (!controller.signal.aborted && current === generation.current) {
          setSnapshot(response.snapshot);
          setStale(response.stale);
          setError(response.warning || '');
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted && current === generation.current)
          setError(requestErrorText(cause, locale));
      })
      .finally(() => {
        if (!controller.signal.aborted && current === generation.current) setLoading(false);
      });
    return () => controller.abort();
  }, [run.id, period, retry, locale]);
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
              onValueChange={(selectedValue) => setPeriod(selectedValue)}
            >
              {(years.length ? years : [period]).map((year) => (
                <option key={year} value={year}>
                  {year.slice(0, 4)} {t('年报', 'annual')}
                </option>
              ))}
            </Select>
          </label>
          <button
            className="icon-button"
            type="button"
            aria-label={t('更新行业数据', 'Refresh industry data')}
            disabled={loading}
            onClick={() => {
              forced.current = true;
              setRetry((value) => value + 1);
            }}
          >
            {loading ? <LoaderCircle size={16} className="spinner" /> : <RefreshCw size={16} />}
          </button>
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
          </div>
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
              title={t(...labels[evidence])}
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
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('企业', 'Company')}</th>
                      <th>{t('数值', 'Value')}</th>
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
                        <td>{value(sample.values[evidence])}</td>
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

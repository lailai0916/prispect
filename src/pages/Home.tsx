import { useState } from 'react';
import { ArrowRight, ExternalLink, Search } from 'lucide-react';
import { money } from '../format';
import { useApp } from '../context';

export function Home() {
  const { t, locale, examples, navigate } = useApp();
  const [companyQuery, setCompanyQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sample = examples.find((item) => item.id === selectedId) || examples[0];
  const metric = (key: string) => sample?.metrics.find((item) => item.key === key)?.value ?? null;
  const profit = metric('netProfit');
  const cash = metric('operatingCashFlow');
  const ratio = metric('cashConversion');
  const max = Math.max(Math.abs(Number(profit || 0)), Math.abs(Number(cash || 0)), 1);
  const growth = (value: string | null) =>
    value === null ? '—' : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
  return (
    <div className="home-content">
      <section className="home-intro">
        <h1>{t('先核对一笔付款', 'Review a payment first')}</h1>
        <p>
          {t(
            '核对预付款条件，或安排接手后的付款日期。比较两个方案，查看缺哪项材料，以及证据变化后哪些结果仍成立。',
            'Review prepayment terms or plan a payment after handover. Compare two options, find the missing evidence, and see which results survive changes to the evidence.'
          )}
        </p>

        <div className="home-purpose-actions">
          <div>
            <button
              className="button button-secondary"
              onClick={() => navigate('/decisions?new=external')}
            >
              {t('核对一笔预付款', 'Review a prepayment')}
              <ArrowRight size={16} />
            </button>
            <p>
              {t(
                '先看合同与收款主体、已付与已交付，再测算这次付款后的未交付暴露。',
                'Check the contract and receiving entity, payments and delivered value, then calculate undelivered exposure after this payment.'
              )}
            </p>
          </div>
          <div>
            <button
              className="button button-secondary"
              onClick={() => navigate('/decisions?new=handover')}
            >
              {t('接手后安排一笔付款', 'Plan a payment after handover')}
              <ArrowRight size={16} />
            </button>
            <p>
              {t(
                '按具体日期排列收付事件，对照两种付款日期，定位最早缺口及下一项依据。',
                'Place cash events on specific dates, compare two payment dates, and locate the earliest gap and next evidence needed.'
              )}
            </p>
          </div>
        </div>
        <form
          className="home-company-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (companyQuery.trim())
              navigate(`/company?query=${encodeURIComponent(companyQuery.trim())}`);
          }}
        >
          <label htmlFor="home-company-query">
            {t('公司名称或证券代码', 'Company name or security code')}
          </label>
          <div>
            <input
              id="home-company-query"
              type="search"
              required
              maxLength={80}
              value={companyQuery}
              onChange={(event) => setCompanyQuery(event.target.value)}
              placeholder={t(
                '例如：松原安全、海康威视、300893',
                'Chinese company name or code, e.g. 300893'
              )}
            />
            <button className="button button-primary" type="submit">
              <Search size={16} />
              {t('查询公司', 'Find company')}
            </button>
          </div>
        </form>
      </section>
      <section className="public-example" aria-labelledby="public-example-title">
        <div className="public-example-toolbar">
          <h2 id="public-example-title">{t('公开示例', 'Public examples')}</h2>
          <div
            className="example-tabs"
            role="tablist"
            aria-label={t('选择示例', 'Choose an example')}
          >
            {examples.map((item, index) => (
              <button
                key={item.id}
                role="tab"
                id={`example-tab-${item.id}`}
                aria-controls="example-panel"
                tabIndex={sample?.id === item.id ? 0 : -1}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? examples.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : examples.length - 1)) %
                          examples.length;
                  setSelectedId(examples[next].id);
                  (
                    event.currentTarget.parentElement?.querySelectorAll('button')[next] as
                      | HTMLButtonElement
                      | undefined
                  )?.focus();
                }}
                aria-selected={sample?.id === item.id}
                className={sample?.id === item.id ? 'active' : ''}
                onClick={() => setSelectedId(item.id)}
              >
                {locale === 'en'
                  ? item.kind === 'contrast'
                    ? 'Songyuan'
                    : 'Hikvision'
                  : item.shortName}
              </button>
            ))}
          </div>
        </div>
        {sample && (
          <div id="example-panel" role="tabpanel" aria-labelledby={`example-tab-${sample.id}`}>
            <div className="example-heading">
              <div>
                <h3>
                  {locale === 'en'
                    ? sample.kind === 'contrast'
                      ? 'Songyuan Safety'
                      : 'Hikvision'
                    : sample.shortName}
                </h3>
                <p>
                  {sample.year} · {t('年度合并报表', 'Annual consolidated statements')} · CNY
                </p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => navigate(`/new?case=${sample.id}`)}
              >
                {t('使用此示例', 'Use this example')}
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="example-metrics">
              {[
                {
                  label: t('合并净利润', 'Consolidated net profit'),
                  value: profit,
                  change: metric('profitGrowth'),
                  kind: 'profit',
                },
                {
                  label: t('经营现金净额', 'Operating cash flow'),
                  value: cash,
                  change: metric('cashGrowth'),
                  kind: 'cash',
                },
              ].map((item) => (
                <div className="example-metric" key={item.kind}>
                  <div className="example-metric-heading">
                    <span>{item.label}</span>
                    <span className="example-change">
                      {t('同比', 'YoY')} {growth(item.change)}
                    </span>
                  </div>
                  <strong>
                    {money(item.value, locale, false)}
                    <small>CNY</small>
                  </strong>
                  <div className="example-bar-track" aria-hidden="true">
                    <div
                      className={`example-bar example-bar-${item.kind}`}
                      style={{
                        width: `${Math.max(0, Math.min(100, (Math.abs(Number(item.value || 0)) / max) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="example-ratio">
              <div>
                <span>{t('现金利润比', 'Cash-to-profit ratio')}</span>
                <strong>{ratio === null ? '—' : `${Number(ratio).toFixed(2)}%`}</strong>
              </div>
              <p>
                {t(
                  '经营现金净额 ÷ 合并净利润，不是销售回款率。',
                  'Operating cash flow ÷ consolidated net profit; not a sales collection rate.'
                )}
              </p>
            </div>
            <div className="example-source">
              <span>
                {sample.year} {t('年度报告', 'annual report')} · {sample.source.documentDate}{' '}
                {t('披露', 'published')}
              </span>
              <a href={sample.source.url} target="_blank" rel="noreferrer">
                {t('查看原件', 'Source PDF')}
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}
      </section>
      <p className="home-scope">
        {t(
          '支持年度合并人民币口径；用于历史财务核查，不作信用评级。',
          'Annual consolidated CNY statements. Historical financial review, without a credit rating.'
        )}{' '}
        <a href="#/method">{t('核查范围', 'Review scope')}</a>
      </p>
    </div>
  );
}

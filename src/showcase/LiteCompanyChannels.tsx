import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, FileText, Layers, MessageCircle, ScanLine } from 'lucide-react';
import { contextFen, contextYuan, type CompanyReadingBasis } from '../../shared/company-analysis';
import type { CompanyResearchRun } from '../../shared/contracts';
import { deriveCompanyFinancialOverview } from '../../shared/company-financial-overview';
import { companyEvidenceSourceUrls } from '../../shared/company-source-evidence';
import { assessmentSourceHref } from '../../shared/source-excerpt-focus';
import { useApp } from '../context';
import type { Locale } from '../format';
import { liteAmountDisplay, liteAmountScale } from './lite-amount-display';
import { LiteCompanyPublicItems, LiteCompanyReputation } from './LiteCompanySignals';
import { SignalField } from './ShowcaseSignalStage';
import './lite-company-channels.css';

export type LiteCompanyChannel = 'finance' | 'public' | 'reputation' | 'original';
const channels: LiteCompanyChannel[] = ['finance', 'public', 'reputation', 'original'];
const absolute = (amount: bigint) => (amount < 0n ? -amount : amount);

/** Presentation of one validated annual snapshot; no transport, model or historical substitution. */
export function deriveLiteCompanyFinance(
  run: CompanyResearchRun,
  basis: CompanyReadingBasis,
  locale: Locale
) {
  const overview = deriveCompanyFinancialOverview(run, basis);
  const annual = overview.state === 'available' ? overview.annual : null;
  const profitField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const profitFen = contextFen(annual?.amounts[profitField]);
  const cashFen = contextFen(annual?.amounts.ocf);
  const differenceFen = profitFen !== null && cashFen !== null ? profitFen - cashFen : null;
  const differenceYuan = differenceFen === null ? null : contextYuan(differenceFen);
  const scale = liteAmountScale(
    [annual?.amounts[profitField], annual?.amounts.ocf, differenceYuan],
    locale
  );
  const profit = liteAmountDisplay(annual?.amounts[profitField], locale, { scale });
  const cash = liteAmountDisplay(annual?.amounts.ocf, locale, { scale });
  let difference = liteAmountDisplay(differenceYuan, locale, { scale });
  // A difference of two bounded amounts can gain a digit. Keep its exact computed value.
  if (!difference && differenceYuan !== null) {
    const [integer, fraction] = differenceYuan.split('.');
    const exact = `${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
    const exactText = locale === 'en' ? `CNY ${exact}` : `${exact} 元`;
    difference = {
      text: exactText,
      exactText,
      exactYuan: differenceYuan,
      approximate: false,
      scale,
      unit: locale === 'en' ? 'CNY' : '元',
    };
  }
  const inputs = [profitFen, cashFen];
  const maximum = inputs.reduce<bigint>(
    (max, amount) => (amount !== null && absolute(amount) > max ? absolute(amount) : max),
    0n
  );
  const signed = inputs.some((amount) => amount !== null && amount < 0n);
  const bars =
    profitFen !== null && cashFen !== null
      ? inputs.map((amount) => {
          const value = amount!;
          // Convert only the bounded visual percentage, never the financial amount.
          const percent = maximum ? Number((absolute(value) * 10_000n) / maximum) / 100 : 0;
          const width = signed ? percent / 2 : percent;
          return { width, start: signed ? (value < 0n ? 50 - width : 50) : 0 };
        })
      : [];
  const sources = annual
    ? ([profitField, 'ocf'] as const).flatMap((field) =>
        (['primary', 'secondary'] as const).flatMap((provider) =>
          companyEvidenceSourceUrls(run.context, annual, field, provider).flatMap((url) => {
            const receipt = run.context?.sources.find((source) => source.url === url);
            const href = assessmentSourceHref(url);
            return href && (!receipt || ['available', 'partial'].includes(receipt.status))
              ? [{ field, provider, href }]
              : [];
          })
        )
      )
    : [];
  return {
    state: annual ? overview.state : overview.state === 'mismatch' ? 'mismatch' : 'missing',
    annual,
    profitField,
    profit,
    cash,
    difference,
    differenceYuan,
    scale,
    signed,
    bars,
    sources,
    originalHref: annual?.originalUrl ? assessmentSourceHref(annual.originalUrl) : null,
  };
}

export function LiteCompanyChannels({
  run,
  basis,
  activePage,
  pageHref,
  financeDetails,
  originalDetails,
}: {
  run: CompanyResearchRun;
  basis: CompanyReadingBasis;
  activePage: LiteCompanyChannel;
  pageHref: (page: LiteCompanyChannel) => string;
  financeDetails?: ReactNode;
  originalDetails?: ReactNode;
}) {
  const { t, locale } = useApp();
  const [scene, setScene] = useState<0 | 1>(0);
  const finance = deriveLiteCompanyFinance(run, basis, locale);
  const snapshotMatches =
    !!run.context &&
    run.context.securityCode === run.input.securityCode &&
    run.context.orgId === run.input.orgId &&
    !run.informationGap &&
    run.context.status !== 'unavailable';
  const companyName =
    run.identity?.shortName ||
    run.identity?.companyName ||
    (snapshotMatches ? run.context?.companyName : null) ||
    run.input.securityCode;
  const profitLabel = t(
    basis === 'parent' ? '归母净利润' : '合并净利润',
    basis === 'parent' ? 'Profit attributable to owners' : 'Consolidated net profit'
  );
  const cashLabel = t('经营现金净额', 'Operating cash flow');
  const tabs = [
    { page: 'finance' as const, label: t('财务', 'Finance'), icon: Layers },
    { page: 'public' as const, label: t('公开事项', 'Public records'), icon: ScanLine },
    { page: 'reputation' as const, label: t('口碑线索', 'Reputation'), icon: MessageCircle },
    { page: 'original' as const, label: t('原文', 'Original'), icon: FileText },
  ];
  const titles = {
    finance: [t('账面利润。', 'Reported profit.'), t('现金留下了吗？', 'What cash remained?')],
    public: [t('一条记录。', 'A public record.'), t('该问什么？', 'What should we ask?')],
    reputation: [t('看到评价。', 'Read the claims.'), t('先找依据。', 'Find their evidence.')],
    original: [t('回到原文。', 'Return to the source.'), t('对照来处。', 'Check the record.')],
  };
  const questions = {
    finance: t('两项数字，放在一起看。', 'Read the two amounts together.'),
    public: t('这条记录，指向什么问题？', 'What question does the record raise?'),
    reputation: t('一句评价，值得相信多少？', 'What would make a claim worth trusting?'),
    original: t('每个数字，都应该能找到来处。', 'Every number should lead to its source.'),
  };
  const description = {
    finance: t(
      '对齐公司、年度与口径，从利润和经营现金开始，再核对完整报告。',
      'Align the company, year and scope. Start with profit and operating cash, then read the report.'
    ),
    public: t(
      '保留记录的日期和原始出处，再问它说明了什么、还缺什么。',
      'Keep the date and original source. Ask what the record establishes and what remains missing.'
    ),
    reputation: t(
      '区分已取得的正文、标题与讨论，把评价留给证据核对。',
      'Distinguish retrieved text, headlines and discussions. Check claims against their evidence.'
    ),
    original: t(
      '只展示这家公司的已保存来源。未取得的原件和节选，继续保持未知。',
      'Read only this company’s saved sources. Originals and excerpts that were not acquired remain unavailable.'
    ),
  };
  const missing =
    finance.state === 'mismatch'
      ? t(
          '来源主体或范围不匹配，相关数字暂不采用。',
          'Source issuer or scope does not match. Dependent amounts are withheld.'
        )
      : t(
          '本年度尚未取得足够可用的金额。已有字段保留，差异与图表等待两项数据齐备。',
          'This annual period lacks sufficient usable amounts. Acquired fields remain readable; differences and bars require both inputs.'
        );
  const amounts = [
    { label: profitLabel, field: finance.profitField, display: finance.profit },
    { label: cashLabel, field: 'ocf' as const, display: finance.cash },
  ];
  return (
    <section
      className="lite-company-channels"
      data-company-page={activePage}
      data-run-id={run.id}
      data-snapshot={run.context?.fetchedAt || ''}
      data-basis={basis}
    >
      <div className="lite-company-stage-layout">
        <header className="lite-company-editorial">
          <p className="lite-company-identity">
            {companyName} · {run.input.securityCode} · {run.input.year}
          </p>
          <h1>
            {titles[activePage][0]}
            <br />
            {titles[activePage][1]}
          </h1>
          <p>{description[activePage]}</p>
        </header>
        <div
          className="showcase-signal-stage showcase-evidence-values lite-company-stage"
          data-channel={activePage}
          data-scene={scene}
          style={{ '--signal-accent': 'var(--lite-primary, #4c8dff)' } as CSSProperties}
        >
          <SignalField channel={activePage} />
          <nav
            className="signal-channel-tabs"
            aria-label={t('公司阅读频道', 'Company reading channels')}
          >
            {tabs.map(({ page, label, icon: Icon }) => (
              <a
                key={page}
                href={pageHref(page)}
                aria-current={activePage === page ? 'page' : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </a>
            ))}
          </nav>
          {channels.map((page) => (
            <section
              key={page}
              className="signal-channel-panel"
              data-company-channel={page}
              data-lite-page={page}
              hidden={activePage !== page}
              aria-labelledby={`lite-company-${page}-title`}
            >
              <div className="signal-stage-context">
                <span className="signal-context-dot" aria-hidden="true" />
                <span>
                  {run.input.year} ·{' '}
                  {snapshotMatches
                    ? t('已保存公司资料', 'Saved company materials')
                    : t('资料尚未取得或待核对', 'Materials unavailable or awaiting verification')}
                </span>
                <span className="signal-context-code">{run.input.securityCode}</span>
              </div>
              <h2
                id={`lite-company-${page}-title`}
                data-lite-page-title
                tabIndex={-1}
                className="signal-stage-question"
              >
                {questions[page]}
              </h2>
              {page === 'finance' && (
                <>
                  <p className="signal-scope">
                    {run.input.year} · CNY · {profitLabel} / {cashLabel}
                  </p>
                  <dl className="signal-finance-facts">
                    {amounts.map(({ label, field, display }) => (
                      <div key={field} data-company-field={field}>
                        <dt>{label}</dt>
                        <dd
                          title={display?.exactText}
                          aria-label={display?.exactText}
                          data-exact-yuan={display?.exactYuan}
                        >
                          <span>{display?.text || '—'}</span>
                        </dd>
                        <span className="signal-fact-source">
                          {display
                            ? t('来自已保存年度字段', 'Saved annual field')
                            : t('未取得或待核对', 'Unavailable or needs review')}
                        </span>
                      </div>
                    ))}
                  </dl>
                  <div
                    className="signal-scene-controls"
                    role="group"
                    aria-label={t('选择财务画面', 'Choose a financial view')}
                  >
                    <button type="button" aria-pressed={scene === 0} onClick={() => setScene(0)}>
                      <span aria-hidden="true">01</span>
                      {t('看数字', 'Numbers')}
                    </button>
                    <button type="button" aria-pressed={scene === 1} onClick={() => setScene(1)}>
                      <span aria-hidden="true">02</span>
                      {t('看差异', 'Difference')}
                    </button>
                    <a href={pageHref('original')}>
                      <span aria-hidden="true">03</span>
                      {t('追原文', 'Original')}
                    </a>
                  </div>
                  <div
                    className="signal-finance-scene"
                    key={scene}
                    data-finance-view={scene === 0 ? 'numbers' : 'difference'}
                  >
                    {scene === 0 && finance.bars.length === 2 ? (
                      <figure
                        className="signal-comparison"
                        role="img"
                        aria-label={`${profitLabel}: ${finance.profit!.exactText}; ${cashLabel}: ${finance.cash!.exactText}`}
                        data-signed={finance.signed}
                      >
                        <div className="signal-bar-ruler">
                          <span>
                            {finance.signed ? t('负值 ← 0 → 正值', 'Negative ← 0 → positive') : '0'}
                          </span>
                          <span>{t('同一金额刻度', 'One amount scale')}</span>
                        </div>
                        {finance.bars.map((bar, index) => (
                          <div className="signal-bar-row" key={amounts[index]!.field}>
                            <span>{amounts[index]!.label}</span>
                            <div className="signal-bar-track">
                              <span
                                className="lite-company-zero"
                                style={{ left: finance.signed ? '50%' : '0%' }}
                              />
                              <span
                                className={`signal-bar signal-bar-${index === 0 ? 'profit' : 'cash'}`}
                                style={
                                  {
                                    left: `${bar.start}%`,
                                    '--signal-bar-width': `${bar.width}%`,
                                  } as CSSProperties
                                }
                              />
                            </div>
                          </div>
                        ))}
                        <figcaption className="signal-panel-note">
                          {t(
                            '两条柱线使用同一刻度。利润和经营现金是不同指标。',
                            'Both bars use the same scale. Profit and operating cash are different measures.'
                          )}
                        </figcaption>
                      </figure>
                    ) : scene === 1 && finance.difference ? (
                      <div className="signal-difference-panel">
                        <div className="signal-equation" aria-hidden="true">
                          <span>{profitLabel}</span>
                          <span>−</span>
                          <span>{cashLabel}</span>
                          <ArrowRight size={18} />
                        </div>
                        <p className="signal-difference-label">
                          {t('两项指标的金额差', 'Difference between the amounts')}
                        </p>
                        <p
                          className="signal-difference-amount"
                          title={finance.difference.exactText}
                          aria-label={finance.difference.exactText}
                          data-exact-yuan={finance.difference.exactYuan}
                        >
                          {finance.difference.text}
                        </p>
                        <p className="signal-panel-note">
                          {t(
                            '由两项相减得到，只提出核对问题，不证明经营原因、亏损或资金缺口。',
                            'Subtracting the two amounts raises a question. It does not establish a cause, loss or funding shortfall.'
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="signal-panel-note" role="status">
                        {missing}
                      </p>
                    )}
                  </div>
                  {basis === 'parent' && (
                    <p className="signal-panel-note">
                      {t(
                        '归母利润与合并经营现金范围不同；这里展示金额，不计算现金兑现比率。',
                        'Attributable profit and consolidated operating cash have different scopes. These are amounts, not a cash-conversion ratio.'
                      )}
                    </p>
                  )}
                  <details className="signal-exact-data">
                    <summary>{t('核对精确金额与来源', 'Check exact amounts and sources')}</summary>
                    <dl>
                      {[
                        ...amounts,
                        {
                          label: t('上述两项相减 · 计算值', 'Difference · calculated'),
                          field: 'difference',
                          display: finance.difference,
                        },
                      ].map(({ label, field, display }) => (
                        <div key={field}>
                          <dt>{label}</dt>
                          <dd>{display?.exactText || t('未取得', 'Unavailable')}</dd>
                        </div>
                      ))}
                    </dl>
                    {finance.sources.length ? (
                      <ul className="lite-company-amount-sources">
                        {finance.sources.map((source, index) => (
                          <li key={`${source.field}-${source.href}-${index}`}>
                            <span>
                              {source.field === 'ocf' ? cashLabel : profitLabel} ·{' '}
                              {source.provider === 'primary'
                                ? t('东方财富', 'Eastmoney')
                                : t('新浪财经', 'Sina Finance')}
                            </span>
                            <a href={source.href} target="_blank" rel="noopener noreferrer">
                              {t('打开记录的来源', 'Open the recorded source')}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </a>
                            <span className="lite-company-print-url">{source.href}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="signal-panel-note">
                        {t(
                          '本项未保存可用的字段来源链接；可在原文频道核对其他已记录资料。',
                          'No usable field-source link was saved here. Check other recorded materials in Original.'
                        )}
                      </p>
                    )}
                  </details>
                  <a className="signal-source-action" href={pageHref('original')}>
                    <span>{t('回到这家公司的来源', 'Return to this company’s sources')}</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </a>
                </>
              )}
              {page === 'public' && <LiteCompanyPublicItems run={run} />}
              {page === 'reputation' && <LiteCompanyReputation run={run} />}
              {page === 'original' && (
                <div className="signal-original-panel lite-company-original">
                  <FileText size={34} aria-hidden="true" />
                  <p>
                    {finance.originalHref
                      ? t(
                          '已记录本年度原件地址。打开原件后核对公司名称、年度、口径与金额。',
                          'An original-document address is saved for this annual period. Check its issuer, year, scope and amounts.'
                        )
                      : t(
                          '本年度未保存可用原件地址。下方保留这家公司的已记录来源；没有取得的 PDF 和节选不作展示。',
                          'No usable original-document address is saved for this annual period. Recorded company sources remain below; unacquired PDFs and excerpts are not shown.'
                        )}
                  </p>
                  {finance.originalHref && (
                    <a
                      className="signal-source-action"
                      href={finance.originalHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>{t('打开已记录年度原件', 'Open the recorded annual original')}</span>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      {financeDetails && (
        <div
          className="lite-company-reading-details"
          data-company-detail="finance"
          hidden={activePage !== 'finance'}
        >
          {financeDetails}
        </div>
      )}
      {originalDetails && (
        <div
          className="signal-original-panel lite-company-reading-details"
          data-company-detail="original"
          hidden={activePage !== 'original'}
        >
          {originalDetails}
        </div>
      )}
    </section>
  );
}

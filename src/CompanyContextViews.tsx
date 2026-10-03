import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowUpRight, FileSearch, Info } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type {
  CompanyContextSnapshot,
  CompanyContextPeriod,
  ContextAmountField,
  CompanyDisclosure,
  CompanySourceComparison,
  PublicSourceState,
} from '../shared/company-workspace';
import {
  analyzeCompanyContext,
  contextFieldLabels,
  contextFen,
  contextRatio,
  contextSum,
  companyCheckPriorities,
  type CompanyReadingBasis,
} from '../shared/company-analysis';
import {
  companyEvidenceComparisons,
  companyEvidenceSourceUrls,
} from '../shared/company-source-evidence';
import { Dialog, Tag } from './components';
import { useApp, type Translate } from './context';
import { date, money } from './format';

function CompanySourceComparisons({
  snapshot,
  checks,
  periods,
  selectedRef,
  compact = false,
}: {
  snapshot: CompanyContextSnapshot;
  checks: CompanySourceComparison[];
  periods: CompanyContextPeriod[];
  selectedRef?: RefObject<HTMLElement | null>;
  compact?: boolean;
}) {
  const { t, locale } = useApp();
  if (compact)
    return (
      <div className="context-source-comparisons">
        {checks.map((check, index) => {
          const period = periods.find((candidate) => candidate.period === check.period);
          return (
            <article
              className="context-source-comparison"
              key={`${check.period}:${check.field}`}
              data-period={check.period}
              data-field={check.field}
              ref={index === 0 ? selectedRef : undefined}
              tabIndex={index === 0 && selectedRef ? -1 : undefined}
            >
              <header>
                <div>
                  <h4>{t(...contextFieldLabels[check.field])}</h4>
                  <span>
                    {check.period} · {t('元（CNY）', 'yuan (CNY)')}
                  </span>
                </div>
                <Tag>
                  {check.matches
                    ? t('容差内一致', 'Within tolerance')
                    : t('差异待核实', 'Difference to verify')}
                </Tag>
              </header>
              <div className="context-source-comparison-values">
                {(['primary', 'secondary'] as const).map((provider) => (
                  <div key={provider} data-provider={provider}>
                    <span>
                      {provider === 'primary' ? t('东方财富', 'Eastmoney') : t('新浪财经', 'Sina')}
                    </span>
                    <strong>{money(check[provider], locale, false)}</strong>
                    {companyEvidenceSourceUrls(snapshot, period, check.field, provider).map(
                      (url, sourceIndex) => (
                        <a
                          key={url}
                          className="text-link"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t('打开来源', 'Open source')}
                          {sourceIndex > 0 ? ` ${sourceIndex + 1}` : ''}
                          <ArrowUpRight size={12} />
                        </a>
                      )
                    )}
                  </div>
                ))}
              </div>
              <p className="context-source-comparison-difference">
                <span>{t('差额（东方财富 − 新浪）', 'Difference (Eastmoney − Sina)')}</span>
                <strong>{money(check.difference, locale, false)}</strong>
              </p>
            </article>
          );
        })}
      </div>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t('报告期与科目', 'Period and field')}</th>
            <th>{t('东方财富（元）', 'Eastmoney (yuan)')}</th>
            <th>{t('新浪财经（元）', 'Sina (yuan)')}</th>
            <th>{t('差额（元）', 'Difference (yuan)')}</th>
            <th>{t('状态', 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check, index) => {
            const period = periods.find((candidate) => candidate.period === check.period);
            return (
              <tr
                key={`${check.period}:${check.field}`}
                ref={
                  index === 0 && selectedRef
                    ? (node) => {
                        selectedRef.current = node;
                      }
                    : undefined
                }
                tabIndex={index === 0 && selectedRef ? -1 : undefined}
              >
                <td>
                  {t(...contextFieldLabels[check.field])}
                  <small>{check.period}</small>
                </td>
                {(['primary', 'secondary'] as const).map((provider) => (
                  <td key={provider}>
                    {money(check[provider], locale, false)}
                    {companyEvidenceSourceUrls(snapshot, period, check.field, provider).map(
                      (url, sourceIndex) => (
                        <small key={url}>
                          <a className="text-link" href={url} target="_blank" rel="noreferrer">
                            {t('打开来源', 'Open source')}
                            {sourceIndex > 0 ? ` ${sourceIndex + 1}` : ''}
                            <ArrowUpRight size={12} />
                          </a>
                        </small>
                      )
                    )}
                  </td>
                ))}
                <td>{money(check.difference, locale, false)}</td>
                <td>
                  <Tag>
                    {check.matches
                      ? t('容差内一致', 'Within tolerance')
                      : t('差异待核实', 'Difference to verify')}
                  </Tag>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CompanyContextEvidence({
  row,
  fields,
  children,
  periods,
  formula,
  snapshot,
}: {
  row: CompanyContextPeriod;
  fields: ContextAmountField[];
  children?: ReactNode;
  periods?: CompanyContextPeriod[];
  formula?: string;
  snapshot?: CompanyContextSnapshot;
}) {
  const { t, locale } = useApp(),
    [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLElement>(null);
  const selectedPeriods = periods || [row];
  const checks = companyEvidenceComparisons(snapshot, selectedPeriods, fields);
  const conflicts = checks.filter((check) => !check.matches);
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  return (
    <>
      <button type="button" className="context-evidence-button" onClick={() => setOpen(true)}>
        <FileSearch size={13} />
        {children || t('字段与来源', 'Fields and sources')}
      </button>
      {open && (
        <Dialog
          title={t('字段与来源', 'Fields and sources')}
          onClose={() => setOpen(false)}
          variant="drawer"
          initialFocus={selectedRef}
        >
          {snapshot && (
            <p>
              <strong>{snapshot.companyName}</strong> · {snapshot.securityCode}
            </p>
          )}
          <p className="muted">
            {row.period} ·{' '}
            {t(
              '人民币；第三方网页字段，尚未逐项核对原件',
              'CNY; third-party fields, not individually checked against the original'
            )}
          </p>
          {formula && <p className="context-formula">{formula}</p>}
          {conflicts.length > 0 && (
            <p className="context-data-note" role="status">
              <Info size={14} />
              {t(
                '相关字段存在来源差异，依赖这些字段的计算暂停；其他字段仍可核对。',
                'Source differences withhold dependent calculations; other fields remain available to inspect.'
              )}
            </p>
          )}
          {snapshot && checks.length > 0 && (
            <section>
              <h3>{t('同报告期来源对照', 'Same-period source comparison')}</h3>
              <p className="muted">
                {t(
                  '金额：元（CNY）· 科目口径见字段名称，报表范围需核对原件。',
                  'Amounts: yuan (CNY). Field names distinguish profit bases; verify statement scope in the original.'
                )}
              </p>
              <CompanySourceComparisons
                snapshot={snapshot}
                checks={checks}
                periods={selectedPeriods}
                selectedRef={selectedRef}
                compact
              />
            </section>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('报告期', 'Period')}</th>
                  <th>{t('科目', 'Field')}</th>
                  <th>{t('精确金额（元）', 'Exact amount (yuan)')}</th>
                  <th>{t('取数来源', 'Provider')}</th>
                </tr>
              </thead>
              <tbody>
                {selectedPeriods.flatMap((period, periodIndex) =>
                  fields.map((field, fieldIndex) => {
                    const conflict = conflicts.find(
                      (check) => check.period === period.period && check.field === field
                    );
                    const first = checks.length === 0 && periodIndex === 0 && fieldIndex === 0;
                    return (
                      <tr
                        key={`${period.period}:${field}`}
                        ref={
                          first
                            ? (node) => {
                                selectedRef.current = node;
                              }
                            : undefined
                        }
                        tabIndex={first ? -1 : undefined}
                      >
                        <td>{period.period}</td>
                        <td>{t(...contextFieldLabels[field])}</td>
                        <td>{money(conflict?.primary ?? period.amounts[field], locale, false)}</td>
                        <td>
                          {conflict
                            ? t(
                                '东方财富原值 · 差异待核实',
                                'Eastmoney original · difference to verify'
                              )
                            : period.fieldSources[field] || t('未取得', 'Not retrieved')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {row.originalUrl && (
            <a className="text-link" href={row.originalUrl} target="_blank" rel="noreferrer">
              {t('打开披露原文', 'Open the disclosed original')}
              <ArrowUpRight size={13} />
            </a>
          )}
          {[...new Set((periods || [row]).flatMap((period) => period.sourceUrls))].map(
            (url, index) => (
              <p key={url}>
                <a className="text-link" href={url} target="_blank" rel="noreferrer">
                  {t(`取数字段入口 ${index + 1}`, `Field source ${index + 1}`)}
                  <ArrowUpRight size={12} />
                </a>
              </p>
            )
          )}
          <p className="muted">
            {t(
              '现金流调整需另查补充表。',
              'Check cash-flow adjustments in the supplementary statement.'
            )}
          </p>
        </Dialog>
      )}
    </>
  );
}

export function CompanyContextOverview({
  snapshot,
  run,
  basis,
  view,
}: {
  snapshot: CompanyContextSnapshot;
  run: CompanyResearchRun;
  basis: CompanyReadingBasis;
  view: 'public' | 'manager';
}) {
  const { t, locale } = useApp(),
    analysis = analyzeCompanyContext(snapshot, basis),
    last = analysis.latestAnnual,
    a = last?.amounts;
  const profitField = analysis.profitField,
    profitName = t(...contextFieldLabels[profitField]);
  const profit = contextFen(a?.[profitField]),
    cash = contextFen(a?.ocf);
  const earningsTitle =
    !a || profit === null
      ? t('利润数据待补', 'Profit data unavailable')
      : profit < 0n
        ? t('最近完整年度利润为负', 'Latest full-year profit is negative')
        : profit === 0n
          ? t('最近完整年度利润为零', 'Latest full-year profit is zero')
          : t('最近完整年度利润为正', 'Latest full-year profit is positive');
  const cashTitle = !analysis.threeYear.complete
    ? t('连续三年数据待补', 'Three consecutive years are incomplete')
    : analysis.threeYear.thinProfit
      ? t('利润基数薄，比例不作解读', 'Thin profit base; ratio withheld')
      : analysis.threeYear.ratio === null
        ? t('利润非正，比例不适用', 'Nonpositive profit; ratio not applicable')
        : t('按同一期间比较现金与利润', 'Compare cash and profit over the same period');
  const debtTitle =
    analysis.shortDebt === null || !a || a.cash === null
      ? t('偿付字段待补', 'Repayment fields are incomplete')
      : contextFen(analysis.shortDebt) === 0n
        ? t('两项短债字段合计为零', 'The two debt fields sum to zero')
        : analysis.debtCoverage !== null && analysis.debtCoverage < 1
          ? t('历史资金低于两项短债合计', 'Historical funds are below two debt items')
          : t('历史资金与短债字段可比较', 'Historical funds and debt fields can be compared');
  const interim = analysis.latestInterim;
  return (
    <>
      {interim && (
        <section className="context-interim">
          <div>
            <strong>{t('最新定期报告', 'Latest periodic report')}</strong>
            <span>
              {interim.period} ·{' '}
              {t('累计期间；通常未经审计', 'Cumulative period; usually unaudited')}
            </span>
          </div>
          <dl>
            {(['revenue', 'parentProfit', 'ocf', 'cash'] as ContextAmountField[]).map((field) => (
              <div key={field}>
                <dt>{t(...contextFieldLabels[field])}</dt>
                <dd>{money(interim.amounts[field], locale)}</dd>
              </div>
            ))}
          </dl>
          <CompanyContextEvidence
            snapshot={snapshot}
            row={interim}
            fields={['revenue', 'parentProfit', 'ocf', 'cash']}
          />
        </section>
      )}
      <div className="context-question-cards">
        <article>
          <span>{t('公司赚得怎么样？', 'How is the company earning?')}</span>
          <h2>{earningsTitle}</h2>
          <p>
            {last?.period || t('报告期未知', 'Period unknown')} · {profitName}{' '}
            {money(a?.[profitField] ?? null, locale)} · {t('营业总收入', 'Revenue')}{' '}
            {money(a?.revenue ?? null, locale)}
          </p>
          <small>
            {t(
              `已取得年度中，${analysis.lossYears} 年利润为负。`,
              `${analysis.lossYears} retrieved years have negative profit.`
            )}
          </small>
          {last && (
            <CompanyContextEvidence
              snapshot={snapshot}
              row={last}
              fields={['revenue', 'netProfit', 'parentProfit', 'deductedProfit']}
            />
          )}
        </article>
        <article>
          <span>
            {t('利润与经营现金是什么关系？', 'How do profit and operating cash compare?')}
          </span>
          <h2>{cashTitle}</h2>
          <p>
            {analysis.threeYear.complete
              ? t('近三年累计', 'Three-year totals')
              : t('已取得年度金额小计', 'Subtotal of retrieved annual fields')}
            ：{profitName} {money(analysis.threeYear.profit, locale)}；
            {t('经营现金', 'Operating cash')} {money(analysis.threeYear.cash, locale)}
          </p>
          <strong className="context-card-value">
            {analysis.threeYear.ratio === null ? '—' : analysis.threeYear.ratio.toFixed(2)}
            <small>{t(`经营现金 / ${profitName}`, `Operating cash / ${profitName}`)}</small>
          </strong>
          {last && (
            <CompanyContextEvidence
              snapshot={snapshot}
              row={last}
              periods={analysis.annuals.slice(-3)}
              fields={[profitField, 'ocf', 'revenue']}
              formula={t(
                `近三个连续年度经营现金净额合计 ÷ ${profitName}合计；利润非正、薄基数或缺失时不解读。`,
                `Operating cash over three consecutive years ÷ total ${profitName}; withheld for nonpositive profit, thin base or missing fields.`
              )}
            />
          )}
        </article>
        <article>
          <span>{t('短期偿付需要核对什么？', 'What needs checking for near-term repayment?')}</span>
          <h2>{debtTitle}</h2>
          <p>
            {t('历史货币资金', 'Historical monetary funds')} {money(a?.cash ?? null, locale)}；
            {t('两项短债合计', 'Two-item debt total')} {money(analysis.shortDebt, locale)}
          </p>
          <small>
            {t(
              '年末账面金额；短债合计仅含上述两项。',
              'Year-end book amounts; the debt total includes these two items only.'
            )}
          </small>
          <strong className="context-card-value">
            {analysis.debtCoverage === null ? '—' : analysis.debtCoverage.toFixed(2)}
            <small>{t('货币资金 / 两项短债', 'Monetary funds / two debt items')}</small>
          </strong>
          {last && (
            <CompanyContextEvidence
              snapshot={snapshot}
              row={last}
              fields={['cash', 'shortLoan', 'currentPortionDebt']}
              formula={t(
                '货币资金 ÷（短期借款 + 一年内到期非流动负债）；分项缺失不补为零。',
                'Monetary funds ÷ (short-term borrowing + current portion of noncurrent debt); missing components are not zero.'
              )}
            />
          )}
        </article>
      </div>
      <section className="context-next-checks">
        <div className="context-section-title">
          <h2>
            {view === 'manager'
              ? t('财务线索与核查清单', 'Financial signals and checks')
              : t('下一步值得核对的事', 'What to check next')}
          </h2>
          <span>{t('公开材料形成的问题清单', 'Questions from public evidence')}</span>
        </div>
        {analysis.missing.length > 0 && (
          <p className="context-data-note">
            <Info size={14} />
            {t('尚缺字段：', 'Missing fields: ')}
            {analysis.missing.map((field) => t(...contextFieldLabels[field])).join('、')}
          </p>
        )}
        {companyCheckPriorities(snapshot, analysis).map((item) => (
          <article key={item.id} className="context-priority">
            <div>
              <Tag>{item.priority}</Tag>
              <h3>{t(...item.title)}</h3>
            </div>
            <p>{t(...item.question)}</p>
            {view === 'manager' && (
              <div className="context-priority-detail">
                <section>
                  <h4>{t('财务依据', 'Financial basis')}</h4>
                  {item.fields.length ? (
                    item.fields.map((field) => (
                      <p key={field}>
                        {t(...contextFieldLabels[field])}：{money(a?.[field] ?? null, locale)}
                      </p>
                    ))
                  ) : (
                    <p>
                      {item.id === 'audit'
                        ? last?.auditOpinion
                        : t(
                            '公告或来源覆盖状态，仍需核对原文',
                            'Disclosure or source coverage, pending original verification'
                          )}
                    </p>
                  )}
                </section>
                <section>
                  <h4>{t('关联公告', 'Related disclosures')}</h4>
                  {item.disclosures.length ? (
                    item.disclosures.map((id) => {
                      const row = snapshot.announcements.find((row) => row.id === id);
                      return row ? (
                        <a key={id} href={row.url} target="_blank" rel="noreferrer">
                          {row.date} · {row.title}
                        </a>
                      ) : null;
                    })
                  ) : (
                    <p>{t('本次没有定位对应公告', 'No corresponding disclosure located')}</p>
                  )}
                </section>
              </div>
            )}
            <p className="context-material-request">
              <b>{t('需要材料', 'Evidence to request')}</b>
              {t(...item.materials)}
            </p>
          </article>
        ))}
      </section>
      {view === 'manager' && analysis.annuals.length > 0 && (
        <section className="context-section">
          <h2>{t('年度财务底稿', 'Annual financial worksheet')}</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('年度', 'Year')}</th>
                  {(['revenue', profitField, 'ocf', 'cash'] as ContextAmountField[]).map(
                    (field) => (
                      <th key={field}>{t(...contextFieldLabels[field])}</th>
                    )
                  )}
                  <th>{t('两项短债', 'Two debt fields')}</th>
                  <th>{t('审计意见字段', 'Audit-opinion field')}</th>
                </tr>
              </thead>
              <tbody>
                {analysis.annuals.map((row) => (
                  <tr key={row.period}>
                    <td>{row.period.slice(0, 4)}</td>
                    {(['revenue', profitField, 'ocf', 'cash'] as ContextAmountField[]).map(
                      (field) => (
                        <td key={field}>{money(row.amounts[field], locale)}</td>
                      )
                    )}
                    <td>
                      {money(
                        contextSum([row.amounts.shortLoan, row.amounts.currentPortionDebt]),
                        locale
                      )}
                    </td>
                    <td>{row.auditOpinion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {last && (
        <section className="context-metric-worksheet">
          <div className="context-section-title">
            <h2>{t('指标与计算口径', 'Metrics and definitions')}</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('指标', 'Metric')}</th>
                  <th>{t('结果', 'Value')}</th>
                  <th>{t('计算与来源', 'Calculation and sources')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: t('资产负债率', 'Liabilities / assets'),
                    value: analysis.assetLiabilityRatio,
                    percent: true,
                    fields: ['totalLiabilities', 'totalAssets'] as ContextAmountField[],
                    formula: t('总负债 ÷ 总资产', 'Total liabilities ÷ total assets'),
                  },
                  {
                    label: t('流动比率', 'Current ratio'),
                    value: analysis.currentRatio,
                    percent: false,
                    fields: ['currentAssets', 'currentLiabilities'] as ContextAmountField[],
                    formula: t('流动资产 ÷ 流动负债', 'Current assets ÷ current liabilities'),
                  },
                  {
                    label: t('速动比率', 'Quick ratio'),
                    value: analysis.quickRatio,
                    percent: false,
                    fields: [
                      'currentAssets',
                      'inventory',
                      'currentLiabilities',
                    ] as ContextAmountField[],
                    formula: t(
                      '（流动资产 − 存货）÷ 流动负债',
                      '(Current assets − inventory) ÷ current liabilities'
                    ),
                  },
                  {
                    label: t('应收账款 / 营收', 'Receivables / revenue'),
                    value: analysis.receivableToRevenue,
                    percent: true,
                    fields: ['receivables', 'revenue'] as ContextAmountField[],
                    formula: t(
                      '应收账款余额 ÷ 年度营业总收入',
                      'Accounts receivable balance ÷ annual revenue'
                    ),
                  },
                  {
                    label: t('经营现金 / 营收', 'Operating cash / revenue'),
                    value: analysis.ocfToRevenue,
                    percent: true,
                    fields: ['ocf', 'revenue'] as ContextAmountField[],
                    formula: t(
                      '年度经营现金净额 ÷ 年度营业总收入',
                      'Annual operating cash ÷ annual revenue'
                    ),
                  },
                  {
                    label: t('财务费用参考倍数', 'Finance-expense proxy'),
                    value: analysis.financeExpenseRatio,
                    percent: false,
                    fields: ['totalProfit', 'financeExpense'] as ContextAmountField[],
                    formula: t(
                      '（利润总额 + 财务费用）÷ 财务费用；仅费用为正时计算，财务费用不等于纯利息，不称为利息保障倍数。',
                      '(Profit before tax + finance expense) ÷ finance expense, only for positive expenses. Finance expense is not interest; this is not interest coverage.'
                    ),
                  },
                ].map((item) => (
                  <tr key={item.label}>
                    <td>{item.label}</td>
                    <td>
                      {item.value === null
                        ? '—'
                        : `${(item.value * (item.percent ? 100 : 1)).toFixed(2)}${item.percent ? '%' : ''}`}
                    </td>
                    <td>
                      <CompanyContextEvidence
                        snapshot={snapshot}
                        row={last}
                        fields={item.fields}
                        formula={item.formula}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="context-data-note">
            {t(
              '分母非正或字段缺失时不计算。比率分别核对，不合成为企业评分。',
              'Ratios are withheld for nonpositive denominators or missing fields and are not combined into a company score.'
            )}
          </p>
        </section>
      )}
      <p className="context-data-note">
        {t(
          '网页概览与原件核查分别展示。',
          'Web context and original-report verification are shown separately.'
        )}{' '}
        {run.status === 'adopted'
          ? t('原件材料已确认采用。', 'Original evidence has been confirmed and adopted.')
          : run.preview
            ? t(
                '已取得原件候选，仍需确认后采用。',
                'Original candidates are available and still require confirmation.'
              )
            : t(
                '原件读取尚未完成或资料不足，概览不替代原件核查。',
                'Original reading is incomplete or insufficient; context does not replace original verification.'
              )}
      </p>
    </>
  );
}

export function CompanyProfileView({
  snapshot,
  includeNews = true,
}: {
  snapshot: CompanyContextSnapshot;
  includeNews?: boolean;
}) {
  const { t, locale } = useApp();
  const labels: Record<string, readonly [string, string]> = {
    orgName: ['企业全称', 'Company name'],
    englishName: ['英文名称', 'English name'],
    creditCode: ['统一社会信用代码', 'Unified credit code'],
    legalPerson: ['法定代表人', 'Legal representative'],
    chairman: ['董事长', 'Chair'],
    president: ['总经理', 'President'],
    capitalWan: ['注册资本（万元）', 'Registered capital (10k yuan)'],
    founded: ['成立日期', 'Founded'],
    listed: ['上市日期', 'Listed'],
    employees: ['员工数（披露字段）', 'Employees (disclosed field)'],
    address: ['注册地址', 'Registered address'],
    business: ['主营业务', 'Business'],
    controller: ['实际控制人', 'Controller'],
    auditor: ['审计机构', 'Auditor'],
    industry: ['行业', 'Industry'],
    website: ['企业网站', 'Website'],
    province: ['省份', 'Province'],
    description: ['企业简介', 'Profile'],
  };
  return (
    <>
      <section className="context-section">
        <h2>{t('公司公开资料', 'Public company profile')}</h2>
        <p className="muted">{t('资料更新时间未知。', 'The profile update date is unknown.')}</p>
        <dl className="context-profile-grid">
          {Object.entries(labels).map(([key, label]) => (
            <div key={key}>
              <dt>{t(...label)}</dt>
              <dd>{snapshot.profile[key] || t('未取得', 'Not retrieved')}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="context-section">
        <h2>{t('已披露十大直接股东', 'Disclosed top direct shareholders')}</h2>
        {snapshot.shareholders.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('股东', 'Shareholder')}</th>
                  <th>{t('比例', 'Ownership')}</th>
                  <th>{t('持股变动字段', 'Reported change')}</th>
                  <th>{t('报告期', 'Period')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.shareholders.map((row, index) => (
                  <tr key={`${row.name}:${index}`}>
                    <td>
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.name}
                      </a>
                    </td>
                    <td>{row.percentage === null ? '—' : `${row.percentage}%`}</td>
                    <td>{row.change || '—'}</td>
                    <td>{row.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t('本次未取得股东明细。', 'No shareholder details retrieved.')}</p>
        )}
      </section>
      {includeNews && (
        <section className="context-section">
          <h2>{t('近期新闻线索', 'Recent news leads')}</h2>
          {snapshot.news.length ? (
            <div className="context-news-list">
              {snapshot.news.map((row) => (
                <article key={row.url}>
                  <span>
                    {row.date} · {row.media} · {row.provider}
                  </span>
                  <a href={row.url} target="_blank" rel="noreferrer">
                    {row.title}
                    <ArrowUpRight size={13} />
                  </a>
                  {row.digest && <p>{row.digest}</p>}
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">
              {t(
                '本次未取得匹配新闻，请查看来源状态。',
                'No matched news retrieved; check source status.'
              )}
            </p>
          )}
        </section>
      )}
      <section className="context-section">
        <h2>{t('官方与授权核查入口', 'Official and authorised checks')}</h2>
        <div className="context-verification-grid">
          {snapshot.verificationLinks.map((link) => (
            <article key={link.url}>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
                <ArrowUpRight size={13} />
              </a>
              <p>{link.purpose}</p>
              <small>{link.instruction}</small>
            </article>
          ))}
        </div>
      </section>
      <p className="muted">
        {t('公开资料获取于', 'Public profile retrieved at')} {date(snapshot.fetchedAt, locale)}
      </p>
    </>
  );
}

const sourceStateLabels: Record<PublicSourceState | 'unknown', readonly [string, string]> = {
  available: ['已取得', 'Retrieved'],
  partial: ['部分覆盖', 'Partial'],
  empty: ['检索为空', 'No results'],
  error: ['本次失败', 'Failed'],
  manual: ['待人工 / 授权', 'Manual / authorised'],
  unknown: ['未知', 'Unknown'],
};
function sourceStateLabel(state: PublicSourceState | 'unknown', t: Translate) {
  return t(...sourceStateLabels[state]);
}

export function CompanySourcesView({ snapshot }: { snapshot: CompanyContextSnapshot }) {
  const { t, locale } = useApp();
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('来源与范围', 'Provider and scope')}</th>
              <th>{t('本次结果', 'Result')}</th>
              <th>{t('最新记录', 'Latest record')}</th>
              <th>{t('获取时间与限制', 'Retrieval and limits')}</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.sources.map((source) => (
              <tr key={source.id}>
                <td>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.provider}
                  </a>
                  <small>{source.dimension}</small>
                </td>
                <td>
                  <Tag>{sourceStateLabel(source.status, t)}</Tag>
                  {source.count > 0 && (
                    <small>
                      {source.count} {t('条', 'records')}
                    </small>
                  )}
                </td>
                <td>{source.latestDate || '—'}</td>
                <td>
                  <span>{date(source.fetchedAt, locale)}</span>
                  <small>{source.note}</small>
                  {source.responseHashes.length > 0 && (
                    <details>
                      <summary>{t('响应哈希', 'Response hashes')}</summary>
                      {source.responseHashes.map((hash, index) => (
                        <code key={`${hash}:${index}`}>{hash}</code>
                      ))}
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="context-section">
        <h2>{t('同报告期财务比对', 'Same-period financial comparison')}</h2>
        {snapshot.comparisons.length ? (
          <CompanySourceComparisons
            snapshot={snapshot}
            checks={snapshot.comparisons}
            periods={snapshot.financials}
          />
        ) : (
          <p className="muted">
            {t('本次没有可对齐的双来源金额。', 'No matching-period amounts from both sources.')}
          </p>
        )}
        <p className="muted">
          {t(
            '仅补充主来源缺项。差异超过一万元与主金额百万分之一的较大值时，保留双方原值并暂停该字段推断。',
            'Only missing primary fields are filled. Differences above the larger of CNY 10,000 and one millionth of the primary amount retain both values and withhold inference for that field.'
          )}
        </p>
      </section>
    </>
  );
}

export function CompanyCoverageView({
  snapshot,
  run,
}: {
  snapshot: CompanyContextSnapshot;
  run: CompanyResearchRun;
}) {
  const { t } = useApp();
  const rows = [
    [
      t('年度财务', 'Annual financials'),
      snapshot.financials.some((row) => row.annual)
        ? t('已取得网页字段', 'Web fields retrieved')
        : t('未取得', 'Not retrieved'),
      t(
        '字段与来源比对，原件核查单独进行',
        'Fields and source comparison; originals checked separately'
      ),
    ],
    [
      t('最新定期报告', 'Latest periodic report'),
      snapshot.financials.some((row) => !row.annual)
        ? t('已取得', 'Retrieved')
        : t('未取得', 'Not retrieved'),
      t('累计期间，通常未经审计', 'Cumulative period, usually unaudited'),
    ],
    [
      t('年报原件与附注', 'Annual originals and notes'),
      run.status === 'adopted'
        ? t('原件已采用', 'Original adopted')
        : run.preview
          ? t('已有候选，待确认采用', 'Candidates awaiting confirmation')
          : t('尚未形成候选', 'No candidates yet'),
      t(
        '页码、摘录、单位与合并口径逐项核对',
        'Pages, excerpts, units and consolidated scope checked individually'
      ),
    ],
    [
      t('公告线索', 'Announcements'),
      sourceStateLabel(
        snapshot.sources.find((source) => source.id === 'cninfo-disclosures')?.status || 'unknown',
        t
      ),
      t(
        '来源条数有上限；标题规则与有限原文摘录',
        'Capped coverage; title rules and limited original excerpts'
      ),
    ],
    [
      t('公司资料与股东', 'Company profile and shareholders'),
      snapshot.profile.orgName
        ? t('已取得公开资料', 'Public profile retrieved')
        : t('未取得', 'Not retrieved'),
      t(
        '资料更新时间未知，不等同实时登记或股权穿透',
        'Unknown update date; not real-time registration or ownership tracing'
      ),
    ],
    [
      t('新闻', 'News'),
      snapshot.news.length
        ? t('有匹配线索', 'Matched leads')
        : t('未取得匹配条目', 'No matched records'),
      t(
        '不是完整口碑监测，新闻需核实',
        'Not comprehensive sentiment monitoring; news requires verification'
      ),
    ],
    [
      t('司法与失信', 'Legal and enforcement'),
      t('待人工 / 授权', 'Manual / authorised'),
      t(
        '提供官方入口，未取得完整企业记录',
        'Official entry points provided; no complete company records retrieved'
      ),
    ],
    [
      t('工商与行政处罚', 'Registration and penalties'),
      t('待人工 / 授权', 'Manual / authorised'),
      t(
        '登记资料与公告线索不替代完整授权查询',
        'Profiles and disclosure leads do not replace authorised queries'
      ),
    ],
  ];
  return (
    <>
      <p className="context-data-note">
        {t(
          '覆盖描述取得了什么与缺少什么；不合成为企业健康分。',
          'Coverage describes retrieved and missing information; it does not form a company health score.'
        )}
      </p>
      <div className="context-coverage-grid">
        {rows.map(([label, state, explanation]) => (
          <article key={label}>
            <h2>{label}</h2>
            <Tag>{state}</Tag>
            <p>{explanation}</p>
          </article>
        ))}
      </div>
      {snapshot.warnings.map((warning, index) => (
        <p key={index} className="muted">
          {warning}
        </p>
      ))}
    </>
  );
}

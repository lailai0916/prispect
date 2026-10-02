import { useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, FileSearch, LoaderCircle } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import { companyPath } from '../shared/company-workspace';
import {
  analyzeCompanyContext,
  companyCheckPriorities,
  contextFieldLabels,
} from '../shared/company-analysis';
import { companyReviewSummary } from '../shared/company-review';
import { useApp } from './context';
import { money } from './format';
import { CompanyContextEvidence } from './CompanyContextViews';
import './company-review.css';

export function CompanyReview({ run }: { run: CompanyResearchRun }) {
  const { t, locale, workspace } = useApp();
  const [requestsOpen, setRequestsOpen] = useState(false);
  const summary = companyReviewSummary(run);
  const snapshot = run.context;
  const active = run.status === 'queued' || run.status === 'running';
  const reading = run.contextStatus === 'loading';
  const original = companyPath(run.id, 'evidence');
  const saved = workspace?.tasks
    .filter(
      (task) =>
        run.adoptedMaterialId &&
        task.materialIds.includes(run.adoptedMaterialId) &&
        task.year === run.input.year &&
        task.status === 'completed'
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const priorities = snapshot
    ? companyCheckPriorities(snapshot, analyzeCompanyContext(snapshot, 'consolidated'))
    : [];
  const ratio = summary.ratio === null ? '—' : (summary.ratio * 100).toFixed(2) + '%';
  const fieldNames = summary.missing.map((field) => t(...contextFieldLabels[field])).join('、');
  const originalState = active
    ? t('原件读取中', 'Reading originals')
    : run.status === 'adopted'
      ? t('原件材料已采用', 'Original evidence adopted')
      : run.preview
        ? t('原件候选待确认', 'Original candidates need confirmation')
        : t('原件核查未完成', 'Original review incomplete');
  const paragraph =
    summary.relation === 'conflict'
      ? t(
          '主体或同报告期来源存在冲突。相关金额与比例暂停展示，请核对原文和来源比对。',
          'The entity or same-period sources conflict. Affected amounts and ratios are withheld; check originals and source comparison.'
        )
      : summary.relation === 'missing'
        ? reading
          ? t(
              '正在读取公开财务资料。已取得的金额保留，缺失项等待来源返回。',
              'Public financial records are being retrieved. Available amounts remain visible while missing fields await sources.'
            )
          : t(
              summary.year + ' 年度尚缺' + fieldNames + '，暂不能比较利润与经营现金。',
              'The ' +
                summary.year +
                ' review is missing ' +
                summary.missing.map((field) => contextFieldLabels[field][1]).join(' and ') +
                '; profit and cash cannot yet be compared.'
            )
        : summary.relation === 'nonpositive'
          ? t(
              summary.year +
                ' 年合并净利润为' +
                money(summary.profit, locale) +
                '元，经营现金净额为' +
                money(summary.cash, locale) +
                '元。利润非正，现金利润比不作常规解读。',
              'For ' +
                summary.year +
                ', consolidated net profit is CNY ' +
                money(summary.profit, locale) +
                ' and operating cash is CNY ' +
                money(summary.cash, locale) +
                '. The cash-to-profit ratio is not interpreted with nonpositive profit.'
            )
          : t(
              summary.year +
                ' 年合并净利润' +
                money(summary.profit, locale) +
                '元，经营现金净额' +
                money(summary.cash, locale) +
                '元' +
                (summary.ratio === null ? '。' : '，现金利润比' + ratio + '。'),
              'For ' +
                summary.year +
                ', consolidated net profit is CNY ' +
                money(summary.profit, locale) +
                ' and operating cash is CNY ' +
                money(summary.cash, locale) +
                (summary.ratio === null ? '.' : '; the cash-to-profit ratio is ' + ratio + '.')
            );
  const disclosure = snapshot?.announcements.find((item) => item.attention === 'high');
  return (
    <div className="company-review" data-testid="company-review">
      <section className="company-review-summary" aria-labelledby="company-review-summary-heading">
        <div className="company-review-section-heading">
          <h2 id="company-review-summary-heading">{t('核查摘要', 'Review summary')}</h2>
          <span className="company-review-state">
            {(active || reading) && <LoaderCircle size={12} className="spinner" />}
            {originalState}
          </span>
        </div>
        <p className="company-review-lead">{paragraph}</p>
        <p className="company-review-source-note">
          {snapshot
            ? t(
                '摘要依据公开网页字段；原件候选需确认后采用。',
                'This summary uses public web fields; original candidates require confirmation before adoption.'
              )
            : t(
                '尚未取得可比较的公开财务金额；可补充原件材料。',
                'Comparable public financial amounts are unavailable; original evidence can be added.'
              )}
          {saved && (
            <a href={'/tasks/' + saved.id}>
              {t('查看已保存的原件核查报告', 'Open the saved original-evidence report')}
              <ArrowRight size={12} />
            </a>
          )}
        </p>
        <dl
          className="company-review-metrics"
          aria-label={t('本年度合并金额', 'Annual consolidated amounts')}
        >
          {[
            [t('合并净利润', 'Consolidated net profit'), money(summary.profit, locale)],
            [t('经营现金净额', 'Operating cash flow'), money(summary.cash, locale)],
            [t('现金利润比', 'Cash-to-profit ratio'), ratio],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="company-review-metric-note">
          <span>
            {t(
              '人民币 · 经营现金净额 ÷ 合并净利润；不是销售回款率。',
              'CNY · operating cash flow ÷ consolidated net profit; not a sales collection rate.'
            )}
          </span>
          {summary.row && (
            <CompanyContextEvidence
              row={summary.row}
              fields={['netProfit', 'ocf']}
              formula={t(
                '同年度合并经营现金净额 ÷ 合并净利润；利润非正或来源冲突时不解读。',
                'Same-year consolidated operating cash ÷ net profit; withheld for nonpositive profit or source conflicts.'
              )}
            >
              {t('金额与来源', 'Amounts and sources')}
            </CompanyContextEvidence>
          )}
        </div>
      </section>
      <section className="company-review-section" aria-labelledby="company-review-findings-heading">
        <h2 id="company-review-findings-heading">{t('核查事项', 'Review matters')}</h2>
        <ol className="company-review-findings">
          <li>
            <span className="company-review-number" aria-hidden="true">
              01
            </span>
            <div>
              <h3>
                {summary.relation === 'below'
                  ? t('经营现金低于合并净利润', 'Operating cash is below consolidated profit')
                  : summary.relation === 'at-or-above'
                    ? t(
                        '经营现金不低于合并净利润',
                        'Operating cash is at or above consolidated profit'
                      )
                    : summary.relation === 'nonpositive'
                      ? t('合并净利润非正', 'Consolidated profit is nonpositive')
                      : summary.relation === 'conflict'
                        ? t('同口径金额需重新核对', 'Comparable amounts need rechecking')
                        : t('年度合并金额尚不齐全', 'Annual consolidated amounts are incomplete')}
              </h3>
              <p>
                {summary.relation === 'below'
                  ? t(
                      '核对现金流补充表、期后回款和存货变化。公开金额不能单独确定差额成因。',
                      'Check cash-flow reconciliation, subsequent collections and inventory changes. Public amounts alone do not establish the cause.'
                    )
                  : summary.relation === 'at-or-above'
                    ? t(
                        '继续核对金额对应的原表分项；这一关系不证明当前资金充足或履约能力。',
                        'Check the original reconciliation items. This relationship does not establish current liquidity or fulfilment capacity.'
                      )
                    : summary.relation === 'nonpositive'
                      ? t(
                          '分别核对利润与经营现金的金额变化、一次性事项和对应原文。',
                          'Review changes in profit and cash separately, including nonrecurring items and original disclosures.'
                        )
                      : t(
                          '先确认主体、年度和合并范围，再补齐或核对相关来源。',
                          'Confirm the entity, year and consolidated scope before collecting or reconciling sources.'
                        )}
              </p>
            </div>
            <a href={companyPath(run.id, 'sources')} className="text-link">
              {t('来源比对', 'Compare sources')}
              <ArrowUpRight size={12} />
            </a>
          </li>
          <li>
            <span className="company-review-number" aria-hidden="true">
              02
            </span>
            <div>
              <h3>
                {t('年报原件与现金流补充资料', 'Original annual report and cash reconciliation')}
              </h3>
              <p>
                {active
                  ? t(
                      '原件正在后台读取，进度和已取得材料可在核查记录中查看。',
                      'Originals are being read in the background; progress and retrieved evidence are available in the review record.'
                    )
                  : run.status === 'adopted'
                    ? t(
                        '已采用的材料和历次核查保留在个人工作区；原始候选与采用结果分别记录。',
                        'Adopted evidence and historical reviews remain in your workspace; extraction candidates and adopted results are recorded separately.'
                      )
                    : run.preview
                      ? t(
                          '已取得原件候选。核对年度、单位、合并范围和金额后，可采用并生成原件核查报告。',
                          'Original candidates are available. Check year, units, consolidated scope and amounts before adopting them and creating an evidence report.'
                        )
                      : run.stoppedReason
                        ? t(
                            '本次原件核查已停止，具体原因和补充材料入口见核查记录。',
                            'The original review stopped; its record contains the reason and evidence options.'
                          )
                        : t(
                            '本次尚无可采用的原件候选，可查看读取记录或补充自己的材料。',
                            'No adoptable original candidates are available; inspect retrieval records or add your own evidence.'
                          )}
              </p>
            </div>
            <a href={original} className="text-link">
              {run.preview && run.status !== 'adopted'
                ? t('确认原件', 'Confirm originals')
                : t('核查记录', 'Review record')}
              <ArrowUpRight size={12} />
            </a>
          </li>
          {disclosure && (
            <li>
              <span className="company-review-number" aria-hidden="true">
                03
              </span>
              <div>
                <h3>{t('需阅读原文的公告线索', 'Disclosure requiring original review')}</h3>
                <p>
                  {disclosure.date} · {disclosure.title}
                </p>
              </div>
              <a href={companyPath(run.id, 'disclosures')} className="text-link">
                {t('查看公告', 'Read disclosures')}
                <ArrowUpRight size={12} />
              </a>
            </li>
          )}
        </ol>
      </section>
      <section
        className="company-review-section company-review-followup"
        aria-labelledby="company-review-followup-heading"
      >
        <h2 id="company-review-followup-heading">{t('后续材料', 'Follow-up evidence')}</h2>
        {summary.relation === 'below' && (
          <h3 className="company-review-request-title">
            {t(
              '期后回款、应收账龄与存货去化资料',
              'Subsequent collections, receivables ageing and inventory movement'
            )}
          </h3>
        )}
        <p>
          {summary.relation === 'below'
            ? t(
                '结合客户回款、合同与发货记录，核对利润与经营现金差额的原因。',
                'Reconcile customer collections with contracts and delivery records to investigate the profit-to-cash gap.'
              )
            : run.input.purpose === 'handover'
              ? t(
                  '当前可用余额、到期收付款和回款依据，需要由交接双方逐项确认。',
                  'Available cash, dated payments and collections need confirmation by the parties to the handover.'
                )
              : t(
                  '涉及付款时，另核对签约主体、收款账户、交付和退款条款。',
                  'Before a payment, separately check the contracting entity, payee account, delivery and refund terms.'
                )}
        </p>
        <div className="company-review-actions">
          <button
            className="button button-primary"
            aria-expanded={requestsOpen}
            aria-controls="company-review-requests"
            onClick={() => setRequestsOpen((value) => !value)}
          >
            {t('查看核查清单', 'Review checklist')}
            <ChevronDown size={14} />
          </button>
          <a className="text-link" href={original}>
            <FileSearch size={14} />
            {t('查看原件', 'View originals')}
          </a>
          <a className="text-link" href={'/decisions?new=' + (run.input.purpose || 'external')}>
            {run.input.purpose === 'handover'
              ? t('建立交接事项', 'Start a handover matter')
              : t('建立付款事项', 'Start a payment matter')}
            <ArrowRight size={13} />
          </a>
        </div>
        <div
          id="company-review-requests"
          hidden={!requestsOpen}
          className="company-review-requests"
        >
          {priorities.length ? (
            <ol>
              {priorities.map((item) => (
                <li key={item.id}>
                  <h3>{t(...item.title)}</h3>
                  <p>{t(...item.materials)}</p>
                  <p className="company-review-source-note">{t(...item.question)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              {t(
                '先取得同年度财务资料，并核对本次交易或交接所需的直接材料。',
                'Obtain same-year financial records and the direct evidence needed for this transaction or handover.'
              )}
            </p>
          )}
          <p className="company-review-source-note">
            {t(
              '清单列出待核对材料，不表示资料已取得或事项已证实。',
              'The checklist identifies requested evidence; it does not establish that evidence has been obtained or authenticated.'
            )}
          </p>
        </div>
      </section>
      <p className="company-review-footnote">
        {t(
          '历史披露不代表当前可用现金。网页摘要与已采用原件报告分别保留。',
          'Historical disclosures do not establish current available cash. Web summaries and adopted-original reports remain separate.'
        )}
      </p>
    </div>
  );
}

import type { DecisionDetail } from '../shared/decision-contracts';
import { derivePaymentBoundary, type PaymentBoundaryCalculation } from '../shared/payment-boundary';
import { useApp, type Translate } from './context';
import { money } from './format';
import { Tag } from './components';
import './payment-boundary.css';

function fieldLabel(field: string, t: Translate): string {
  const labels: Record<string, [string, string]> = {
    totalAmount: ['交易总金额', 'Total transaction amount'],
    alreadyPaid: ['已付金额', 'Already paid'],
    deliveredAmount: ['已交付对应金额', 'Delivered value'],
    actualRefund: ['实际已收到退款', 'Refund actually received'],
    exposureLimit: ['自设未交付暴露上限', 'Your undelivered-exposure limit'],
    'identity-contract': ['合同主体依据', 'Contract-entity evidence'],
    'identity-payee': ['收款主体依据', 'Receiving-entity evidence'],
    'identity-refund': ['退款主体依据', 'Refund-responsibility evidence'],
    terms: ['付款、交付与退款条款依据', 'Payment, delivery and refund terms'],
    paid: ['已付记录', 'Payment record'],
    delivered: ['实际交付记录', 'Delivery record'],
    refunded: ['实际退款记录', 'Actual-refund record'],
    'payment-range': ['交易范围矛盾', 'Inconsistent transaction scope'],
    'alreadyPaid-exceeds-total': [
      '已付大于交易总金额',
      'Already paid exceeds the transaction total',
    ],
    'deliveredAmount-exceeds-total': [
      '交付金额大于交易总金额',
      'Delivered value exceeds the transaction total',
    ],
    'actualRefund-exceeds-paid': ['实退款大于已付金额', 'Actual refunds exceed amounts paid'],
  };
  const key = field.replace(/^gate:/, '');
  return labels[key] ? t(...labels[key]) : t('金额字段待核对', 'Amount field needs review');
}
function BoundaryResult({
  result,
  records = false,
}: {
  result: PaymentBoundaryCalculation;
  records?: boolean;
}) {
  const { t, locale } = useApp();
  return (
    <div className="payment-boundary-result">
      <h4>
        {records
          ? t('按定位记录与输入条件', 'Using located records and input conditions')
          : t('按全部输入条件', 'Using all entered conditions')}
      </h4>
      {result.status === 'known' ? (
        <>
          <span className="payment-boundary-label">
            {t('本次拟付款金额的数学上限', 'Mathematical ceiling for this payment')}
          </span>
          <strong className="payment-boundary-amount">
            {money(result.maximumProposedAmount, locale, false)} <small>CNY</small>
          </strong>
          <p>
            {result.bindingConstraint === 'contract'
              ? t(
                  '交易剩余额构成较紧的约束。',
                  'The remaining transaction amount is the tighter constraint.'
                )
              : result.bindingConstraint === 'both'
                ? t(
                    '交易剩余额与自设暴露空间相等。',
                    'The remaining transaction amount equals your exposure headroom.'
                  )
                : t(
                    '自设未交付暴露空间构成较紧的约束。',
                    'Your undelivered-exposure headroom is the tighter constraint.'
                  )}
          </p>
        </>
      ) : result.status === 'already-above-limit' ? (
        <>
          <Tag tone="amber">
            {t('当前暴露已超自设上限', 'Current exposure already exceeds your limit')}
          </Tag>
          <p>
            {t('超出金额：', 'Amount above the limit: ')}
            {money(result.currentExcess, locale, false)} CNY
          </p>
          <p>
            {t(
              '在这些条件下，没有满足上限的非负新增付款金额。先核对已付、交付、实退款及上限条件。',
              'Under these conditions, no nonnegative additional payment satisfies the limit. Review paid amounts, delivery, actual refunds and your limit first.'
            )}
          </p>
        </>
      ) : (
        <>
          <Tag tone={result.status === 'invalid' ? 'red' : 'neutral'}>
            {result.status === 'invalid'
              ? t('金额或范围不一致 · 停止演算', 'Invalid amount or scope · calculation paused')
              : t('条件或依据不齐 · 上限未知', 'Conditions or evidence missing · ceiling unknown')}
          </Tag>
          <p>
            {[
              ...new Set(
                [...result.missingFields, ...result.invalidFields].map((field) =>
                  fieldLabel(field, t)
                )
              ),
            ].join(t('、', ', '))}
          </p>
        </>
      )}
      {result.currentExposure !== null && (
        <dl className="payment-boundary-values">
          <dt>{t('新增付款前的未交付暴露', 'Undelivered exposure before another payment')}</dt>
          <dd>{money(result.currentExposure, locale, false)} CNY</dd>
          <dt>{t('自设暴露空间', 'Headroom under your exposure limit')}</dt>
          <dd>{money(result.exposureHeadroom, locale, false)} CNY</dd>
          <dt>{t('交易剩余额', 'Remaining transaction amount')}</dt>
          <dd>{money(result.remainingContractAmount, locale, false)} CNY</dd>
        </dl>
      )}
    </div>
  );
}
export function PaymentBoundary({ detail }: { detail: DecisionDetail }) {
  const { t, locale, workspace } = useApp();
  const view = derivePaymentBoundary(detail),
    input = detail.version.input.external;
  if (!view || !input) return null;
  return (
    <section
      className="payment-boundary"
      aria-label={t('反求付款条件边界', 'Solve the payment-condition boundary')}
    >
      <div className="report-section-title">
        <h3>{t('自设条件留下多少付款空间', 'How much room your conditions leave')}</h3>
        <Tag>{t('约束演算', 'Constraint calculation')}</Tag>
      </div>
      <p className="field-note">
        {t(
          '反求本次拟付款的数学上限，不需要先填拟付金额。上限同时受交易剩余额与自设未交付暴露约束。',
          'Solve the mathematical ceiling without entering a proposed payment. Both the remaining transaction amount and your undelivered-exposure limit constrain it.'
        )}
      </p>
      <div className="payment-boundary-columns">
        <BoundaryResult result={view.assumptions} />
        <BoundaryResult result={view.records} records />
      </div>
      <p className="field-note">
        {t(
          '记录路径只采用已定位材料文本的已付、实际交付和实退款字段；主体或条款核对未完成时暂停。交易总金额与自设上限仍是输入条件。',
          'The record path uses paid, delivered and actual-refund fields located in saved material text. It pauses while entity or terms checks are incomplete. The transaction total and your limit remain entered conditions.'
        )}
      </p>
      <details className="payment-boundary-formula">
        <summary>{t('核对公式与采用的金额', 'Check the formula and amounts used')}</summary>
        <p>
          {t(
            '自设暴露空间 = 上限 + 已交付对应金额 + 实际已收到退款 − 已付金额。',
            'Exposure headroom = limit + delivered value + refunds actually received − amounts already paid.'
          )}
        </p>
        <p>
          {t(
            '交易剩余额 = 交易总金额 − 已付金额。',
            'Remaining transaction amount = transaction total − amounts already paid.'
          )}
        </p>
        <p>
          {t(
            '当前暴露未超上限且金额范围一致时，本次拟付款数学上限取两项较小值。',
            'When current exposure is within the limit and the amount scope is consistent, the mathematical ceiling is the smaller of these two values.'
          )}
        </p>
        <div className="payment-boundary-table">
          <table>
            <thead>
              <tr>
                <th>{t('金额字段', 'Amount field')}</th>
                <th>{t('输入条件', 'Entered condition')}</th>
                <th>{t('记录路径', 'Record path')}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  'totalAmount',
                  'alreadyPaid',
                  'deliveredAmount',
                  'actualRefund',
                  'exposureLimit',
                ] as const
              ).map((field) => (
                <tr key={field}>
                  <th>{fieldLabel(field, t)}</th>
                  <td>
                    {input[field] === null
                      ? t('尚未提供', 'Not provided')
                      : `${money(input[field], locale, false)} CNY`}
                  </td>
                  <td>
                    {field === 'totalAmount' || field === 'exposureLimit'
                      ? t('沿用输入条件', 'Entered condition retained')
                      : view.recordInput[field] === null
                        ? t('缺少匹配记录', 'Matching record missing')
                        : `${money(view.recordInput[field], locale, false)} CNY`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.recordEvidenceIds.length > 0 && (
          <ul className="payment-boundary-sources">
            {view.recordEvidenceIds.map((id) => {
              const record = detail.version.evidence.find((item) => item.id === id)!;
              const material = workspace?.materials.find((item) => item.id === record.materialId);
              const isPdf = material?.filename.toLowerCase().endsWith('.pdf');
              const href = material?.uploadId
                ? `/api/materials/${encodeURIComponent(material.id)}/file${isPdf ? `#page=${record.page || 1}` : ''}`
                : material?.sourceUrl && /^https?:\/\//.test(material.sourceUrl)
                  ? `${material.sourceUrl}${isPdf ? `#page=${record.page || 1}` : ''}`
                  : null;
              return (
                <li key={id}>
                  {fieldLabel(record.slot, t)} · {record.sourceLabel}{' '}
                  {href ? (
                    <a className="text-link" href={href} target="_blank" rel="noopener noreferrer">
                      {t('打开对应材料', 'Open linked material')}
                      {record.page ? ` · ${t('页', 'page')} ${record.page}` : ''}
                    </a>
                  ) : (
                    <span className="field-note">
                      {t('材料入口当前不可用', 'Material link currently unavailable')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </details>
      <p className="field-note">
        {t(
          '承诺、预计或尚未到账的退款不抵减实际暴露。数学上限不是付款建议、付款批准或整笔交易的安全保证。',
          'Promised, expected or pending refunds do not reduce actual exposure. The mathematical ceiling is not a payment recommendation, payment approval or safety guarantee for the transaction.'
        )}
      </p>
    </section>
  );
}

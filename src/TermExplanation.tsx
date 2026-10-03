import { Popover } from '@base-ui/react/popover';
import { CircleHelp, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from './context';
import { money } from './format';
import './term-explanation.css';

/** A local definition: opening it never queries sources or changes a calculation. */
export function TermExplanation({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useApp();
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="term-explanation-trigger"
        aria-label={t(`了解${title}`, `Explain ${title}`)}
      >
        <CircleHelp size={14} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={7}
          collisionPadding={12}
          collisionAvoidance={{ side: 'shift', align: 'shift' }}
          className="term-explanation-positioner"
        >
          <Popover.Popup className="term-explanation-popup">
            <div className="term-explanation-heading">
              <Popover.Title>{title}</Popover.Title>
              <Popover.Close
                className="term-explanation-close"
                aria-label={t('关闭解释', 'Close explanation')}
              >
                <X size={14} aria-hidden="true" />
              </Popover.Close>
            </div>
            <Popover.Description render={<div className="term-explanation-content" tabIndex={0} />}>
              {children}
            </Popover.Description>
            <a className="text-link" href="/docs/methodology#method-decision">
              {t('查看核查方法', 'Review methodology')}
            </a>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface ExposureExplanationAmounts {
  alreadyPaid: string | null;
  deliveredAmount: string | null;
  actualRefund: string | null;
  proposedAmount?: string | null;
}

/** Uses the supplied branch's amounts and existing result; never recalculates or substitutes zero. */
export function UndeliveredExposureExplanation({
  amounts,
  result,
  beforePayment = false,
  records = false,
}: {
  amounts: ExposureExplanationAmounts;
  result?: string | null;
  beforePayment?: boolean;
  records?: boolean;
}) {
  const { t, locale } = useApp();
  const amount = (value: string | null | undefined) =>
    value == null ? t('未知', 'unknown') : `${money(value, locale, false)} CNY`;
  return (
    <TermExplanation title={t('未交付暴露', 'Undelivered exposure')}>
      <p>
        {beforePayment
          ? t(
              '已付款中，扣除对应交付和实际到账退款后，仍未交付的金额；计算最低为 0。',
              'The amount already paid that remains undelivered after deducting delivered value and refunds actually received; the calculation is floored at zero.'
            )
          : t(
              '已付加本次拟付，扣除对应交付和实际到账退款后，仍未交付的金额；计算最低为 0。',
              'Already paid plus this proposed payment, less delivered value and refunds actually received; the amount still undelivered is floored at zero.'
            )}
      </p>
      <p>
        {t(
          '退款承诺不抵减这项金额，它也不代表最终损失。',
          'Promised refunds do not reduce this amount, which is not a prediction of final loss.'
        )}
      </p>
      <dl className="term-explanation-amounts">
        <dt>{t('已付', 'Already paid')}</dt>
        <dd>{amount(amounts.alreadyPaid)}</dd>
        {!beforePayment && (
          <>
            <dt>{t('本次拟付', 'Proposed payment')}</dt>
            <dd>{amount(amounts.proposedAmount)}</dd>
          </>
        )}
        <dt>{t('已交付对应金额', 'Delivered value')}</dt>
        <dd>{amount(amounts.deliveredAmount)}</dd>
        <dt>{t('实际到账退款', 'Refund received')}</dt>
        <dd>{amount(amounts.actualRefund)}</dd>
        {result !== undefined && (
          <>
            <dt>{t('未交付暴露', 'Undelivered exposure')}</dt>
            <dd>{amount(result)}</dd>
          </>
        )}
      </dl>
      <p className="term-explanation-basis">
        {records
          ? t('沿用本版本定位记录中的金额。', 'Uses amounts from this version’s located records.')
          : t('沿用当前输入条件中的金额。', 'Uses amounts from the current entered conditions.')}
      </p>
    </TermExplanation>
  );
}

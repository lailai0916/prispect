import type { DecisionChange, DecisionChangeSet } from '../shared/decision-change';
import { useApp } from './context';
import { money } from './format';
import { decisionText } from './decisionTranslations';
import './decision-changes.css';
import { ChevronDown } from 'lucide-react';
import { decisionClaimTargets } from '../shared/decision-claims';
import type { DecisionClaimTarget } from '../shared/decision-contracts';

const states: Record<string, readonly [string, string]> = {
  active: ['采用', 'Active'],
  withdrawn: ['已撤回', 'Withdrawn'],
  matched: ['字段匹配', 'Fields match'],
  unknown: ['未知', 'Unknown'],
  conflict: ['记录冲突', 'Record conflict'],
  'out-of-scope': ['范围不符', 'Out of scope'],
  'condition-unmet': ['条件未满足', 'Condition unmet'],
  true: ['满足自设上限', 'Within user-set limit'],
  false: ['超过自设上限', 'Above user-set limit'],
  known: ['条件下可计算', 'Computable under these conditions'],
  invalid: ['范围或金额不一致', 'Invalid scope or amounts'],
  'already-above-limit': ['当前暴露已超自设上限', 'Current exposure above your limit'],
  'no-day-end-shortfall': [
    '所列日末检查点未低于底线',
    'No listed day-end check point below the floor',
  ],
  'order-sensitive': ['同日顺序影响底线', 'Same-day order affects the floor'],
  'not-order-sensitive': ['所列检查点未出现此敏感性', 'Not found at listed check points'],
  'baseline-below-floor': [
    '不含本次拟付也低于底线',
    'Below the floor without this proposed payment',
  ],
  'not-achievable': ['列示回款无法达到条件', 'Listed receipts cannot satisfy the condition'],
  external: ['付款前核对', 'Before payment'],
  handover: ['接手核查', 'Company handover'],
  'source-record': ['来源记录', 'Source record'],
  'counterparty-statement': ['对方陈述', 'Counterparty statement'],
  assumption: ['假设', 'Assumption'],
  identity: ['责任主体', 'Responsible entities'],
  'cash-flow': ['现金事件', 'Cash event'],
  contract: ['签约', 'Contract'],
  payee: ['收款', 'Payee'],
  refund: ['退款责任', 'Refund responsibility'],
  in: ['收款', 'Receipt'],
  out: ['付款', 'Payment'],
  fixed: ['固定事件', 'Fixed event'],
  proposed: ['可调整事件', 'Adjustable event'],
};
export function DecisionChanges({
  changes,
  compact = false,
}: {
  changes: DecisionChangeSet | undefined;
  compact?: boolean;
}) {
  const { t, locale } = useApp();
  if (!changes) return null;
  const value = (row: DecisionChange, raw: string | null) =>
    raw === null
      ? t('未知或未提供', 'Unknown or not supplied')
      : row.unit === 'CNY'
        ? `${money(raw, locale, false)} CNY`
        : row.key.startsWith('claim:') &&
            row.key.endsWith(':target') &&
            decisionClaimTargets[raw as DecisionClaimTarget]
          ? t(...decisionClaimTargets[raw as DecisionClaimTarget].label)
          : (row.unit === 'state' ||
                row.key === 'purpose' ||
                /:(slot|kind|role|direction|flexibility)$/.test(row.key)) &&
              states[raw]
            ? t(...states[raw])
            : raw;
  const counts = (kind: DecisionChange['kind']) =>
    changes.changes.filter((row) => row.kind === kind).length;
  return (
    <details className="decision-changes" open={!compact}>
      <summary>
        {t('本版改变了什么', 'What changed in this version')}
        <span>
          V{changes.fromRevision} → V{changes.toRevision}
        </span>
        <span>{t(`${changes.changes.length} 项差异`, `${changes.changes.length} changes`)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <p className="field-note">
        {t(
          '比较相邻保存版本的输入、材料和当前规则结果；没有重新检索资料，不表示企业发生了同样的变化。',
          'Compares adjacent saved inputs, evidence and current-rule results. No sources were retrieved again; these are not observations of business changes.'
        )}
      </p>
      {changes.changes.length ? (
        <>
          <p className="decision-change-counts">
            {t(
              `输入 ${counts('input')} · 材料 ${counts('evidence')} · 门槛 ${counts('gate')} · 演算 ${counts('calculation')}`,
              `Inputs ${counts('input')} · Evidence ${counts('evidence')} · Gates ${counts('gate')} · Calculations ${counts('calculation')}`
            )}
          </p>
          <div
            className="decision-change-table"
            tabIndex={0}
            aria-label={t('版本差异，可横向滚动', 'Version differences; scroll horizontally')}
          >
            <table>
              <thead>
                <tr>
                  <th>{t('变化项', 'Changed field')}</th>
                  <th>V{changes.fromRevision}</th>
                  <th>V{changes.toRevision}</th>
                </tr>
              </thead>
              <tbody>
                {changes.changes.map((row) => (
                  <tr key={`${row.kind}:${row.key}`}>
                    <th scope="row">
                      {row.kind === 'gate' && locale === 'en'
                        ? decisionText(row.label[0])
                        : t(...row.label)}
                    </th>
                    <td>{value(row, row.before)}</td>
                    <td>{value(row, row.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>
          {t(
            '本版没有改变这些输入、材料状态、门槛或演算结果。',
            'This version did not change these inputs, evidence states, gates or calculation results.'
          )}
        </p>
      )}
    </details>
  );
}

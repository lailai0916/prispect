import type { DecisionDetail, DecisionEvidenceSlot } from '../shared/decision-contracts';
import { deriveDecisionEntityPath, type DecisionEntityPathNode } from '../shared/payment-boundary';
import { useApp, type Translate } from './context';
import { Tag } from './components';
import './payment-boundary.css';

export interface DecisionEntityPathProps {
  detail: DecisionDetail;
  onAddEvidence?: (slot: DecisionEvidenceSlot, role?: 'contract' | 'payee' | 'refund') => void;
  onEvidence?: (evidenceId: string) => void;
}
function statusLabel(node: DecisionEntityPathNode, t: Translate): string {
  switch (node.status) {
    case 'input-only':
      return node.name
        ? t('仅名称 · 关系未核对', 'Name only · relationship unconfirmed')
        : t('尚未记录', 'Not recorded');
    case 'matched':
      return t('角色字段已定位', 'Role field located');
    case 'conflict':
      return t('记录冲突', 'Record conflict');
    case 'out-of-scope':
      return t('主体或范围待核对', 'Entity or scope needs review');
    case 'withdrawn':
      return t('依据已撤回', 'Evidence withdrawn');
    case 'condition-unmet':
      return t('条件未满足', 'Condition unmet');
    default:
      return t('缺少匹配依据', 'Matching evidence missing');
  }
}
export function DecisionEntityPath({ detail, onAddEvidence, onEvidence }: DecisionEntityPathProps) {
  const { t } = useApp();
  const nodes = deriveDecisionEntityPath(detail);
  if (!nodes) return null;
  const labels: Record<DecisionEntityPathNode['id'], [string, string]> = {
    'trading-name': ['经营名义／门店名', 'Trading or store name'],
    contract: ['合同责任主体', 'Contract-responsible entity'],
    payee: ['实际收款主体', 'Receiving entity'],
    refund: ['退款责任主体', 'Refund-responsible entity'],
  };
  return (
    <section
      className="decision-entity-path"
      aria-label={t('经营名义与付款责任主体', 'Trading name and payment-responsible entities')}
    >
      <div className="report-section-title">
        <h3>{t('这笔付款涉及谁', 'Who is involved in this payment')}</h3>
      </div>
      <p className="field-note">
        {t(
          '门店名称与承担责任的企业分别核对。下面按角色排列；名称相同也不自动证明经营关系。',
          'Review the store name and responsible entities separately. These are roles; equal names do not establish an operating relationship.'
        )}
      </p>
      <ol className="decision-entity-nodes">
        {nodes.map((node) => (
          <li key={node.id}>
            <span className="decision-entity-role">{t(...labels[node.id])}</span>
            <strong>{node.name || t('尚未记录名称', 'Name not recorded')}</strong>
            <Tag tone={node.status === 'conflict' ? 'red' : 'neutral'}>{statusLabel(node, t)}</Tag>
            {node.id === 'trading-name' ? (
              <p>
                {t(
                  '需结合营业执照、合同抬头和收款凭证确认关系。',
                  'Check the business licence, contract heading and payment receipt to establish the relationship.'
                )}
              </p>
            ) : (
              <div className="decision-entity-actions">
                {onEvidence &&
                  node.evidenceIds.map((id, index) => (
                    <button
                      type="button"
                      className="text-link"
                      key={id}
                      onClick={() => onEvidence(id)}
                    >
                      {t('查看角色依据', 'View role evidence')} {index + 1}
                    </button>
                  ))}
                {onAddEvidence && (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      onAddEvidence('identity', node.id as 'contract' | 'payee' | 'refund')
                    }
                  >
                    {t('补充该角色依据', 'Add evidence for this role')}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="field-note">
        {t(
          '角色字段在保存材料中定位，只说明记录匹配；不能认证门店归属、原件真实性或未来履约。',
          'Locating role fields in saved material confirms a record match. It does not authenticate store ownership, original documents or future performance.'
        )}
      </p>
    </section>
  );
}

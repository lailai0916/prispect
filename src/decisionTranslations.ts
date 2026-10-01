import { metricName } from './format';
import type { MetricKey } from '../shared/contracts';

const messages: Record<string, string> = {
  尚未提供对应记录: 'No corresponding record provided',
  历史版本中的未解释冲突记录: 'Unresolved conflicting record from an earlier version',
  '字段已在所绑定的保存文本中定位；仅说明记录匹配，未鉴真或认证履行。':
    'The fields were located in the linked saved text. This establishes text matching, not authentication or verified performance.',
  '存在未解释的记录冲突；撤回或恢复旧版本不能视为已解决。':
    'An unexplained record conflict remains. Withdrawing evidence or restoring an earlier version does not resolve it.',
  '未形成同主体、适用日期及匹配原文的记录依据；用户转录、对方陈述和假设不当作已核验原件。':
    'Evidence for the same entity, applicable date and matching source text is incomplete. Transcriptions, statements and assumptions are not treated as verified originals.',
  '同一对象的提供字段或原文记录不一致，需补充纠正及对账依据；撤回记录不消除已知冲突。':
    'Fields or source records for the same item differ. Provide corrections and reconciliation evidence; withdrawing a record does not remove the known conflict.',
  历史财报主体与适用范围: 'Historical report entity and scope',
  '仅连接该主体的历史年度事实，不证明当前可用余额、个人交款安全或履约。':
    'Links only historical annual facts for this entity. It does not establish current available cash, payment safety or performance.',
  '集团或其他主体的年报只作历史背景，不能证明本次交易主体的资金能力。':
    'A group or other entity’s report is historical context, not evidence of the transaction entity’s current funds.',
  未取得可采用历史任务: 'No applicable historical review linked',
  签约主体: 'Contract entity',
  收款主体: 'Receiving entity',
  退款责任主体: 'Refund-responsible entity',
  '付款、交付与退款条款': 'Payment, delivery and refund terms',
  已付记录: 'Payments already made',
  实际交付对应金额: 'Value actually delivered',
  实际退款记录: 'Actual refund records',
  '实际退款大于已付金额，需核查记录范围；未用max(0)抹掉矛盾。':
    'Actual refunds exceed payments already made. Recheck the record scope; max(0) has not been used to conceal the contradiction.',
  自设未交付暴露上限: 'Your undelivered-exposure limit',
  '只核对人工记录和自设上限；拟付方案满足算术条件也不是支付批准。承诺退款不抵减实际暴露。':
    'Compares supplied records with your chosen limit. Meeting the arithmetic condition is not payment approval. Promised refunds do not reduce actual exposure.',
  用户自设暴露上限: 'User-selected exposure limit',
  起点可用余额记录: 'Opening available-cash record',
  新增付款后的自设现金底线: 'Your cash floor after the additional payment',
  '依据分支仍是有记录字段的情景，不认证未来现金。相同日先后未知时先付款保守边界单列；延期方案假设采购可延期且其他现金流不受影响。':
    'The recorded-fields branch is still a scenario, not verified future cash. A separate payments-first bound covers unknown same-day order. Delaying assumes the purchase can be deferred without affecting other cash flows.',
  拟付款日期: 'Proposed payment date',
  延期方案的可行条件: 'Conditions for delaying the payment',
  '改付款日假设供应商同意延期，交付及相关回款均不受影响；需核查这些条件，不能推荐延期。':
    'Changing the date assumes supplier consent and no effect on delivery or related receipts. These conditions need review; the calculation does not recommend a delay.',
  对照日期是假设: 'Alternative date is an assumption',
  业务扩张或结算结构变化: 'Business expansion or a change in settlement structure',
  回款困难或收款延期: 'Collection difficulties or delayed receipts',
  扩张备货与订单增长: 'Inventory build-up for expansion or growing orders',
  去化困难或库存积压: 'Slow sell-through or excess inventory',
  '账龄、票据结算和期后回款记录，用于区分两种可能解释。':
    'Aging, bill-settlement and subsequent collection records to distinguish the two explanations.',
  '订单覆盖、库龄和期后出库记录，用于区分两种可能解释。':
    'Order coverage, inventory aging and subsequent dispatch records to distinguish the two explanations.',
  区分应收的两种解释: 'Distinguish the two receivables explanations',
  区分存货的两种解释: 'Distinguish the two inventory explanations',
  '同一财务信号支持继续核查，不裁定经营原因。':
    'The financial signal supports further review; it does not establish the operating cause.',
  '签约、收款和退款责任主体的原件；如主体不同，提供授权书、合同付款指引及责任说明。':
    'Original records identifying the contract, receiving and refund-responsible entities. If they differ, provide authorization, contractual payment instructions and responsibility terms.',
  '明确付款、交付、退款责任及延期同意的书面条款，核对延期对交付和回款的影响。':
    'Written payment, delivery and refund terms and consent to delay. Check the effect on delivery and collections.',
  '与起点日期一致的银行账户对账、受限资金和可用余额记录；不能以年报金额代替。':
    'Bank reconciliation, restricted-fund and available-balance records for the start date. Annual report amounts cannot substitute for them.',
  '该事件的金额、日期、主体及必要支出/收款计划原文；缺依据不删除事件或填零。':
    'Source text for this event’s amount, date, entity and payment or collection schedule. Missing evidence does not justify deleting an event or filling it with zero.',
  '截至所选日期的实际付款、交付对应金额和实际退款凭据；承诺退款不替代发生记录。':
    'Actual payment, delivered-value and refund records through the selected date. Refund promises cannot replace records of occurrence.',
  '同交易主体的资料及明确适用范围；集团历史报表仅作背景，不能代替当前交易证据。':
    'Records for the transaction entity with an explicit scope. Group historical reports are context and cannot replace current transaction evidence.',
  '决定、证据转录与现金计划仅保存在当前账号，不发送外部模型。':
    'Decision inputs, transcriptions and cash plans are saved only in your account and are not sent to an external model.',
  '来源定位及字段匹配不是资料鉴真，也不认证经济真实性或未来履行。':
    'Source location and field matching do not authenticate documents, economic facts or future performance.',
  '没有绑定保存文本的用户转录仅支持独立假设分支，不进入有记录字段分支。':
    'Transcriptions without linked saved text support only the separate assumption branch, not the recorded-fields branch.',
  '历史年度财报不证明今日现金、交款安全、公司评级或支付批准。':
    'Historical annual reports do not establish today’s cash, payment safety, a company rating or payment approval.',
  '旧输入版本按当前规则重算；恢复创建新版本并保留当前已知未解释冲突。':
    'Historical inputs are recalculated under current rules. Restoring creates a new version and retains currently known unexplained conflicts.',
  交易金额范围一致性: 'Transaction amount and scope consistency',
  交易范围与总额: 'Transaction scope and total',
  '已付、交付或退款金额与交易总额/发生范围矛盾，暂停方案暴露；未用max(0)掩盖范围错误。':
    'Payment, delivery or refund amounts contradict the transaction total or recorded scope. Exposure calculations stop; max(0) does not conceal scope errors.',
  '历史应收负向现金调整仅促使调查，不能支持当前流入金额或裁定原因。':
    'The historical negative receivables adjustment motivates investigation. It does not support the current inflow amount or establish its cause.',
  '历史存货负向现金调整仅促使调查，不能支持当前流入金额或裁定原因。':
    'The historical negative inventory adjustment motivates investigation. It does not support the current inflow amount or establish its cause.',
};

export function decisionText(text: string): string {
  if (messages[text]) return messages[text];
  let match = text.match(/^核对(.+)的冲突$/);
  if (match) return `Reconcile conflicting ${decisionText(match[1])}`;
  match = text.match(/^补充(.+)$/);
  if (match) return `Provide ${decisionText(match[1])}`;
  match = text.match(/^(.+)的金额与日期记录$/);
  if (match) return `${match[1]}: amount and date records`;
  match = text.match(/^核查(.+)的回款依据$/);
  if (match) return `Review collection evidence for ${match[1]}`;
  match = text.match(
    /^请提供(.+)截至(\d{4}-\d{2}-\d{2})，事件(.+)（(.+)），(.+)、(.+)的收款对象、合同\/订单、约定结算日期及期后实际回款记录；核对延期或去化对该笔流入的影响。$/
  );
  if (match)
    return `For ${match[1]} as of ${match[2]}, provide the collection party, contract or order, agreed settlement date and subsequent actual receipts for event ${match[3]} (${match[4]}), ${match[5] === '日期待补' ? 'date unknown' : match[5]}, ${match[6] === '金额待补' ? 'amount unknown' : match[6].replace(/元$/, ' CNY')}. Review how delays or inventory sell-through affect this inflow.`;
  match = text.match(/^适用范围更正后不再同组；未认证真伪或争议事实。(.*)$/);
  if (match)
    return `No longer grouped together after scope correction. Authenticity and disputed facts have not been verified. ${match[1]}`;
  match = text.match(
    /^(\d{4}) (netProfit|operatingCashFlow|inventoryAdjustment|receivablesAdjustment|payablesAdjustment|otherAdjustments)$/
  );
  if (match) return `${match[1]} ${metricName(match[2] as MetricKey, 'en')}`;
  return text;
}

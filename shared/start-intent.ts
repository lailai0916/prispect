/** Local routing only. A description remains an unverified user statement. */
export type StartKind = 'company' | 'external' | 'handover';
export interface StartIntent {
  kind: StartKind;
  companyQuery: string | null;
  proposedAmount: string | null;
  year?: number;
}

function companyName(text: string): string | null {
  if (/^\d{6}$/.test(text)) return text;
  const code = /(?:股票|证券|代码|\b(?:stock|security)\s+code)\s*[:：]?\s*(\d{6})(?!\d)/i.exec(
    text
  );
  if (code) return code[1]!;
  let value = text
    .replace(
      /^(?:我(?:们)?(?:想|要|准备|正在)?(?:了解|查询|核查|分析|看看|看一下|判断|接手|接管|和|与|向|给)|(?:请(?:帮我)?|帮我)?(?:了解|查询|核查|分析|看看|看一下|判断|接手|接管|查一下))\s*/g,
      ''
    )
    .replace(/^(?:please\s+)?(?:check|research|review|analy[sz]e|look\s+up)\s+/i, '')
    .trim();
  const legal =
    /([\p{L}][\p{L}\p{N}·（）() .-]{1,70}?(?:有限责任公司|股份有限公司|有限公司|集团公司))/u.exec(
      value
    );
  if (legal) {
    value = legal[1]!
      .split(/(?:准备向|准备给|向|给|与|接手|接管|了解|查询|核查|分析)/)
      .at(-1)!
      .trim();
  } else {
    value = value
      .split(
        /(?:的财务|的现金|的经营|的风险|\d{4}\s*年|靠不靠谱|怎么样|是否|能不能|值得信任|财报|现金流|最近|风险|合作|[？?，,。\n])/
      )[0]!
      .replace(/的$/, '')
      .split(
        /(?:['’]s\s+(?:finances|cash|risk)|\s+(?:cash\s+flow|financial\s+(?:statements|risk))|\s+20\d{2}\b)/i
      )[0]!
      .trim();
  }
  if (
    !value ||
    value.length > 80 ||
    /(?:家人|朋友|储蓄|存款|准备|付款|支付|转账|工资|退款|万元|\d+元|@|https?:)|\b(?:my|family|friend|prepay|payment|refund|salary|deposit|savings|transfer|pay|CNY|RMB)\b/i.test(
      value
    )
  )
    return null;
  if (!/^[\p{L}\p{N}·（）() &.-]+$/u.test(value)) return null;
  return value;
}

function proposedPayment(text: string): string | null {
  const match =
    /(?:拟付|拟付款|准备付|准备支付|预付|预付款|支付|付款|转账|付给)[^\d，,。\n]{0,40}(\d+(?:\.\d{1,2})?)\s*(万(?:元)?|元)/.exec(
      text
    );
  if (!match) return null;
  const [whole, decimal = ''] = match[1]!.split('.');
  const cents =
    (BigInt(whole!) * 100n + BigInt(decimal.padEnd(2, '0'))) *
    (match[2]!.startsWith('万') ? 10000n : 1n);
  if (cents > 1000000000000000000n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function proposedEnglishPayment(text: string): string | null {
  const match =
    /\b(?:prepay|pay|transfer)\b[^\n]{0,40}?\b(?:CNY|RMB)\s+(\d+(?:\.\d{1,2})?)(?![\d.])/i.exec(
      text
    );
  if (!match) return null;
  const [whole, decimal = ''] = match[1]!.split('.');
  const cents = BigInt(whole!) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (cents > 1000000000000000000n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function interpretStart(text: string, mode: StartKind | 'auto' = 'auto'): StartIntent {
  const value = text.trim();
  const kind =
    mode !== 'auto'
      ? mode
      : /(?:接手|接管|交接|收付款|发工资|现金缺口)|\b(?:handover|take\s+over|payroll|cash\s+gap)\b/i.test(
            value
          )
        ? 'handover'
        : /(?:预付|付款|支付|转账|储蓄|存款|充值|退款|加盟|交给)|\b(?:prepay|prepayment|pay|payment|transfer|savings|deposit|refund)\b/i.test(
              value
            )
          ? 'external'
          : 'company';
  const requestedYear = kind === 'company' ? /(?:20\d{2})(?:\s*年|\b)/.exec(value)?.[0] : undefined;
  return {
    kind,
    companyQuery: companyName(value),
    proposedAmount:
      kind === 'company' ? null : proposedPayment(value) || proposedEnglishPayment(value),
    ...(requestedYear ? { year: Number(requestedYear.replace(/\s*年$/, '')) } : {}),
  };
}

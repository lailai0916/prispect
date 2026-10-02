import type { AnalysisTask, ContextNoteKey, EvidenceRef, MetricKey } from '../shared/contracts.js';
import { calculateCashPlan } from '../shared/cash-plan.js';

export function escapeHtml(input: unknown): string {
  return String(input ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
}
const metricLabels: Record<MetricKey, string> = {
  netProfit: '合并净利润',
  operatingCashFlow: '经营现金净额',
  inventoryAdjustment: '存货调整',
  receivablesAdjustment: '经营性应收调整',
  payablesAdjustment: '经营性应付调整',
  otherAdjustments: '其余已披露调整',
};
const style = `
:root{color-scheme:light dark;--ink:#202124;--muted:#656970;--line:#e4e5e8;--accent:#3567db;--canvas:#f5f6f8;--paper:#fff;--subtle:#f8f9fa;--selection:#dce7ff}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--ink);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
.document{max-width:1080px;margin:32px auto;padding:44px 52px;background:var(--paper);border:1px solid var(--line);border-radius:12px}
header{border-bottom:1px solid var(--line);padding-bottom:24px}
.identity{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:28px;color:var(--muted);font-size:12px}
.brand{color:var(--ink);font-weight:600;font-size:15px}
h1{font-size:28px;line-height:1.35;letter-spacing:-.025em;font-weight:600;margin:0 0 12px}
h2{font-size:18px;line-height:1.4;letter-spacing:-.015em;font-weight:600;margin:0 0 16px}
h3{font-size:14px;line-height:1.6;font-weight:600;margin:0 0 6px}
p{margin:0 0 10px}p:last-child{margin-bottom:0}section{margin-top:32px}
.meta{display:flex;flex-wrap:wrap;gap:8px 24px;color:var(--muted);font-size:12px;margin-bottom:16px}
.summary{max-width:76ch}.muted,small{color:var(--muted)}small{font-size:12px}
a{color:var(--accent);text-decoration:none;text-underline-offset:3px;overflow-wrap:anywhere}a:hover{text-decoration:underline}a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.table-wrap{overflow-x:auto;overscroll-behavior-x:contain;border:1px solid var(--line);border-radius:8px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid var(--line)}
th{background:var(--subtle);font-weight:500;color:var(--muted);white-space:nowrap}tbody tr:last-child td{border-bottom:0}
.amount{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}.unit{display:block;color:var(--muted);font-size:11px}.formula{min-width:200px;color:var(--muted)}
.item{padding:16px 0;border-bottom:1px solid var(--line)}.item:first-of-type{padding-top:0}.item:last-child{border-bottom:0;padding-bottom:0}
.item-heading{display:flex;justify-content:space-between;gap:20px;align-items:baseline}.status{white-space:nowrap;color:var(--muted);font-size:12px;font-weight:400}
.references{font-size:12px;color:var(--muted);margin-top:10px}.quote{margin-top:4px;color:var(--muted);overflow-wrap:anywhere}.request{margin-top:8px}.request span{color:var(--muted);margin-right:8px}
.source{margin-top:24px}.source:first-of-type{margin-top:0}.source-meta{margin:8px 0 12px;font-size:12px;color:var(--muted);overflow-wrap:anywhere}.hash{font-size:11px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.observations{min-width:760px;table-layout:fixed}.observations th:nth-child(1){width:90px}.observations th:nth-child(2){width:130px}.observations th:nth-child(3){width:160px}.observations th:nth-child(4){width:130px}.observations td:first-child{min-width:76px}.observations td:last-child{min-width:280px}
.note{padding:16px 20px;background:var(--subtle);border-radius:8px;color:var(--muted);font-size:12px}.note ul{margin:0;padding-left:18px}.note li+li{margin-top:6px}.model-text{white-space:pre-line;max-width:76ch}
footer{border-top:1px solid var(--line);margin-top:36px;padding-top:16px;font-size:11px;color:var(--muted);overflow-wrap:anywhere}::selection{background:var(--selection)}
@media(prefers-color-scheme:dark){:root{--ink:#ececf0;--muted:#a0a4ae;--line:#34363d;--accent:#91a8ff;--canvas:#15161b;--paper:#1b1d23;--subtle:#24262e;--selection:#374779}}
@media(max-width:700px){body{background:var(--paper)}.document{margin:0;padding:28px 20px;border:0;border-radius:0}h1{font-size:24px}.identity{margin-bottom:24px}.item-heading{display:block}.status{display:block;margin-bottom:8px}section{margin-top:28px}.observations{min-width:calc(510px + 100vw - 40px)}}
@media print{:root{color-scheme:light;--ink:#202124;--muted:#656970;--line:#e4e5e8;--accent:#3567db;--canvas:#fff;--paper:#fff;--subtle:#f8f9fa}body{background:#fff;font-size:10pt}.document{max-width:none;margin:0;padding:0;border:0;border-radius:0}h1{font-size:20pt}h2{font-size:13pt;break-after:avoid}h3{font-size:10pt;break-after:avoid}.item,.closing{break-inside:avoid}footer{margin-top:12px;padding-top:10px;line-height:1.3}header{padding-bottom:16px}section{margin-top:24px}.table-wrap{overflow:visible;border:0;border-radius:0}table{font-size:8pt;table-layout:fixed}.observations{min-width:0}.formula{min-width:0}.observations td:first-child,.observations td:last-child{min-width:0}th,td{padding:7px 8px;overflow-wrap:anywhere}.metrics th:nth-child(1){width:18%}.metrics th:nth-child(2),.metrics th:nth-child(3){width:17%}.metrics th:nth-child(4){width:48%}.bridge th:nth-child(1){width:28%}.bridge th:nth-child(2){width:22%}.bridge th:nth-child(3){width:50%}.observations th:nth-child(1){width:11%}.observations th:nth-child(2){width:15%}.observations th:nth-child(3){width:20%}.observations th:nth-child(4){width:14%}.observations th:nth-child(5){width:40%}thead{display:table-header-group}tr{break-inside:avoid}.amount{white-space:normal}.item-heading{display:block}.status{display:inline-block;margin:0 0 8px}.identity{margin-bottom:20px}.source h3{break-after:avoid}a{color:inherit;text-decoration:none}.references{font-size:8pt}.hash,footer{font-size:7pt}@page{size:A4;margin:16mm}}
`;

export function reportHtml(task: AnalysisTask): string {
  const report = task.report!;
  const e = escapeHtml;
  const sourceIndex = new Map(report.snapshot.map((material, index) => [material.id, index + 1]));
  const refs = (items: EvidenceRef[], quotes = false): string =>
    items
      .filter(
        (ref, index) =>
          items.findIndex(
            (other) =>
              other.materialId === ref.materialId &&
              other.page === ref.page &&
              (!quotes || other.quote === ref.quote)
          ) === index
      )
      .map((ref) => {
        const index = sourceIndex.get(ref.materialId);
        const label = index ? `<a href="#source-${index}">来源 ${index}</a>` : e(ref.materialId);
        return `${label}${ref.page === null ? ' · 页码未提供' : ` · PDF 第 ${e(ref.page)} 页`}${quotes ? `<div class="quote">${e(ref.quote)}</div>` : ''}`;
      })
      .join(quotes ? '<br>' : '；');
  const table = (head: string, rows: string, extra = '') =>
    `<div class="table-wrap"><table class="${extra}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const section = (title: string, body: string) => `<section><h2>${title}</h2>${body}</section>`;
  const modelStatus = {
    'not-requested': '未启用',
    'not-configured': '服务未配置',
    completed: '解释已完成',
    failed: '解释未完成',
  }[report.model.status];
  const modelDisclosure =
    report.model.status === 'not-requested' || report.model.status === 'not-configured'
      ? '本次未向模型服务发送材料。'
      : report.model.error?.includes('未调用')
        ? '输入条件不满足，本次未调用模型。'
        : '已发送筛选后的指标、短摘录与规则摘要。引用 ID 与格式已检查，解释含义需人工复核。';
  const verdict = {
    supported: '核对通过',
    attention: '需后续询证',
    insufficient: '材料不足',
    conflict: '口径冲突',
  }[report.verdict];
  const headline = {
    supported: report.bridge ? '现金桥已核对' : '金额可核对',
    attention: '经营现金低于合并净利润',
    insufficient: '材料不足',
    conflict: '输入存在冲突',
  }[report.verdict];
  const summary = {
    supported: report.bridge ? '利润与调整项之和等于经营现金净额。' : report.summary,
    attention: '经营现金与利润的差额已核对，经营原因仍需询证。',
    insufficient: '保留可采用金额；补全材料后重算。',
    conflict: '保留冲突来源，请修正后重算。',
  }[report.verdict];
  const metrics = table(
    `<th>指标</th><th class="amount">${e(report.year)} 年</th><th class="amount">${e(report.previousYear)} 年</th><th>公式 / 口径</th>`,
    report.metrics
      .map(
        (metric) =>
          `<tr><td>${e(metric.label)}</td><td class="amount">${metric.value === null ? '不可计算' : e(metric.value)}${metric.value === null ? '' : `<span class="unit">${e(metric.unit)}</span>`}</td><td class="amount">${metric.previousValue === null ? '—' : e(metric.previousValue)}${metric.previousValue === null ? '' : `<span class="unit">${e(metric.unit)}</span>`}</td><td class="formula">${e(metric.formula)}</td></tr>`
      )
      .join(''),
    'metrics'
  );
  const bridge = report.bridge
    ? table(
        '<th>项目</th><th class="amount">金额（CNY）</th><th>依据</th>',
        report.bridge
          .map(
            (step) =>
              `<tr><td>${e(step.label)}${step.derived ? '<span class="unit">分组计算</span>' : ''}</td><td class="amount">${e(step.value)}</td><td>${refs(step.sourceRefs)}</td></tr>`
          )
          .join(''),
        'bridge'
      )
    : '<p class="muted">材料不足或口径冲突，现金桥未生成。</p>';
  const checks = report.checks
    .map(
      (check) =>
        `<div class="item"><div class="item-heading"><h3>${e(check.label)}</h3><span class="status">${{ pass: '已核对', warn: '需核对', fail: '未通过' }[check.status]}</span></div><p>${e(check.message === '输入声明的主体、年度期间、人民币单位及合并范围一致；这不等于原件真实性已核验。' ? '输入口径一致。' : check.message)}</p>${check.sourceRefs.length ? `<div class="references">${refs(check.sourceRefs)}</div>` : ''}</div>`
    )
    .join('');
  const findings = report.findings
    .map(
      (finding) =>
        `<div class="item"><div class="item-heading"><h3>${e(finding.label)}</h3><span class="status">${{ calculation: '计算结果', source: '原文依据', management: '管理层说法' }[finding.basis]}</span></div><p>${e(finding.explanation)}</p>${finding.sourceRefs.length ? `<div class="references">${refs(finding.sourceRefs, true)}</div>` : ''}</div>`
    )
    .join('');
  const crossSignals = (report.crossSignals || [])
    .map((signal) => {
      const next = signal.nextEvidence[task.purpose === 'handover' ? 'handover' : 'external'];
      const facts = signal.facts
        .map(
          (fact) =>
            `<tr><td>${e(fact.year)} · ${e(metricLabels[fact.metric])}</td><td class="amount">${e(fact.amount)} CNY</td><td>${refs(fact.sourceRefs, true)}</td></tr>`
        )
        .join('');
      return `<div class="item"><h3>${e(signal.title.zh)}</h3><p>${e(signal.reading.zh)}</p>${table('<th>触发事实</th><th class="amount">金额</th><th>原件位置</th>', facts)}<p class="request"><span>解释一</span>${e(signal.explanations[0].zh)}</p><p class="request"><span>解释二</span>${e(signal.explanations[1].zh)}</p><p class="request"><span>${task.purpose === 'handover' ? '接手前核查' : '付款前核查'}</span>${e(next.zh)}</p></div>`;
    })
    .join('');
  const crossSignalChecks =
    report.crossSignalChecks === undefined
      ? '<p class="muted">这份旧版报告没有保存组合规则评估记录；本次导出未重新计算。使用原材料创建新核查后可评估当前规则。</p>'
      : `<p class="muted">规则核对区分组合成立、组合不成立与材料阻断。组合不成立或未能核对均不表示企业安全；声明口径和现金桥闭合也不认证原件真实性。</p>${report.crossSignalChecks
          .map((check) => {
            const requirements = check.requirements
              .map(
                (row) =>
                  `<tr><td>${e(row.year)} · ${e(metricLabels[row.metric])}</td><td>${{ available: '可采用', excluded: '本次排除', missing: '未取得', conflict: '数值或主体冲突', invalid: '口径或原始调整行未通过' }[row.state]}</td><td class="amount">${row.amount === null ? '—' : `${e(row.amount)} CNY`}</td><td>${refs(row.sourceRefs, true) || '—'}</td></tr>`
              )
              .join('');
            const conditions = check.conditions
              .map(
                (condition) =>
                  `<p class="request"><span>${{ met: '满足', 'not-met': '不满足', unknown: '未知' }[condition.status]}</span>${e(condition.label.zh)}</p>`
              )
              .join('');
            const blockers = check.blockers
              .map(
                (blocker) =>
                  `<p class="request"><span>阻断依据</span>${e(blocker.message.zh)}</p>${blocker.sourceRefs.length ? `<div class="references">${refs(blocker.sourceRefs, true)}</div>` : ''}`
              )
              .join('');
            return `<div class="item"><div class="item-heading"><h3>${e(check.title.zh)}</h3><span class="status">${{ triggered: '组合成立', 'not-triggered': '组合不成立', blocked: '未能核对' }[check.status]}</span></div>${conditions}${table('<th>所需输入</th><th>采用状态</th><th class="amount">金额</th><th>原件位置</th>', requirements)}${blockers}</div>`;
          })
          .join('')}`;
  const questions = report.questions
    .map(
      (question) =>
        `<div class="item"><div class="item-heading"><h3>${e(question.text)}</h3><span class="status">${question.status === 'done' ? '已处理' : '待处理'}</span></div><p class="muted">${e(question.reason)}</p><p class="request"><span>请求材料</span>${e(question.requestedEvidence)}</p>${question.trigger ? `<div class="references">触发事实：${e(question.trigger.year)} 年 ${e(metricLabels[question.trigger.metric])} ${e(question.trigger.amount)} CNY<br>${refs(question.trigger.sourceRefs, true)}</div>` : ''}</div>`
    )
    .join('');
  const purpose = task.purpose === 'handover' ? 'handover' : 'external';
  const contextLabels: Record<ContextNoteKey, string> = {
    'external.identity': '签约公司与收款主体',
    'external.promise': '交付性质、资金用途与履约条件',
    'external.latest': '年报之后的经营变化',
    'handover.cash': '接手日可用与受限资金',
    'handover.schedule': '近期收款与到期付款',
    'handover.controls': '应收、存货与交接责任',
  };
  const contextKeys = (Object.keys(contextLabels) as ContextNoteKey[]).filter(
    (key) => key.startsWith(`${purpose}.`) || task.contextNotes?.[key]
  );
  const context = `<p>${purpose === 'handover' ? '内部接手者 · 经营交接核查' : '外部普通人 · 交付资金与信任前核查'}</p><p class="muted">以下是用户记录的跟进状态与备注，未独立核实；勾选不代表企业可靠或问题已解决。此记录不作为模型分析输入。</p>${contextKeys
    .map((key) => {
      const record = task.contextNotes?.[key];
      return `<div class="item"><div class="item-heading"><h3>${e(contextLabels[key])}</h3><span class="status">${record?.done ? '跟进已标记完成' : '待跟进'}</span></div><p class="model-text">${record?.note ? e(record.note) : '未记录备注。'}</p></div>`;
    })
    .join('')}`;
  let cashPlan = '';
  if (task.cashPlan) {
    const calculation = calculateCashPlan(task.cashPlan);
    const amount = (value: string | null) => (value === null ? '未知' : e(value));
    cashPlan = section(
      '90 天收付款工作表',
      `<div class="meta"><span>用户输入情景 · 人民币元</span><span>测算日期 ${e(task.cashPlan.asOf)}</span></div><p>起始可用资金：${amount(calculation.openingCash)} CNY。三个区间互不重叠，逐期余额 = 上期余额 + 本区间预计流入 − 本区间预计流出。</p><p class="muted">这是用户假设下的测算，不是经营预测；年度经营现金流、历史年末余额未自动填入。留空按未知处理，未知输入传递至后续余额；预计收款仍需核查时间与可收回性。本表不发送模型。</p>${table(
        '<th>区间（天）</th><th class="amount">预计流入</th><th class="amount">预计流出</th><th class="amount">期末余额</th><th class="amount">情景缺口</th><th>输入状态</th>',
        calculation.periods
          .map(
            (period) =>
              `<tr><td>${period.startDay}–${period.endDay}</td><td class="amount">${amount(period.inflow)}</td><td class="amount">${amount(period.outflow)}</td><td class="amount">${amount(period.balance)}</td><td class="amount">${amount(period.gap)}</td><td>${period.status === 'known' ? '输入已填写，未认证' : '存在未知输入'}</td></tr>`
          )
          .join(''),
        'cash-plan'
      )}`
    );
  }
  const sources = report.snapshot
    .map(
      (material, index) =>
        `<div class="source" id="source-${index + 1}"><h3>来源 ${index + 1} · ${e(material.title)}</h3><div class="source-meta">${e(material.company)} · 披露日期 ${e(material.documentDate)}<br>${e(material.filename)}${material.sourceUrl ? ` · <a href="${e(material.sourceUrl)}">打开公开原始报告</a>` : ''}<div class="hash">SHA-256 ${e(material.sha256)}</div></div>${table('<th>采用状态</th><th>年度 / 指标</th><th class="amount">原始金额</th><th>口径</th><th>定位与摘录</th>', material.observations.map((obs) => `<tr><td>${task.excludedMetrics.includes(obs.key) ? '本次排除' : '已保存输入'}</td><td>${e(obs.year)}<br>${e(metricLabels[obs.key])}</td><td class="amount">${e(obs.value)}<span class="unit">${{ yuan: '元', wan: '万元', yi: '亿元', usd: '美元' }[obs.unit]}</span></td><td>${e(obs.currency)}<br>${{ consolidated: '合并报表', parent: '母公司报表', unknown: '口径未确认' }[obs.scope]}<br>${{ annual: '年度', interim: '半年度', quarterly: '季度', unknown: '期间未确认' }[obs.period ?? 'unknown']}</td><td>${obs.page === null ? '页码未提供' : `PDF 第 ${e(obs.page)} 页`}<div class="quote">${e(obs.quote)}</div>${obs.components?.length ? `<div class="quote">原始分组行：${obs.components.map((c) => `${e(c.label)} = ${e(c.value)}（${c.page === null ? '页码未提供' : `PDF 第 ${e(c.page)} 页`}）`).join('；')}</div>` : ''}</td></tr>`).join(''), 'observations')}<p class="source-meta">保存的输入不等于全部采用；实际采用以口径检查为准。被排除的指标未参与本次计算。</p></div>`
    )
    .join('');
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${e(task.title)} · 析光 Prispect</title><style>${style}</style></head><body><main class="document"><header><div class="identity"><span class="brand">析光 Prispect</span><span>核查底稿</span></div><h1>${e(headline)}</h1><div class="meta"><span>${e(report.company)}</span><span>${e(report.year)} 年度 · ${e(report.previousYear)} 比较年度</span><span>${e(verdict)}</span></div><p class="summary">${e(summary)}</p></header>${section('指标与计算', metrics)}${section('现金桥', bridge)}${section('口径检查', checks)}${section('组合规则评估记录', crossSignalChecks)}${crossSignals ? section('组合线索与下一项核查', crossSignals) : ''}${findings ? section('解释与依据', findings) : ''}${section('后续询证', questions || '<p class="muted">本次没有生成询证问题。</p>')}${section('场景核查与用户记录', context)}${cashPlan}${section('模型解释', `<div class="meta"><span>${e(modelStatus)}</span>${report.model.provider ? `<span>${e(report.model.provider)} · ${e(report.model.name)}</span>` : ''}</div><p class="muted">${e(modelDisclosure)}</p>${report.model.text ? `<p class="model-text">${e(report.model.text)}</p>` : report.model.error ? `<p>${e(report.model.error)}</p>` : ''}`)}${section('来源与输入快照', sources)}<div class="closing">${section('适用范围', `<div class="note"><ul>${report.limitations.map((l) => `<li>${e(l)}</li>`).join('')}<li>输入口径一致不等于原件真实性已核验。</li><li>原始报告保留发行人及披露平台权利。本底稿不代表财报的商用再分发授权。</li></ul></div>`)}<footer>任务 ${e(task.id)}<br>生成时间 ${e(task.updatedAt)} · 此文件保存导出时的输入、结果与问题状态。</footer></div></main></body></html>`;
}

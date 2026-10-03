import { productTerms } from '../shared/product-terms';
import type {
  AnalysisTask,
  EvidenceRef,
  Question,
  Report,
  ReviewPurpose,
} from '../shared/contracts';
import { reportCurrencyView } from '../shared/report-currency-view';
import { metricName, type Locale } from './format';
import { translateRule } from './ruleTranslations';

export interface RankedReviewQuestion {
  question: Question;
  priority: 'prerequisite' | 'follow-up' | 'recorded';
  orderReason: { zh: string; en: string };
  recipient: { zh: string; en: string };
}

// Saved amounts are in yuan. Match the server's accepted precision without
// rounding sub-cent values or passing large amounts through Number.
function savedAmountInFen(amount: string): bigint | null {
  if (!/^-?\d{1,20}(?:\.\d{1,10})?$/.test(amount)) return null;
  const [whole, fraction = ''] = amount.replace(/^-/, '').split('.');
  if (/[1-9]/.test(fraction.slice(2))) return null;
  const fen = BigInt(whole!) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
  return amount.startsWith('-') ? -fen : fen;
}

function magnitudeInYuan(fen: bigint): string {
  const absolute = fen < 0n ? -fen : fen;
  return `${(absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function isPrerequisite(question: Question): boolean {
  return question.id === 'supplement' || question.id.startsWith('supplement-');
}

function suggestedRecipient(
  question: Question,
  purpose: ReviewPurpose
): { zh: string; en: string } {
  const metric = question.trigger?.metric;
  const collections = question.id === 'collections' || metric === 'receivablesAdjustment';
  const inventory = question.id === 'inventory' || metric === 'inventoryAdjustment';
  const roles = collections
    ? { zh: '财务或客户结算负责人', en: 'finance or customer-settlement lead' }
    : inventory
      ? { zh: '订单或库存负责人', en: 'order or inventory lead' }
      : { zh: '财务负责人', en: 'finance lead' };
  const scopeNote = inventory
    ? { zh: '财务另行核对口径；', en: 'Finance should separately check the scope; ' }
    : { zh: '', en: '' };
  return purpose === 'handover'
    ? {
        zh: `建议与${roles.zh}交接；${scopeNote.zh}具体联系人待确认。`,
        en: `Suggested handover contact: ${roles.en}. ${scopeNote.en}Confirm the actual contact.`,
      }
    : {
        zh: `建议向对方${roles.zh}索取材料；${scopeNote.zh}具体联系人待确认。`,
        en: `Suggested material request: the counterparty's ${roles.en}. ${scopeNote.en}Confirm the actual contact.`,
      };
}

export function rankReviewQuestions(
  report: Report,
  purpose: ReviewPurpose = 'external'
): RankedReviewQuestion[] {
  const currencyView = reportCurrencyView(report);
  return currencyView.report.questions
    .map((question, index) => {
      const fen = question.trigger ? savedAmountInFen(question.trigger.amount) : null;
      const priority: RankedReviewQuestion['priority'] =
        question.status === 'done'
          ? 'recorded'
          : isPrerequisite(question)
            ? 'prerequisite'
            : 'follow-up';
      const group =
        priority === 'recorded' ? 3 : priority === 'prerequisite' ? 0 : fen !== null ? 1 : 2;
      const orderReason =
        priority === 'recorded'
          ? {
              zh: '已记录跟进完成，置于待办之后；这不表示风险已解除或经营解释已验证。',
              en: 'Follow-up is recorded as done and follows open items. This does not establish that a risk is resolved or an explanation is verified.',
            }
          : priority === 'prerequisite'
            ? {
                zh: '先补齐阻断核查的材料或口径；金额大小不改变这一优先级。',
                en: 'Resolve the evidence or scope prerequisite first. Amount size does not change this priority.',
              }
            : currencyView.bridgeBlocked && !question.trigger
              ? {
                  zh: '币种或金额单位待核对，受影响的历史触发金额不用于排序；保留询证问题与原顺序。',
                  en: 'Currency or amount units need review. Affected historical triggering amounts are not used for ordering; the questions and their relative order are retained.',
                }
              : question.trigger && fen !== null
                ? {
                    zh: `${question.trigger.year} 年${metricName(question.trigger.metric, 'zh-Hans')}的历史现金影响绝对额为 ${magnitudeInYuan(fen)} 元，仅用于安排询证先后，不是风险评级。`,
                    en: `The ${question.trigger.year} historical cash-effect magnitude for ${metricName(question.trigger.metric, 'en')} is CNY ${magnitudeInYuan(fen)}. It orders follow-up only; it is not a risk rating.`,
                  }
                : question.trigger
                  ? {
                      zh: '已保存的触发金额不符合精确人民币分格式，未用于金额排序；保留原值与原顺序供核对。',
                      en: 'The saved triggering amount is not a valid exact CNY-cent value. It was not used for amount ordering; its original value and relative order are retained for review.',
                    }
                  : {
                      zh: '没有已保存的触发金额，保留原有询证顺序；不从指标补算。',
                      en: 'No triggering amount was saved. The original follow-up order is retained; no amount is reconstructed from metrics.',
                    };
      return {
        question,
        priority,
        orderReason,
        recipient: suggestedRecipient(question, purpose),
        index,
        group,
        magnitude: fen === null ? null : fen < 0n ? -fen : fen,
      };
    })
    .sort((a, b) => {
      if (a.group !== b.group) return a.group - b.group;
      if (a.group === 1 && a.magnitude !== b.magnitude) return a.magnitude! > b.magnitude! ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ question, priority, orderReason, recipient }) => ({
      question,
      priority,
      orderReason,
      recipient,
    }));
}

function escapeMarkdown(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/([`*_{}\[\]<>#+!|])/g, '\\$1');
}

function literal(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

function savedText(text: string, locale: Locale): string {
  if (locale !== 'en') return escapeMarkdown(text);
  const translated = translateRule(text);
  return translated === text && /[\u3400-\u9fff]/.test(text)
    ? `Original text (kept as supplied):\n\n${literal(text)}`
    : escapeMarkdown(translated);
}

function references(refs: EvidenceRef[], report: Report, locale: Locale): string {
  const t = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const distinct = refs.filter(
    (ref, index) =>
      refs.findIndex(
        (other) =>
          other.materialId === ref.materialId &&
          other.page === ref.page &&
          other.quote === ref.quote &&
          other.sourceUrl === ref.sourceUrl
      ) === index
  );
  if (!distinct.length)
    return t(
      '未保存原文引用；没有补造来源。',
      'No source excerpt was saved; no source was invented.'
    );
  return distinct
    .map((ref, index) => {
      const material = report.snapshot.find((item) => item.id === ref.materialId);
      const sourceUrl = ref.sourceUrl || material?.sourceUrl;
      return [
        `**${t('引用', 'Reference')} ${index + 1}**`,
        `${t('材料标识', 'Material ID')}: ${escapeMarkdown(ref.materialId)}`,
        ...(material
          ? [`${t('材料标题', 'Document title')}: ${escapeMarkdown(material.title)}`]
          : []),
        `${t('来源页码', 'Source page')}: ${ref.page === null ? t('未提供', 'not supplied') : ref.page}`,
        `${t('来源 URL', 'Source URL')}:`,
        sourceUrl ? literal(sourceUrl) : t('未提供', 'not supplied'),
        ...(material?.sha256 ? [`SHA-256: ${escapeMarkdown(material.sha256)}`] : []),
        `${t('原文（按保存内容保留）', 'Original excerpt (kept as supplied, not translated)')}:`,
        literal(ref.quote),
      ].join('\n\n');
    })
    .join('\n\n');
}

function questionRefs(question: Question, report: Report): EvidenceRef[] {
  return [
    ...(question.trigger?.sourceRefs || []),
    ...report.findings
      .filter((finding) => finding.questionIds.includes(question.id))
      .flatMap((finding) => finding.sourceRefs),
    ...(isPrerequisite(question)
      ? report.checks
          .filter((check) => check.status !== 'pass')
          .flatMap((check) => check.sourceRefs)
      : []),
  ];
}

export function buildReviewChecklist(task: AnalysisTask, locale: Locale): string {
  const t = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const purpose = task.purpose === 'handover' ? 'handover' : 'external';
  const currencyView = task.report ? reportCurrencyView(task.report) : undefined;
  const report = currencyView?.report;
  const purposeLabel =
    purpose === 'handover'
      ? t(
          '内部接手：核查财务交接与付款安排',
          'Internal handover: verify financial records and payment arrangements'
        )
      : t(
          '外部核查：付款或交付信任前索取依据',
          'External review: request evidence before payment or a trust commitment'
        );
  const lines = [
    `# ${t('析光 · 询证清单', 'Prispect · Review checklist')}`,
    `${t(...productTerms.reviewReport)}: ${escapeMarkdown(task.title)}`,
    `${t('公司', 'Company')}: ${escapeMarkdown(report?.company || task.company)}`,
    `${t('用途', 'Purpose')}: ${purposeLabel}`,
    ...(!task.purpose
      ? [
          t(
            '用途未保存；此导出按外部核查安排联系建议。',
            'No purpose was saved; this export uses external-review contact suggestions.'
          ),
        ]
      : []),
    `${t('历史年度', 'Historical year')}: ${report?.year ?? task.year}${report ? ` · ${t('比较年度', 'Comparison year')}: ${report.previousYear}` : ''}`,
    `${t('保存更新时间', 'Saved update time')}: ${escapeMarkdown(task.updatedAt)}`,
    `## ${t('使用边界', 'Scope and limits')}`,
    t(
      '顺序先处理材料或口径阻断，再按已保存历史现金影响的绝对额安排询证，使用整数分。金额只解释跟进顺序，不是风险、信用或公司好坏评级。',
      'Evidence or scope prerequisites come first, followed by saved historical cash-effect magnitudes calculated in integer cents. Amounts explain follow-up order only, not risk, credit, or company quality.'
    ),
    t(
      '这是已保存报告的历史记录，不自动更新、重算或补全旧指标。历史年报不能单独证明当前付款能力、承诺安全或经营原因。缺件与核心冲突保留为未知；需补齐并重新核查。',
      'This is a historical record of the saved report. It is not updated, recomputed, or filled from older metrics. Historical annual reports alone do not establish current payment capacity, commitment safety, or operating causes. Missing evidence and core conflicts remain unknown pending a new review.'
    ),
    t(
      '“跟进完成”只表示清单状态已记录，不表示风险已解除、解释已验证或对方已实际提供材料。联系角色是建议，需另行确认具体人员。',
      '“Follow-up recorded as done” is a checklist state. It does not establish risk resolution, verified explanations, or actual delivery of materials. Contact roles are suggestions; confirm the actual people.'
    ),
  ];
  if (!report) {
    lines.push(
      `## ${t('报告状态', 'Report status')}`,
      t(
        '此财报核查尚无已保存核查报告，未生成询证清单。',
        'This financial review has no saved review report; no review questions were generated.'
      )
    );
    return `${lines.join('\n\n')}\n`;
  }

  if (currencyView?.issues.length) {
    lines.push(
      `## ${t('币种与单位核对', 'Currency and amount-unit review')}`,
      t(
        '相关历史计算与触发金额暂停采用，原记录与来源保留。以下保存金额未转换为人民币；历史询证问题保留，需先核对触发依据。',
        'Dependent historical calculations and triggering amounts are withheld; original records and sources remain. The saved amounts below have not been converted to CNY. Historical questions are retained pending review of their triggering evidence.'
      )
    );
    for (const issue of currencyView.issues)
      lines.push(
        `**${issue.year} · ${metricName(issue.key, locale)}**`,
        `${t('保存金额（未转换）', 'Saved amount (not converted)')}:`,
        literal(issue.value),
        `${t('单位 / 币种', 'Unit / currency')}: ${escapeMarkdown(issue.unit)} / ${escapeMarkdown(issue.currency || t('未确认', 'unconfirmed'))}`,
        references(issue.sourceRefs, report, locale)
      );
  }

  const verdicts = {
    supported: t(
      '历史金额核对通过；经营原因与当前决策仍待单独核查。',
      'Historical amounts reconciled; operating causes and the current decision need separate verification.'
    ),
    attention: t(
      '存在需后续询证的历史金额关系；原因未确定。',
      'Historical amount relationships need follow-up; their causes are undetermined.'
    ),
    insufficient: t(
      '材料不足；依赖缺件的解释保持未知。',
      'Evidence is insufficient; explanations dependent on missing records remain unknown.'
    ),
    conflict: t(
      '存在核心口径或金额冲突；依赖冲突的解释保持未知。',
      'Core scope or amount conflicts exist; dependent explanations remain unknown.'
    ),
  };
  lines.push(
    `## ${currencyView?.issues.length ? t('当前展示核查状态', 'Displayed review state') : t('已保存核查状态', 'Saved review state')}`,
    verdicts[report.verdict]
  );
  for (const check of report.checks.filter((item) => item.status !== 'pass')) {
    lines.push(
      `**${t('核查项目', 'Check')}**: ${check.status === 'fail' ? t('未通过', 'failed') : t('待核对', 'needs review')}`,
      savedText(check.label, locale),
      savedText(check.message, locale),
      references(check.sourceRefs, report, locale)
    );
  }
  if (report.crossSignalChecks === undefined) {
    lines.push(
      t(
        '此旧报告未保存组合线索核查状态；没有在导出时补算。',
        'This older report has no saved combination-check state; none was reconstructed during export.'
      )
    );
  } else {
    for (const check of report.crossSignalChecks.filter((item) => item.status === 'blocked')) {
      lines.push(
        `**${escapeMarkdown(locale === 'en' ? check.title.en : check.title.zh)}** · ${t('证据阻断，状态未知', 'evidence blocked; unknown')}`
      );
      for (const blocker of check.blockers)
        lines.push(
          escapeMarkdown(locale === 'en' ? blocker.message.en : blocker.message.zh),
          references(blocker.sourceRefs, report, locale)
        );
    }
  }
  for (const limitation of report.limitations) lines.push(savedText(limitation, locale));

  lines.push(`## ${t('询证顺序', 'Follow-up order')}`);
  const ranked = rankReviewQuestions(report, purpose);
  if (!ranked.length)
    lines.push(
      t(
        '此报告未保存询证问题；这不表示没有风险或无需核查。',
        'No follow-up questions were saved. This does not establish that there are no risks or no further checks.'
      )
    );
  ranked.forEach(({ question, priority, orderReason, recipient }, index) => {
    const priorityLabel = {
      prerequisite: t('先补材料 / 口径', 'Evidence / scope prerequisite'),
      'follow-up': t('待询证', 'Follow-up'),
      recorded: t('已记录完成', 'Recorded as done'),
    }[priority];
    lines.push(
      `### ${index + 1}. ${priorityLabel} · ${escapeMarkdown(question.id)}`,
      savedText(question.text, locale),
      `**${t('状态', 'Status')}**: ${question.status === 'done' ? t('已记录跟进完成', 'Follow-up recorded as done') : t('待跟进', 'Open')}`,
      `**${t('排序理由', 'Order reason')}**: ${escapeMarkdown(locale === 'en' ? orderReason.en : orderReason.zh)}`,
      `**${t('建议联系', 'Suggested contact')}**: ${escapeMarkdown(locale === 'en' ? recipient.en : recipient.zh)}`,
      `**${t('核查原因', 'Reason for inquiry')}**:`,
      savedText(question.reason, locale),
      `**${t('所需材料', 'Requested materials')}**:`,
      savedText(question.requestedEvidence, locale)
    );
    if (question.trigger) {
      lines.push(
        `**${t('已保存触发事实', 'Saved triggering fact')}**: ${question.trigger.year} · ${metricName(question.trigger.metric, locale)} · CNY`,
        literal(question.trigger.amount)
      );
      if (savedAmountInFen(question.trigger.amount) === null)
        lines.push(
          t(
            '金额格式待核，以上原值未用于排序。',
            'Amount format needs review; the original value above was not used for ordering.'
          )
        );
    } else {
      lines.push(
        t(
          '未保存触发金额；没有从报告指标补算。',
          'No triggering amount was saved; none was reconstructed from report metrics.'
        )
      );
    }
    lines.push(
      `**${t('原文依据', 'Source evidence')}**:`,
      references(questionRefs(question, report), report, locale)
    );
  });
  return `${lines.join('\n\n')}\n`;
}

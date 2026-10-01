import { useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

import { post } from '../api';

import { useApp, adjustments } from '../context';
import { PageHeading } from '../components';

export function MethodPage() {
  const { t, workspace, user, confirm, navigate } = useApp();
  useEffect(() => {
    if (new URLSearchParams(location.hash.split('?')[1]).get('section') === 'privacy') {
      document.getElementById('method-privacy')?.scrollIntoView({ block: 'start' });
    }
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="CLEAR METHODS. HONEST LIMITS."
        title={t('照见如何核查', 'How CashLens reviews evidence')}
        description={t(
          '会计计算保持确定，解释保持开放。这里说清楚系统做了什么，以及结论能到哪里。',
          'Calculations stay deterministic. Explanations stay open. Understand what the system does and where its conclusions stop.'
        )}
      />
      <div className="method-layout">
        <nav className="method-nav" aria-label={t('方法目录', 'Method contents')}>
          {[
            ['method-scope', t('01 核查范围', '01 Review scope')],
            ['method-math', t('02 计算与现金桥', '02 Calculations')],
            ['method-evidence', t('03 证据与冲突', '03 Evidence & conflicts')],
            ['method-ai', t('04 规则与模型', '04 Rules & models')],
            ['method-demo', t('05 演示工作区', '05 Demo workspace')],
            ['method-privacy', t('06 数据与隐私', '06 Data & privacy')],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {label}
              <ChevronRight size={14} />
            </a>
          ))}
        </nav>
        <div className="method-content">
          <section id="method-scope">
            <div className="eyebrow">01 / THE SCOPE</div>
            <h2>
              {t(
                '固定的问题：利润是否兑现为经营现金？',
                'A fixed question: does profit translate into operating cash?'
              )}
            </h2>
            <p>
              {t(
                '照见面向合作前的财务线索核查。核查名称只是底稿标签，系统不接受任意自然语言问题并宣称已完成核查。当前支持年度合并人民币口径、两年比较，以及现金流量补充表中的调整项目。',
                'CashLens supports pre-partnership financial evidence review. Review titles are working-paper labels, not arbitrary natural-language analysis requests. The current scope is annual consolidated CNY statements, two-year comparisons, and cash-flow supplementary adjustments.'
              )}
            </p>
            <div className="method-callout">
              <ShieldCheck size={23} />
              <p>
                {t(
                  '不输出信用总分，不预测违约，不裁定一家企业是否「靠谱」。公开材料只能支持特定事实，不能替代完整商业尽调。',
                  'No composite credit score, default prediction, or company reliability verdict. Public evidence supports specific observations; it does not replace full commercial due diligence.'
                )}
              </p>
            </div>
            <p>
              {t(
                '两份示例来源于松原安全与海康威视 2025 年公开年度报告。行业不同，仅展示同一方法如何处理不同现金结构；不会将其排名。2025 年披露不代表今日经营状态。',
                'The examples use 2025 public annual reports from Songyuan Safety and Hikvision. They operate in different industries, so the examples show different cash structures under the same method without ranking them. A historical report is not today’s operating condition.'
              )}
            </p>
          </section>
          <section id="method-math">
            <div className="eyebrow">02 / DETERMINISTIC CALCULATIONS</div>
            <h2>{t('按分计算，按原表闭合。', 'Calculate in cents. Reconcile to the source.')}</h2>
            <div className="formula-box">
              <span>{t('现金转化比例', 'Cash conversion')}</span>
              <strong>
                {t(
                  '经营现金净额 ÷ 合并净利润 × 100%',
                  'Operating cash flow ÷ consolidated net profit × 100%'
                )}
              </strong>
              <small>
                {t(
                  '净利润为零或负值时，不产生通常比例解读。',
                  'Conventional ratio interpretation is withheld when profit is zero or negative.'
                )}
              </small>
            </div>
            <div className="formula-box">
              <span>{t('现金桥', 'Cash bridge')}</span>
              <strong>
                {t(
                  '净利润 + 存货调整 + 经营性应收调整 + 经营性应付调整 + 其余已披露调整 = 经营现金净额',
                  'Net profit + inventory + operating receivables + operating payables + other disclosed adjustments = operating cash flow'
                )}
              </strong>
              <small>
                {t(
                  '「其余调整」必须有全部原始分组行，另验原表求和与差额；不把残差当来源。',
                  '“Other adjustments” requires its original component rows. Both the row sum and the bridge are checked; a residual is not source evidence.'
                )}
              </small>
            </div>
            <p>
              {t(
                '金额以十进制字符串输入，服务端换算为整数分。缺失保留为缺失，不补零。若前一年基数非正，只看两年金额变化，不产生普通增长率。',
                'Amounts enter as decimal strings and are converted to integer cents on the server. Missing stays missing, never zero. With a non-positive prior-year base, compare amounts without conventional growth percentages.'
              )}
            </p>
          </section>
          <section id="method-evidence">
            <div className="eyebrow">03 / PROVENANCE AND COUNTERFACTUALS</div>
            <h2>
              {t(
                '输入一致，不等于原件已经真实核验。',
                'Consistent input is not authenticated evidence.'
              )}
            </h2>
            <p>
              {t(
                '系统验证你提供的主体、期间、单位、币种和范围是否相容。公开示例另有原件来源、页码与 SHA256；用户导入材料仍需人工核对原件。冲突值双方保留并停止采用，不静默覆盖。',
                'The system checks compatibility of supplied company, period, unit, currency, and scope. Public examples separately retain source URLs, pages, and SHA256. Imported evidence still needs human source verification. Conflicting values are retained and not silently overwritten.'
              )}
            </p>
            <p>
              {t(
                '负向应收调整可以对应扩张、结算结构变化，也可以对应回款压力。负向存货调整可以来自备货，也可以涉及去化压力。公开表格不能单独在两种解释中裁定一种，因此问题单请求账龄、票据、期后回款、订单与出库记录。',
                'Negative receivables adjustments may reflect expansion, settlement changes, or collection pressure. Negative inventory adjustments may reflect stock-building or sell-through pressure. A public table cannot decide between these explanations, so follow-up requests cover aging, bills, subsequent collections, orders, and dispatch records.'
              )}
            </p>
            <div className="method-callout amber-callout">
              <SlidersHorizontal size={23} />
              <p>
                {t(
                  '压力测试改变本次提供的观测，并创建新任务。去掉附注时，现金桥与原因解释必须撤回；补回完整输入后，再真实重算。它不表示公司缺少披露。',
                  'Stress tests change supplied observations and create a new task. Removing notes withholds the bridge and causal explanations. Restoring the input triggers a genuine rerun. It does not imply the issuer omitted disclosures.'
                )}
              </p>
            </div>
          </section>
          <section id="method-ai">
            <div className="eyebrow">04 / RULES AND OPTIONAL EXPLANATION</div>
            <h2>
              {t('计算交给规则，模型只做可选解释。', 'Rules calculate. A model may explain.')}
            </h2>
            <p>
              {t(
                '解析、口径检查、金额、现金桥、引用定位与问题选择由确定性逻辑完成。网站模型 API 与聊天额度不同。未配置时不调用模型，明确显示规则分析；当前状态如下。',
                'Parsing, scope checks, amounts, bridge reconciliation, citation location, and question selection use deterministic logic. A website model API is separate from chat usage. Without configuration, no model is called and reports clearly identify rules-based analysis.'
              )}
            </p>
            <div className="method-provider">
              <Activity size={22} />
              <div>
                <strong>
                  {!workspace
                    ? t('登录后查看可用模式', 'Log in to view available modes')
                    : workspace.provider.configured
                      ? t('可选模型接口已配置', 'Optional model API configured')
                      : t('确定性规则模式', 'Deterministic rules mode')}
                </strong>
                <span>
                  {!workspace
                    ? t(
                        '核心规则核查可独立运行。是否启用模型，以每份任务的主动选择与实际记录为准。',
                        'Core rules-based review runs independently. Model use depends on each task’s explicit choice and actual record.'
                      )
                    : workspace.provider.configured
                      ? t(
                          '具体成功 / 失败状态，以每份报告的实际记录为准。',
                          'Success or failure is recorded separately in each report.'
                        )
                      : t(
                          '未配置模型 API；无需模型也可完整核查与导出。',
                          'No model API configured. Reviews and exports work independently.'
                        )}
                </span>
              </div>
            </div>
            <p>
              {t(
                '配置可选模型时，只发送本次结构化证据，并检查引用 ID、格式和允许金额，解释含义仍需人工复核。调用失败保留规则报告。模型文字不是新来源，不会把资料里的指令当系统命令执行。',
                'When configured, the optional model receives only structured evidence from this review. Citation IDs, format, and permitted amounts are checked; explanation meanings still need human review. Failures preserve the rules report. Model text is not a new source, and instructions embedded in evidence are not executed.'
              )}
            </p>
          </section>
          <section id="method-demo">
            <div className="eyebrow">05 / DEMO WORKSPACE</div>
            <h2>{t('有意暴露边界，才值得信任。', 'Make the limits inspectable.')}</h2>
            <p>
              {t(
                '四个案例包含完整现金反差、另一种现金结构、人为材料不足与人为母公司口径冲突。它们不是信用评级样本。重置仅删除当前演示工作区里的任务与导入记录，并恢复示例。',
                'Four cases include a complete cash contrast, another cash structure, deliberately missing evidence, and a deliberate parent-company scope conflict. They are not credit-rating samples. Reset removes this workspace’s reviews and imports and restores the examples.'
              )}
            </p>
            <div className="inline-actions">
              <button className="button button-primary" onClick={() => navigate('/new')}>
                {t('开始一份核查', 'Start a review')}
                <ArrowRight size={16} />
              </button>
              {user && (
                <button
                  className="button button-secondary"
                  onClick={() =>
                    confirm({
                      title: t('重置当前工作区？', 'Reset this workspace?'),
                      text: t(
                        '当前账号的所有核查、问题状态和导入材料将删除，示例材料重新建立。此操作不可撤销，不影响其他账号。请先导出需要保留的报告。',
                        'All reviews, follow-up statuses, and imports in your account will be removed and example materials restored. This cannot be undone and does not affect other accounts. Export anything you need first.'
                      ),
                      action: async () => {
                        await post('/reset', { confirm: 'RESET_DEMO' });
                        navigate('/workspace');
                      },
                    })
                  }
                >
                  <RotateCcw size={16} />
                  {t('重置演示工作区', 'Reset demo workspace')}
                </button>
              )}
            </div>
          </section>
          <section id="method-privacy">
            <div className="eyebrow">06 / YOUR DATA AND ITS FLOW</div>
            <h2>{t('数据与隐私', 'Data and privacy')}</h2>
            <p>
              {t(
                '你的登录邮箱、名字、密码哈希和会话摘要保存在本网站服务器。账号用于保存你的个人工作区；邮箱是登录标识，目前没有邮件找回服务。',
                'Your login email, name, password hash, and session digest are stored on this website’s server. Your account keeps a personal workspace; email is your login identifier, and email-based recovery is not available.'
              )}
            </p>
            <p>
              {t(
                '确认保存的材料、原始上传文件、核查任务与问题跟进记录会保留，直到你删除相应记录或重置自己的工作区。未确认的上传预览在 24 小时后过期，网站会在后续访问或上传时清理；这不是定时准点删除。',
                'Confirmed materials, original uploaded files, reviews, and follow-up records are retained until you delete the corresponding records or reset your workspace. Unconfirmed preview uploads expire after 24 hours and are cleaned up during subsequent access or uploads, rather than at a guaranteed scheduled time.'
              )}
            </p>
            <p>
              {t(
                '材料与报告下载仅向所属账号开放。网站没有公开分享功能，不会为你的工作区生成公开访问链接。',
                'Material and report downloads are available only to the account that owns them. This website has no public-sharing feature and does not generate public workspace links.'
              )}
            </p>
            <div className="method-callout">
              <ShieldCheck size={23} />
              <p>
                {t(
                  '只有你在每次新建任务时主动勾选可选智能解释，本次已采纳的财务指标与短摘录才会发送到第三方 TokenFlux 模型服务。未勾选时不外发材料；规则模式可以完成核心核查、比较、问题跟进与导出。',
                  'Only when you explicitly enable optional model explanation for a new task are its adopted financial observations and short excerpts sent to the third-party TokenFlux model service. Without that choice, evidence is not sent to the model. Rules mode supports core review, comparison, follow-up, and export.'
                )}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

import { useEffect } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';

import { useApp } from '../context';
import { DocumentLayout } from '../DocumentLayout';
import '../review-pages.css';

export function MethodPage({ section }: { section?: string | null }) {
  const { t, user, navigate } = useApp();
  useEffect(() => {
    document.title = `${t('方法与数据', 'Method and data')} · ${t('析光', 'Prispect')}`;
  }, [t]);

  return (
    <DocumentLayout
      path="/method"
      section={section}
      headings={[
        { id: 'method-scope', section: 'scope', label: t('核查范围', 'Scope') },
        { id: 'method-decision', section: 'decision', label: t('付款事项', 'Payment matters') },
        { id: 'method-math', section: 'math', label: t('计算公式', 'Calculations') },
        { id: 'method-evidence', section: 'evidence', label: t('来源与冲突', 'Sources') },
        { id: 'method-ai', section: 'ai', label: t('检索与 AI', 'Research and AI') },
        { id: 'method-demo', section: 'demo', label: t('数据管理', 'Data management') },
        { id: 'method-privacy', section: 'privacy', label: t('数据与隐私', 'Data and privacy') },
      ]}
    >
      <header className="document-heading">
        <div className="document-breadcrumb">
          <a href="/">{t('析光', 'Prispect')}</a>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{t('方法', 'Method')}</span>
        </div>
        <h1>{t('方法与数据', 'Method and data')}</h1>
        <p className="document-description">
          {t('计算口径、材料要求与数据使用。', 'Calculations, source requirements, and data use.')}
        </p>
      </header>
      <div className="method-content">
        <section id="method-scope">
          <h2>{t('核查范围', 'Review scope')}</h2>
          <p>
            {t(
              '查找公开公司披露，核对历史财务结构；付款事项按所供条件与收付记录测算。',
              'Find public disclosures and review historical finances. Payment matters use the terms and cash records you supply.'
            )}
          </p>
          <details>
            <summary>{t('财报口径', 'Financial statement scope')}</summary>
            <p>
              {t(
                '核查名称用于区分任务，不是任意自然语言问题的分析指令。系统支持年度合并数据、可比两年金额及现金流补充表的调整项；归母或母公司利润不能代替合并净利润。',
                'Review names identify working papers, not arbitrary natural-language analysis requests. Reviews support annual consolidated data, comparable two-year amounts, and cash-flow supplementary adjustments. Profit attributable to the parent and parent-only profit cannot replace consolidated net profit.'
              )}
            </p>
            <p>
              {t(
                '财务年度与披露日期分别保留。2025 年年度报告通常于 2026 年披露；年度金额不代表今日经营状态。不同公司并列展示时，不作健康排名。',
                'The financial year and publication date are retained separately. A 2025 annual report is normally published in 2026; historical amounts do not establish current conditions. Side-by-side companies are not health rankings.'
              )}
            </p>
            <p>
              {t(
                '结果不构成信用评级、违约预测或投资、授信、合作决策，不能替代完整商业尽调。',
                'Results are not credit ratings, default predictions, or investment, lending, or partnership decisions. They do not replace full commercial due diligence.'
              )}
            </p>
          </details>
        </section>
        <section id="method-decision">
          <h2>{t('付款事项', 'Payment matters')}</h2>
          <p>
            {t(
              '外部核对自己拟交出去的钱；内部核对接手企业的一笔新增付款。主体、材料与金额未知时仍可保存，计算保留未知。',
              'External decisions review money you propose to pay; internal decisions review a new company payment. Save incomplete inputs while keeping missing entities, evidence and amounts unknown.'
            )}
          </p>
          <details>
            <summary>
              {t('条件计算、材料依赖与版本', 'Conditional calculations, evidence and versions')}
            </summary>
            <p>
              {t(
                '外部情景按已付金额加本次拟付款，减明确交付对应金额与实际退款，计算本次付款后的未交付敞口。退款承诺不算已退款；自设上限只表达个人约束，不判断公司信用。未提供金额不按零处理，未知上限不作超限判断。',
                'External scenarios calculate undelivered exposure after this proposed payment from payments, specified delivered value and actual refunds. A refund promise is not a received refund. A user limit is a personal constraint, not a company credit rating. Missing amounts are not zero; an unknown limit does not produce a limit verdict.'
              )}
            </p>
            <p>
              {t(
                '内部按具体事件日期累计所列收付款，分别显示期末与事件节点余额。相对现金底线的缺口不等于余额为负。同日顺序未确认时显示先付款的保守边界；改期仅假设可协商且其余已列条件不变，不证明交付或回款不受影响。',
                'Internal scenarios accumulate listed cash events by date, distinguishing period ends from event balances. A gap below the user cash floor is not necessarily a negative balance. Unconfirmed same-day order has a disclosed outflows-first bound. A date alternative assumes negotiation is possible and other listed conditions stay fixed; it does not prove delivery or receipts are unaffected.'
              )}
            </p>
            <p>
              {t(
                '假设计算与所关联记录字段下的计算分别展示。材料文本定位只表示匹配到服务器保存的文本；转录、对方陈述、假设与独立鉴真分开。撤回直接依据会暂停依赖它的记录计算，独立假设和无关财务事实仍保留。',
                'Assumption calculations and calculations under linked record fields are shown separately. Text location means a match in server-saved material text. Transcription, statements and assumptions do not establish independent authentication. Withdrawing direct evidence withholds its dependent record calculation while retaining independent assumptions and unrelated financial facts.'
              )}
            </p>
            <p>
              {t(
                '每次输入或证据变更保存新版本，旧版本只读。恢复旧输入会新建版本并重新计算，不抹去已知未解冲突。',
                'Every input or evidence change creates a version; historical inputs are read-only. Restoring them creates and recalculates a new version while preserving known unresolved conflicts.'
              )}
            </p>
          </details>
        </section>
        <section id="method-math">
          <h2>{t('计算公式', 'Calculations')}</h2>
          <p>
            {t(
              '现金利润比 = 经营现金净额 ÷ 合并净利润 × 100%，不是销售回款率。',
              'Cash-to-profit ratio = operating cash flow ÷ consolidated net profit × 100%; it is not a sales collection rate.'
            )}
          </p>
          <details>
            <summary>{t('现金桥与计算条件', 'Cash bridge and calculation conditions')}</summary>
            <div className="formula-box">
              <span>{t('现金桥', 'Cash bridge')}</span>
              <strong>
                {t(
                  '合并净利润 + 存货调整 + 经营性应收调整 + 经营性应付调整 + 其余已披露调整 = 经营现金净额',
                  'Consolidated net profit + inventory adjustments + operating receivables adjustments + operating payables adjustments + other disclosed adjustments = operating cash flow'
                )}
              </strong>
              <small>
                {t(
                  '其余调整需提供全部原始分组行，独立求和再核对差额；残差不能代替来源。',
                  'Other adjustments require all original component rows, independently summed and checked against the difference. A residual cannot replace source evidence.'
                )}
              </small>
            </div>
            <p>
              {t(
                '金额按原表单位转换为整数分，缺失不填零。净利润为零或负值时不作通常比例解读；同比基数非正时仅比较金额，不输出常规增长率。',
                'Amounts are converted from their source units to integer cents. Missing values are not filled with zero. Conventional ratio interpretation is withheld for non-positive profit; with a non-positive prior-year base, only amounts are compared.'
              )}
            </p>
            <p>
              {t(
                '经营现金是经营流入与流出的净额，不是银行余额或销售收款额。现金桥调整不等于对应资产负债项目的单一余额变动；负向应收或存货调整不能直接证明坏账或滞销。',
                'Operating cash flow is the net of operating inflows and outflows, not a bank balance or sales receipts. Bridge adjustments are not simple changes in individual balance-sheet accounts. Negative receivables or inventory adjustments do not directly prove bad debts or unsold stock.'
              )}
            </p>
          </details>
        </section>
        <section id="method-evidence">
          <h2>{t('来源与冲突', 'Sources and conflicts')}</h2>
          <p>
            {t(
              '输入口径一致，不等于原件真实性已核验。',
              'Consistent input does not authenticate the original source.'
            )}
          </p>
          <details>
            <summary>{t('来源核对与证据变更', 'Source checks and evidence changes')}</summary>
            <p>
              {t(
                '系统检查公司、期间、单位、币种、报表范围与数值冲突。公开示例保留来源、页码和 SHA-256；导入材料仍需人工核对原件。文件哈希标识文件内容，不证明发布者身份或内容真实。冲突来源保留，相关数据暂停采用。',
                'Checks cover company, period, units, currency, statement scope, and conflicting values. Public examples retain source references, pages, and SHA-256. Imports still need human verification against originals. A file hash identifies its content, not its publisher or truth. Conflicting sources are retained and the affected values are not adopted.'
              )}
            </p>
            <p>
              {t(
                '应收调整可能涉及业务扩张、结算变化或回款压力；存货调整可能涉及备货或去化压力。经营原因需要账龄、票据、期后回款、订单及出库记录继续核对；管理层说明与独立验证分开记录。',
                'Receivables adjustments may reflect expansion, settlement changes, or collection pressure; inventory adjustments may reflect stock-building or sell-through pressure. Aging, bills, subsequent collections, orders, and dispatch records are needed to investigate causes. Management statements are recorded separately from independent verification.'
              )}
            </p>
            <p>
              {t(
                '调整证据会另建任务，保留原报告与原件。不采用的指标不参与本次计算或模型解释；缺少必要调整资料时不生成现金桥与相关归因。恢复输入后重新核查，不代表已取得新外部资料，也不表示公司未披露。',
                'Editing evidence creates a new review and retains the original report and files. Excluded observations are not used in its calculations or model explanation. Missing required adjustment evidence withholds the bridge and related attributions. Restoring input reruns the review; it does not mean new external documents were obtained or that the issuer omitted disclosures.'
              )}
            </p>
          </details>
        </section>
        <section id="method-ai">
          <h2>{t('检索与 AI', 'Research and AI')}</h2>
          <p>
            {t(
              'AI 协助查找相关材料与整理解释；金额和口径按原文核对。',
              'AI helps find relevant documents and organize explanations. Amounts and reporting scope are checked against the source.'
            )}
          </p>
          <details>
            <summary>{t('公开企业查询如何处理', 'How public company research works')}</summary>
            <p>
              {t(
                '从巨潮披露源确认 A 股主体，再并行核对指定年度年报、相关附注和选定的近期公告原件。核对主体、原件哈希、表格范围与单位，按具体财务信号有限补查。检索步骤、来源与停止原因保存在查询记录。无匹配只表示当前披露源未找到；公告标题不等于已证明风险，选定全文也不代表完整风险调查。',
                'Confirm an A-share identity in CNINFO disclosures, then check the requested annual report, related notes and selected recent announcement originals in parallel. Checks cover identity, file hash, statement scope and units; specific financial signals guide bounded follow-up. Records retain actual tool events, sources and stop reasons. No match means this source returned no candidate. Titles do not prove risk, and reading selected originals is not a comprehensive risk investigation.'
              )}
            </p>
            <p>
              {t(
                'AI 可根据财务线索选择需要继续阅读的附注与公告，并整理可能解释。金额只取自原文，原表差额不能由 AI 补数。',
                'AI can use financial signals to select notes and announcements for further reading and organize possible explanations. Amounts come from the source; AI cannot fill differences in the original tables.'
              )}
            </p>
            <p>
              {t(
                '历史图表独立读取东方财富公开网页的年度财务字段，保留证券主体、期间、币种、接口字段与响应哈希。与年报候选的金额对照仅标识相同、不同或尚未核对，不代替原件与范围确认。资金存量、年度现金流和有限债务分项分别展示，不推导当前可用资金或付款安全。来源暂不可达或缺项时，保留明确状态。',
                'Historical charts separately read annual financial fields from Eastmoney’s public website, retaining the security identity, period, currency, field names and response hashes. Comparisons with annual-report candidates indicate equal, different or unchecked amounts; they do not replace source and scope confirmation. Cash stocks, annual cash flows and selected debt items are shown separately, without inferring current available funds or payment safety. Unavailable sources and missing fields retain explicit states.'
              )}
            </p>
            <p>
              {t(
                '候选提取结果仍需核对原件后确认，才成为个人材料。天眼查等商业工商接口尚未取得授权接入，不将公开财报查询表述为全面公司信用调查。',
                'Extracted candidates require review against the original and confirmation before becoming personal materials. Licensed commercial company-data services such as Tianyancha are not connected; public-report research is not a comprehensive company credit investigation.'
              )}
            </p>
          </details>
          <details>
            <summary>{t('解释范围', 'Explanation scope')}</summary>
            <p>
              {t(
                '报告金额、口径检查与现金桥由规则计算。AI 解读不可用或未完成时，已有规则报告仍可阅读、比较、跟进和导出。',
                'Rules calculate report amounts, scope checks and cash bridges. If AI interpretation is unavailable or incomplete, the existing rules report remains readable and available for comparison, follow-up and export.'
              )}
            </p>
            <p>
              {t(
                '解释保留引用与依据，但仍需人工复核；AI 文字不是新增证据。',
                'Explanations retain their references and basis, but still need human review. AI text is not new evidence.'
              )}
            </p>
          </details>
        </section>
        <section id="method-demo">
          <h2>{t('数据管理', 'Data management')}</h2>
          <p>
            {t(
              '材料、查询和任务属于当前账号；需要保留的报告请先导出。',
              'Evidence, searches and tasks belong to this account. Export reports you need to keep.'
            )}
          </p>
          <details>
            <summary>{t('清空工作区的范围', 'What clearing your workspace removes')}</summary>
            <p>
              {t(
                '清空工作区会删除本账号的付款任务与全部版本、企业查询、财报核查、跟进状态和上传材料。不可撤销，不影响其他账号。',
                'Clearing removes this account’s payment tasks and all versions, company searches, financial reviews, follow-up statuses and uploaded evidence. It cannot be undone and does not affect other accounts.'
              )}
            </p>
            <div className="inline-actions">
              <button className="button button-primary" onClick={() => navigate('/new')}>
                {t('新建核查', 'New review')}
                <ArrowRight size={16} />
              </button>
              {user && (
                <a className="text-link" href="/account">
                  {t('管理账号数据', 'Manage account data')}
                  <ArrowRight size={14} />
                </a>
              )}
            </div>
          </details>
        </section>
        <section id="method-privacy">
          <h2>{t('数据与隐私', 'Data and privacy')}</h2>
          <a className="text-link" href="/privacy">
            {t('阅读完整隐私政策', 'Read the full privacy policy')}
            <ArrowRight size={14} />
          </a>
          <p>{t('本产品由析光团队运营。', 'This product is operated by the Prispect team.')}</p>
          <p>
            {t(
              '账号、上传文件与核查保存在网站服务器；账号内文件下载需登录相应账号。',
              'Accounts, uploaded files, and reviews are stored on the website server. Downloads are restricted to their owning account.'
            )}
          </p>
          <details>
            <summary>{t('账号与记录', 'Accounts and records')}</summary>
            <h3>{t('账号', 'Account')}</h3>
            <p>
              {t(
                '服务器保存账号资料、密码哈希与登录会话。验证、找回和其他登录方式以账号页当前可用功能为准。',
                'The server retains account details, password hashes and sessions. Verification, recovery and other sign-in methods depend on the features currently available on the account page.'
              )}
            </p>
            <h3>{t('文件与记录', 'Files and records')}</h3>
            <p>
              {t(
                '确认保存的材料、原始上传文件、任务、场景备注、收付款工作表与跟进状态保留至删除相应记录或重置工作区。未确认的上传预览，以及可恢复失败查询的临时断点和公开原件缓存，在24小时后过期，后续访问时清理；历史查询记录保留。不是定时准点删除。',
                'Confirmed materials, original uploads, reviews, notes, cash worksheets and follow-up states remain until deletion or workspace reset. Unconfirmed uploads and temporary checkpoints/public-file caches for recoverable failed research expire after 24 hours and are cleaned on subsequent access. Historical research records remain. Cleanup is not guaranteed at an exact scheduled time.'
              )}
            </p>
            <h3>{t('访问', 'Access')}</h3>
            <p>
              {t(
                '网站不生成公开工作区链接；账号内记录与文件仅供相应账号访问。',
                'The website does not generate public workspace links. Records and files are restricted to their owning account.'
              )}
            </p>
          </details>
          <details>
            <summary>{t('第三方数据处理', 'Third-party data processing')}</summary>
            <p>
              {t(
                'AI 自动参与公司查询、财报核查和企业问答。具体数据处理范围、外部服务与保存规则见隐私政策。',
                'AI is an automatic part of company lookup, financial reviews and company questions. See the privacy policy for data-processing scope, external services and retention.'
              )}
            </p>
            <a className="text-link" href="/privacy?section=ai">
              {t('查看 AI 数据处理说明', 'Read the AI data-processing details')}
              <ArrowRight size={14} />
            </a>
          </details>
        </section>
      </div>
    </DocumentLayout>
  );
}

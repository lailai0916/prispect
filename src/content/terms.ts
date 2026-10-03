import type { ProductDocument } from './document';
import { documentMetadata, documentTitles } from './document-navigation';

export const termsDocument: ProductDocument = {
  ...documentMetadata['/docs/terms'],
  sections: [
    {
      id: 'scope',
      title: ['1. 适用范围与使用人', '1. Scope and users'],
      paragraphs: [
        [
          '本协议适用于析光团队（以下简称“我们”）运营的析光（Prispect）在线服务。使用前请阅读本协议及隐私政策；对重要条款有疑问，可以通过本页联系方式询问。',
          'These terms apply to the Prispect online service operated by the Prispect team (“we”). Please read these terms and the privacy policy before use. You can ask about important provisions using the contact information on this page.',
        ],
        [
          '登录或注册页面提供本协议与隐私政策的入口；继续登录或注册，表示你接受本协议并已阅读隐私政策。使用指南与核查方法用于解释功能和结果，不是额外的数据处理授权。依法需要单独告知或取得同意的事项，仍须另行履行，不能以继续使用或接受本协议代替。',
          'The login and registration pages link to these terms and the privacy policy. Continuing to log in or register indicates acceptance of these terms and acknowledgement of the privacy policy. The user guide and review methodology explain features and results; they do not grant additional permission to process data. Separate notices or consent required by law must still be provided or obtained; continued use or acceptance of these terms does not replace them.',
        ],
        [
          '本服务不面向不满14周岁者。你应具备与使用行为相适应的民事行为能力；已满14周岁的未成年人应在监护人指导下阅读与使用。依法需要同意或代理的事项，应由监护人同意或代理。代组织使用时，应具备相应授权。',
          'The service is not intended for children under 14. You should have the legal capacity appropriate to your use. Minors aged 14 or older should read and use it with a guardian’s guidance; obtain consent or representation when legally required. Use on behalf of an organization requires appropriate authorization.',
        ],
      ],
    },
    {
      id: 'services',
      title: ['2. 析光提供的服务', '2. What Prispect provides'],
      paragraphs: [
        [
          '析光分析公开公司资料、整理材料、核对财务口径、计算条件情景，并记录待补材料与后续行动。可用功能及范围以对应页面说明为准。',
          'Prispect analyzes public-company information, organizes materials, checks financial reporting scope, calculates conditional scenarios, and records missing evidence and next actions. Each page identifies the available features and their scope.',
        ],
      ],
      bullets: [
        [
          '公司研究：默认取得结构化年度财务与同行数据，展示财务观察、年度趋势和同年同行参照，不自动下载年报 PDF 或调用模型。你明确请求深度研究时，可按目标补查公告、新闻等公开资料并生成研究判断。公开研究与待确认的年报候选分别保留，不自动采用候选。',
          'Company research retrieves structured annual financial and peer data by default, presenting financial observations, annual trends and same-year peer comparisons without automatically downloading annual-report PDFs or calling a model. Explicit deep-research requests may retrieve disclosures, news and other public information according to the goal and generate research judgments. Public research remains separate from unconfirmed annual-report candidates and does not automatically adopt them.',
        ],
        [
          '财报核查：按同期间、同主体与合并范围核对利润和经营现金；必要材料缺失或冲突时，暂停相关计算。',
          'Financial reviews compare profit and operating cash for the same period, entity and consolidation scope. Missing or conflicting necessary evidence pauses the affected calculation.',
        ],
        [
          '私人核查事项：使用你提供的付款、交付、退款或日期现金计划，计算条件下的敞口与缺口，保留输入及证据变更版本。',
          'Private cases use your payment, delivery, refund or dated cash-plan inputs to calculate conditional exposure and shortfalls, retaining versions of input and evidence changes.',
        ],
      ],
      links: [{ label: documentTitles['/docs/guide'], href: '/docs/guide' }],
    },
    {
      id: 'accounts',
      title: ['3. 账号与访问安全', '3. Accounts and access'],
      bullets: [
        [
          '请使用你有权使用的账号资料，妥善保管密码、验证器、通行密钥及恢复码，不向他人提供访问凭据。',
          'Use account information you are entitled to use. Protect passwords, authenticators, passkeys and recovery codes, and do not share access credentials.',
        ],
        [
          '注册或登录不表示身份、企业资质、材料真伪或代理权限已被认证。展示手机号由用户自行填写，无需短信验证；邮箱的验证状态以账号页显示为准。',
          'Registration or login does not certify identity, business qualifications, document authenticity or authority to act. Display phone numbers are entered by users without SMS verification; email-verification status is shown on the account page.',
        ],
        [
          '发现异常访问时，请在账号页检查并撤销相应会话，或联系析光。找回与验证功能不可用时，请保留已登录设备，不假定邮箱可以恢复访问。展示手机号不用于账号恢复。',
          'If you notice unexpected access, inspect and revoke relevant sessions on the account page or contact Prispect. When recovery or verification is unavailable, keep a signed-in device and do not assume email can restore access. Display phone numbers are not used for account recovery.',
        ],
        [
          '请自行保存所需导出与原件。账号访问凭据丢失、材料被清空或服务不可用，可能影响你再次取得工作数据。',
          'Keep the exports and originals you need. Lost credentials, cleared materials or service unavailability may prevent access to working data.',
        ],
      ],
    },
    {
      id: 'materials',
      title: ['4. 你提供的材料与权利', '4. Your materials and rights'],
      paragraphs: [
        [
          '你及相应权利人保留上传文件、输入记录和原有内容的权利。提供材料不将其所有权转让给析光，也不授权我们将私人材料公开、用于宣传或替其他用户作判断。',
          'You and the relevant rights holders retain rights in uploaded files, records and existing content. Providing materials does not transfer ownership to Prispect or authorize public disclosure, promotion, or use to assess matters for other users.',
        ],
        [
          '为完成你选择的功能，析光需要读取、存储、解析材料并形成可查看或导出的工作结果。该处理限于所说明的服务与必要范围，具体数据处理及保留规则见隐私政策。',
          'The features you choose require Prispect to read, store and parse materials and produce working results you can view or export. Processing is limited to the described service and necessary scope; the privacy policy explains data processing and retention.',
        ],
        [
          '请只提供有权处理且核查所必需的内容；涉及他人个人信息、商业秘密或受限制资料时，应先确认授权与使用条件，并删去或遮盖不必要的信息。公开可读的材料不当然允许再次公开传播。',
          'Provide only content you are authorized to process and need for the review. Check authorization and restrictions for others’ personal information, trade secrets or restricted materials, and remove unnecessary details. Public accessibility is not automatic permission to republish.',
        ],
      ],
      links: [{ label: documentTitles['/docs/copyright'], href: '/docs/copyright' }],
    },
    {
      id: 'privacy',
      title: ['5. 数据处理与 AI', '5. Data processing and AI'],
      paragraphs: [
        [
          '默认公司财务分析不调用模型。你明确请求深度研究、原件核查、财报核查解释，或提交登录后的助手问题时，相应功能可使用 AI，且不提供单独关闭模型的选项。使用 AI 的研究目标会与公开资料一起发送给模型，请勿填写私人信息。对应的数据处理范围、外部服务和记录保存方式见隐私政策。',
          'Default company financial analysis does not call a model. Explicit deep-research, original-report review and financial-review explanation requests, and signed-in assistant questions, may use AI with no separate model-disable switch. Goals for research using AI are sent to the model with public information; do not include private information. The privacy policy describes processing scope, external services and record retention.',
        ],
        [
          '阅读或接受本协议不替代依法需要的数据使用告知与同意。你可以停止使用相应功能；已发生的数据处理及后续保留，依照隐私政策与适用法律处理。',
          'Reading or accepting these terms does not replace data-use notices or consent required by law. You may stop using the relevant features. Processing already performed and subsequent retention are governed by the privacy policy and applicable law.',
        ],
      ],
      links: [{ label: documentTitles['/docs/privacy'], href: '/docs/privacy' }],
    },
    {
      id: 'conduct',
      title: ['6. 合理使用', '6. Acceptable use'],
      bullets: [
        [
          '不得伪造或冒用材料、身份或授权，不得将条件测算冒充审计结论、资信认证、实际到账证明或付款授权。',
          'Do not fabricate or misuse materials, identity or authority, or present conditional calculations as audit conclusions, credit certification, proof of received funds or payment approval.',
        ],
        [
          '不得尝试访问其他账号的数据、绕过权限或读取限制、恶意消耗资源，或破坏服务及来源网站。',
          'Do not attempt to access another account’s data, bypass access or reading limits, maliciously consume resources, or disrupt the service or source websites.',
        ],
        [
          '导出、分享或向第三方使用结果时，应保留必要的来源、范围、日期、缺项和假设，不删去影响理解的限制，也应遵守原材料的使用条件。',
          'When exporting, sharing or using results with others, retain necessary sources, scope, dates, gaps and assumptions. Do not remove material limitations, and observe the original materials’ conditions of use.',
        ],
      ],
    },
    {
      id: 'results',
      title: ['7. 重要：结果的适用边界', '7. Important: limits of results'],
      emphasis: true,
      paragraphs: [
        [
          '金额一致、文件哈希匹配或字段能在文字中定位，不等于材料鉴真、企业可靠或未来履行。历史集团年报不证明今天的合同主体、可用余额或退款能力；未查得资料也不表示风险不存在。',
          'Matching amounts, file hashes or fields located in text do not authenticate materials, establish business reliability or prove future performance. Historical group reports do not establish today’s contractual entity, available funds or ability to refund. Missing information does not establish absence of risk.',
        ],
        [
          '计划、假设、对方陈述和实际记录应分开。未到账退款不能抵减实际敞口；年度经营现金不能当作当前现金；情景余额是输入条件下的计算，不是预测。材料缺失或冲突须先补充与核对。',
          'Keep plans, assumptions, counterparty statements and actual records separate. Unreceived refunds do not reduce actual exposure; annual operating cash is not current cash. Scenario balances are calculations under supplied conditions, not forecasts. Resolve missing or conflicting evidence first.',
        ],
        [
          '析光财务评级是所选年度合并财务的公开筛选方法，不属于评级机构的信用等级。盈利成长、经营现金、偿付杠杆与营运占用各占综合分的 25%；一个核心维度低于 40 分，最终等级最高 C，两个及以上最高 D，均分不变。关键数据缺失或冲突时完整评级为 NR；已有独立有效维度时可以展示单独标明覆盖范围的暂定评级，不显示完整百分制总分，也不改写保存的完整评级。同行与事件不机械扣分。完整规则见核查方法，初步倾向和历史评级都不代表已验证未来风险。',
          'Prispect financial grades screen selected-year consolidated financials; they are not credit-agency ratings. Profitability, operating cash, solvency and working-capital pressure each contribute 25% of the complete score. One core dimension below 40 caps the grade at C; two or more cap it at D without changing the arithmetic score. Missing or conflicting key data leaves the complete grade as NR. Independently valid dimensions may support a separately labeled provisional grade with coverage, without a complete score out of 100 or changes to the saved complete grade. Peers and events do not automatically deduct points. Review methodology contains the full rules; initial views and historical grades do not establish future risk.',
        ],
        [
          '析光不托管资金、不执行付款，不提供存款保障、投资建议或专业审计意见。AI 判断可能遗漏或误读，引用存在不证明解释正确；模型未完成时保留规则结果和实际状态。重要资金或合同决定应结合原件、当前记录及必要的专业意见，不能只依赖本服务。',
          'Prispect does not hold funds, execute payments, or provide deposit protection, investment advice or professional audit opinions. AI judgments may omit or misread information; citations do not prove an explanation correct. Incomplete model analysis retains rule results and actual status. Important financial or contractual decisions require originals, current records and professional advice where needed, rather than sole reliance on this service.',
        ],
      ],
    },
    {
      id: 'responsibility',
      title: ['8. 重要：服务可用性与责任', '8. Important: availability and responsibility'],
      emphasis: true,
      paragraphs: [
        [
          '外部来源变更、连接中断、文件版式或处理失败可能造成缺项、延迟或功能不可用。我们未约定固定可用率、响应时限、全部公司覆盖或特定交易结果。发现问题时，请保留相关输入与来源并联系析光。',
          'Changes to external sources, interrupted connections, document layouts or processing failures may cause gaps, delays or unavailability. We do not promise a fixed availability rate, response time, coverage of every company or a particular transaction outcome. Preserve relevant inputs and sources and contact Prispect if a problem occurs.',
        ],
        [
          '以上功能范围与使用提示不免除析光依法应承担的责任，也不排除你的法定权利。依法不得免除的责任，包括造成人身损害，或因故意、重大过失造成财产损失的责任，不因本协议而被排除。责任应根据适用法律、具体行为及因果关系认定。',
          'These descriptions and use cautions do not remove obligations imposed on Prispect by law or exclude your statutory rights. Liability that cannot lawfully be excluded, including for personal injury or property loss caused intentionally or through gross negligence, is not excluded by these terms. Responsibility depends on applicable law, the specific conduct and causation.',
        ],
      ],
      links: [
        {
          label: ['民法典：格式条款与责任规则', 'Civil Code: standard terms and liability'],
          href: 'https://www.court.gov.cn/zixun/xiangqing/233181.html',
        },
      ],
    },
    {
      id: 'data-exit',
      title: ['9. 导出、清空与停止使用', '9. Export, clearing and stopping use'],
      paragraphs: [
        [
          '你可以停止使用，并按可用功能导出所需报告与材料。账号页的“清空我的工作区”会删除本账号的核查事项及版本、研究记录、财报核查、跟进记录、材料和保留原件，账号与安全设置仍保留。请先备份，清空后页面无法撤销。',
          'You may stop using the service and export the reports and materials supported by available features. Clear my workspace on the account page deletes this account’s review items and versions, research records, financial reviews, follow-up records, materials and retained originals. The account and security settings remain. Back up first; the page cannot undo clearing.',
        ],
        [
          '停止使用或退出登录不自动删除账号与工作数据。关于账号、个人信息权利或其他无法自行完成的请求，请通过本页联系方式联系析光；具体保留规则见隐私政策。',
          'Stopping use or signing out does not automatically delete an account or working data. Contact Prispect through this page for account, personal-information rights or requests you cannot complete yourself. Retention rules are described in the privacy policy.',
        ],
      ],
    },
    {
      id: 'changes-disputes',
      title: ['10. 协议更新与问题处理', '10. Changes and resolving concerns'],
      paragraphs: [
        [
          '本页标明协议版本与更新日期。重要权利义务或数据处理规则发生变化时，应提供清楚的更新说明，并履行依法所需的告知与同意要求；页面更新本身不代表已取得你的新授权。',
          'This page identifies the version and update date. Material changes to rights, obligations or data processing require clear notice and any consent required by law. Updating a page alone does not establish your new authorization.',
        ],
        [
          '服务问题、条款说明与争议可先联系析光沟通。无法协商解决时，依法通过有权处理的机构或法院解决，不以本协议限制你依法提出申诉或诉讼的权利。某一条款依法无效时，其他条款在法律允许的范围内继续适用。',
          'Contact Prispect first about service concerns, explanations of terms or disputes. Unresolved matters may be addressed through legally competent bodies or courts; these terms do not limit lawful complaint or litigation rights. If a provision is invalid under law, the remaining provisions apply to the extent permitted.',
        ],
        [
          '中文为本文的原始版本，英文提供对应说明。两种语言存在歧义时，可要求我们解释；应依适用法律及公平原则处理，不以语言差异减少你的法定权利。',
          'Chinese is the original version, with a corresponding English explanation. You may request clarification of differences or ambiguity; interpretation follows applicable law and fairness, without reducing statutory rights through a language difference.',
        ],
      ],
    },
  ],
};

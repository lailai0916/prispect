import { DOCUMENT_DATE, DOCUMENT_VERSION, type ProductDocument } from './document';

export const privacyDocument: ProductDocument = {
  title: ['隐私政策', 'Privacy policy'],
  description: [
    '说明析光处理哪些信息、为什么处理，以及你可以怎样查看、更正和删除。',
    'What Prispect processes, why it is needed, and how to access, correct or delete it.',
  ],
  version: DOCUMENT_VERSION,
  updatedAt: DOCUMENT_DATE,
  sections: [
    {
      id: 'scope',
      title: ['适用范围与联系方式', 'Scope and contact'],
      paragraphs: [
        [
          '析光 / Prispect 由析光团队运营，是企业资料核查与条件计算产品。本政策适用于 xuejun.cc 的网站、账号、个人工作区及相关服务。',
          'Prispect is a company-evidence review and conditional-calculation product operated by the Prispect team. This policy covers xuejun.cc, its accounts, personal workspaces and related services.',
        ],
        [
          '个人信息或数据处理问题，请联系 lailai0x394@gmail.com。你打开的外部披露网站、模型服务及其他外部页面还适用各自的规则；本政策不能替代这些服务的隐私说明。',
          'For personal-information or data-processing questions, contact lailai0x394@gmail.com. External disclosure sites, model services and other external pages also apply their own rules. This policy does not replace their privacy notices.',
        ],
        [
          '账号登录和私人工作区需要必要的身份与服务信息；头像、简介、组织、附加安全方式和 AI 解读属于可选择的功能。不填写可选资料或关闭 AI 解读，不影响已经提供的规则核查和条件计算。',
          'Account access and private workspaces need identity and service information. Avatars, biographies, organization details, additional sign-in methods and AI interpretation are optional. Leaving optional profile fields blank or turning off AI interpretation does not prevent rules-based reviews and conditional calculations.',
        ],
      ],
    },
    {
      id: 'collection',
      title: ['处理的信息与用途', 'Information and purposes'],
      paragraphs: [
        [
          '我们处理你主动提供的内容，以及为完成请求、管理会话和保障服务安全所需的记录。请只提供完成核查所需的最少信息，并确保有权使用涉及他人的资料。',
          'We process information you provide and records needed to fulfill requests, manage sessions and protect the service. Provide only what your review needs, and ensure you are authorized to use information about other people.',
        ],
      ],
      table: {
        columns: [
          ['类别', 'Category'],
          ['信息范围', 'Information'],
          ['用途', 'Purpose'],
        ],
        rows: [
          [
            ['注册与账号', 'Registration and account'],
            [
              '邮箱、姓名或昵称、密码验证所需的加盐哈希、账号标识、创建与更新时间、验证状态。',
              'Email, name or nickname, salted password hash, account identifier, creation and update times, and verification status.',
            ],
            [
              '建立账号、登录、隔离工作区、维护资料和处理安全请求。',
              'Create an account, sign in, separate workspaces, maintain profile information and handle security requests.',
            ],
          ],
          [
            ['可选个人资料', 'Optional profile'],
            [
              '头像、简介、组织或公司、时区；手机号及其验证状态仅在相应服务可用并使用时处理。',
              'Avatar, biography, organization or company, and time zone; a phone number and its verification status when the corresponding service is available and used.',
            ],
            [
              '展示你的称呼、管理资料与联系或登录方式；头像不用于人脸识别。',
              'Display your profile and manage contact or sign-in methods. Avatars are not used for facial recognition.',
            ],
          ],
          [
            ['会话与安全', 'Sessions and security'],
            [
              '会话标识及令牌、有效期、IP 地址、浏览器标识、登录与限流记录、近期身份复核状态；选用两步验证或通行密钥时的相应验证资料。',
              'Session identifiers and tokens, expiry, IP address, browser identifier, sign-in and rate-limit records, recent identity confirmation, and verification information for optional two-step verification or passkeys.',
            ],
            [
              '维持登录、识别已登录设备、限制滥用、验证敏感操作和撤销会话。设备名称是浏览器信息的简化显示，不是设备身份认证。',
              'Maintain sign-in, list signed-in devices, limit abuse, verify sensitive actions and revoke sessions. Device labels summarize browser information and do not authenticate a device identity.',
            ],
          ],
          [
            ['上传材料', 'Uploaded materials'],
            [
              '你上传的 PDF、CSV、JSON 原文件、文件名、大小、内容哈希、预览、确认后的主体与指标、原文摘录、页码和来源关联。',
              'Uploaded PDF, CSV or JSON originals, filenames, sizes, content hashes, previews, confirmed entities and metrics, excerpts, page numbers and source references.',
            ],
            [
              '解析、预览、保存材料，定位原文，计算报告，并供你查看或下载原件。哈希核对文件内容，不认证原文真伪。',
              'Parse, preview and retain materials, locate source text, calculate reports, and let you view or download originals. A hash checks file content; it does not authenticate a document.',
            ],
          ],
          [
            ['私人核查与现金条件', 'Private reviews and cash conditions'],
            [
              '公司与交易主体、承诺和原话、金额与日期、收付款事件、备注、证据记录、适用范围、撤回状态、已知冲突及全部保存版本。',
              'Companies and transaction entities, promises and quotations, amounts and dates, cash events, notes, evidence records, scope, withdrawals, known conflicts and saved versions.',
            ],
            [
              '保存核查事项，复算条件结果、比较方案、追踪材料依赖、回看和恢复输入版本。',
              'Retain reviews, recalculate conditional results, compare scenarios, trace evidence dependencies, and review or restore input versions.',
            ],
          ],
          [
            ['公开公司查询', 'Public company lookup'],
            [
              '输入的查询词、所选主体与证券代码、年度、用途、公开公告及年报、原件哈希、候选字段、执行与错误记录、模型选项和返回结果。',
              'Entered search terms, selected identity and security code, year, purpose, public announcements and annual reports, original hashes, candidate fields, execution and error records, model choices and results.',
            ],
            [
              '检索官方披露资料、确认主体、读取原件、形成候选、记录覆盖范围，并在允许时恢复中断的查询。',
              'Retrieve official disclosures, confirm identity, read originals, create candidates, record coverage, and resume an interrupted lookup when available.',
            ],
          ],
          [
            ['反馈与请求', 'Feedback and requests'],
            [
              '你发送的联系方式、说明、必要附件和处理记录。',
              'Contact information, explanations, necessary attachments and handling records you send us.',
            ],
            [
              '答复问题、核验请求范围、处理更正或删除等事项。请勿发送密码、恢复码或完整金融账户信息。',
              'Reply, verify the scope of requests, and handle corrections or deletion. Do not send passwords, recovery codes or complete financial-account information.',
            ],
          ],
        ],
      },
    },
    {
      id: 'security-factors',
      title: ['密码、两步验证与通行密钥', 'Passwords, two-step verification and passkeys'],
      paragraphs: [
        [
          '登录或修改密码时，服务需要临时接收密码以完成验证，保存的是加盐密码哈希，不保存明文密码。已启用两步验证的密码登录还需相应验证；恢复码用于两步验证，不能代替密码重置。',
          'The service temporarily receives a password to verify sign-in or a password change. It stores a salted hash, not a plaintext password. Password sign-in with two-step verification enabled also requires the applicable verification. Recovery codes are for two-step verification, not password resets.',
        ],
        [
          '启用验证器时，服务保存加密的验证器密钥与恢复码以及必要的验证状态。请保管好自己的恢复码，不要把它们放进材料、核查备注或反馈邮件。',
          'When an authenticator is enabled, the service stores its secret and recovery codes in encrypted form, with necessary verification status. Keep your recovery codes secure; do not place them in materials, review notes or feedback emails.',
        ],
        [
          '通行密钥由你的设备或凭据管理器保管私钥。析光保存公钥、凭据标识、设备类型、同步状态、验证计数等验证资料，要求设备验证。析光不接收设备验证中的指纹、面容模板或通行密钥私钥。',
          'Your device or credential manager holds a passkey’s private key. Prispect stores the public key, credential identifier, device type, backup status, verification counter and related verification information, and requires device verification. It does not receive fingerprint data, facial templates or the passkey private key from that verification.',
        ],
        [
          '当前邮箱验证、换绑邮箱、邮件密码找回和短信验证暂不可用，不能发送相关验证邮件或验证码。邮箱作为登录名不代表已验证身份。以后提供这些功能时，会先说明相应数据用途和接收方。',
          'Email verification, email changes, password recovery by email and SMS verification are currently unavailable. Verification emails or codes cannot be sent. Using an email as a sign-in name does not mean its ownership has been verified. If these features become available, their data purposes and recipients will be explained first.',
        ],
      ],
    },
    {
      id: 'private-workspace',
      title: ['私人材料与条件计算', 'Private materials and conditional calculations'],
      paragraphs: [
        [
          '工作区中的核查事项、材料和历史版本按账号隔离，普通用户不能读取其他账号的数据。保存后的证据撤回或范围更正会产生后续状态，旧版本仍保留原有记录；恢复旧版本也不会抹去当前已知的未解决冲突。',
          'Workspace reviews, materials and history are separated by account. Ordinary users cannot read another account’s data. Withdrawing evidence or correcting its scope creates a later state while earlier versions retain their records. Restoring an earlier version does not erase currently known unresolved conflicts.',
        ],
        [
          '私人现金计划的 CSV／JSON 导入在浏览器内解析。只有你确认使用并保存核查事项后，相应计划字段才随核查输入保存到服务端；该导入不会自动上传原文件、生成来源记录，或发送给分析模型。其他材料上传功能则会将选定原文件发送到服务端解析与保留。',
          'Private cash-plan CSV or JSON imports are parsed in your browser. Corresponding plan fields are stored on the server when you confirm their use and save the review. This import does not automatically upload the original, create source records or send data to an analysis model. The separate material-upload feature sends selected original files to the server for parsing and retention.',
        ],
        [
          '条件计算使用你保存的输入与相关证据字段，不自动读取银行账户、执行付款、核准授信或建立个人信用评分。来源定位不等于鉴真；历史财务资料不能证明当前现金余额或付款安全。',
          'Conditional calculations use your saved inputs and relevant evidence fields. They do not automatically access bank accounts, execute payments, approve credit or create personal credit scores. Locating a source is not authentication; historical financial documents do not establish a current cash balance or payment safety.',
        ],
      ],
    },
    {
      id: 'ai',
      title: ['AI 解读与对外发送', 'AI interpretation and external processing'],
      emphasis: true,
      paragraphs: [
        [
          'AI 是可选择的处理方式。公司查询在 AI 可用时默认勾选“使用 AI 解读”，财报核查默认不启用 AI；你可以在提交前改变当次选项。启用时会把下列内容发送给外部模型服务。关闭该选项可以继续使用官方资料检索和规则计算。',
          'AI processing is optional. Company lookup has “Use AI interpretation” selected by default when AI is available; financial reviews have AI off by default. You can change the option before submitting. When enabled, the information below is sent to an external model service. With the option off, official-source retrieval and rules-based calculations remain available.',
        ],
      ],
      table: {
        columns: [
          ['场景', 'Feature'],
          ['发送的内容', 'Information sent'],
          ['不包含的内容', 'Information excluded'],
        ],
        rows: [
          [
            ['公开公司查询', 'Public company lookup'],
            [
              '所查询主体的公开信息、公开公告标题与来源、候选页及短表格文字、已读公开附注和公告短摘录、已采用的财务指标与规则线索。',
              'Public company information, public announcement titles and sources, candidate pages and short table text, excerpts from public notes and announcements, and accepted financial metrics and rules-based signals.',
            ],
            [
              '账号资料和安全密钥、私人核查事项、交易原话、私人现金计划、跟进备注，以及其他账号的材料。',
              'Account details and security secrets, private reviews, transaction statements, private cash plans, follow-up notes, or other accounts’ materials.',
            ],
          ],
          [
            ['财报核查的可选解释', 'Optional financial-review explanation'],
            [
              '报告实际采用的本期与比较年度合并指标、关联短摘录与证据标识、规则结论及非管理层解释的规则分析。若你选用自己上传的财务材料，相关已采用字段与摘录也可能发送。',
              'Current and comparison-year consolidated metrics actually used by the report, associated short excerpts and evidence identifiers, the rules verdict and rules analysis excluding management explanations. If you use uploaded financial materials, their accepted fields and excerpts may also be sent.',
            ],
            [
              '整份上传文件、未采用或排除的观测、存在冲突而暂停使用的输入、私人交易决策、现金条件和账号安全信息。',
              'The full uploaded file, unused or excluded observations, conflicted inputs whose use has stopped, private transaction decisions, cash conditions or account security information.',
            ],
          ],
        ],
      },
      bullets: [
        [
          '当前选用 AI 时，请求由 TokenFlux.dev 外部接口处理。经该接口处理不代表已确定由某一模型厂商直接接收数据。',
          'When AI is selected, requests currently pass through the external TokenFlux.dev API. Use of this API does not establish that a particular model developer directly receives the data.',
        ],
        [
          '我们尚未完成对该服务的运营主体、下游接收方、保存区域、保存期限、训练用途与合同保障的核验，不承诺其不保存、不训练或仅在境内处理。请不要在外发摘录中放入个人敏感信息、商业秘密或无权提供的资料；不能接受这些边界时，请关闭 AI。',
          'We have not completed verification of this service’s operating entity, downstream recipients, storage regions, retention, training use or contractual safeguards. We do not promise zero retention, no training or processing only within mainland China. Keep sensitive personal information, trade secrets and unauthorized material out of externally sent excerpts. Turn off AI if these limits are unacceptable.',
        ],
        [
          '外发摘录没有自动脱敏功能。公开披露资料也可能含有人员姓名等个人信息；公开可访问不等于可以任意使用。我们不以私人核查事项或现金计划训练自有模型，也没有把这些私人输入接入公开查询模型。',
          'Externally sent excerpts are not automatically redacted. Public disclosures may contain names or other personal information; public availability does not permit unrestricted use. We do not train our own models on private reviews or cash plans, and these private inputs are not connected to the public lookup model.',
        ],
        [
          '提交前关闭 AI 选项，可避免本次 AI 请求；查询运行中取消，可停止后续步骤，但不能追回已经发送的数据。规则报告与返回的解释分别保存；核查来源标识、格式或数值不代表已认证解释的含义，也不会自动决定是否付款。',
          'Turning off AI before submission avoids AI requests for that submission. Cancelling a running lookup can stop subsequent steps, but cannot recall data already sent. Rules reports and returned explanations are retained separately. Checking source identifiers, format or numbers does not authenticate an interpretation’s meaning or automatically decide a payment.',
        ],
      ],
      links: [
        {
          label: ['TokenFlux 使用政策', 'TokenFlux usage policy'],
          href: 'https://docs.tokenflux.dev/docs/tos/usage-policy.html',
        },
      ],
    },
    {
      id: 'third-parties',
      title: ['外部服务与访问', 'External services and access'],
      paragraphs: [
        [
          '公司查询把你输入的查询词及选定证券代码、主体标识、年度等检索参数发送至巨潮资讯公开披露接口。请在公司搜索框只输入公司名称或证券代码，避免夹带私人交易、个人姓名、账号或其他不必要内容。',
          'Company lookup sends your entered search terms and selected security code, entity identifier, year and other retrieval parameters to CNINFO’s public-disclosure service. Enter only a company name or security code in company search; avoid private transactions, personal names, account details or other unnecessary information.',
        ],
        [
          '账号与工作区由析光所用云服务器保存和处理，基础设施运营者可能按其服务规则处理网络和运维数据。必要维护、事故排查或处理你提出的数据请求时，获授权人员可能接触相应资料。应用中的账号隔离不等于对运营人员的端到端加密。',
          'Accounts and workspaces are stored and processed on the cloud server used by Prispect. Infrastructure operators may process network and operational data under their service rules. Authorized personnel may access relevant information for maintenance, incident investigation or your data requests. Application-level account separation is not end-to-end encryption against the operator.',
        ],
        [
          '当前服务器的实际存储地区及全部基础设施受托方信息尚未完成对外核验，我们不保证所有数据仅在中国境内存储。涉及个人信息向境外提供时，应履行适用的告知、同意及其他法定要求；仅阅读本政策不能替代这些要求。',
          'The server’s physical storage region and the full set of infrastructure processors have not been verified for public disclosure. We do not guarantee that all data is stored only in mainland China. Where personal information is provided outside mainland China, applicable notice, consent and other legal requirements must be met; reading this policy does not replace them.',
        ],
        [
          '本服务没有出售个人信息或广告画像功能。若需要新增处理目的、接收方或对外公开方式，会另行说明，并在适用法律要求时取得相应同意。依法需要披露信息时，将按有效法律要求处理，尽量限制披露范围。',
          'The service has no personal-data sale or advertising-profile feature. New purposes, recipients or public-disclosure methods will be explained separately, with the applicable consent where required by law. Legally required disclosure will be handled under valid legal requirements with the scope limited where possible.',
        ],
        [
          '点击外部年报、公告、邮件或其他站外链接后，相应网站或邮件服务可能处理你的 IP 地址、浏览器或通信记录。你自行下载、导出或分享的文件由你决定保管和接收人；导出不会自动公开你的工作区。',
          'External report, announcement, email or other links may let the destination site or mail service process your IP address, browser or communication records. You choose how to keep and who receives downloaded, exported or shared files. An export does not automatically publish your workspace.',
        ],
      ],
    },
    {
      id: 'browser-storage',
      title: ['Cookie 与浏览器内保存', 'Cookies and browser storage'],
      paragraphs: [
        [
          '必要 Cookie 用于登录会话、两步验证和通行密钥挑战等认证操作。正式 HTTPS 服务的会话 Cookie 使用 Secure、HttpOnly 和 SameSite 限制。阻止或删除这些 Cookie 可能使你退出登录或无法完成认证。',
          'Necessary cookies support sessions, two-step verification and passkey challenges. Session cookies on the production HTTPS service use Secure, HttpOnly and SameSite restrictions. Blocking or deleting these cookies may sign you out or prevent authentication.',
        ],
        [
          '语言和外观偏好保存在当前浏览器的 localStorage；起始输入和模式等短草稿保存在当前标签页的 sessionStorage，并与账号状态关联。匿名草稿可以在你登录后接续；退出或切换账号会清理相应账号草稿。',
          'Language and appearance preferences are stored in the browser’s localStorage. Short starting-input drafts and their modes are stored in the tab’s sessionStorage and associated with account state. An anonymous draft may continue after sign-in; signing out or switching accounts clears the corresponding account draft.',
        ],
        [
          '这些浏览器存储不是云端备份。浏览器恢复标签页时可能恢复会话草稿，清理站点数据则可能删除草稿和偏好；未保存的完整表单也不保证能恢复。当前站点没有广告跟踪或第三方统计脚本。',
          'Browser storage is not a cloud backup. Browser tab restoration may restore a session draft, while clearing site data may remove drafts and preferences. Full unsaved forms are not guaranteed to recover. The current site has no advertising-tracking or third-party analytics scripts.',
        ],
      ],
    },
    {
      id: 'retention',
      title: ['保存期限与删除范围', 'Retention and deletion scope'],
      table: {
        columns: [
          ['数据', 'Data'],
          ['当前保存方式', 'Current retention'],
        ],
        rows: [
          [
            ['尚未确认的上传原件', 'Unconfirmed upload originals'],
            [
              '自上传暂存起 24 小时后过期；清理在工作区加载、上传或相关清理触发时执行，不能承诺恰在第 24 小时删除每个字节。',
              'Expire 24 hours after temporary retention. Cleanup runs when workspace loading, uploading or related cleanup is triggered; deletion of every byte exactly at hour 24 is not promised.',
            ],
          ],
          [
            ['查询断点与公开原件缓存', 'Lookup checkpoints and public-source cache'],
            [
              '完成查询后清理临时断点缓存；失败且可恢复的查询在创建后 24 小时过期，按清理触发移除缓存。已经保留的预览原件、候选和执行记录遵循其各自保存范围。',
              'Temporary checkpoint caches are cleaned after completion. Failed recoverable lookups expire 24 hours after creation and their caches are removed when cleanup runs. Retained preview originals, candidates and execution records follow their own retention rules.',
            ],
          ],
          [
            ['已确认材料与核查历史', 'Confirmed materials and review history'],
            [
              '当前没有按固定天数自动删除，保留到你按可用方式删除、清空工作区，或经核验处理的数据删除请求。材料被报告或任何核查版本引用时，单独删除会被阻止。',
              'No fixed-day automatic deletion is currently applied. They remain until deletion through available controls, workspace clearing or a verified data-deletion request. Individual deletion of a material is blocked while a report or any review version references it.',
            ],
          ],
          [
            ['账号、安全与支持记录', 'Account, security and support records'],
            [
              '账号和启用的安全资料不随工作区清空删除。会话有有效期，持续使用可能续期；退出或撤销会话后不能继续使用该会话登录。会话过期、请求完成或限流窗口结束不等于所有历史记录立即从数据库清除。',
              'Clearing a workspace does not delete the account or enabled security information. Sessions expire and may renew through continued use; sign-out or revocation prevents further sign-in with that session. Expiry, request completion or the end of a rate-limit window does not mean every historical database record is immediately removed.',
            ],
          ],
          [
            ['备份', 'Backups'],
            [
              '服务备份可能包含账号、材料原件、工作区版本与必要配置。现有备份没有自动滚动删除期限；在线删除不会立即清除备份旧副本。相关删除请求会核对备份范围、法律要求和恢复需要后处理，不承诺立即或永久不可恢复。',
              'Service backups may include accounts, original materials, workspace versions and necessary configuration. Existing backups have no automatic rolling deletion period. Online deletion does not immediately erase earlier backup copies. Deletion requests require review of backup scope, legal requirements and recovery needs; immediate or permanently irreversible erasure is not promised.',
            ],
          ],
        ],
      },
      paragraphs: [
        [
          '账号页的“清空我的工作区”删除本账号的核查事项和全部版本、公司查询、财报核查、跟进状态、上传材料及保留原件；账号、头像和登录因素保留，不影响其他账号。该操作在页面内无法撤销，请先保存需要保留的导出或原件。',
          '“Clear my workspace” removes this account’s reviews and all versions, company lookups, financial reviews, follow-up states, uploaded materials and retained originals. It keeps the account, avatar and sign-in factors and does not affect other accounts. The page cannot undo this action; save needed exports or originals first.',
        ],
        [
          '撤回一条证据是停止其当前依赖计算，不是删除全部历史记录；删除查询记录也不自动删除已经采用的材料和报告。停止后续 AI 请求同样不删除第三方已经收到的信息。',
          'Withdrawing evidence stops its current dependent calculation; it does not delete all history. Deleting a lookup record does not automatically delete adopted materials or reports. Stopping future AI requests likewise does not remove information already received by a third party.',
        ],
      ],
    },
    {
      id: 'rights',
      title: ['查看、更正、删除与其他请求', 'Access, correction, deletion and other requests'],
      bullets: [
        [
          '你可以在账号页查看和修改可编辑资料，管理头像、通行密钥及已登录会话；在材料和报告页面查看原件、下载材料并导出已支持的报告格式。',
          'Use account settings to view and change editable profile information and manage your avatar, passkeys and signed-in sessions. Material and report pages let you view originals, download materials and export supported report formats.',
        ],
        [
          '输入更正、证据撤回、范围更正和旧版本恢复保留相应核查历史；它们不是直接修改或删除旧版本。需要删除历史或减少服务端保存时，可使用相应删除或清空功能，或联系我们说明范围。',
          'Input corrections, evidence withdrawals, scope corrections and version restoration retain the corresponding review history; they do not directly modify or delete earlier versions. To remove history or reduce server retention, use available deletion or clearing controls, or contact us with the requested scope.',
        ],
        [
          '对于页面未提供的查阅、复制、更正、删除、限制处理或账号删除请求，可以通过联系邮箱提出。当前没有页面内自动账号注销按钮或全部账号数据一键导出功能；“清空工作区”不等于账号注销。',
          'Contact us for access, copying, correction, deletion, restriction or account-deletion requests not available through the pages. There is currently no automatic account-deletion button or one-click export of all account data. Clearing a workspace does not close an account.',
        ],
        [
          '请说明涉及的账号、数据类别、希望采取的动作和可回复的渠道。我们会在必要范围核验请求身份与权限，并按适用法律处理或说明不能满足的原因。不要为核验发送密码、恢复码或不必要的身份证明。',
          'Specify the account, data categories, requested action and a reply channel. We will verify identity and authority only as necessary, and handle the request under applicable law or explain why it cannot be met. Do not send passwords, recovery codes or unnecessary identity documents.',
        ],
        [
          '可在提交前关闭 AI 选项，避免该次可选 AI 处理；运行中取消查询，可停止后续步骤。已经发送的数据、完成的处理和历史结果不会因此自动消失。依法需要留存或技术上暂时难以删除的数据，应限制用途并继续采取必要保护措施。对处理答复有异议，可以再次联系我们或依法向有权机关反映。',
          'Turn off AI before submission to avoid optional AI processing for that request. Cancel a running lookup to stop subsequent steps. Data already sent, completed processing and historical results do not automatically disappear. Data that must legally be retained or cannot yet be technically deleted should have its use restricted and remain protected. You may contact us again about a response or raise the matter with a competent authority under applicable law.',
        ],
      ],
      links: [
        {
          label: ['联系数据处理负责人', 'Contact for data requests'],
          href: 'mailto:lailai0x394@gmail.com',
        },
        {
          label: [
            '《中华人民共和国个人信息保护法》',
            'Personal Information Protection Law of China',
          ],
          href: 'https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm',
        },
      ],
    },
    {
      id: 'sensitive-data',
      title: ['敏感信息与未成年人', 'Sensitive information and minors'],
      paragraphs: [
        [
          '析光不要求你提供身份证号、完整银行或支付账号、医疗资料、精确行踪等与核查无关的敏感信息。上传合同、流水或其他材料前，请移除不必要的个人资料，并确认具有合法来源和相应处理权限。产品没有自动脱敏功能。',
          'Prispect does not require identity-card numbers, complete bank or payment account details, medical records, precise location or other sensitive information unrelated to a review. Remove unnecessary personal details from contracts, statements and other materials before uploading, and confirm their lawful source and your authority to process them. The product does not automatically redact them.',
        ],
        [
          '本服务不面向未满 14 周岁的儿童。未满 18 周岁的用户，在依法需要监护人同意的情形下，应先取得同意再使用。监护人发现儿童误注册或上传信息时，可联系我们；我们会核验必要信息后协助停止相关处理并处理删除请求。',
          'This service is not directed to children under 14. Users under 18 should obtain guardian consent before use where legally required. A guardian who discovers a child’s mistaken registration or upload may contact us. After necessary verification, we will help stop the relevant processing and handle deletion requests.',
        ],
      ],
    },
    {
      id: 'protection',
      title: ['安全保护与事件处理', 'Protection and incident handling'],
      paragraphs: [
        [
          '服务使用 HTTPS 传输、账号权限检查、请求来源和防伪校验、密码哈希、安全因素保护、访问限制与备份。账号数据库、工作区文件和备份并未全部进行内容加密；没有端到端加密或“绝不泄露”的保证。',
          'The service uses HTTPS, account authorization, request-origin and anti-forgery checks, password hashing, security-factor protection, access restrictions and backups. The account database, workspace files and backups are not all content-encrypted. We do not provide end-to-end encryption or a guarantee against all disclosure.',
        ],
        [
          '必要的运行与安全记录用于维护、限流和故障排查，不作为广告画像。不要在标题、文件名或反馈中放入秘密凭据，以免它们进入业务记录或必要的诊断信息。',
          'Necessary operational and security records support maintenance, rate limiting and fault diagnosis, not advertising profiles. Keep secret credentials out of titles, filenames and feedback so they do not enter business records or necessary diagnostic information.',
        ],
        [
          '发现账号异常时，可撤销已登录会话、修改密码并检查安全方式；邮件找回暂不可用时请保留可用的登录方式。如发生影响个人信息的安全事件，我们会调查、采取补救措施，并按适用要求告知有关人员或报告主管机关。',
          'If an account appears compromised, revoke signed-in sessions, change the password and review sign-in methods. While email recovery is unavailable, retain an available sign-in method. For a security incident affecting personal information, we will investigate, take remedial steps and notify affected people or report to the competent authority as applicable.',
        ],
      ],
    },
    {
      id: 'changes',
      title: ['政策变更', 'Policy changes'],
      paragraphs: [
        [
          '本页显示版本和更新日期。信息类别、用途、外部接收方、存储安排或用户权利发生实质变化时，会更新说明并作必要提示；依法需要新的同意时，不能用本政策的更新代替该同意。',
          'This page displays its version and update date. Material changes to information categories, purposes, external recipients, storage or user rights will be explained and signaled as necessary. Where fresh consent is legally required, a policy update does not replace it.',
        ],
      ],
    },
  ],
};

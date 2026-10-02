import { DOCUMENT_DATE, DOCUMENT_VERSION, type ProductDocument } from './document';

export const copyrightDocument: ProductDocument = {
  title: ['版权与许可', 'Copyright and licensing'],
  description: [
    '区分析光代码许可、第三方内容与你提供的材料，保留来源和许可条件。',
    'Distinguishing the Prispect code license, third-party content and your materials, while retaining sources and license conditions.',
  ],
  version: DOCUMENT_VERSION,
  updatedAt: DOCUMENT_DATE,
  sections: [
    {
      id: 'product-names',
      title: ['1. 产品与运营方', '1. Product and operator'],
      paragraphs: [
        [
          '析光 / Prispect 为产品与运营团队的名称。使用名称或标识时，应准确说明关系，不冒充运营方，也不暗示尚未取得的认可或合作关系。',
          '析光 / Prispect names both the product and its operating team. Use names or identifiers accurately, without impersonating the operator or implying endorsement or a partnership that has not been granted.',
        ],
      ],
    },
    {
      id: 'code-license',
      title: ['2. 软件代码：MIT 许可', '2. Software code: MIT license'],
      paragraphs: [
        [
          '仓库 LICENSE 标注：MIT License；Copyright (c) 2026 lailai。',
          'The repository LICENSE states: MIT License; Copyright (c) 2026 lailai.',
        ],
        [
          '适用 MIT 的软件代码及相应软件文档可按其条款使用、复制、修改、合并、发布、分发、再许可及销售；复制件或重要部分须保留原版权与许可声明。原创网站文案、项目文档与演示素材的另列许可见下一节。此处概述不修改完整许可证及其中的保证、责任条款。',
          'Software code and associated software documentation covered by MIT may be used, copied, modified, merged, published, distributed, sublicensed and sold under its terms. Copies or substantial portions must retain the copyright and permission notice. Original website text, project documentation and presentation materials have the separate license described below. This summary does not amend the full license, including its warranty and liability provisions.',
        ],
        [
          '网站服务协议与软件许可处理不同事项。服务使用条款不会收回 MIT 已授予的代码权限，也不会把另有许可的依赖、用户文件或第三方报告改为 MIT。',
          'The online-service terms and software license address different matters. Service terms do not withdraw code permissions already granted by MIT or relicense dependencies, user files or third-party reports under MIT.',
        ],
      ],
      links: [
        {
          label: ['查看完整软件许可', 'Read the full software license'],
          href: '/software-license.txt',
        },
        {
          label: ['MIT 许可说明', 'MIT license reference'],
          href: 'https://opensource.org/license/mit',
        },
      ],
    },
    {
      id: 'content-license',
      title: ['3. 原创内容：CC BY 4.0', '3. Original content: CC BY 4.0'],
      paragraphs: [
        [
          '仓库 LICENSE-docs 将原创析光网站文案、项目文档与演示素材按知识共享署名 4.0 国际许可（CC BY 4.0）授权，Copyright (c) 2026 lailai。该范围与软件代码的 MIT 许可分别说明。',
          'The repository LICENSE-docs licenses original Prispect website text, project documentation and presentation materials under Creative Commons Attribution 4.0 International (CC BY 4.0), Copyright (c) 2026 lailai. This scope is stated separately from the MIT software-code license.',
        ],
        [
          '使用这些原创内容时，署名须标明本项目并保留适用声明；具体授权条件以 CC BY 4.0 完整条款为准。',
          'Attribution for this original content must identify the project and preserve applicable notices. The full CC BY 4.0 terms govern the permission conditions.',
        ],
        [
          '该许可不适用于第三方企业报告、报告摘录、标识、财务披露文件、比赛材料或软件依赖，其原有权利与条款继续适用。用户材料也不因上传或被引用而适用本项目的原创内容许可；来源元数据与财务事实不表示原报告可以无限再分发。',
          'This license does not apply to third-party company reports, report excerpts, logos, financial disclosure documents, competition materials or software dependencies; their original rights and terms remain in force. Uploading or citing user materials does not place them under the project’s original-content license. Source metadata and financial facts do not imply unrestricted redistribution of the original reports.',
        ],
      ],
      links: [
        {
          label: ['查看原创内容许可与范围', 'Read the original-content license and scope'],
          href: '/content-license.txt',
        },
        {
          label: ['CC BY 4.0 完整条款', 'Full CC BY 4.0 legal terms'],
          href: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        },
      ],
    },
    {
      id: 'third-party',
      title: ['4. 第三方软件与公开资料', '4. Third-party software and public materials'],
      paragraphs: [
        [
          '第三方软件沿用其自身许可证和版权声明。公开财报、公告、网页、商标与其他内容的权利属于相应权利人；来源可访问、可下载或被析光引用，不代表你取得无限复制、传播或商业使用许可。',
          'Third-party software retains its own licenses and copyright notices. Rights in public reports, announcements, webpages, trademarks and other content remain with the respective rights holders. Accessibility, downloading or citation by Prispect does not grant unlimited copying, distribution or commercial-use rights.',
        ],
        [
          '析光保留原件链接、页码与核查所需摘录。再次使用这些内容时，请依据来源许可或适用法律判断使用范围，保留必要出处，不将摘录解释为原发布方的完整意见或对析光的认可。',
          'Prispect retains original links, page references and excerpts needed for review. Reuse requires assessing the source license or applicable legal conditions, retaining necessary attribution, and avoiding presentation of excerpts as the publisher’s full view or endorsement of Prispect.',
        ],
      ],
      links: [
        {
          label: ['第三方软件许可声明', 'Third-party software notices'],
          href: '/third-party-notices.txt',
        },
        {
          label: ['著作权法2020年修法决定', '2020 amendment to the Copyright Law'],
          href: 'https://www.ncac.gov.cn/xxfb/ywxx/202011/t20201112_47358.html',
        },
      ],
    },
    {
      id: 'your-content',
      title: ['5. 上传材料与工作结果', '5. Uploaded materials and working results'],
      paragraphs: [
        [
          '上传、转录或导入不会将你的原有内容权利转让给析光。你应确认有权提供和处理相关内容；私有工作结果仅按所选服务功能处理，不因使用析光而成为公开资料。',
          'Uploading, transcribing or importing does not transfer your existing content rights to Prispect. You should be authorized to provide and process that content. Private working results are processed for selected features and do not become public merely through use of Prispect.',
        ],
        [
          '导出文件可能同时包含你的输入、第三方摘录和计算结果，其权利不能一概归为单一主体。数值运算或 AI 解读也不自动产生对基础资料的独占权；权利归属及保护范围应依据具体内容、授权与适用法律判断。',
          'Exports may combine your inputs, third-party excerpts and calculations, so rights cannot all be assigned to a single owner. Calculation or AI interpretation does not automatically confer exclusive rights in underlying materials. Ownership and protection depend on the specific content, authorization and applicable law.',
        ],
      ],
      links: [
        { label: ['材料使用与服务约定', 'Terms for materials and service use'], href: '#/terms' },
        { label: ['私人数据处理', 'Private-data processing'], href: '#/privacy' },
      ],
    },
    {
      id: 'copyright-requests',
      title: ['6. 版权问题与更正请求', '6. Copyright concerns and correction requests'],
      paragraphs: [
        [
          '发现权利或来源标注问题时，请通过本页联系方式告知具体页面、文件或链接、涉及内容、权利依据及可联系信息。请勿在公开反馈中附上不必要的身份证明、合同全文或账户信息；需要补充材料时再使用合适的沟通方式。',
          'For a rights or attribution concern, contact us through this page with the relevant page, file or link, the content involved, the basis of your rights and a contact method. Avoid unnecessary identity documents, full contracts or account details in public feedback; use an appropriate channel if further materials are needed.',
        ],
        [
          '析光会结合来源与所提供信息处理请求，必要时更正标注或限制相关内容。页面中的链接或摘录不替代权利人授权，版权争议亦不由析光的财务核查结果裁定。',
          'Prispect will assess requests using the source and information provided, correcting attribution or restricting relevant content where needed. Links or excerpts do not replace rights-holder authorization, and Prispect financial results do not adjudicate copyright disputes.',
        ],
      ],
    },
  ],
};

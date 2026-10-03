/**
 * 未上市中国公司核查源 —— 预留接口（非上市主体的扩展点）。
 *
 * 现状：项目只覆盖 A股（巨潮 cninfo）与美股（SEC EDGAR）的上市公司。
 * 要支持未上市中国公司（如"观猹"这类一级市场主体），接入本文件声明的接口即可，
 * 主流程（searchCompanies / runCompanyResearch）无需改动：
 *
 * 1. search：实现 searchPrivateCompanies(query)，用工商数据 API（企查查 / 天眼查 /
 *    爱企查等，需企业资质与 token）按公司名检索，返回 CompanyIdentity[]，
 *    其中 exchange 一律填 'cn-private'，orgId 用工商统一社会信用代码。
 * 2. research：实现 runPrivateResearch(identity, options)，抓取工商登记（成立时间 /
 *    注册资本 / 实缴 / 股东 / 诉讼 / 经营异常）、融资披露、舆情报道，
 *    输出与 secCompanyResearch 同构的预览材料（observations 可直接进现金桥引擎）。
 * 3. 把本文件的 status 从 'pending' 改为 'ready'，前端无结果提示会自动变为
 *    "未上市主体可核查"，搜索候选即可进入现有 run 管线。
 *
 * 注意：未上市主体没有年报/季报强制披露，财务维度需改用工商年报或招股书；
 * 现金桥引擎的 year 字段与 annual/quarterly 期间口径保持不变即可复用。
 */

export interface PrivateCompanySource {
  key: 'cn-private';
  /** pending = 接口已预留但未接入真实数据；ready = 已接入可用 */
  status: 'pending' | 'ready';
  note: string;
}

export const privateCompanySource: PrivateCompanySource = {
  key: 'cn-private',
  status: 'pending',
  note: '未上市主体数据源接入中：需要工商登记/融资/舆情类数据 API（企查查、天眼查等）',
};

/** 预留的搜索入口：当前返回空候选 + 明确提示，接入后替换为真实工商检索。 */
export async function searchPrivateCompanies(
  _query: string
): Promise<{ candidates: never[]; note: string }> {
  return {
    candidates: [],
    note: privateCompanySource.note,
  };
}

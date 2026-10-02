import type { CompanyAnnouncement, CompanyIdentity } from '../shared/contracts.js';
import type {
  CompanyAuditOpinionEvidence,
  CompanyAuditOpinionResult,
} from '../shared/company-contracts.js';
import {
  candidateCompanyName,
  issuerCodeEvidence,
  type CompanyPdfText,
} from './company-extraction.js';

const compact = (value: string) => value.replace(/\s/g, '');
const opinionHeading =
  /^(?:[一二三四五六七八九十\d]+[、.．])?(?:审计意见|保留意见|否定意见|无法表示意见)$/;
const nextHeading = /^[二三四五六七八九十\d]+[、.．]/;
const auditIntroduction = /我们(?:审计了|接受委托[，,]?审计(?:了)?)/;

export function pendingAuditOpinion(requestedYear: number | null): CompanyAuditOpinionResult {
  return {
    status: 'pending',
    requestedYear,
    scope: { issuer: 'unconfirmed', reportYear: 'unconfirmed', auditPeriod: 'unconfirmed' },
    evidence: [],
    warnings: [],
  };
}

/** Locate a formal financial-statement audit section; never infer an audit type or safety verdict. */
export function extractAuditOpinion(
  identity: CompanyIdentity,
  announcement: CompanyAnnouncement,
  pdf: CompanyPdfText,
  year: number
): CompanyAuditOpinionResult {
  const result = pendingAuditOpinion(year);
  result.status = 'unknown';
  const coverYears = [
    ...new Set(
      [
        ...compact(
          pdf.pages
            .slice(0, 5)
            .map((page) => page.text)
            .join('\n')
        ).matchAll(/(20\d{2})(?:年(?:度)?)?年度报告/g),
      ].map((match) => Number(match[1]))
    ),
  ];
  result.scope.reportYear =
    announcement.reportYear !== year || (coverYears.length && !coverYears.includes(year))
      ? 'conflict'
      : coverYears.length === 1 && coverYears[0] === year
        ? 'matched'
        : 'unconfirmed';
  const codes = [
    ...new Set(issuerCodeEvidence(pdf.pages, identity.exchange).map((row) => row.code)),
  ];
  const codeScope =
    codes.length && !codes.includes(identity.securityCode)
      ? 'conflict'
      : codes.length === 1 && codes[0] === identity.securityCode
        ? 'matched'
        : 'unconfirmed';
  result.scope.issuer = codeScope;
  if (codeScope === 'conflict' || result.scope.reportYear === 'conflict') {
    result.warnings.push('年报原件的主体或年度与本次查询不一致，未采用审计意见段落。');
    return result;
  }
  const companyName = candidateCompanyName(pdf.pages) || identity.companyName;
  const candidates: {
    evidence: CompanyAuditOpinionEvidence[];
    issuerMatched: boolean;
    period: 'matched' | 'unconfirmed';
  }[] = [];
  for (const [pageIndex, page] of pdf.pages.entries()) {
    const lines = page.text.split('\n');
    let offset = 0;
    for (const line of lines) {
      const start = offset;
      offset += line.length + 1;
      if (!opinionHeading.test(compact(line))) continue;
      // An exact heading excludes summary tables and dotted table-of-contents entries.
      const excerpts: { page: number; quote: string }[] = [];
      let remaining = 2400;
      for (
        let current = pageIndex;
        current <= pageIndex + 1 && current < pdf.pages.length;
        current++
      ) {
        const source = pdf.pages[current]!;
        if (current > pageIndex && source.page !== page.page + 1) break;
        const text = source.text.slice(current === pageIndex ? start : 0);
        let end = text.length;
        let lineOffset = 0;
        for (const [index, value] of text.split('\n').entries()) {
          if (!(current === pageIndex && index === 0) && nextHeading.test(compact(value))) {
            end = lineOffset;
            break;
          }
          lineOffset += value.length + 1;
        }
        const quote = text.slice(0, Math.min(end, remaining)).trim();
        if (quote) excerpts.push({ page: source.page, quote });
        remaining -= quote.length;
        if (end < text.length || remaining <= 0) break;
      }
      const section = compact(excerpts.map((row) => row.quote).join('\n'));
      const introduction = auditIntroduction.exec(section);
      if (!introduction || !/财务报表/.test(section)) continue;
      const conclusion = section
        .slice(introduction.index + introduction[0].length)
        .search(/我们认为|我们无法|我们不对|不发表审计意见/);
      if (conclusion < 0) continue;
      const introEnd = introduction.index + introduction[0].length + conclusion;
      const intro = section.slice(introduction.index, introEnd);
      // Internal-control opinions and reports quoted about another issuer are not financial opinions.
      if (/内部控制/.test(intro) || !/财务报表/.test(intro)) continue;
      const auditedCompany = intro
        .slice(introduction[0].length)
        .match(/^([^，,（(]{2,110}?(?:股份有限公司|有限责任公司|有限公司))/)?.[1];
      if (companyName && auditedCompany && compact(companyName) !== auditedCompany) continue;
      const issuerMatched = Boolean(companyName && auditedCompany === compact(companyName));
      const years = [
        ...new Set([
          ...[...intro.matchAll(/(20\d{2})年度/g)].map((match) => Number(match[1])),
          ...[...intro.matchAll(/(20\d{2})年12月31日/g)].map((match) => Number(match[1])),
        ]),
      ];
      // A clearly different audit period is excluded instead of displayed as this year's opinion.
      if (years.length && !years.includes(year)) continue;
      const period = years.length === 1 && years[0] === year ? 'matched' : 'unconfirmed';
      candidates.push({
        issuerMatched,
        period,
        evidence: excerpts.map((row) => ({
          id: `audit-${announcement.id}-p${row.page}`,
          title: announcement.title,
          sourceUrl: announcement.sourceUrl,
          sha256: pdf.sha256,
          page: row.page,
          quote: row.quote,
          kind: 'annual-note',
          auditedYear: period === 'matched' ? year : null,
        })),
      });
    }
  }
  if (!candidates.length) {
    result.warnings.push('未定位到与本次年度相符的财务报表审计意见正文；这不表示没有审计意见。');
    return result;
  }
  const selected =
    candidates.find((item) => item.issuerMatched && item.period === 'matched') || candidates[0]!;
  result.scope.issuer =
    codeScope === 'matched' && selected.issuerMatched ? 'matched' : 'unconfirmed';
  result.scope.auditPeriod = selected.period;
  result.evidence = selected.evidence;
  result.status =
    Object.values(result.scope).every((value) => value === 'matched') && candidates.length === 1
      ? 'located'
      : 'candidate';
  if (result.status === 'candidate')
    result.warnings.push(
      '已保留候选原文，但主体、年报年度、审计期间或唯一段落尚未全部确认，请逐项核对。'
    );
  result.warnings.push(
    '这里只定位审计意见原文，不确认审计类别、资料真实性、当前偿付能力或公司是否可靠。'
  );
  return result;
}

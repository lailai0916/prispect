import type { CompanyResearchRun, Observation } from '../shared/contracts';
import type {
  CompanyFinancialContext,
  CompanyFinancialMetric,
  CompanyFinancialYear,
} from '../shared/company-market';
import { yuan } from './format';

export function amountInFen(value: string | null): bigint | null {
  if (value === null || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  if (/[1-9]/.test(fraction.slice(2))) return null;
  const fen = BigInt(whole!) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
  return value.startsWith('-') ? -fen : fen;
}

/** Historical pass markers cannot authorize unsupported currency or unit inputs. */
export function compareOriginal(
  context: CompanyFinancialContext,
  run: CompanyResearchRun,
  row: CompanyFinancialYear,
  metric: CompanyFinancialMetric
): { status: 'same' | 'different' | 'unchecked'; observation?: Observation; value?: string } {
  if (!['netProfit', 'operatingCashFlow'].includes(metric) || !run.preview || !run.identity)
    return { status: 'unchecked' };
  const normalize = (value: string) => value.normalize('NFKC').replace(/\s/g, '').toLowerCase();
  const company = run.identity.companyName;
  const material = run.preview.material;
  const scopeCheck = run.preview.checks.find((check) => check.id === `${row.year}-${metric}`);
  if (
    context.identity.status !== 'matched' ||
    context.securityCode !== run.identity.securityCode ||
    context.exchange !== run.identity.exchange ||
    !company ||
    normalize(material.company) !== normalize(company) ||
    scopeCheck?.status !== 'pass'
  )
    return { status: 'unchecked' };
  const observations = material.observations.filter(
    (item) =>
      item.key === metric &&
      item.year === row.year &&
      item.period === 'annual' &&
      item.scope === 'consolidated' &&
      item.kind === 'reported'
  );
  if (
    observations.some(
      (item) => item.currency !== 'CNY' || !['yuan', 'wan', 'yi'].includes(item.unit)
    )
  )
    return { status: 'unchecked' };
  const values = observations.map((item) => amountInFen(yuan(item.value, item.unit)));
  const webValue = amountInFen(row.amounts[metric]);
  if (
    !observations.length ||
    webValue === null ||
    values.some((value) => value === null) ||
    new Set(values.map(String)).size !== 1
  )
    return { status: 'unchecked' };
  return {
    status: webValue === values[0] ? 'same' : 'different',
    observation: observations[0],
    value: yuan(observations[0]!.value, observations[0]!.unit),
  };
}

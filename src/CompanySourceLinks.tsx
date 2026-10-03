import { ArrowUpRight } from 'lucide-react';
import { useApp } from './context';

export interface CompanySourceLink {
  url: string;
  label?: readonly [string, string];
}

function providerLabel(url: URL): readonly [string, string] {
  const host = url.hostname.toLowerCase();
  if (host === 'eastmoney.com' || host.endsWith('.eastmoney.com')) {
    if (url.searchParams.get('reportName') === 'RPT_LICO_FN_CPD')
      return ['东方财富 · 行业比较', 'Eastmoney · Industry comparison'];
    return host === 'datacenter.eastmoney.com' || host === 'datacenter-web.eastmoney.com'
      ? ['东方财富结构化取数', 'Eastmoney financial data']
      : ['东方财富', 'Eastmoney'];
  }
  if (
    host === 'sina.cn' ||
    host.endsWith('.sina.cn') ||
    host === 'sina.com.cn' ||
    host.endsWith('.sina.com.cn')
  )
    return ['新浪财经结构化取数', 'Sina Finance financial data'];
  if (host === 'cninfo.com.cn' || host.endsWith('.cninfo.com.cn'))
    return ['巨潮资讯 · 披露原文', 'CNINFO · Original disclosure'];
  return [host, host];
}

/** Link the recorded endpoints without replacing them with provider homepages. */
export function CompanySourceLinks({
  sources,
  title = ['来源', 'Sources'],
}: {
  sources: readonly CompanySourceLink[];
  title?: readonly [string, string];
}) {
  const { t } = useApp();
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const links = sources.flatMap((source) => {
    try {
      const url = new URL(source.url);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        seen.has(url.href)
      )
        return [];
      seen.add(url.href);
      const label = source.label || providerLabel(url);
      const count = (counts.get(label[0]) || 0) + 1;
      counts.set(label[0], count);
      return [{ url: source.url, label, count, explicit: Boolean(source.label) }];
    } catch {
      return [];
    }
  });
  if (!links.length) return null;
  return (
    <section className="company-source-links">
      <h3>{t(...title)}</h3>
      <ul>
        {links.map((link) => (
          <li key={link.url}>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              <span>
                {t(...link.label)}
                {!link.explicit &&
                  ((counts.get(link.label[0]) || 0) > 1 || link.label[0].endsWith('结构化取数')) &&
                  ` · ${link.count}`}
              </span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

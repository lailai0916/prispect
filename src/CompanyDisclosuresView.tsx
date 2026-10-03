import { Select } from './Select';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FileSearch } from 'lucide-react';
import type { CompanyContextSnapshot, CompanyDisclosure } from '../shared/company-workspace';
import { Dialog, Tag } from './components';
import { useApp } from './context';

export function CompanyDisclosuresView({ snapshot }: { snapshot: CompanyContextSnapshot }) {
  const { t } = useApp();
  const [days, setDays] = useState(365),
    [category, setCategory] = useState('all'),
    [attention, setAttention] = useState('material'),
    [grouped, setGrouped] = useState(true),
    [expanded, setExpanded] = useState(false),
    [evidence, setEvidence] = useState<CompanyDisclosure | null>(null);
  const categories = [
    ...new Set(
      snapshot.announcements.filter((row) => row.attention !== 'routine').map((row) => row.category)
    ),
  ];
  useEffect(() => {
    if (
      category !== 'all' &&
      !snapshot.announcements.some(
        (row) => row.attention !== 'routine' && row.category === category
      )
    ) {
      setCategory('all');
      setExpanded(false);
    }
  }, [snapshot, category]);
  const cutoff = new Date(Date.parse(snapshot.fetchedAt) - days * 86400000)
    .toISOString()
    .slice(0, 10);
  const relevant = snapshot.announcements.filter((row) => row.attention !== 'routine'),
    routine = snapshot.announcements.filter((row) => row.attention === 'routine');
  const filtered = relevant.filter(
    (row) =>
      row.date >= cutoff &&
      (category === 'all' || row.category === category) &&
      (attention === 'all' || attention === 'high'
        ? attention === 'all' || row.attention === 'high'
        : row.attention === 'high' || row.attention === 'medium')
  );
  const groups = useMemo(() => {
    const map = new Map<string, CompanyDisclosure[]>();
    for (const row of filtered) {
      const template = row.title
        .replace(/^.*?[:：]/, '')
        .replace(
          /20\d{2}年|\d+年|\d+月|\d+日|第[一二三四五六七八九十\d]+次|[\d,.]+(?:万元|亿元|%)/g,
          ''
        )
        .replace(/关于|的公告|公告|进展情况|进展|\s/g, '');
      const key = `${row.category}:${template}`;
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.values()].sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2, routine: 3 })[a[0]!.attention] -
          { high: 0, medium: 1, low: 2, routine: 3 }[b[0]!.attention] ||
        b[0]!.date.localeCompare(a[0]!.date)
    );
  }, [snapshot, cutoff, category, attention]);
  const topics = [...new Set(filtered.map((row) => row.category))].map((category) => ({
    category,
    rows: filtered.filter((row) => row.category === category),
  }));
  const sourceState = snapshot.sources.filter((source) => source.dimension.startsWith('公告'));
  const disclosureCard = (row: CompanyDisclosure, others: CompanyDisclosure[] = []) => (
    <article key={row.id} className="context-disclosure-card">
      <div>
        <Tag>{row.category}</Tag>
        <time>{row.date}</time>
        {others.length > 1 && (
          <span>
            {others.length} {t('条同类', 'similar disclosures')}
          </span>
        )}
      </div>
      <h3>{row.title}</h3>
      <p>{row.meaning}</p>
      <p className="context-material-request">
        <b>{t('下一步核实', 'Next check')}</b>
        {row.nextQuestion}
      </p>
      {row.excerpt && <blockquote>{row.excerpt.quote}</blockquote>}
      <div className="context-disclosure-actions">
        <a href={row.url} target="_blank" rel="noreferrer">
          {t('打开原文', 'Open original')}
          <ArrowUpRight size={12} />
        </a>
        <button type="button" className="text-link" onClick={() => setEvidence(row)}>
          <FileSearch size={13} />
          {row.excerpt
            ? t(`原文第 ${row.excerpt.page} 页`, `Original page ${row.excerpt.page}`)
            : t('来源与覆盖', 'Sources and coverage')}
        </button>
      </div>
      {others.length > 1 && (
        <details>
          <summary>
            {t(`查看 ${others.length} 条同类公告`, `View ${others.length} similar disclosures`)}
          </summary>
          {others.map((item) => (
            <p key={item.id}>
              <time>{item.date}</time>{' '}
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            </p>
          ))}
        </details>
      )}
    </article>
  );
  return (
    <>
      <div className="context-disclosure-counts">
        <span>
          <b>{snapshot.announcements.length}</b>
          {t('已去重公告', 'deduplicated disclosures')}
        </span>
        <span>
          <b>{relevant.length}</b>
          {t('财务相关', 'financially relevant')}
        </span>
        <span>
          <b>{routine.length}</b>
          {t('常规或待判读', 'routine or unclassified')}
        </span>
      </div>
      <p className="context-data-note">
        {t(
          '标题规则用于定位核查事项。公司角色、金额和当前进展仍需原文确认，不据此认定违约或案件结果。',
          'Title rules identify checks. Company role, amounts and current progress require original verification; classification does not establish default or case outcomes.'
        )}
      </p>
      <div className="context-filters">
        <label>
          {t('范围', 'Period')}
          <Select
            value={days}
            onValueChange={(selectedValue) => {
              setDays(Number(selectedValue));
              setExpanded(false);
            }}
          >
            <option value={90}>{t('近九十天', 'Last 90 days')}</option>
            <option value={365}>{t('近一年', 'Last year')}</option>
            <option value={1095}>{t('近三年', 'Last three years')}</option>
          </Select>
        </label>
        <label>
          {t('类别', 'Category')}
          <Select
            value={category}
            onValueChange={(selectedValue) => {
              setCategory(selectedValue);
              setExpanded(false);
            }}
          >
            <option value="all">{t('全部类别', 'All categories')}</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </Select>
        </label>
        <label>
          {t('关注度', 'Attention')}
          <Select value={attention} onValueChange={(selectedValue) => setAttention(selectedValue)}>
            <option value="material">{t('财务重点', 'Financial focus')}</option>
            <option value="high">{t('高关注', 'High attention')}</option>
            <option value="all">{t('全部相关', 'All relevant')}</option>
          </Select>
        </label>
        <div className="context-segmented" aria-label={t('公告视图', 'Disclosure view')}>
          <button type="button" aria-pressed={grouped} onClick={() => setGrouped(true)}>
            {t('同类聚合', 'Grouped')}
          </button>
          <button type="button" aria-pressed={!grouped} onClick={() => setGrouped(false)}>
            {t('逐条列表', 'List')}
          </button>
        </div>
      </div>
      <section className="context-topic-summary">
        <h2>{t(`筛选结果 · ${filtered.length} 条`, `Filtered results · ${filtered.length}`)}</h2>
        <div>
          {topics.map((topic) => (
            <span key={topic.category}>
              {topic.category} · {topic.rows.length}
            </span>
          ))}
        </div>
        {sourceState
          .filter((source) => source.status === 'partial' || source.status === 'error')
          .map((source) => (
            <p key={source.id}>
              {source.provider}：{source.note}
            </p>
          ))}
      </section>
      {!filtered.length ? (
        <p className="context-empty">
          {t(
            '当前范围没有匹配事项，可扩大日期或类别。',
            'No matching items in this range. Broaden the period or category.'
          )}
        </p>
      ) : (
        <div className="context-disclosure-list">
          {grouped
            ? (expanded ? groups : groups.slice(0, 8)).map((rows) =>
                disclosureCard(rows.find((row) => row.excerpt) || rows[0]!, rows)
              )
            : (expanded ? filtered : filtered.slice(0, 10)).map((row) => disclosureCard(row))}
        </div>
      )}
      {(grouped ? groups.length > 8 : filtered.length > 10) && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('收起', 'Show less') : t('展开筛选结果', 'Show all filtered results')}
        </button>
      )}
      <details className="context-routine">
        <summary>
          {t(
            `常规与待判读公告 · ${routine.length} 条`,
            `Routine and unclassified disclosures · ${routine.length}`
          )}
        </summary>
        <p className="muted">
          {t(
            '这些公告没有被丢弃，也没有被计为高关注事项。',
            'These records are retained without being counted as high-attention matters.'
          )}
        </p>
        {routine.map((row) => (
          <p key={row.id}>
            <time>{row.date}</time>{' '}
            <a href={row.url} target="_blank" rel="noreferrer">
              {row.title}
            </a>
          </p>
        ))}
      </details>
      {evidence && (
        <Dialog
          title={t('公告来源与摘录', 'Disclosure sources and excerpt')}
          variant="drawer"
          onClose={() => setEvidence(null)}
        >
          <h3>{evidence.title}</h3>
          <p className="muted">{evidence.date}</p>
          {evidence.excerpt ? (
            <>
              <blockquote>{evidence.excerpt.quote}</blockquote>
              <p>
                {t(
                  `PDF 第 ${evidence.excerpt.page} 页；仅读取前 ${evidence.excerpt.pagesRead} 页范围`,
                  `PDF page ${evidence.excerpt.page}; excerpt coverage limited to the first ${evidence.excerpt.pagesRead} pages`
                )}
              </p>
              <code>{evidence.excerpt.sha256}</code>
            </>
          ) : (
            <p>
              {t(
                '本次没有取得可定位摘录，保留原文入口。',
                'No locatable excerpt retrieved; the original link is retained.'
              )}
            </p>
          )}
          {evidence.sources.map((source) => (
            <p key={source.url}>
              <a className="text-link" href={source.url} target="_blank" rel="noreferrer">
                {source.provider}
                <ArrowUpRight size={12} />
              </a>
            </p>
          ))}
          <p className="muted">
            {t(
              '规则核查提示 · 摘录范围见上方标注。',
              'Rule-based check prompts · excerpt scope is labeled above.'
            )}
          </p>
        </Dialog>
      )}
    </>
  );
}

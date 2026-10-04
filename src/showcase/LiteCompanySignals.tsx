import type { CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { CompanyResearchRun } from '../../shared/contracts';
import { deriveCompanyResearchProgress } from '../../shared/company-research-view';
import { assessmentSourceHref, knownSourcePage } from '../../shared/source-excerpt-focus';
import { useApp } from '../context';
import './lite-company-signals.css';

type SignalRecord = {
  key: string;
  kind: 'announcement' | 'news' | 'discussion';
  title: string;
  date: string;
  provider: string;
  url: string;
  sources: { provider: string; url: string }[];
  digest?: string;
  excerpt?: { text: string; url: string; page?: number; readAt?: string };
  meaning?: string;
  nextQuestion?: string;
};

/** These reading panels consume the owning saved run; no navigation starts retrieval. */
function signalsAvailable(run: CompanyResearchRun): boolean {
  return (
    !run.informationGap &&
    /^\d{6}$/.test(run.input.securityCode) &&
    Number.isInteger(run.input.year) &&
    run.input.year >= 2010 &&
    run.input.year < new Date().getFullYear() &&
    deriveCompanyResearchProgress(run).snapshot !== 'mismatch'
  );
}

function sourceKey(value: string): string | undefined {
  const href = assessmentSourceHref(value);
  if (!href) return;
  const url = new URL(href);
  url.hash = '';
  return url.href;
}

function sourcesFor(rows: { provider: string; url: string }[]) {
  const sources = new Map<string, { provider: string; url: string }>();
  for (const row of rows) {
    const href = assessmentSourceHref(row.url);
    const key = sourceKey(row.url);
    if (href && key && !sources.has(key)) sources.set(key, { provider: row.provider, url: href });
  }
  return [...sources.values()];
}

function uniqueRecords(records: SignalRecord[]): SignalRecord[] {
  const result = new Map<string, SignalRecord>();
  for (const row of records) {
    if (!row.title.trim()) continue;
    const href = assessmentSourceHref(row.url);
    // Only a recorded source URL deduplicates different records. Missing links
    // retain their own stored identity; titles or similar figures never join sources.
    const key = sourceKey(href || '') || row.key;
    const previous = result.get(key);
    if (!previous) result.set(key, { ...row, key });
    else
      result.set(key, {
        ...previous,
        sources: sourcesFor([...previous.sources, ...row.sources]),
        excerpt: previous.excerpt || row.excerpt,
        digest: previous.digest || row.digest,
      });
  }
  return [...result.values()];
}

function publicItems(run: CompanyResearchRun): SignalRecord[] {
  if (!signalsAvailable(run)) return [];
  return uniqueRecords([
    ...(run.context?.announcements || []).map(
      (row): SignalRecord => ({
        key: `disclosure:${row.id}`,
        kind: 'announcement',
        title: row.title,
        date: row.date,
        provider: row.sources.find((source) => assessmentSourceHref(source.url))?.provider || '',
        url: row.url,
        sources: sourcesFor([...row.sources, { provider: '', url: row.url }]),
        meaning: row.meaning,
        nextQuestion: row.nextQuestion,
        excerpt: row.excerpt && {
          text: row.excerpt.quote,
          url: row.excerpt.url,
          page: knownSourcePage(row.excerpt.page),
        },
      })
    ),
    ...run.announcements
      .filter(
        (row) =>
          row.category !== 'annual' ||
          row.reportYear === undefined ||
          row.reportYear === run.input.year
      )
      .map(
        (row): SignalRecord => ({
          key: `announcement:${row.id}`,
          kind: 'announcement',
          title: row.title,
          date: row.publishedAt,
          provider: '',
          url: row.sourceUrl,
          sources: sourcesFor([{ provider: '', url: row.sourceUrl }]),
        })
      ),
  ]);
}

function reputationItems(run: CompanyResearchRun): SignalRecord[] {
  if (!signalsAvailable(run)) return [];
  return uniqueRecords([
    ...(run.context?.news || []).map(
      (row, index): SignalRecord => ({
        key: `news:${row.id || index}`,
        kind: 'news',
        title: row.title,
        date: row.date,
        provider: row.media || row.provider,
        url: row.url,
        sources: sourcesFor([{ provider: row.media || row.provider, url: row.url }]),
        digest: row.contentScope !== 'headline' ? row.digest : undefined,
        excerpt:
          (!row.contentScope || row.contentScope === 'media-excerpt') && row.excerpt
            ? { text: row.excerpt.text, url: row.excerpt.url, readAt: row.excerpt.readAt }
            : undefined,
      })
    ),
    ...(run.context?.discussions || [])
      .filter((row) => row.securityCode === run.input.securityCode)
      .map(
        (row): SignalRecord => ({
          key: `discussion:${row.id}`,
          kind: 'discussion',
          title: row.title,
          date: row.date,
          provider: row.provider,
          url: row.url,
          sources: sourcesFor([{ provider: row.provider, url: row.url }]),
          excerpt:
            row.textScope === 'post-excerpt' && row.excerpt
              ? { text: row.excerpt.text, url: row.excerpt.url, readAt: row.excerpt.readAt }
              : undefined,
        })
      ),
  ]);
}

function SignalRecordRow({ record, index }: { record: SignalRecord; index: number }) {
  const { t } = useApp();
  const href = assessmentSourceHref(record.url);
  const excerpt =
    record.excerpt?.text.trim() && assessmentSourceHref(record.excerpt.url, record.excerpt.page)
      ? record.excerpt
      : undefined;
  const excerptHref = excerpt && assessmentSourceHref(excerpt.url, excerpt.page);
  const dateTime = /^\d{4}-\d{2}-\d{2}(?:$|T|\s)/.test(record.date) ? record.date : undefined;
  return (
    <li data-signal-kind={record.kind} data-source-url={href}>
      <span className="signal-record-number">{String(index + 1).padStart(2, '0')}</span>
      <article className="lite-company-signal-record">
        <strong>{record.title}</strong>
        <p className="lite-company-signal-meta">
          <time dateTime={dateTime}>{record.date || t('日期未提供', 'Date unavailable')}</time>
          <span>{record.provider || t('来源未标注', 'Source unlabeled')}</span>
          <span>
            {record.kind === 'discussion'
              ? t('未核实的公众观点', 'Unverified public opinion')
              : record.kind === 'news'
                ? t('媒体线索', 'Media lead')
                : t('公司公告', 'Company disclosure')}
          </span>
        </p>
        {href ? (
          <a
            className="lite-company-signal-source"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('打开来源原文', 'Open source')}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : (
          <p>{t('未取得可打开的来源链接。', 'An available source link was not retrieved.')}</p>
        )}
        <details className="lite-company-signal-detail">
          <summary>
            {excerpt
              ? t('阅读已取得的节选', 'Read the saved excerpt')
              : record.digest
                ? t('阅读来源摘要与记录', 'Read the source digest and record')
                : t('查看来源与读取范围', 'View sources and reading scope')}
          </summary>
          {excerpt ? (
            <>
              <blockquote>{excerpt.text}</blockquote>
              <p>
                {excerpt.page !== undefined &&
                  t(`原文第 ${excerpt.page} 页 · `, `Original page ${excerpt.page} · `)}
                {t(
                  '这是已取得的节选，全文覆盖未确认。',
                  'This is a saved excerpt; full-text coverage is unconfirmed.'
                )}
              </p>
              {excerpt.readAt && <p>{t('读取时间：', 'Read at: ') + excerpt.readAt}</p>}
              {excerptHref && excerptHref !== href && (
                <a
                  className="lite-company-signal-source"
                  href={excerptHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('打开节选出处', 'Open excerpt source')}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            </>
          ) : record.digest ? (
            <>
              <p>{record.digest}</p>
              <p>
                {t(
                  '来源提供的摘要；尚未取得正文。',
                  'Source-provided digest; the article body has not been retrieved.'
                )}
              </p>
            </>
          ) : (
            <p>
              {t(
                '本条仅取得标题，请打开原文继续核对。',
                'Only the title was retrieved. Open the source to continue checking.'
              )}
            </p>
          )}
          {record.meaning && (
            <p>{t('已保存的核查提示：', 'Saved reading prompt: ') + record.meaning}</p>
          )}
          {record.nextQuestion && (
            <p>{t('接下来可核对：', 'Next check: ') + record.nextQuestion}</p>
          )}
          {record.sources.length > 0 && (
            <ul className="lite-company-signal-sources">
              {record.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.provider || t('已保存来源', 'Saved source')}
                    <span>{source.url}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </details>
      </article>
    </li>
  );
}

function SavedSignalRecords({ records }: { records: SignalRecord[] }) {
  const { t } = useApp();
  return (
    <>
      <ol className="signal-record-questions lite-company-signal-list">
        {records.slice(0, 3).map((record, index) => (
          <SignalRecordRow key={record.key} record={record} index={index} />
        ))}
      </ol>
      {records.length > 3 && (
        <details className="lite-company-signals-more">
          <summary>
            {t(
              `继续阅读其余 ${records.length - 3} 条记录`,
              `Read the other ${records.length - 3} saved records`
            )}
          </summary>
          <ol className="signal-record-questions lite-company-signal-list" start={4}>
            {records.slice(3).map((record, index) => (
              <SignalRecordRow key={record.key} record={record} index={index + 3} />
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

function SavedScope({ run }: { run: CompanyResearchRun }) {
  const { t } = useApp();
  return (
    <p className="signal-panel-note lite-company-signal-scope">
      {run.input.securityCode} ·{' '}
      {t(`${run.input.year} 年度研究`, `${run.input.year} annual research`)}
      {' · '}
      {t(
        '近期事项按原发布日期阅读，可能晚于财报年度。',
        'Recent items retain their publication dates, which may follow the financial year.'
      )}
    </p>
  );
}

function MissingSignals({ run, kind }: { run: CompanyResearchRun; kind: 'public' | 'reputation' }) {
  const { t } = useApp();
  return (
    <p className="signal-missing-note" role="status">
      {!signalsAvailable(run)
        ? t(
            '主体或研究年度未能匹配，未展示这些记录。',
            'The entity or research year does not match; these records are withheld.'
          )
        : kind === 'public'
          ? t(
              '本次尚未取得公开事项材料，不能据此认定没有事件或信用问题。',
              'Public-item material has not been retrieved for this run; this does not establish an absence of events or credit issues.'
            )
          : t(
              '本次尚未取得口碑材料，未生成评价、星级或可信度评分。',
              'Reputation material has not been retrieved for this run. No reviews, stars or credibility scores are generated.'
            )}
    </p>
  );
}

export function LiteCompanyPublicItems({ run }: { run: CompanyResearchRun }) {
  const records = publicItems(run);
  return (
    <div
      className="signal-records-panel lite-company-signals"
      data-run-id={run.id}
      data-year={run.input.year}
      data-snapshot-fetched-at={run.context?.fetchedAt}
    >
      <div className="signal-record-stack" aria-hidden="true">
        <span>01 / ENTITY</span>
        <span>02 / DATE</span>
        <span>03 / ORIGINAL</span>
      </div>
      <SavedScope run={run} />
      {records.length ? (
        <SavedSignalRecords records={records} />
      ) : (
        <MissingSignals run={run} kind="public" />
      )}
    </div>
  );
}

export function LiteCompanyReputation({ run }: { run: CompanyResearchRun }) {
  const { t } = useApp();
  const records = reputationItems(run);
  return (
    <div
      className="signal-reputation-panel lite-company-signals"
      data-run-id={run.id}
      data-year={run.input.year}
      data-snapshot-fetched-at={run.context?.fetchedAt}
    >
      <div className="signal-question-cloud">
        {[
          t('谁在说？', 'Who said it?'),
          t('什么时候？', 'When?'),
          t('亲历还是转述？', 'Firsthand or repeated?'),
        ].map((label, index) => (
          <span key={label} style={{ '--signal-item-index': index } as CSSProperties}>
            {label}
          </span>
        ))}
      </div>
      <div className="signal-reputation-filter">
        <span>{t('身份', 'Identity')}</span>
        <span>{t('时间', 'Time')}</span>
        <span>{t('出处', 'Source')}</span>
        <ArrowRight size={20} aria-hidden="true" />
        <strong>{t('再提问题', 'Ask next')}</strong>
      </div>
      <SavedScope run={run} />
      <p className="signal-panel-note">
        {t(
          '媒体与公众观点是核查线索，不能替代公司披露或已证实事实。',
          'Media reports and public opinions are research leads; they do not replace company disclosures or established facts.'
        )}
      </p>
      {records.length ? (
        <SavedSignalRecords records={records} />
      ) : (
        <MissingSignals run={run} kind="reputation" />
      )}
    </div>
  );
}

import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  deriveSourceTrust,
  type SourceReadScope,
  type SourceRelationKind,
} from '../shared/source-trust';
import type { PublicSourceState } from '../shared/company-workspace';
import { useApp } from './context';
import { date } from './format';
import './source-trust.css';

const readLabels: Record<SourceReadScope, readonly [string, string]> = {
  'source-receipt': ['来源响应记录', 'Provider response'],
  'disclosure-index': ['公告索引，未读原文', 'Disclosure index; original unread'],
  'disclosure-excerpt': ['公告原文节选', 'Disclosure excerpt'],
  headline: ['仅新闻标题', 'News headline only'],
  digest: ['媒体摘要', 'Media digest'],
  'media-excerpt': ['媒体正文节选', 'Media body excerpt'],
  'post-title': ['仅讨论标题', 'Discussion title only'],
  'post-excerpt': ['公开观点节选', 'Public opinion excerpt'],
};
const stateLabels: Record<PublicSourceState, readonly [string, string]> = {
  available: ['已取得', 'Retrieved'],
  partial: ['部分取得', 'Partly retrieved'],
  empty: ['本轮无匹配', 'No matches in this retrieval'],
  error: ['读取失败', 'Retrieval failed'],
  manual: ['待人工或授权', 'Manual or authorised check needed'],
};
const relationLabels: Record<SourceRelationKind, readonly [string, string]> = {
  'same-location': ['同一记录链接', 'Same retained location'],
  'same-cluster': ['采集时归为同组', 'Grouped by the collector'],
  'same-content': ['相同正文哈希与节选', 'Matching body hash and excerpt'],
};
const PAGE_SIZE = 12;

/** Inspects acquired public sources locally. It does not fetch, score or alter a saved report. */
export function SourceTrust({ run }: { run: CompanyResearchRun }) {
  const { t, locale } = useApp();
  const headingId = useId();
  const view = useMemo(() => deriveSourceTrust(run), [run]);
  const [paging, setPaging] = useState({ fingerprint: '', page: 0 });
  const fingerprint = `${run.id}:${view.scope}:${view.snapshotFetchedAt}:${view.rows.length}`;
  const page = paging.fingerprint === fingerprint ? paging.page : 0;
  const pages = Math.max(1, Math.ceil(view.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const rows = view.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const titles =
    view.reading.headline + view.reading['post-title'] + view.reading['disclosure-index'];
  const bodies =
    view.reading['media-excerpt'] +
    view.reading['post-excerpt'] +
    view.reading['disclosure-excerpt'];
  const renderRows = (entries: typeof rows) =>
    entries.map((row) => {
      const family = view.families.find((family) => family.memberIds.includes(row.id));
      const reasons =
        family?.relations
          .filter((relation) => relation.memberIds.includes(row.id))
          .map((relation) => relation.kind) || [];
      return (
        <tr key={row.id}>
          <td>
            <strong>{row.label || t('未命名来源', 'Unnamed source')}</strong>
            <small>{row.provider || t('来源名称未知', 'Provider unknown')}</small>
            {row.url ? (
              <a href={row.url} target="_blank" rel="noreferrer">
                {t('打开来源', 'Open source')}
                <ArrowUpRight size={12} />
              </a>
            ) : (
              <small>{t('未记录可打开的链接', 'No usable link retained')}</small>
            )}
          </td>
          <td>
            {t(...readLabels[row.scope])}
            {reasons.length > 0 && (
              <small>
                {t(
                  `已知关系组 · ${family!.memberIds.length} 条`,
                  `Known relationship group · ${family!.memberIds.length} entries`
                )}{' '}
                · {[...new Set(reasons)].map((reason) => t(...relationLabels[reason])).join(' · ')}
              </small>
            )}
            {family?.differingContent && (
              <small>
                {t(
                  '组内有不同正文记录，不能视为相同文本。',
                  'This group contains differing body records; its entries are not all the same text.'
                )}
              </small>
            )}
          </td>
          <td>
            {row.date
              ? row.date.length === 10
                ? row.date
                : date(row.date, locale)
              : t('日期未知', 'Date unknown')}
            {row.readAt && (
              <small>
                {row.kind === 'receipt' ? t('请求于', 'Requested at') : t('读取于', 'Read at')}{' '}
                {date(row.readAt, locale)}
              </small>
            )}
          </td>
          <td>
            <span className={`source-trust-state state-${row.status}`}>
              {t(...stateLabels[row.status])}
            </span>
            {row.note && <small>{row.note}</small>}
          </td>
        </tr>
      );
    });
  const renderTable = (entries: typeof rows) => (
    <div className="source-trust-table table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t('条目与出处', 'Entry and location')}</th>
            <th>{t('读取范围', 'Reading scope')}</th>
            <th>{t('记录日期', 'Record date')}</th>
            <th>{t('本轮状态', 'Retrieval status')}</th>
          </tr>
        </thead>
        <tbody>{renderRows(entries)}</tbody>
      </table>
    </div>
  );
  return (
    <section id="company-source-trust" className="source-trust" aria-labelledby={headingId}>
      <div className="source-trust-heading">
        <h2 id={headingId}>{t('来源与读取范围', 'Sources and reading scope')}</h2>
        {view.snapshotFetchedAt && (
          <span>
            {t('资料快照', 'Source snapshot')} · {date(view.snapshotFetchedAt, locale)}
          </span>
        )}
      </div>
      {view.scope === 'mismatch' ? (
        <p className="source-trust-note">
          {t(
            '主体或年度范围不一致，未采用这些来源。请先核对主体与报告年度。',
            'The issuer or annual scope does not match. These sources are withheld until the issuer and report year are checked.'
          )}
        </p>
      ) : view.scope === 'missing' ? (
        <p className="source-trust-note">
          {t(
            '尚未取得公开资料快照。没有资料不代表没有风险。',
            'No public source snapshot has been retrieved. Missing information does not establish absence of risk.'
          )}
        </p>
      ) : (
        <>
          {view.scope === 'previous' && (
            <p className="source-trust-note">
              {t(
                '以下为当前资料快照；已保存报告使用的是前次快照，不能将这些条目视为报告已经采用的依据。',
                'These are the current source records. The saved report uses an earlier snapshot; these entries are not necessarily its adopted basis.'
              )}
            </p>
          )}
          <dl className="source-trust-summary">
            <div>
              <dt>{t('已读节选', 'Retrieved excerpts')}</dt>
              <dd>{bodies}</dd>
            </div>
            <div>
              <dt>{t('摘要', 'Digests')}</dt>
              <dd>{view.reading.digest}</dd>
            </div>
            <div>
              <dt>{t('仅标题或索引', 'Titles or indexes only')}</dt>
              <dd>{titles}</dd>
            </div>
            <div>
              <dt>{t('来源读取失败', 'Failed provider reads')}</dt>
              <dd>{view.states.error}</dd>
            </div>
          </dl>
          <p className="source-trust-note">
            {t(
              '范围为下表已检查条目。节选不等于全文，媒体与公开观点不等于已证实事实；来源独立性未知，不同平台和转载条数不能视为独立印证。',
              'Counts describe the inspected entries below. Excerpts are not full documents, and media or public opinions are not verified facts. Independence is unknown; platform or repost counts do not establish independent corroboration.'
            )}
          </p>
          {view.rows.length ? (
            <details className="source-trust-detail">
              <summary>
                {t('检查逐条来源与已知关系', 'Inspect source entries and known relationships')}{' '}
                <span>({view.rows.length})</span>
              </summary>
              {renderTable(rows)}
              {pages > 1 && (
                <nav className="source-trust-paging" aria-label={t('来源分页', 'Source pages')}>
                  <button
                    type="button"
                    disabled={currentPage === 0}
                    onClick={() => setPaging({ fingerprint, page: currentPage - 1 })}
                  >
                    <ChevronLeft size={14} />
                    {t('上一页', 'Previous')}
                  </button>
                  <span aria-live="polite">
                    {currentPage + 1} / {pages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === pages - 1}
                    onClick={() => setPaging({ fingerprint, page: currentPage + 1 })}
                  >
                    {t('下一页', 'Next')}
                    <ChevronRight size={14} />
                  </button>
                </nav>
              )}
            </details>
          ) : (
            <p className="source-trust-note">
              {t('本次没有可展示的来源记录。', 'No source entries are available in this snapshot.')}
            </p>
          )}
          {view.rows.length > 0 && (
            <div className="source-trust-print" aria-hidden="true">
              {renderTable(view.rows)}
            </div>
          )}
          {(view.omitted > 0 || view.rejectedDiscussions > 0) && (
            <p className="source-trust-note">
              {view.omitted > 0 &&
                t(
                  `本视图另有 ${view.omitted} 条超出检查范围；完整资料仍在各资料页面。`,
                  `${view.omitted} entries are outside this inspection limit; full records remain in their source pages.`
                )}
              {view.rejectedDiscussions > 0 &&
                t(
                  ` ${view.rejectedDiscussions} 条讨论未通过主体或来源核对，未展示。`,
                  ` ${view.rejectedDiscussions} discussion entries failed issuer or source checks and are withheld.`
                )}
            </p>
          )}
        </>
      )}
    </section>
  );
}

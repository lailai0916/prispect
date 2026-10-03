import { productTerms } from '../../shared/product-terms';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Copy, Columns3, Plus, Trash2 } from 'lucide-react';
import type { AnalysisTask, CreateTaskInput } from '../../shared/contracts';
import { api, post } from '../api';
import { reviewVariantTitle, date } from '../format';
import { useApp } from '../context';
import { PageHeading, EmptyState, TaskTag, VerdictTag, ActionMenu } from '../components';
import { purposeName } from '../ReviewContext';
import { SearchField } from '../Experience';
import { Select } from '../Select';

type ReviewFilter = 'all' | 'active' | 'completed';

export function WorkspacePage() {
  const { t, locale, workspace, navigate, execute, confirm, busy } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState('recent');
  const tasks = workspace!.tasks
    .filter((task) =>
      `${task.title} ${task.company}`.toLowerCase().includes(search.trim().toLowerCase())
    )
    .filter(
      (task) =>
        filter === 'all' ||
        (filter === 'completed' ? task.status === 'completed' : task.status !== 'completed')
    )
    .sort((a, b) =>
      sort === 'year'
        ? b.year - a.year || b.createdAt.localeCompare(a.createdAt)
        : sort === 'name'
          ? a.title.localeCompare(b.title, locale)
          : b.createdAt.localeCompare(a.createdAt)
    );
  const filters: [ReviewFilter, string][] = [
    ['all', t('全部', 'All')],
    ['active', t('未完成', 'Incomplete')],
    ['completed', t('已完成', 'Completed')],
  ];
  const copy = async (task: AnalysisTask) => {
    const result = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: reviewVariantTitle(task.title, t('复核', 'Review copy')),
        company: task.company,
        year: task.year,
        materialIds: task.materialIds,
        excludedMetrics: task.excludedMetrics,
        purpose: task.purpose || 'external',
        useModel: true,
      } satisfies CreateTaskInput)
    );
    if (result) navigate(`/tasks/${result.id}`);
  };
  return (
    <div className="reviews-page">
      <PageHeading
        title={t(...productTerms.financialReviews)}
        action={
          <button className="button button-primary" onClick={() => navigate('/new')}>
            <Plus size={16} />
            {t(...productTerms.newFinancialReview)}
          </button>
        }
      />
      <div className="list-toolbar review-toolbar">
        <div className="list-filters" role="group" aria-label={t('核查状态', 'Review status')}>
          {filters.map(([key, label]) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
              <span className="filter-count">
                {
                  workspace!.tasks.filter(
                    (task) =>
                      key === 'all' ||
                      (key === 'completed'
                        ? task.status === 'completed'
                        : task.status !== 'completed')
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="list-toolbar-controls">
          <Select aria-label={t('排序方式', 'Sort reviews')} value={sort} onValueChange={setSort}>
            <option value="recent">{t('最近创建', 'Recently created')}</option>
            <option value="year">{t('年度优先', 'Year descending')}</option>
            <option value="name">{t('名称排序', 'Name')}</option>
          </Select>
          <SearchField
            value={search}
            onChange={setSearch}
            label={t('搜索财报核查', 'Search financial reviews')}
            placeholder={t('搜索公司或核查名称', 'Search company or review')}
          />
        </div>
      </div>
      {!tasks.length ? (
        <EmptyState
          title={
            search || filter !== 'all'
              ? t('没有匹配的核查', 'No matching reviews')
              : t('暂无财报核查', 'No financial reviews yet')
          }
          text={
            search || filter !== 'all'
              ? t('换一个搜索词，或查看全部核查。', 'Try another search or view all reviews.')
              : t(
                  '查询公司公开年报，或使用你已有的材料。',
                  'Look up public annual reports or use your own materials.'
                )
          }
          action={
            search || filter !== 'all' ? (
              <button
                className="button button-secondary"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
              >
                {t('查看全部', 'View all')}
              </button>
            ) : (
              <div className="empty-state-actions">
                <button className="button button-primary" onClick={() => navigate('/company')}>
                  {t('开始公司研究', 'Start company research')}
                  <ArrowRight size={15} />
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => navigate('/new?case=custom')}
                >
                  {t('导入材料', 'Import material')}
                </button>
              </div>
            )
          }
        />
      ) : (
        <>
          <p className="table-scroll-hint">
            {t('左右滑动查看全部列。', 'Scroll horizontally to see all columns.')}
          </p>
          <div className="table-wrap">
            <table className="review-table">
              <thead>
                <tr>
                  <th>{t('核查 / 公司', 'Review / company')}</th>
                  <th>{t('年度', 'Year')}</th>
                  <th>{t('状态', 'Status')}</th>
                  <th>{t('核查结果', 'Result')}</th>
                  <th>{t('创建时间', 'Created')}</th>
                  <th>
                    <span className="sr-only">{t('操作', 'Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <a href={`/tasks/${task.id}`} className="table-title">
                        {task.title}
                        <ArrowUpRight size={13} className="row-open-icon" aria-hidden="true" />
                      </a>
                      <span className="table-subtitle">
                        {task.company} · {purposeName(task.purpose, t)}
                      </span>
                    </td>
                    <td className="mono">{task.year}</td>
                    <td>
                      <TaskTag status={task.status} />
                    </td>
                    <td>
                      {task.report ? (
                        <VerdictTag verdict={task.report.verdict} />
                      ) : (
                        <span className="muted">
                          {task.materialIds.length} {t('份材料', 'materials')}
                        </span>
                      )}
                      {task.excludedMetrics.length > 0 && (
                        <span className="table-subtitle">
                          {t('已调整证据', 'Evidence adjusted')}
                        </span>
                      )}
                    </td>
                    <td className="mono muted">{date(task.createdAt, locale)}</td>
                    <td>
                      <ActionMenu
                        label={`${t('核查操作', 'Review actions')}: ${task.title}`}
                        items={[
                          {
                            label: t('复制并重算', 'Duplicate and rerun'),
                            icon: <Copy size={15} />,
                            disabled: busy,
                            onSelect: () => {
                              void copy(task);
                            },
                          },
                          {
                            label: t(...productTerms.compareReviews),
                            icon: <Columns3 size={15} />,
                            disabled: task.status !== 'completed',
                            onSelect: () => navigate(`/compare?left=${task.id}`),
                          },
                          {
                            label: t('删除核查', 'Delete review'),
                            icon: <Trash2 size={15} />,
                            danger: true,
                            disabled: busy,
                            onSelect: () =>
                              confirm({
                                title: t('删除这份核查？', 'Delete this review?'),
                                text: t(
                                  '这份财报核查、核查报告与跟进状态将移除，原材料保留。',
                                  'This removes the financial review, review report, and follow-up states. Source materials remain.'
                                ),
                                action: async () => {
                                  await api(`/tasks/${task.id}`, { method: 'DELETE' });
                                },
                              }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="list-summary">
            <span role="status">
              {tasks.length} {t('份核查', 'reviews')}
            </span>
            <a href="/materials" className="text-link">
              {t('管理材料', 'Manage materials')}
              <ArrowRight size={14} />
            </a>
          </div>
        </>
      )}
    </div>
  );
}

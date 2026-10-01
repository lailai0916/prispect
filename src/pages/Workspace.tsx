import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Copy, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import type { AnalysisTask, CreateTaskInput } from '../../shared/contracts';
import { api, post } from '../api';
import { reviewVariantTitle, date } from '../format';

import { useApp } from '../context';
import { PageHeading, EmptyState, TaskTag, VerdictTag } from '../components';

export function WorkspacePage() {
  const { t, locale, workspace, navigate, execute, confirm } = useApp();
  const [search, setSearch] = useState('');
  const tasks = workspace!.tasks
    .filter((task) => `${task.title} ${task.company}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const copy = async (task: AnalysisTask) => {
    const result = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: reviewVariantTitle(task.title, t('复核', 'Review copy')),
        company: task.company,
        year: task.year,
        materialIds: task.materialIds,
        excludedMetrics: task.excludedMetrics,
        useModel: false,
      } satisfies CreateTaskInput)
    );
    if (result) navigate(`/tasks/${result.id}`);
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR REVIEW DESK"
        title={t('核查工作台', 'Your review workspace')}
        description={t(
          '一次核查，保留一份材料快照。继续上次工作，或从新问题开始。',
          'Every review keeps its own evidence snapshot. Continue your work or start with a new question.'
        )}
        action={
          <button className="button button-primary" onClick={() => navigate('/new')}>
            <Plus size={17} />
            {t('新建核查', 'New review')}
          </button>
        }
      />
      <div className="workspace-stats">
        <div>
          <span>{t('核查任务', 'Reviews')}</span>
          <strong>{workspace!.tasks.length.toString().padStart(2, '0')}</strong>
        </div>
        <div>
          <span>{t('已完成', 'Completed')}</span>
          <strong>
            {workspace!.tasks
              .filter((task) => task.status === 'completed')
              .length.toString()
              .padStart(2, '0')}
          </strong>
        </div>
        <div>
          <span>{t('已保存材料', 'Saved materials')}</span>
          <strong>{workspace!.materials.length.toString().padStart(2, '0')}</strong>
        </div>
        <div className="workspace-mode">
          <ShieldCheck />
          <span>
            {t('规则核查模式', 'Rules-based review')}
            <small>
              {workspace!.provider.configured
                ? t('已配置可选模型解释', 'Optional model configured')
                : t(
                    '未配置模型 API，计算与证据核查可独立运行',
                    'No model API configured. Calculations and evidence checks run independently.'
                  )}
            </small>
          </span>
        </div>
      </div>
      <div className="list-toolbar">
        <h2>{t('全部核查', 'All reviews')}</h2>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label={t('搜索核查任务', 'Search reviews')}
            placeholder={t('搜索公司或核查名称', 'Search company or review')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {!tasks.length ? (
        <EmptyState
          title={
            search
              ? t('没有匹配的核查', 'No matching reviews')
              : t('第一条说法，等你核查。', 'Your first claim is ready for review.')
          }
          text={
            search
              ? t('尝试其他公司或名称。', 'Try a different company or title.')
              : t(
                  '选择公开年报案例，或者导入你自己的结构化材料。',
                  'Choose a public annual-report case or import your structured evidence.'
                )
          }
          action={
            !search && (
              <button className="button button-primary" onClick={() => navigate('/new')}>
                {t('开始第一份核查', 'Start your first review')}
                <ArrowRight size={16} />
              </button>
            )
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="review-table">
            <thead>
              <tr>
                <th>{t('核查任务 / 主体', 'Review / company')}</th>
                <th>{t('年度', 'Year')}</th>
                <th>{t('状态', 'Status')}</th>
                <th>{t('材料 / 结论', 'Evidence / verdict')}</th>
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
                    <a href={`#/tasks/${task.id}`} className="table-title">
                      {task.title}
                    </a>
                    <span className="table-subtitle">{task.company}</span>
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
                        {t('证据压力测试', 'Evidence stress test')}
                      </span>
                    )}
                  </td>
                  <td className="mono muted">{date(task.createdAt, locale)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        title={t(
                          '复制并重新核查，使用规则模式',
                          'Duplicate and rerun in rules mode'
                        )}
                        onClick={() => copy(task)}
                      >
                        <Copy size={17} />
                      </button>
                      <button
                        className="icon-button"
                        title={t('删除核查', 'Delete review')}
                        onClick={() =>
                          confirm({
                            title: t('删除这份核查？', 'Delete this review?'),
                            text: t(
                              '任务、报告与问题完成记录将移除，原材料保留。',
                              'This removes the review, report, and follow-up statuses. Source materials remain.'
                            ),
                            action: async () => {
                              await api(`/tasks/${task.id}`, { method: 'DELETE' });
                            },
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                      <a
                        className="icon-button"
                        aria-label={t('打开核查报告', 'Open review')}
                        href={`#/tasks/${task.id}`}
                      >
                        <ArrowUpRight size={18} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="workspace-footnote">
        <span>
          <span className="status-dot" />
          {t('个人工作区 · 自动保存', 'Personal workspace · Automatically saved')}
        </span>
        <a className="text-link" href="#/materials">
          {t('管理核查材料', 'Manage evidence')}
          <ArrowRight size={16} />
        </a>
      </div>
    </>
  );
}

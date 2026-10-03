import { ArrowRight, ChevronDown, FileSearch, LoaderCircle } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import { companyPath } from '../shared/company-workspace';
import { analyzeCompanyContext, companyCheckPriorities } from '../shared/company-analysis';
import { companyReviewSummary } from '../shared/company-review';
import { useApp } from './context';
import './company-review.css';

/** Original confirmation and private decisions remain separate from public research judgments. */
export function CompanyReview({ run }: { run: CompanyResearchRun }) {
  const { t, workspace } = useApp();
  const summary = companyReviewSummary(run);
  const active = run.status === 'queued' || run.status === 'running';
  const original = companyPath(run.id, 'evidence');
  const saved = workspace?.tasks
    .filter(
      (task) =>
        run.adoptedMaterialId &&
        task.materialIds.includes(run.adoptedMaterialId) &&
        task.year === run.input.year &&
        task.status === 'completed'
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const sameEntity =
    run.context?.securityCode === run.input.securityCode && run.context.orgId === run.input.orgId;
  const priorities =
    sameEntity && run.context
      ? companyCheckPriorities(run.context, analyzeCompanyContext(run.context, 'consolidated'))
      : [];
  const originalState = active
    ? t('原件读取中', 'Reading originals')
    : run.status === 'adopted'
      ? t('材料已采用', 'Evidence adopted')
      : run.preview
        ? t('候选待确认', 'Candidates need confirmation')
        : t('原件待补齐', 'Originals incomplete');
  const originalExplanation = active
    ? t(
        '年报原件正在后台读取，已取得材料与进度可在核查记录中查看。',
        'Annual-report originals are being read. Retrieved evidence and progress are in the review record.'
      )
    : run.status === 'adopted'
      ? t(
          '原件材料已保留在个人材料中心，可继续查看采用结果与已保存报告。',
          'Adopted original evidence is retained in your materials. Its confirmation and saved reports remain accessible.'
        )
      : run.preview
        ? t(
            '已取得原件候选。核对年度、单位、合并范围和金额后，可采用并生成核查报告。',
            'Original candidates are available. Confirm the year, units, consolidated scope and amounts before adoption.'
          )
        : run.informationGap
          ? t(
              '尚未定位支持的上市主体。请补充准确主体与有权使用的财务原件。',
              'A supported listed issuer was not located. Add the correct entity and authorized financial originals.'
            )
          : t(
              '本次原件尚不完整。查看读取记录，或补充自己的财务材料。',
              'Original evidence is incomplete. Inspect the retrieval record or add your own financial records.'
            );
  return (
    <div className="company-review company-review-evidence" data-testid="company-review">
      <div className="company-review-section-heading">
        <h3>{t('原件与后续材料', 'Originals and follow-up evidence')}</h3>
        <span className="company-review-state">
          {active && <LoaderCircle size={12} className="spinner" aria-hidden="true" />}
          {originalState}
        </span>
      </div>
      <p className="company-review-evidence-description">{originalExplanation}</p>
      <div className="company-review-actions">
        <a className="button button-secondary" href={original}>
          <FileSearch size={14} />
          {run.preview && run.status !== 'adopted'
            ? t('确认年报原件', 'Confirm original report')
            : t('查看原件核查', 'Open original review')}
        </a>
        {saved && (
          <a className="text-link" href={'/tasks/' + saved.id}>
            {t('已保存的原件报告', 'Saved original-evidence report')}
            <ArrowRight size={13} />
          </a>
        )}
        {run.informationGap && (
          <a className="text-link" href="/new?case=custom">
            {t('导入财务材料', 'Import financial records')}
            <ArrowRight size={13} />
          </a>
        )}
      </div>
      <details id="company-review-requests" className="company-review-checklist">
        <summary>
          <ChevronDown size={14} />
          {t('需要核对的材料', 'Evidence checklist')}
          {priorities.length > 0 && <span>{priorities.length}</span>}
        </summary>
        <div className="company-review-requests">
          {priorities.length ? (
            <ol>
              {priorities.map((item) => (
                <li key={item.id}>
                  <h3>{t(...item.title)}</h3>
                  <p>{t(...item.materials)}</p>
                  <p className="company-review-source-note">{t(...item.question)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              {t(
                '先取得同年度财务资料，并核对本次交易或交接所需的直接材料。',
                'Obtain same-year financial records and the direct evidence needed for this transaction or handover.'
              )}
            </p>
          )}
          <p className="company-review-source-note">
            {t(
              '以上为待核对材料，尚不能视为已取得或已证实。',
              'These are requested records, not evidence already obtained or authenticated.'
            )}
          </p>
        </div>
      </details>
      <div className="company-review-private-step">
        <p>
          {run.input.purpose === 'handover'
            ? t(
                '安排交接时，另核对当前现金、到期收付款与回款依据。',
                'For a handover, separately confirm current cash, dated payments and collection evidence.'
              )
            : t(
                '涉及付款时，另核对签约主体、收款账户、交付和退款条款。',
                'Before a payment, separately check the contracting entity, payee account, delivery and refund terms.'
              )}
          {summary.relation === 'below' && (
            <span>
              {' '}
              {t(
                '公开金额的差额仍需用期后回款、账龄和存货资料解释。',
                'The public-data gap still requires subsequent collections, ageing and inventory records.'
              )}
            </span>
          )}
        </p>
        <a className="text-link" href={'/decisions?new=' + (run.input.purpose || 'external')}>
          {run.input.purpose === 'handover'
            ? t('建立交接事项', 'Start a handover matter')
            : t('建立付款事项', 'Start a payment matter')}
          <ArrowRight size={13} />
        </a>
      </div>
    </div>
  );
}

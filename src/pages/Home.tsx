import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

import { money } from '../format';

import { useApp } from '../context';

export function Home() {
  const { t, locale, examples, navigate } = useApp();
  const sample = examples.find((item) => item.kind === 'contrast');
  const year = sample?.year;
  const p = sample?.metrics.find((item) => item.key === 'netProfit')?.value ?? null;
  const c = sample?.metrics.find((item) => item.key === 'operatingCashFlow')?.value ?? null;
  const profitGrowth = sample?.metrics.find((item) => item.key === 'profitGrowth')?.value ?? null;
  const cashGrowth = sample?.metrics.find((item) => item.key === 'cashGrowth')?.value ?? null;
  const ratio = p && c && Number(p) > 0 ? (Number(c) / Number(p)) * 100 : null;
  return (
    <>
      <section className="hero section-shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-square" />
            CASH EVIDENCE, NOT A GUESS
          </div>
          <h1>
            {t('利润很好。', 'Profit looks good.')}
            <br />
            <span>{t('现金呢？', 'What about cash?')}</span>
          </h1>
          <p className="hero-description">
            {t(
              '合作之前，先核查年度合并利润与现金。照见把两者之间的落差，变成可追溯的证据、两种解释和下一步要问的问题。',
              'Before a partnership, review annual consolidated profit and cash. CashLens turns the gap between them into traceable evidence, competing explanations, and the questions to ask next.'
            )}
          </p>
          <div className="hero-actions">
            <button
              className="button button-primary button-large"
              onClick={() => navigate(`/new${sample ? `?case=${sample.id}` : ''}`)}
            >
              {t('核查一个真实案例', 'Review a real case')}
              <ArrowUpRight size={20} />
            </button>
            <a className="text-link" href="#/method">
              {t('了解核查方法', 'Explore the method')}
              <ArrowRight size={17} />
            </a>
          </div>
          <div className="hero-trust">
            <ShieldCheck size={16} />
            {t(
              '每个数值有出处，每个判断有边界。',
              'A source for every number. A boundary for every conclusion.'
            )}
          </div>
        </div>
        <div className="hero-evidence">
          <div className="hero-paper-head">
            <span className="paper-label">
              {t('真实公开年报 · 合并口径', 'PUBLIC ANNUAL REPORT · CONSOLIDATED')}
            </span>
            <span className="mono">01 / CASH GAP</span>
          </div>
          <div className="hero-company">
            <h2>{sample?.shortName || t('公开案例', 'Public case')}</h2>
            <span>
              {year || '—'} {t('年度', 'FY')}
              <ArrowUpRight size={18} />
            </span>
          </div>
          <div className="hero-money-row">
            <div>
              <span>{t('净利润', 'Net profit')}</span>
              <strong>
                {money(p, locale)}
                <small>CNY</small>
              </strong>
            </div>
            <div className="money-bar profit-bar" style={{ width: '100%' }} />
            {profitGrowth !== null && (
              <span className="hero-growth">
                {t('同比', 'Year over year')}{' '}
                <strong>
                  {Number(profitGrowth) > 0 ? '+' : ''}
                  {Number(profitGrowth).toFixed(2)}%
                </strong>
              </span>
            )}
          </div>
          <div className="hero-money-row cash-row">
            <div>
              <span>{t('经营活动现金净额', 'Operating cash flow')}</span>
              <strong>
                {money(c, locale)}
                <small>CNY</small>
              </strong>
            </div>
            <div
              className="money-bar cash-bar"
              style={{ width: ratio === null ? '0%' : `${Math.max(4, Math.min(100, ratio))}%` }}
            />
            {cashGrowth !== null && (
              <span className="hero-growth">
                {t('同比', 'Year over year')}{' '}
                <strong>
                  {Number(cashGrowth) > 0 ? '+' : ''}
                  {Number(cashGrowth).toFixed(2)}%
                </strong>
              </span>
            )}
          </div>
          <div className="hero-gap">
            <div>
              <span>{t('利润现金转化', 'Cash conversion')}</span>
              <strong>{ratio === null ? '—' : `${ratio.toFixed(2)}%`}</strong>
            </div>
            <p>
              {t(
                '利润增长，不等于现金已收回。差距的原因，需要继续核查。',
                'Profit growth does not prove cash collection. The reason for the gap needs evidence.'
              )}
            </p>
          </div>
          <div className="paper-footer">
            <FileText size={15} />
            <span>
              {sample
                ? t(sample.source.title, `${year} annual report · Consolidated cash-flow notes`)
                : t('正在读取来源', 'Loading source')}
            </span>
            {sample?.source.url && (
              <a href={sample.source.url} target="_blank" rel="noreferrer">
                {t('原件', 'Source')}
                <ArrowUpRight size={12} />
              </a>
            )}
          </div>
          <div className="hero-note">
            <span className="note-dash" />
            {t('这是一条核查线索，不是一张信用评级。', 'A line of inquiry, not a credit rating.')}
          </div>
        </div>
      </section>
      <section className="home-process section-shell">
        <div className="section-heading">
          <span className="eyebrow">THE REVIEW WORKFLOW</span>
          <h2>{t('看见差距，也看清依据。', 'See the gap. Understand the evidence.')}</h2>
          <p>
            {t(
              '从一条说法开始，直到一个具体问题。',
              'Start with a claim. Finish with a concrete question.'
            )}
          </p>
        </div>
        <div className="process-grid">
          {[
            [
              FileText,
              t('确认材料与口径', 'Confirm evidence and scope'),
              t(
                '公司、期间、单位、合并范围，先对齐再计算。',
                'Align company, period, unit, and consolidation scope before calculating.'
              ),
            ],
            [
              Layers,
              t('打开现金桥与原件', 'Open the cash bridge and sources'),
              t(
                '数值与原文同屏。解释哪里有依据、哪里还不能确认。',
                'Keep numbers and original evidence together. See what is supported and what is still uncertain.'
              ),
            ],
            [
              SlidersHorizontal,
              t('让结论接受压力测试', 'Put the conclusion under stress'),
              t(
                '移除一组证据，重新核查。材料减少，结论也必须收缩。',
                'Remove a group of observations and rerun. Less evidence must mean a narrower conclusion.'
              ),
            ],
          ].map(([Icon, title, description], i) => {
            const Symbol = Icon as typeof FileText;
            return (
              <article className="process-item" key={i}>
                <span className="step-number">0{i + 1}</span>
                <Symbol size={24} />
                <h3>{title as string}</h3>
                <p>{description as string}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="home-bottom section-shell">
        <div>
          <div className="eyebrow">A BETTER QUESTION</div>
          <h2>
            {t('不是「这家公司靠谱吗」，', 'Beyond “Is this company reliable?”')}
            <br />
            {t('而是「这笔利润，为什么还没变成现金？」', '“Why has this profit not become cash?”')}
          </h2>
        </div>
        <button className="button button-light" onClick={() => navigate('/workspace')}>
          {t('进入工作台', 'Open workspace')}
          <ArrowRight size={18} />
        </button>
      </section>
    </>
  );
}

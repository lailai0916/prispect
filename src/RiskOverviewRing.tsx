import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  FileCheck2,
  MessageSquareText,
  Play,
  Square,
  TriangleAlert,
  Zap,
} from 'lucide-react';

import type { Report } from '../shared/contracts';
import { useApp } from './context';
import {
  deriveRiskPerspective,
  type RiskDimension,
  type RiskMetric,
  type RiskStatus,
} from './riskDimensions';
import './ring-perspective.css';

const statusColor: Record<RiskStatus, string> = {
  good: '#34d399',
  warn: '#f5b942',
  bad: '#ef4444',
  unknown: '#8a8f98',
};

/** 易懂版结论短词（人话） */
const plainTitle: Record<RiskStatus, { zh: string; en: string }> = {
  good: { zh: '没问题', en: 'Looks fine' },
  warn: { zh: '要留意', en: 'Watch' },
  bad: { zh: '有风险', en: 'Risk' },
  unknown: { zh: '待查清', en: 'Incomplete' },
};

/** 各维度中心展示的代表性指标（真实 metrics 下标） */
const repMetricIndex: Record<string, number> = { finance: 2, credit: 1, reputation: 0, risk: 0 };

const dimIcons = {
  finance: BadgeDollarSign,
  credit: FileCheck2,
  reputation: MessageSquareText,
  risk: Zap,
};

const dimOrder: RiskDimension['key'][] = ['finance', 'credit', 'reputation', 'risk'];

interface ReputationData {
  count: number;
  items: { title: string; url: string }[];
}

/** 美股最新季度（10-Q）数据，来自 /api/company-quarter（SEC XBRL 结构化） */
interface SecQuarterData {
  available: boolean;
  periodLabel: string;
  fiscalLabel: string;
  reportDate: string;
  filingDate: string;
  sourceUrl: string;
  netProfit: string | null;
  operatingCashFlow: string | null;
  cashConversion: string | null;
  quoteProfit: string;
  quoteCash: string;
}

/** 从报告快照中识别 SEC 材料并提取 CIK（美股专用，A股返回 null 不打扰） */
function secCikOf(report: Report): string | null {
  for (const material of report.snapshot ?? []) {
    const url = material.sourceUrl ?? '';
    const match = /sec\.gov\/Archives\/edgar\/data\/(\d{1,10})\//.exec(url);
    if (match) return match[1];
  }
  return null;
}

function metricNumber(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(%|条|项|处)?$/.exec(value.trim());
  return m ? Number(m[1]) : null;
}

/**
 * 易懂版第一部分：科技大环四维总览。
 * 深色科技风：背景粒子流 + 旋转刻度环 + 四段状态环 + 中心双星环 + 彗星流光，
 * 点按四维切换中心图形；数据全部来自报告真实推导，不引入虚构值。
 */
export function RiskOverviewRing({ report }: { report: Report }) {
  const { t, locale } = useApp();
  const perspective = useMemo(() => deriveRiskPerspective(report, locale), [report, locale]);
  const reduceMotion =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const [revealed, setRevealed] = useState(reduceMotion);
  const [current, setCurrent] = useState(-1);
  const [hoverDim, setHoverDim] = useState(-1);
  const [autoOn, setAutoOn] = useState(false);
  const [period, setPeriod] = useState<'annual' | 'quarter'>('annual');
  const [quarter, setQuarter] = useState<SecQuarterData | null>(null);
  const autoTimer = useRef<number | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const touchX = useRef(0);
  const touchY = useRef(0);

  /* 美股最新季度（10-Q）：从报告快照识别 CIK，拉取季度口径财务数据 */
  useEffect(() => {
    const cik = secCikOf(report);
    if (!cik) return;
    let alive = true;
    void fetch(`/api/company-quarter?orgId=${cik}&name=${encodeURIComponent(report.company)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SecQuarterData>) : null))
      .then((data) => {
        if (alive) setQuarter(data);
      })
      .catch(() => {
        if (alive) setQuarter(null);
      });
    return () => {
      alive = false;
    };
  }, [report]);

  /* 季度口径下财务段状态（年初至今累计，阈值与年报一致） */
  const quarterFinanceStatus: RiskStatus | null = useMemo(() => {
    if (!quarter?.cashConversion) return null;
    const conversion = Number(quarter.cashConversion);
    const net = quarter.netProfit != null ? Number(quarter.netProfit) : null;
    if (net != null && net < 0) return 'bad';
    if (Number.isFinite(conversion)) {
      if (conversion >= 100) return 'good';
      if (conversion >= 70) return 'warn';
      return 'bad';
    }
    return null;
  }, [quarter]);

  /* X-Ray 扫描开场 → 显影 */
  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setTimeout(() => setRevealed(true), 1750);
    return () => window.clearTimeout(id);
  }, [reduceMotion]);

  /* 背景粒子流 */
  useEffect(() => {
    if (reduceMotion) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'ringp-fx';
    const host = ringRef.current?.parentElement;
    host?.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = 0;
    let H = 0;
    let raf = 0;
    const dots: {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      a: number;
      c: string;
    }[] = [];
    const size = () => {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      W = canvas.width = rect.width;
      H = canvas.height = rect.height;
    };
    size();
    const mk = (y0?: number) => ({
      x: Math.random() * W,
      y: y0 !== undefined ? y0 : Math.random() * H,
      r: Math.random() * 1.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.14,
      vy: -Math.random() * 0.22 - 0.03,
      a: Math.random() * 0.07 + 0.04,
      c: Math.random() < 0.6 ? '245,185,66' : '56,189,248',
    });
    for (let i = 0; i < 26; i++) dots.push(mk());
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < dots.length; i++) {
        const p = dots[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -6 || p.x < -6 || p.x > W + 6) {
          dots[i] = mk(H + 6);
          continue;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = `rgba(${p.c},${p.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      host?.removeChild(canvas);
    };
  }, [reduceMotion]);

  /* 自动演示 */
  const stopAuto = () => {
    if (autoTimer.current !== null) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
    setAutoOn(false);
  };
  const startAuto = () => {
    stopAuto();
    setCurrent(-1);
    setAutoOn(true);
    let step = 0;
    const play = () => {
      if (step > 3) {
        stopAuto();
        setCurrent(-1);
        return;
      }
      setCurrent(step);
      step += 1;
      autoTimer.current = window.setTimeout(play, 2600);
    };
    autoTimer.current = window.setTimeout(play, 2600);
  };

  /* 键盘左右切换 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = current + (e.key === 'ArrowRight' ? 1 : -1);
      if (next < -1 || next > 3) return;
      stopAuto();
      setCurrent(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  useEffect(
    () => () => {
      if (autoTimer.current !== null) window.clearTimeout(autoTimer.current);
    },
    []
  );

  const overall = perspective.overall;
  const overallColor = statusColor[overall.status];
  const overallWord = plainTitle[overall.status];
  const activeDim = current >= 0 ? current : hoverDim;
  const dim = current >= 0 ? perspective.dimensions[current] : null;

  const onNode = (i: number) => {
    stopAuto();
    setCurrent(i);
  };

  return (
    <section
      className={`ring-perspective${revealed ? ' ringp-revealed' : ''}`}
      aria-label={t('四维风险总览（易懂版）', 'Risk overview (plain view)')}
    >
      <div className="ringp-head">
        <span className="ringp-kicker">{t('四维透视 · 第一眼结论', 'Risk at a glance')}</span>
        <span className="ringp-scope">{t(overall.scope.zh, overall.scope.en)}</span>
        {quarter?.available && (
          <span className="ringp-period" role="group" aria-label={t('数据期间', 'Period')}>
            <button
              type="button"
              className={period === 'annual' ? 'is-on' : ''}
              onClick={() => setPeriod('annual')}
              title={t('依据年度年报', 'Based on annual report')}
            >
              {report.year} {t('年报', 'FY')}
            </button>
            <button
              type="button"
              className={period === 'quarter' ? 'is-on' : ''}
              onClick={() => setPeriod('quarter')}
              title={`${quarter.fiscalLabel}（${quarter.periodLabel}）`}
            >
              {t('最新季度', 'Latest Q')} · {quarter.fiscalLabel.replace(/（.*/, '')}
            </button>
          </span>
        )}
        <button
          type="button"
          className={`ringp-auto${autoOn ? ' is-on' : ''}`}
          onClick={autoOn ? stopAuto : startAuto}
          aria-label={t('自动演示', 'Auto demo')}
          title={t('自动演示', 'Auto demo')}
        >
          {autoOn ? <Square size={12} /> : <Play size={12} />}
        </button>
      </div>

      <div className="ringp-stage">
        <div
          className={`ringp-ring-wrap${current >= 0 ? ' ringp-dim' : ''}`}
          ref={ringRef}
          onClick={() => {
            if (current < 0) return;
            stopAuto();
            setCurrent(-1);
          }}
          aria-label={t('四维风险总览环，点按回到总览', 'Risk ring; click to return to overview')}
        >
          {!revealed && (
            <div className="ringp-scan" aria-hidden="true">
              <svg viewBox="0 0 240 240" className="ringp-scan-ring">
                <circle
                  cx="120"
                  cy="120"
                  r="92"
                  fill="none"
                  stroke="rgba(56,189,248,.35)"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                  className="ringp-scan-spin"
                />
              </svg>
              <div className="ringp-scan-line" />
              <div className="ringp-scan-txt">X-RAY</div>
            </div>
          )}

          <svg className="ringp-ticks" viewBox="0 0 240 240" aria-hidden="true">
            <circle
              cx="120"
              cy="120"
              r="108"
              stroke="rgba(255,255,255,.10)"
              strokeWidth="1"
              strokeDasharray="2 7"
              fill="none"
            />
            <circle
              cx="120"
              cy="120"
              r="76"
              stroke="rgba(255,255,255,.05)"
              strokeWidth="1"
              strokeDasharray="1 9"
              fill="none"
            />
          </svg>

          <svg className="ringp-main" viewBox="0 0 240 240" aria-hidden="true">
            <circle className="ringp-bg" cx="120" cy="120" r="92" />
            {perspective.dimensions.map((d, i) => (
              <circle
                key={d.key}
                className={`ringp-seg${activeDim === i ? ' hot' : ''}`}
                cx="120"
                cy="120"
                r="92"
                transform={`rotate(${i * 90 - 90} 120 120)`}
                style={{
                  stroke:
                    i === 0 && period === 'quarter' && quarterFinanceStatus
                      ? statusColor[quarterFinanceStatus]
                      : statusColor[d.status],
                }}
              />
            ))}
            <circle r="2.4" fill="#eaf6ff" className="ringp-comet">
              <animateMotion
                dur="7s"
                repeatCount="indefinite"
                path="M120,28 a92,92 0 1,1 0,184 a92,92 0 1,1 0,-184"
              />
            </circle>
          </svg>

          <div className="ringp-orbit" aria-hidden="true">
            <div className="ringp-o1" />
            <div className="ringp-o2" />
          </div>

          <div className="ringp-hub">
            {current < 0 ? (
              <div className="ringp-core" key="def">
                <span className="ringp-warn-ico">
                  <TriangleAlert size={42} strokeWidth={1.8} style={{ color: overallColor }} />
                </span>
                <strong className="ringp-big" style={{ color: overallColor }}>
                  {t(overallWord.zh, overallWord.en)}
                </strong>
              </div>
            ) : (
              <DimensionCenter
                key={`${dim!.key}-${period}`}
                dimension={dim!}
                reportCompany={report.company}
                quarter={quarter}
                period={period}
              />
            )}
            <div className="ringp-hint">
              {current < 0 ? (
                t('点四个圆圈看细节', 'Tap the four circles for details')
              ) : period === 'quarter' && dim?.key === 'finance' && quarter?.sourceUrl ? (
                <>
                  <a
                    className="ringp-src"
                    href={quarter.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('10-Q 原文 ↗', '10-Q filing ↗')}
                  </a>
                  <span className="ringp-hint-sep">·</span>
                  <span>{t('点环回总览', 'Tap the ring to return')}</span>
                </>
              ) : (
                t('点环回总览', 'Tap the ring to return')
              )}
            </div>
          </div>

          <span className="ringp-bracket ringp-b-tl" />
          <span className="ringp-bracket ringp-b-tr" />
          <span className="ringp-bracket ringp-b-bl" />
          <span className="ringp-bracket ringp-b-br" />
        </div>

        <div className="ringp-nodes">
          {perspective.dimensions.map((d, i) => {
            const Icon = dimIcons[d.key];
            const effStatus =
              i === 0 && period === 'quarter' && quarterFinanceStatus
                ? quarterFinanceStatus
                : d.status;
            const word = plainTitle[effStatus];
            const on = current === i;
            return (
              <button
                key={d.key}
                type="button"
                className={`ringp-node${on ? ' is-on' : ''}`}
                onClick={() => onNode(i)}
                onMouseEnter={() => setHoverDim(i)}
                onMouseLeave={() => setHoverDim(-1)}
                aria-label={`${t(d.plain.zh, d.plain.en)} · ${t(word.zh, word.en)}`}
              >
                <span className="ringp-node-ico" style={{ color: statusColor[effStatus] }}>
                  <Icon size={25} strokeWidth={1.8} />
                </span>
                <span className="ringp-node-status" style={{ color: statusColor[effStatus] }}>
                  <i style={{ background: statusColor[effStatus] }} />
                  {t(word.zh, word.en)}
                </span>
                <span className="ringp-node-label">{t(d.plain.zh, d.plain.en)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="ringp-note">
        {t(
          '结论由已核验的证据状态推导 · 只讲事实 · 不评级 · 不劝买不劝卖',
          'Derived from verified evidence · facts only · no rating · no buy/sell advice'
        )}
      </p>
    </section>
  );
}

/** 维度中心图形：财务进度 / 来源三格 / 口碑圆点 / 风险双信号 */
function DimensionCenter({
  dimension,
  reportCompany,
  quarter,
  period,
}: {
  dimension: RiskDimension;
  reportCompany: string;
  quarter: SecQuarterData | null;
  period: 'annual' | 'quarter';
}) {
  const { t, locale } = useApp();
  const index = repMetricIndex[dimension.key] ?? 0;
  const metric = dimension.metrics[index];
  const number = metric ? metricNumber(metric.value) : null;

  if (dimension.key === 'finance') {
    /* 最新季度（10-Q）：中心显示季度现金利润比，口径为年初至今累计 */
    if (period === 'quarter' && quarter?.cashConversion != null) {
      const qv = `${quarter.cashConversion}%`;
      const qn = Math.min(Number(quarter.cashConversion), 100);
      return (
        <div className="ringp-core">
          <AnimatedNumber value={qv} />
          <span className="ringp-meter">
            <i style={{ width: `${qn}%` }} />
          </span>
          <span className="ringp-sub">
            {t('最新季度 · 年初至今累计', 'Latest quarter · YTD cumulative')}
          </span>
        </div>
      );
    }
    return (
      <div className="ringp-core">
        <AnimatedNumber value={metric?.value ?? '—'} />
        <span className="ringp-meter">
          <i style={{ width: `${Math.min(number ?? 0, 100)}%` }} />
        </span>
        <span className="ringp-sub">{t(dimension.summary.zh, dimension.summary.en)}</span>
      </div>
    );
  }

  if (dimension.key === 'credit') {
    const gaps = dimension.metrics.filter((m) => m.tone !== 'good').length;
    const allUnknown = dimension.metrics.every((m) => m.tone === 'plain' || m.tone === 'unknown');
    const bigText =
      allUnknown || dimension.metrics.length === 0
        ? t('待查', 'Pending')
        : gaps === 0
          ? t('全齐', 'Complete')
          : t(`缺 ${gaps} 项`, `${gaps} missing`);
    return (
      <div className="ringp-core">
        <div className="ringp-credit-dots" aria-hidden="true">
          {dimension.metrics.map((m: RiskMetric, i: number) => (
            <i
              key={i}
              className={`ringp-credit-dot${m.tone === 'good' ? ' ok' : m.tone === 'warn' ? ' warn' : ' unk'}`}
            />
          ))}
        </div>
        <span className="ringp-big ringp-big-sm">{bigText}</span>
        <span className="ringp-sub">{t(dimension.summary.zh, dimension.summary.en)}</span>
      </div>
    );
  }

  if (dimension.key === 'reputation') {
    return <ReputationCenter dimension={dimension} reportCompany={reportCompany} />;
  }

  /* risk */
  return (
    <div className="ringp-core">
      <div className="ringp-signals" aria-hidden="true">
        <i style={{ background: statusColor[dimension.status] }} />
        <i style={{ background: statusColor[dimension.status] }} />
      </div>
      <span className="ringp-big ringp-big-sm">{metric?.value ?? '—'}</span>
      <span className="ringp-sub">{t(dimension.summary.zh, dimension.summary.en)}</span>
    </div>
  );
}

function ReputationCenter({
  dimension,
  reportCompany,
}: {
  dimension: RiskDimension;
  reportCompany: string;
}) {
  const { t } = useApp();
  const [rep, setRep] = useState<ReputationData | null>(null);
  const metric = dimension.metrics[0];
  const count = rep?.count ?? 0;
  const dots = count > 0 ? Math.min(count, 12) : 6;
  useEffect(() => {
    let alive = true;
    void fetch(`/api/company-reputation?q=${encodeURIComponent(reportCompany)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ReputationData>) : null))
      .then((data) => {
        if (alive) setRep(data);
      })
      .catch(() => {
        if (alive) setRep(null);
      });
    return () => {
      alive = false;
    };
  }, [reportCompany]);
  return (
    <div className="ringp-core">
      <div className="ringp-dots" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} className={i < dots ? 'lit' : ''} />
        ))}
      </div>
      <span className="ringp-big ringp-big-sm">
        {count > 0 ? `${count} ${t('条', 'items')}` : (metric?.value ?? '—')}
      </span>
      <span className="ringp-sub">
        {count > 0
          ? t('只看报道 · 不下判断', 'Listed only · no judgment')
          : t(dimension.summary.zh, dimension.summary.en)}
      </span>
    </div>
  );
}

/** 数字滚动（仅对数值/百分比） */
function AnimatedNumber({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const m = useMemo(() => /^(\d+(?:\.\d+)?)(\s*(%|条|项|处))?$/.exec(value.trim()), [value]);
  const reduceMotion =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!m) {
      el.textContent = value;
      return;
    }
    const target = Number(m[1]);
    const suffix = m[2] ?? '';
    if (reduceMotion) {
      el.textContent = `${target.toFixed(target % 1 === 0 ? 0 : 2)}${suffix}`;
      return;
    }
    const t0 = performance.now();
    const dur = 1100;
    const step = (ts: number) => {
      const p = Math.min((ts - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = target * eased;
      el.textContent = `${v.toFixed(v % 1 === 0 && p >= 1 ? 0 : 2)}${suffix}`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, reduceMotion, m]);

  return (
    <span ref={ref} className="ringp-big" style={{ color: 'var(--ringp-big-color, #ffd98a)' }} />
  );
}

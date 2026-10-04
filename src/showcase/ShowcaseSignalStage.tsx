import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowRight, ArrowUpRight, FileText, Layers, MessageCircle, ScanLine } from 'lucide-react';
import { contextFen, contextYuan } from '../../shared/company-analysis';
import { landingExample } from '../cinematic/landing-content';
import { useApp } from '../context';
import { liteAmountDisplay, liteAmountScale } from './lite-amount-display';
import './showcase-signal-stage.css';

type Channel = 'finance' | 'public' | 'reputation' | 'original';
const channels: Channel[] = ['finance', 'public', 'reputation', 'original'];
const colors = {
  finance: [76, 141, 255],
  public: [76, 141, 255],
  reputation: [76, 141, 255],
  original: [76, 141, 255],
} as const;
const profitFen = contextFen(landingExample.summary.profit);
const cashFen = contextFen(landingExample.summary.cash);
if (profitFen === null || cashFen === null)
  throw new Error('Signal stage requires exact source amounts.');
const difference = contextYuan(profitFen - cashFen);
// Floating point is used only for the length of the illustrative same-scale bars.
const cashWidth =
  (Number(landingExample.summary.cash) / Number(landingExample.summary.profit)) * 100;

/** Decorative local geometry, without any research or financial-data requests. */
export function SignalField({ channel }: { channel: Channel }) {
  const surface = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = surface.current;
    const stage = canvas?.closest<HTMLElement>('.showcase-signal-stage');
    const context = canvas?.getContext('2d');
    if (!canvas || !stage) return;
    stage.dataset.signalRendering = context ? 'canvas' : 'static';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    let width = 0;
    let height = 0;
    let frame = 0;
    let previousTime = 0;
    let previousPaint = 0;
    let time = 0;
    let inView = false;
    let disposed = false;
    const aim = { x: 0, y: 0 };
    const position = { x: 0, y: 0 };
    const [red, green, blue] = colors[channel];
    const tint = (alpha: number) => `rgba(${red},${green},${blue},${alpha})`;
    const active = () => !reduced.matches && !document.hidden && inView;

    const draw = () => {
      if (!context || !width || !height) return;
      context.clearRect(0, 0, width, height);
      const shift = position.x * 9;
      context.lineWidth = 1;
      context.strokeStyle = tint(0.07);
      for (let x = 0; x < width; x += 48) {
        context.beginPath();
        context.moveTo(x + shift, 0);
        context.lineTo(x + shift, height);
        context.stroke();
      }
      for (let y = 0; y < height; y += 48) {
        context.beginPath();
        context.moveTo(0, y + position.y * 6);
        context.lineTo(width, y + position.y * 6);
        context.stroke();
      }
      // These tracks are a stage texture, not a company relationship graph.
      for (let track = 0; track < 5; track++) {
        const baseline = height * (0.2 + track * 0.15);
        context.beginPath();
        for (let index = 0; index <= 64; index++) {
          const x = (index / 64) * width;
          const phase = index / 9 + time * 0.2 + track;
          const offset =
            channel === 'reputation'
              ? Math.sin(phase) * 15
              : channel === 'public'
                ? Math.sin(phase) * 5
                : channel === 'original'
                  ? 0
                  : Math.cos(phase) * 9;
          const y = baseline + offset + position.y * 5;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = tint(0.08);
        context.stroke();
        const x = reduced.matches
          ? width * 0.7
          : ((time * 28 + track * width * 0.19) % (width + 120)) - 60;
        const glow = context.createLinearGradient(x - 65, 0, x + 15, 0);
        glow.addColorStop(0, tint(0));
        glow.addColorStop(0.75, tint(0.35));
        glow.addColorStop(1, tint(0));
        context.strokeStyle = glow;
        context.stroke();
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (!active() || disposed) return;
      if (previousTime) time += Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      if (now - previousPaint >= 1000 / 24) {
        position.x += (aim.x - position.x) * 0.09;
        position.y += (aim.y - position.y) * 0.09;
        draw();
        previousPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const reconcile = () => {
      if (disposed) return;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      stage.dataset.signalMotion = active() ? 'active' : 'paused';
      draw();
      if (active() && context) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const density = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.max(1, Math.round(width * density));
      canvas.height = Math.max(1, Math.round(height * density));
      context?.setTransform(density, 0, 0, density, 0, 0);
      stage.dataset.signalReady = 'true';
      reconcile();
    };
    const move = (event: PointerEvent) => {
      if (!finePointer.matches || reduced.matches) return;
      const bounds = stage.getBoundingClientRect();
      aim.x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2;
      aim.y = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2;
    };
    const leave = () => {
      aim.x = 0;
      aim.y = 0;
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        reconcile();
      },
      { threshold: 0.02 }
    );
    const resizer = new ResizeObserver(resize);
    observer.observe(stage);
    resizer.observe(stage);
    stage.addEventListener('pointermove', move, { passive: true });
    stage.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', reconcile);
    reduced.addEventListener('change', reconcile);
    resize();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizer.disconnect();
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', reconcile);
      reduced.removeEventListener('change', reconcile);
    };
  }, [channel]);
  return <canvas ref={surface} className="signal-field" aria-hidden="true" />;
}

function OriginalPanel({ onOpenSource }: { onOpenSource: () => void }) {
  const { t } = useApp();
  const [page, setPage] = useState(0);
  const crop = landingExample.source.crops[page];
  return (
    <div className="signal-original-panel">
      <div className="signal-original-tabs" aria-label={t('选择原件页码', 'Select original page')}>
        {landingExample.source.crops.map((item, index) => (
          <button
            key={item.page}
            type="button"
            aria-pressed={page === index}
            onClick={() => setPage(index)}
          >
            <FileText size={14} aria-hidden="true" />
            {t(`第 ${item.page} 页`, `Page ${item.page}`)}
          </button>
        ))}
      </div>
      <button
        className="signal-original-sheet"
        type="button"
        onClick={onOpenSource}
        aria-label={t(
          '放大查看松原安全 2025 年报原件',
          'Enlarge the original Songyuan 2025 annual report'
        )}
      >
        <img
          key={crop.page}
          src={crop.src}
          width={crop.width}
          height={crop.height}
          alt={t(...crop.alt)}
          loading="lazy"
        />
        <span className="signal-original-corner" aria-hidden="true">
          <ArrowUpRight size={18} />
        </span>
      </button>
      <div className="signal-original-caption">
        <span>{t(...crop.caption)}</span>
        <span>PDF / {crop.page}</span>
      </div>
      <p className="signal-panel-note">
        {t(
          '回到原表，核对名称、年度、口径和金额。',
          'Check the original labels, year, scope and amounts.'
        )}
      </p>
    </div>
  );
}

export function ShowcaseSignalStage({
  onOpenSource,
  initialChannel = 'finance',
  initialScene = 0,
}: {
  onOpenSource: () => void;
  initialChannel?: Channel;
  initialScene?: 0 | 1 | 2;
}) {
  const { t, locale } = useApp();
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [scene, setScene] = useState<number>(initialScene);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const scale = liteAmountScale(
    [landingExample.summary.profit, landingExample.summary.cash, difference],
    locale
  );
  const profitDisplay = liteAmountDisplay(landingExample.summary.profit, locale, { scale })!;
  const cashDisplay = liteAmountDisplay(landingExample.summary.cash, locale, { scale })!;
  const differenceDisplay = liteAmountDisplay(difference, locale, { scale })!;
  const tabs = [
    { id: 'finance' as const, label: t('财务', 'Finance'), icon: Layers },
    { id: 'public' as const, label: t('公开事项', 'Public records'), icon: ScanLine },
    { id: 'reputation' as const, label: t('口碑线索', 'Reputation'), icon: MessageCircle },
    { id: 'original' as const, label: t('原文', 'Original'), icon: FileText },
  ];
  const question =
    channel === 'finance'
      ? scene === 1
        ? t('利润与现金的差距，还需要核对什么？', 'What needs checking behind the profit–cash gap?')
        : t('账面上的利润，留下了多少现金？', 'How much profit became operating cash?')
      : channel === 'public'
        ? t('一条公开记录，指向什么问题？', 'What question does a public record raise?')
        : channel === 'reputation'
          ? t('一句评价，值得相信多少？', 'What would make a claim worth trusting?')
          : t('每个数字，都应该能找到来处。', 'Every number should lead to its source.');
  const selectTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setChannel(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      className="showcase-signal-stage showcase-evidence-values"
      data-lite-card
      data-channel={channel}
      data-scene={scene}
      style={{ '--signal-accent': `rgb(${colors[channel].join(',')})` } as CSSProperties}
    >
      <SignalField channel={channel} />
      <div
        className="signal-channel-tabs"
        role="tablist"
        aria-label={t('探索不同公司线索', 'Explore company information channels')}
      >
        {tabs.map(({ id: key, label, icon: Icon }, index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-${key}-tab`}
            aria-controls={`${id}-${key}-panel`}
            aria-selected={channel === key}
            tabIndex={channel === key ? 0 : -1}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            onKeyDown={(event) => selectTab(event, index)}
            onClick={() => setChannel(key)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {channels.map((key) => (
        <div
          key={key}
          role="tabpanel"
          id={`${id}-${key}-panel`}
          aria-labelledby={`${id}-${key}-tab`}
          hidden={channel !== key}
          tabIndex={0}
          className="signal-channel-panel"
        >
          {channel === key && (
            <>
              <div className="signal-stage-context">
                <span className="signal-context-dot" aria-hidden="true" />
                <span>
                  {key === 'finance' || key === 'original'
                    ? t(...landingExample.notices.sample)
                    : t(
                        '能力示意 · 此处未取得相关资料',
                        'Capability preview · records not obtained here'
                      )}
                </span>
                <span className="signal-context-code">
                  {key === 'finance' || key === 'original'
                    ? landingExample.company.code
                    : t('待取得', 'NOT OBTAINED')}
                </span>
              </div>
              <h3 key={question} className="signal-stage-question">
                <span>{question}</span>
              </h3>
              {(key === 'finance' || key === 'original') && (
                <p className="signal-scope">
                  {t(...landingExample.notices.scope)} ·{' '}
                  {t('不是当前查询结果', 'Not a current query result')}
                </p>
              )}
              {key === 'finance' && (
                <>
                  <dl className="signal-finance-facts">
                    <div>
                      <dt>{t('合并净利润', 'Consolidated net profit')}</dt>
                      <dd title={profitDisplay.exactText} aria-label={profitDisplay.exactText}>
                        <span>{profitDisplay.text}</span>
                      </dd>
                      <span className="signal-fact-source">
                        {t('原件第 190 页', 'Original · page 190')}
                      </span>
                    </div>
                    <div>
                      <dt>{t('经营现金净额', 'Operating cash flow')}</dt>
                      <dd title={cashDisplay.exactText} aria-label={cashDisplay.exactText}>
                        <span>{cashDisplay.text}</span>
                      </dd>
                      <span className="signal-fact-source">
                        {t('原件第 191 页', 'Original · page 191')}
                      </span>
                    </div>
                  </dl>
                  <div
                    className="signal-scene-controls"
                    role="group"
                    aria-label={t('选择财务展示画面', 'Choose a financial view')}
                  >
                    {[
                      t('看数字', 'Numbers'),
                      t('看差异', 'Difference'),
                      t('追原文', 'Original'),
                    ].map((label, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-pressed={scene === index}
                        onClick={() => setScene(index)}
                      >
                        <span aria-hidden="true">0{index + 1}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div
                    className="signal-finance-scene"
                    key={scene}
                    data-finance-view={
                      scene === 0 ? 'numbers' : scene === 1 ? 'difference' : 'source'
                    }
                  >
                    {scene === 0 && (
                      <>
                        <div className="signal-comparison" aria-hidden="true">
                          <div className="signal-bar-ruler">
                            <span>0</span>
                            <span title={profitDisplay.exactText}>{profitDisplay.text}</span>
                          </div>
                          <div className="signal-bar-row">
                            <span>{t('利润', 'Profit')}</span>
                            <div className="signal-bar-track">
                              <div className="signal-bar signal-bar-profit" />
                            </div>
                          </div>
                          <div className="signal-bar-row">
                            <span>{t('经营现金', 'Operating cash')}</span>
                            <div className="signal-bar-track">
                              <div
                                className="signal-bar signal-bar-cash"
                                style={{ '--signal-bar-width': `${cashWidth}%` } as CSSProperties}
                              />
                            </div>
                          </div>
                        </div>
                        <p className="signal-panel-note">
                          {t(
                            '两条横线使用同一金额刻度。利润与经营现金是不同指标。',
                            'Both bars use the same monetary scale. Profit and operating cash are different measures.'
                          )}
                        </p>
                      </>
                    )}
                    {scene === 1 && (
                      <div className="signal-difference-panel">
                        <div className="signal-equation" aria-hidden="true">
                          <span>{t('合并净利润', 'Net profit')}</span>
                          <span>−</span>
                          <span>{t('经营现金净额', 'Operating cash')}</span>
                          <ArrowRight size={18} />
                        </div>
                        <p className="signal-difference-label">
                          {t('两项指标的金额差', 'Difference between the two amounts')}
                        </p>
                        <p className="signal-difference-amount">
                          <span
                            title={differenceDisplay.exactText}
                            aria-label={differenceDisplay.exactText}
                          >
                            {differenceDisplay.text}
                          </span>
                        </p>
                        <p className="signal-panel-note">
                          {t(
                            '由上述两项相减得到。金额差提出问题，不证明经营原因，也不代表亏损或资金缺口。',
                            'Calculated by subtracting the two amounts above. It raises a question; it does not establish a business cause, loss or funding shortfall.'
                          )}
                        </p>
                      </div>
                    )}
                    {scene === 2 && <OriginalPanel onOpenSource={onOpenSource} />}
                  </div>
                  <details className="signal-exact-data">
                    <summary>{t('核对精确金额', 'Check the exact amounts')}</summary>
                    <dl>
                      {[
                        [
                          t(
                            '合并净利润 · 原件第 190 页',
                            'Consolidated profit · original page 190'
                          ),
                          profitDisplay.exactText,
                        ],
                        [
                          t('经营现金净额 · 原件第 191 页', 'Operating cash · original page 191'),
                          cashDisplay.exactText,
                        ],
                        [
                          t('上述两项相减 · 计算值', 'Difference of the two amounts · calculated'),
                          differenceDisplay.exactText,
                        ],
                      ].map(([label, amount]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{amount}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                  {scene !== 2 && (
                    <button className="signal-source-action" type="button" onClick={onOpenSource}>
                      <span>{t('打开两项数字的原件', 'Open the original source')}</span>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </button>
                  )}
                </>
              )}
              {key === 'public' && (
                <div className="signal-records-panel">
                  <div className="signal-record-stack" aria-hidden="true">
                    <span>01 / ENTITY</span>
                    <span>02 / DATE</span>
                    <span>03 / ORIGINAL</span>
                  </div>
                  <ol className="signal-record-questions">
                    {[
                      [
                        t('先对主体', 'Match the entity'),
                        t('记录说的是同一家公司吗？', 'Does the record name the same company?'),
                      ],
                      [
                        t('再看时间', 'Check the date'),
                        t('何时发生，之后是否有更新？', 'When did it occur? Has it been updated?'),
                      ],
                      [
                        t('回到原文', 'Read the original'),
                        t(
                          '原记录写了什么，哪些还不能下结论？',
                          'What does it say? What remains unresolved?'
                        ),
                      ],
                    ].map(([label, detail], index) => (
                      <li key={label}>
                        <span className="signal-record-number">0{index + 1}</span>
                        <div>
                          <strong>{label}</strong>
                          <p>{detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="signal-missing-note">
                    {t(
                      '这个历史示例未取得公开事项材料；这里展示阅读路径，不展示公司的事件或信用结论。',
                      'Public-record material is not obtained for this example. This shows a reading route, not company events or a credit conclusion.'
                    )}
                  </p>
                </div>
              )}
              {key === 'reputation' && (
                <div className="signal-reputation-panel">
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
                  <p className="signal-panel-note">
                    {t(
                      '一条评论可以是一条线索。先核对对象和出处，再看能否被其他材料支持。',
                      'A comment can be a lead. Check its subject and source, then look for supporting material.'
                    )}
                  </p>
                  <p className="signal-missing-note">
                    {t(
                      '这个历史示例未取得口碑材料；不生成评价、星级或可信度评分。',
                      'Reputation material is not obtained for this example. No reviews, stars or credibility scores are generated.'
                    )}
                  </p>
                </div>
              )}
              {key === 'original' && <OriginalPanel onOpenSource={onOpenSource} />}
            </>
          )}
        </div>
      ))}
      <p className="signal-stage-status" role="status">
        {t('当前展示：', 'Showing: ')}
        {tabs.find((tab) => tab.id === channel)?.label}
        {channel === 'finance'
          ? ` · ${[t('数字', 'Numbers'), t('差异', 'Difference'), t('原文', 'Original')][scene]}`
          : ''}
      </p>
    </div>
  );
}

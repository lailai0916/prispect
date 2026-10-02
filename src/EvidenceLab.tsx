import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileSearch,
  FileText,
  FlaskConical,
  LoaderCircle,
  Pause,
  RotateCcw,
  ScanLine,
  X,
} from 'lucide-react';
import {
  evaluateEvidenceLab,
  highlightEvidenceLab,
  type EvidenceLabGraph,
  type LabHypothesisId,
  type LabNode,
  type LabSource,
} from '../shared/evidence-lab';
import {
  companyChallengeDefinitions,
  type ChallengeClue,
  type CompanyChallengeState,
} from '../shared/company-challenge';
import { Dialog } from './components';
import { useApp } from './context';
import { money } from './format';
import './evidence-lab.css';

export type EvidenceLabProps = {
  graph: EvidenceLabGraph;
  compact?: boolean;
  example?: boolean;
  challenge?: CompanyChallengeState;
  onChallenge?: (target: LabHypothesisId) => void;
  challengeDisabled?: boolean;
  onStartResearch?: () => void;
};

type Connection = { id: string; path: string };
const stages = [
  { kind: 'fact', label: ['原文事实', 'Source facts'] },
  { kind: 'calculation', label: ['计算关系', 'Calculations'] },
  { kind: 'hypothesis', label: ['待检验解释', 'Explanations to test'] },
  { kind: 'material', label: ['所需材料', 'Required records'] },
] as const;

function sourceHref(source: LabSource): string | undefined {
  try {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    if (source.page && Number.isSafeInteger(source.page) && source.page > 0)
      url.hash = `page=${source.page}`;
    return url.href;
  } catch {
    return;
  }
}

/** Sources are gathered from actual upstream dependencies, never from sibling explanations. */
function dependencySources(graph: EvidenceLabGraph, selected: LabNode | undefined): LabSource[] {
  const sources = new Map<string, LabSource>();
  const visited = new Set<string>();
  const visit = (node: LabNode | undefined) => {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);
    node.sourceRefs.forEach((source) => sources.set(source.id, source));
    node.dependsOn.forEach((id) => visit(graph.nodes.find((item) => item.id === id)));
  };
  visit(selected);
  return [...sources.values()];
}

export function EvidenceLab({
  graph,
  compact = false,
  example = false,
  challenge,
  onChallenge,
  challengeDisabled = false,
  onStartResearch,
}: EvidenceLabProps) {
  const { t, locale } = useApp();
  const [withdrawn, setWithdrawn] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(graph.defaultSelectionId);
  const [inspectedClue, setInspectedClue] = useState<ChallengeClue | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const canvas = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const markerId = 'lab-arrow-' + useId().replace(/:/g, '');
  const fingerprint = useMemo(
    () =>
      JSON.stringify([
        graph.company,
        graph.year,
        graph.snapshotFetchedAt,
        graph.nodes.map((node) => [node.id, node.baseState, node.baseValue, node.sourceRefs]),
      ]),
    [graph]
  );
  useEffect(() => {
    setWithdrawn([]);
    setSelectedId(graph.defaultSelectionId);
    setInspectedClue(null);
    setSourceId(null);
    setInspectorOpen(false);
  }, [fingerprint, graph.defaultSelectionId]);
  useEffect(() => {
    const element = canvas.current?.closest('.evidence-lab');
    if (!element) return;
    const sync = () => setMobile(element.getBoundingClientRect().width <= 620);
    const observer = new ResizeObserver(sync);
    sync();
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setInspectedClue(null), [challenge?.result?.generatedAt]);
  const evaluated = useMemo(() => evaluateEvidenceLab(graph, withdrawn), [graph, withdrawn]);
  const selected = evaluated.nodes.find((node) => node.id === selectedId);
  const highlighted = useMemo(
    () => highlightEvidenceLab(evaluated, selectedId),
    [evaluated, selectedId]
  );
  const highlightedNodes = new Set(highlighted.nodeIds);
  const highlightedEdges = new Set(highlighted.edgeIds);
  const challengeResult = challenge?.result;
  const researchLoading = challenge?.status === 'loading';
  const resultMatches =
    challengeResult?.year === graph.year &&
    (!graph.snapshotFetchedAt || challengeResult.snapshotFetchedAt === graph.snapshotFetchedAt);
  const visibleResult = resultMatches ? challengeResult : undefined;
  const selectedSources = useMemo(() => {
    if (inspectedClue && visibleResult) {
      const ids = new Set([
        ...inspectedClue.evidenceIds,
        ...visibleResult.metrics
          .filter((metric) => inspectedClue.metricIds.includes(metric.id))
          .flatMap((metric) => metric.evidenceIds),
      ]);
      return visibleResult.evidence.filter((source) => ids.has(source.id));
    }
    return dependencySources(evaluated, selected);
  }, [evaluated, selected, inspectedClue, visibleResult]);
  const selectedSource =
    selectedSources.find((source) => source.id === sourceId) || selectedSources[0];
  const mainMetrics = [
    `fact-${graph.year}-netProfit`,
    `fact-${graph.year}-ocf`,
    'calc-cash-profit',
  ].flatMap((id) => {
    const node = evaluated.nodes.find((item) => item.id === id);
    return node ? [node] : [];
  });
  const activeHypothesis = selected?.hypothesisId;
  const researchInapplicable =
    evaluated.nodes.find((node) => node.id === `hypothesis-${activeHypothesis}`)?.state ===
    'not-applicable';
  const displayedNodes = compact
    ? evaluated.nodes.filter(
        (node) =>
          node.kind === 'hypothesis' ||
          (node.kind === 'material' && node.hypothesisId === (activeHypothesis || 'expansion')) ||
          highlightedNodes.has(node.id) ||
          mainMetrics.some((metric) => metric.id === node.id) ||
          node.id === 'calc-profit-cash-gap'
      )
    : evaluated.nodes;
  const displayedNodeIds = displayedNodes.map((node) => node.id).join('|');

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = element.getBoundingClientRect();
        const paths = evaluated.edges.flatMap((edge) => {
          const from = nodeRefs.current.get(edge.from);
          const to = nodeRefs.current.get(edge.to);
          if (!from || !to || !from.isConnected || !to.isConnected) return [];
          const a = from.getBoundingClientRect();
          const b = to.getBoundingClientRect();
          if (!a.width || !b.width) return [];
          const visible = (rect: DOMRect, node: HTMLElement) => {
            const lane = node.closest('.lab-lane-nodes')?.getBoundingClientRect();
            return !lane || (rect.bottom > lane.top && rect.top < lane.bottom);
          };
          if (!visible(a, from) || !visible(b, to)) return [];
          const across = b.left > a.right - 3;
          const x1 = (across ? a.right : a.left + a.width / 2) - bounds.left;
          const y1 = (across ? a.top + a.height / 2 : a.bottom) - bounds.top;
          const x2 = (across ? b.left : b.left + b.width / 2) - bounds.left;
          const y2 = (across ? b.top + b.height / 2 : b.top) - bounds.top;
          const bend = across ? Math.max(12, (x2 - x1) / 2) : Math.max(10, Math.abs(y2 - y1) / 3);
          return [
            {
              id: edge.id,
              path: across
                ? `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
                : `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
            },
          ];
        });
        setConnections(paths);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    nodeRefs.current.forEach((node) => observer.observe(node));
    element.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [evaluated, displayedNodeIds, locale]);

  const selectNode = (node: LabNode) => {
    setSelectedId(node.id);
    setInspectedClue(null);
    setSourceId(null);
    if (mobile) setInspectorOpen(true);
  };
  const valueText = (node: LabNode) =>
    node.value === null
      ? '—'
      : node.unit === 'percent'
        ? `${node.value}%`
        : node.unit === 'CNY'
          ? money(node.value, locale)
          : node.value;
  const stateText = (node: LabNode) => {
    if (node.materialStatus === 'needed') return t('尚未取得', 'Not obtained');
    if (node.state === 'withdrawn') return t('试验中已撤回', 'Withdrawn in trial');
    if (node.state === 'paused') return t('依赖暂停', 'Dependency paused');
    if (node.state === 'missing') return t('缺少依据', 'Evidence missing');
    if (node.state === 'conflict') return t('来源冲突', 'Source conflict');
    if (node.state === 'not-applicable') return t('不适用', 'Not applicable');
    if (node.kind === 'hypothesis') return t('待检验', 'Untested');
    return node.kind === 'calculation' ? t('已计算', 'Calculated') : t('可核对', 'Inspectable');
  };
  const sourceQuality = (source: LabSource) =>
    source.sourceQuality === 'excerpt'
      ? t('原文摘录', 'Source excerpt')
      : source.sourceQuality === 'web'
        ? t('网页字段', 'Web field')
        : t('标题线索', 'Headline lead');
  const clueText = (clue: ChallengeClue) =>
    clue.text[locale === 'en' ? 'en' : 'zh'].replace(
      /\{\{metric:([^{}]+)\}\}/g,
      (_, id: string) => {
        const metric = visibleResult?.metrics.find((item) => item.id === id);
        return metric ? t(...metric.display) : t('数据未取得', 'Data unavailable');
      }
    );
  const researchAction = activeHypothesis ? (
    <div className="lab-challenge-action">
      {onChallenge ? (
        <button
          className="button button-primary"
          disabled={
            challengeDisabled ||
            researchInapplicable ||
            researchLoading ||
            selected?.state === 'paused' ||
            withdrawn.length > 0
          }
          onClick={() => onChallenge(activeHypothesis)}
        >
          {researchLoading && challenge?.target === activeHypothesis ? (
            <LoaderCircle size={14} className="spinner" />
          ) : (
            <ScanLine size={14} />
          )}
          {researchLoading && challenge?.target === activeHypothesis
            ? t('正在定向补查', 'Researching this explanation')
            : t('挑战这个解释', 'Challenge this explanation')}
        </button>
      ) : (
        <button
          className="button button-secondary"
          onClick={onStartResearch}
          disabled={!onStartResearch || researchInapplicable}
        >
          <FileSearch size={14} />
          {t('查询公司并挑战', 'Look up a company to challenge')}
        </button>
      )}
      <p>
        {researchInapplicable
          ? t(
              '本年度未形成正利润、低经营现金的组合，无需按低现金原因补查。',
              'This year does not show positive profit with lower operating cash. Researching a low-cash cause is not applicable.'
            )
          : withdrawn.length > 0
            ? t(
                '先恢复试验中撤回的事实，再按已保存的公开资料补查。',
                'Restore the withdrawn facts before researching the saved public data.'
              )
            : onChallenge
              ? t(
                  '定向寻找支持与反向线索；没有材料的部分继续保留缺口。',
                  'Search for supporting and counter clues. Unobtained records remain gaps.'
                )
              : example
                ? t(
                    '当前是公开原件示例，尚未执行定向补查。',
                    'This is a public-report example; targeted research has not run.'
                  )
                : t(
                    '此处只进行依据试验；定向补查需另查询公开公司。',
                    'This view is an evidence trial. Look up a public company separately for targeted research.'
                  )}
      </p>
    </div>
  ) : null;
  const inspectorTitle = inspectedClue
    ? t('研究线索的依据', 'Evidence for a research clue')
    : selected
      ? t(...selected.label)
      : t('选择一条线索', 'Select a clue');
  const inspector = (
    <div className="lab-inspector-content">
      <div className="lab-inspector-heading">
        <span>
          <FileText size={13} />
          {t('来源与依赖', 'Sources and dependencies')}
        </span>
        <h3>{inspectorTitle}</h3>
      </div>
      {inspectedClue ? (
        <>
          <p className="lab-inspector-detail">{clueText(inspectedClue)}</p>
          <button
            className="text-link"
            onClick={() => {
              setInspectedClue(null);
              setSourceId(null);
            }}
          >
            {t('返回所选路径', 'Return to the selected path')}
          </button>
        </>
      ) : selected ? (
        <>
          <div className={'lab-inspector-state lab-state-' + selected.state}>
            {['paused', 'withdrawn'].includes(selected.state) && <Pause size={12} />}
            {stateText(selected)}
          </div>
          {selected.value !== null && (
            <div className="lab-inspector-value">
              <strong>{valueText(selected)}</strong>
              {selected.unit === 'CNY' && <small>{t('人民币', 'CNY')}</small>}
              {selected.unit === 'CNY' && (
                <span>
                  {money(selected.value, locale, false)} {t('元', 'CNY')}
                </span>
              )}
            </div>
          )}
          {selected.formula && <p className="lab-inspector-formula">{t(...selected.formula)}</p>}
          <p className="lab-inspector-detail">{t(...selected.detail)}</p>
          {selected.reason && (
            <p className="lab-paused-reason" role="status">
              {t(...selected.reason)}
            </p>
          )}
          {researchAction}
          {selected.dependsOn.length > 0 && (
            <div className="lab-inputs">
              <span>{t('依赖', 'Depends on')}</span>
              {selected.dependsOn.map((id) => {
                const input = evaluated.nodes.find((node) => node.id === id);
                return input ? (
                  <button key={id} onClick={() => selectNode(input)}>
                    {t(...input.label)}
                    <ArrowRight size={11} />
                  </button>
                ) : null;
              })}
            </div>
          )}
          {selected.kind === 'fact' && selected.baseState === 'available' && (
            <button
              className="button button-secondary lab-withdraw"
              onClick={() => {
                setWithdrawn((current) =>
                  current.includes(selected.id)
                    ? current.filter((id) => id !== selected.id)
                    : [...current, selected.id]
                );
                if (mobile) setInspectorOpen(false);
              }}
            >
              {selected.state === 'withdrawn' ? <RotateCcw size={13} /> : <Pause size={13} />}
              {selected.state === 'withdrawn'
                ? t('在试验中恢复', 'Restore in trial')
                : t('在试验中撤回', 'Withdraw in trial')}
            </button>
          )}
          {activeHypothesis && (
            <div className="lab-distinguishing-records">
              <h4>{t('区分两种解释需要', 'Records that distinguish explanations')}</h4>
              <ul>
                {companyChallengeDefinitions[activeHypothesis].materials.map((material) => (
                  <li key={material.id}>
                    <strong>{t(...material.label)}</strong>
                    <span>{t(...material.purpose)}</span>
                    <small>{t('尚未取得', 'Not obtained')}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
      <section className="lab-source-section" aria-label={t('对应来源', 'Corresponding sources')}>
        <h4>
          {t('对应来源', 'Corresponding sources')}
          <span>{selectedSources.length}</span>
        </h4>
        {selected?.kind === 'hypothesis' && !inspectedClue && (
          <p className="lab-source-empty">
            {t(
              '这些来源支撑底层金额，尚未证明本解释。',
              'These sources support the underlying amounts, not this explanation.'
            )}
          </p>
        )}
        {selectedSources.length > 1 && (
          <div
            className="lab-source-tabs"
            role="group"
            aria-label={t('选择来源', 'Select a source')}
          >
            {selectedSources.map((source, index) => (
              <button
                key={source.id}
                className={selectedSource?.id === source.id ? 'selected' : ''}
                onClick={() => setSourceId(source.id)}
                aria-pressed={selectedSource?.id === source.id}
                title={source.label}
              >
                {index + 1}
                {source.page ? t(` · 第 ${source.page} 页`, ` · p. ${source.page}`) : ''}
              </button>
            ))}
          </div>
        )}
        {selectedSource ? (
          <div className="lab-source-document" key={selectedSource.id}>
            <div>
              <FileText size={13} />
              <strong>{selectedSource.label}</strong>
            </div>
            <p className="lab-source-quality">
              {sourceQuality(selectedSource)}
              {selectedSource.page
                ? t(` · 第 ${selectedSource.page} 页`, ` · Page ${selectedSource.page}`)
                : ''}
            </p>
            {selectedSource.quote ? (
              <blockquote>{selectedSource.quote}</blockquote>
            ) : (
              <p>
                {t('当前来源未提供可定位的原文摘录。', 'This source has no locatable excerpt.')}
              </p>
            )}
            {sourceHref(selectedSource) && (
              <a href={sourceHref(selectedSource)} target="_blank" rel="noreferrer">
                {selectedSource.sourceQuality === 'web'
                  ? t('打开网页来源', 'Open the web source')
                  : t('打开原文', 'Open the original')}
                <ArrowUpRight size={13} />
              </a>
            )}
          </div>
        ) : (
          <p className="lab-source-empty">
            {selected?.kind === 'material'
              ? t(
                  '这是一项材料请求；尚未取得该材料。关联公开线索不能替代它。',
                  'This is a record request. Related public clues do not replace the unobtained record.'
                )
              : t(
                  '当前节点没有可定位的来源，不能据此确认解释。',
                  'This node has no locatable source; it cannot confirm an explanation.'
                )}
          </p>
        )}
      </section>
    </div>
  );
  const clueGroup = (items: ChallengeClue[], label: string, kind: string) => (
    <section className={'lab-clue-group lab-clue-' + kind}>
      <h4>
        {label}
        <span>{items.length}</span>
      </h4>
      {items.length ? (
        <ol>
          {items.map((clue) => (
            <li key={clue.id}>
              <p>{clueText(clue)}</p>
              <button
                className="text-link"
                onClick={() => {
                  setInspectedClue(clue);
                  setSourceId(null);
                  if (mobile) setInspectorOpen(true);
                }}
              >
                <FileSearch size={12} />
                {t('查看依据', 'Inspect evidence')}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {t(
            '本轮尚未形成有来源支持的线索；不能据此认定没有相关情况。',
            'This run has not produced source-supported clues. This does not establish the absence of such circumstances.'
          )}
        </p>
      )}
    </section>
  );

  return (
    <section
      className={'evidence-lab' + (compact ? ' evidence-lab-compact' : '')}
      aria-label={t('企业证据实验室', 'Company evidence lab')}
      data-testid="evidence-lab"
    >
      <header className="lab-header">
        <div>
          <FlaskConical size={16} />
          <h2>{t('企业证据实验室', 'Company evidence lab')}</h2>
        </div>
        <span>
          {graph.company} · {graph.year} · {t('合并口径', 'Consolidated')}
        </span>
      </header>
      <div className="lab-key-metrics">
        {mainMetrics.map((node) => (
          <button
            key={node.id}
            className={
              'lab-key-metric' +
              (selectedId === node.id ? ' selected' : '') +
              ' lab-state-' +
              node.state
            }
            onClick={() => selectNode(node)}
            aria-pressed={selectedId === node.id}
          >
            <span>{t(...node.label)}</span>
            <strong>{valueText(node)}</strong>
            <small>
              {node.unit === 'percent'
                ? t('经营现金 ÷ 合并净利润', 'Operating cash / net profit')
                : t('人民币 · 合并口径', 'CNY · consolidated')}
            </small>
            {['paused', 'withdrawn', 'missing', 'conflict', 'not-applicable'].includes(
              node.state
            ) && <em>{stateText(node)}</em>}
          </button>
        ))}
      </div>
      <div className="lab-trial-toolbar" role="status">
        <span>
          <FlaskConical size={12} />
          {withdrawn.length
            ? t(
                `本地试验 · ${withdrawn.length} 条事实已撤回，${evaluated.nodes.filter((node) => node.state === 'paused').length} 个依赖节点暂停`,
                `Local trial · ${withdrawn.length} facts withdrawn, ${evaluated.nodes.filter((node) => node.state === 'paused').length} dependent nodes paused`
              )
            : t(
                '本地试验 · 选择节点，查看它依赖的来源',
                'Local trial · Select a node to inspect its dependencies'
              )}
        </span>
        {withdrawn.length > 0 && (
          <button className="text-link" onClick={() => setWithdrawn([])}>
            <RotateCcw size={12} />
            {t('恢复全部', 'Restore all')}
          </button>
        )}
      </div>
      <div className="lab-workspace">
        <div className="lab-canvas" ref={canvas}>
          <svg className="lab-connections" aria-hidden="true">
            <defs>
              <marker
                id={markerId}
                markerWidth="5"
                markerHeight="5"
                refX="4"
                refY="2.5"
                orient="auto"
              >
                <path d="M0 0 L5 2.5 L0 5" fill="context-stroke" />
              </marker>
            </defs>
            {connections.map((connection) => {
              const edge = evaluated.edges.find((item) => item.id === connection.id)!;
              return (
                <path
                  key={edge.id}
                  d={connection.path}
                  data-edge-id={edge.id}
                  data-edge-state={edge.state}
                  className={
                    'lab-connection lab-connection-' +
                    edge.state +
                    (highlightedEdges.has(edge.id) ? ' highlighted' : '')
                  }
                  markerEnd={'url(#' + markerId + ')'}
                />
              );
            })}
          </svg>
          {stages.map((stage, index) => (
            <section
              className={'lab-lane lab-lane-' + stage.kind}
              key={stage.kind}
              aria-label={t(stage.label[0], stage.label[1])}
            >
              <h3>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {t(stage.label[0], stage.label[1])}
              </h3>
              <div className="lab-lane-nodes">
                {displayedNodes
                  .filter((node) => node.kind === stage.kind)
                  .map((node) => (
                    <button
                      key={node.id}
                      ref={(element) => {
                        if (element) nodeRefs.current.set(node.id, element);
                        else nodeRefs.current.delete(node.id);
                      }}
                      className={
                        'lab-node lab-node-' +
                        node.kind +
                        ' lab-state-' +
                        node.state +
                        (node.materialStatus ? ' lab-node-needed' : '') +
                        (highlightedNodes.has(node.id) ? ' on-path' : '') +
                        (selectedId === node.id ? ' selected' : '')
                      }
                      onClick={() => selectNode(node)}
                      aria-pressed={selectedId === node.id}
                      aria-label={t(...node.label) + ' · ' + stateText(node)}
                      data-lab-node={node.id}
                      data-node-state={node.state}
                    >
                      <span className="lab-node-label">{t(...node.label)}</span>
                      {node.unit && <strong className="lab-node-value">{valueText(node)}</strong>}
                      <span className="lab-node-state">
                        {['paused', 'withdrawn'].includes(node.state) && <Pause size={10} />}
                        {stateText(node)}
                      </span>
                      {node.kind === 'fact' && node.sourceRefs[0] && (
                        <span className="lab-node-origin">{sourceQuality(node.sourceRefs[0])}</span>
                      )}
                      {node.kind === 'hypothesis' && node.state === 'not-applicable' ? (
                        <span className="lab-node-detail">
                          {t(
                            '本年度未形成正利润、低经营现金的组合。',
                            'This year does not show positive profit with lower operating cash.'
                          )}
                        </span>
                      ) : node.reason ? (
                        <span className="lab-node-detail">{t(...node.reason)}</span>
                      ) : node.kind === 'hypothesis' && node.hypothesisId ? (
                        <span className="lab-node-detail">
                          {t(...companyChallengeDefinitions[node.hypothesisId].explanation)}
                        </span>
                      ) : node.kind === 'material' ? (
                        <span className="lab-node-detail">{t(...node.detail)}</span>
                      ) : node.formula ? (
                        <span className="lab-node-detail">{t(...node.formula)}</span>
                      ) : null}
                      {node.hypothesisId && node.kind === 'hypothesis' && (
                        <span className="lab-node-inspect">
                          {t('选择并挑战', 'Select to challenge')}
                          <ArrowRight size={11} />
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <aside
          className="lab-inspector"
          aria-label={t('所选节点的来源与依赖', 'Sources and dependencies of the selected node')}
        >
          {inspector}
        </aside>
      </div>
      <button className="lab-mobile-inspect" onClick={() => setInspectorOpen(true)}>
        <FileSearch size={14} />
        <span>{inspectorTitle}</span>
        {t('查看依据', 'Inspect')}
        <ArrowRight size={13} />
      </button>
      <footer className="lab-footer">
        <span>
          <i />
          {t(
            '连线表示依赖或待检验关系，不代表因果已确认。',
            'Lines show dependencies or questions to test; they do not confirm causation.'
          )}
        </span>
        <span>{t(...graph.sourceNotice)}</span>
      </footer>
      {challenge && (
        <section
          className="lab-challenge-results"
          aria-label={t('解释挑战的研究结果', 'Research results for the challenged explanation')}
        >
          <div className="lab-results-heading">
            <h3>
              <ScanLine size={15} />
              {t(...companyChallengeDefinitions[challenge.target].title)} ·{' '}
              {t('解释挑战', 'Explanation challenge')}
            </h3>
            <span>
              {researchLoading
                ? t('补查中', 'Researching')
                : challenge.status === 'failed'
                  ? t('未完成', 'Not completed')
                  : t('本轮结果', 'Run result')}
            </span>
          </div>
          {challenge.status === 'failed' && (
            <p className="lab-result-warning" role="alert">
              {t('本次定向补查未完成。', 'This targeted research did not complete.')}
              {challenge.error ? ' ' + challenge.error : ''}
              {visibleResult
                ? t(
                    '下列为之前保留的研究结果。',
                    'The results below are retained from the previous run.'
                  )
                : ''}
            </p>
          )}
          {challengeResult && !resultMatches && (
            <p className="lab-result-warning">
              {t(
                '研究结果对应其他资料快照，未用于当前实验台。',
                'The research result belongs to another snapshot and is not applied to this lab.'
              )}
            </p>
          )}
          {challenge.trace.length > 0 && (
            <details className="lab-research-trace" open={researchLoading || undefined}>
              <summary>
                <ChevronDown size={13} />
                {t('实际补查过程', 'Actual research steps')} · {challenge.trace.length}
              </summary>
              <ol>
                {challenge.trace.map((step) => (
                  <li key={step.id}>
                    {step.status === 'running' ? (
                      <LoaderCircle className="spinner" size={12} />
                    ) : step.status === 'completed' ? (
                      <Check size={12} />
                    ) : (
                      <X size={12} />
                    )}
                    <div>
                      <strong>{step.label}</strong>
                      <span>
                        {step.status === 'running'
                          ? t('执行中', 'Running')
                          : step.status === 'completed'
                            ? t('完成', 'Completed')
                            : t('未完成', 'Not completed')}
                      </span>
                      {step.summary && <p>{step.summary}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {visibleResult && (
            <>
              <p className="lab-result-summary">
                <strong>{t(...companyChallengeDefinitions[visibleResult.target].title)}</strong> ·{' '}
                {t(...visibleResult.summary)}
              </p>
              <p className="lab-result-model-note">
                {visibleResult.applicability === 'not-applicable'
                  ? t(
                      '本年度不适用低现金原因挑战，未调用解释模型。',
                      'A low-cash cause challenge is inapplicable for this year; the interpretation model was not called.'
                    )
                  : visibleResult.applicability === 'missing-basis'
                    ? t(
                        '关键基础金额或来源尚未齐，先补齐依据；本轮未调用解释模型。',
                        'Key amounts or sources are missing. Complete the evidence first; the interpretation model was not called.'
                      )
                    : visibleResult.model.status === 'not-called'
                      ? t(
                          '本轮未调用解释模型；下列保留有来源支持的规则线索。',
                          'The interpretation model was not called; source-supported rule clues are retained below.'
                        )
                      : visibleResult.model.status === 'completed'
                        ? t(
                            'AI 已整理定向补查线索；解释仍待检验。',
                            'AI organized the targeted clues; the explanation remains untested.'
                          )
                        : visibleResult.model.status === 'not-configured'
                          ? t(
                              'AI 服务未配置，下列仅保留公开数据规则线索。',
                              'AI is not configured; only public-data rule clues are retained below.'
                            )
                          : t(
                              'AI 未完成解读，下列仅保留有依据的规则线索。',
                              'AI interpretation did not complete; only supported rule clues are retained below.'
                            )}
              </p>
              <div className="lab-result-columns">
                {clueGroup(visibleResult.support, t('支持线索', 'Supporting clues'), 'support')}
                {clueGroup(visibleResult.counter, t('反向线索', 'Counter clues'), 'counter')}
                <section className="lab-clue-group lab-clue-gaps">
                  <h4>
                    {t('仍未取得', 'Still unobtained')}
                    <span>{visibleResult.gaps.length}</span>
                  </h4>
                  <ul>
                    {visibleResult.gaps.map((gap, index) => (
                      <li key={index}>{t(...gap)}</li>
                    ))}
                  </ul>
                  {visibleResult.distinguishingMaterials.map((material) => (
                    <div className="lab-result-material" key={material.id}>
                      <strong>{t(...material.label)}</strong>
                      <span>{t(...material.purpose)}</span>
                      <small>{t('尚未取得', 'Not obtained')}</small>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
        </section>
      )}
      {inspectorOpen && mobile && (
        <Dialog
          title={inspectorTitle}
          onClose={() => setInspectorOpen(false)}
          variant="drawer"
          className="lab-source-dialog"
        >
          {inspector}
        </Dialog>
      )}
    </section>
  );
}

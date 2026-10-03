import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import { buildCompanyEvidenceLab, type EvidenceLabGraph } from '../shared/evidence-lab';
import {
  companyChallengeDefinitions,
  type CompanyChallengeState,
  type CompanyChallengeTarget,
} from '../shared/company-challenge';
import { EvidenceLab } from './EvidenceLab';
import { api, RequestError, requestErrorText } from './api';
import { useApp } from './context';

type ChallengeResponse = { challenge: CompanyChallengeState | null; stale: boolean };
const POLL_INTERVAL = 1500;
const POLL_WINDOW = 10 * 60 * 1000;
const REQUEST_TIMEOUT = 25_000;
const challengeErrors: Record<string, readonly [string, string]> = {
  CHALLENGE_INPUT: ['请选择要挑战的解释。', 'Select the explanation to challenge.'],
  CHALLENGE_SOURCE_BUSY: [
    '公开资料或分析正在更新，请完成后再挑战。',
    'Public data or analysis is updating. Wait for it to finish before challenging.',
  ],
  CHALLENGE_SCOPE: [
    '尚未取得匹配主体的公开资料，不能挑战这个解释。',
    'Matching public company data is unavailable, so this explanation cannot be challenged.',
  ],
  CHALLENGE_BUSY: [
    '当前补查仍在执行或取消中，请完成后再试。',
    'The current research is running or cancelling. Wait for it to finish.',
  ],
  CHALLENGE_CAPACITY: [
    '已有解释补查在执行，请稍后重试。',
    'Another explanation is being researched. Retry shortly.',
  ],
};

function CompanyEvidenceLabSession({
  run,
  graph,
  updating,
}: {
  run: CompanyResearchRun;
  graph: EvidenceLabGraph;
  updating: boolean;
}) {
  const { t, locale, user } = useApp();
  const canRead = !!user && !!run.context && !run.informationGap && run.contextStatus !== 'loading';
  const [challenge, setChallenge] = useState<CompanyChallengeState>();
  const [checking, setChecking] = useState(canRead);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [requestError, setRequestError] = useState<unknown>();
  const [pollingStopped, setPollingStopped] = useState(false);
  const [version, setVersion] = useState(0);
  const lifecycle = useRef(new AbortController());
  const reader = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const publishedTransition = useRef<string | null>(null);
  const locked = useRef(false);
  const endpoint = `/company-runs/${encodeURIComponent(run.id)}/challenge`;
  const disabled =
    !canRead ||
    updating ||
    checking ||
    submitting ||
    serverLoading ||
    run.assessmentStatus === 'loading';

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  const accept = (response: ChallengeResponse, notify = false) => {
    const next = response.challenge || undefined;
    const result = next?.result;
    const mismatched =
      result &&
      (result.securityCode !== run.input.securityCode ||
        result.year !== run.input.year ||
        result.basis !== 'consolidated' ||
        result.snapshotFetchedAt !== run.context?.fetchedAt);
    const outdated = response.stale || !!mismatched;
    setStale(outdated);
    setServerLoading(next?.status === 'loading');
    setChallenge(outdated ? undefined : next);
    const transition = JSON.stringify([
      next?.status || null,
      next?.revision || null,
      next?.target || null,
      next?.result?.generatedAt || null,
      outdated,
    ]);
    const changed = transition !== publishedTransition.current;
    const shouldPublish = changed && (notify || publishedTransition.current !== null);
    publishedTransition.current = transition;
    if (shouldPublish)
      window.dispatchEvent(new CustomEvent('prispect:company-run-updated', { detail: run.id }));
  };

  useEffect(() => {
    if (!canRead) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    reader.current = controller;
    const lifetime = lifecycle.current;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setChecking(true);
    setRequestError(undefined);
    setPollingStopped(false);
    const load = async () => {
      try {
        const response = await api<ChallengeResponse>(endpoint, {
          signal: AbortSignal.any([
            lifetime.signal,
            controller.signal,
            AbortSignal.timeout(REQUEST_TIMEOUT),
          ]),
        });
        if (controller.signal.aborted || lifetime.signal.aborted) return;
        accept(response);
        setChecking(false);
        if (response.challenge?.status === 'loading') {
          if (Date.now() - startedAt >= POLL_WINDOW) setPollingStopped(true);
          else {
            timer = setTimeout(() => void load(), POLL_INTERVAL);
            pollTimer.current = timer;
          }
        }
      } catch (cause) {
        if (controller.signal.aborted || lifetime.signal.aborted) return;
        setRequestError(cause);
        setChecking(false);
      }
    };
    void load();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canRead, endpoint, version]);

  const startChallenge = async (target: CompanyChallengeTarget, refresh = false) => {
    if (disabled || locked.current) return;
    locked.current = true;
    setSubmitting(true);
    setRequestError(undefined);
    setPollingStopped(false);
    const lifetime = lifecycle.current;
    try {
      const response = await api<ChallengeResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ target, ...(refresh ? { refresh: true } : {}) }),
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT)]),
      });
      if (lifetime.signal.aborted) return;
      accept(response, true);
      setVersion((value) => value + 1);
    } catch (cause) {
      if (!lifetime.signal.aborted) setRequestError(cause);
    } finally {
      locked.current = false;
      if (!lifetime.signal.aborted) setSubmitting(false);
    }
  };

  const cancelChallenge = async () => {
    if (!user || !serverLoading || submitting || locked.current) return;
    locked.current = true;
    reader.current?.abort();
    clearTimeout(pollTimer.current);
    setSubmitting(true);
    setCancelling(true);
    setChecking(false);
    setRequestError(undefined);
    const lifetime = lifecycle.current;
    try {
      const response = await api<ChallengeResponse>(`${endpoint}/cancel`, {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT)]),
      });
      if (lifetime.signal.aborted) return;
      accept(response, true);
      setVersion((value) => value + 1);
    } catch (cause) {
      if (!lifetime.signal.aborted) setRequestError(cause);
    } finally {
      locked.current = false;
      if (!lifetime.signal.aborted) {
        setSubmitting(false);
        setCancelling(false);
      }
    }
  };
  const specificError =
    requestError instanceof RequestError ? challengeErrors[requestError.code] : undefined;
  const errorText =
    requestError instanceof DOMException &&
    ['TimeoutError', 'AbortError'].includes(requestError.name)
      ? t(
          '研究状态未能及时返回，请刷新状态。',
          'The research status did not return in time. Refresh its status.'
        )
      : specificError
        ? t(...specificError)
        : requestError instanceof RequestError && requestError.code.startsWith('CHALLENGE_')
          ? locale === 'en'
            ? 'The challenge request did not complete. Refresh its status or retry when public data is ready.'
            : requestErrorText(requestError, locale)
          : requestError === undefined
            ? ''
            : requestErrorText(requestError, locale);
  const previous = challenge?.result;
  const previousLabel = previous ? t(...companyChallengeDefinitions[previous.target].title) : '';
  const currentLabel = challenge ? t(...companyChallengeDefinitions[challenge.target].title) : '';
  const showingPrevious =
    previous && (challenge?.status !== 'ready' || previous.target !== challenge.target);

  return (
    <div className="company-evidence-lab" data-testid="company-evidence-lab">
      {submitting && !cancelling && (
        <p className="context-data-note" role="status">
          {t('正在启动解释补查…', 'Starting explanation research…')}
        </p>
      )}
      {serverLoading && (
        <button
          className="button button-secondary"
          disabled={submitting || !user}
          onClick={() => void cancelChallenge()}
        >
          {cancelling ? t('正在取消…', 'Cancelling…') : t('取消本次补查', 'Cancel this research')}
        </button>
      )}
      {stale && (
        <p className="context-data-note" role="status">
          {t(
            '公开资料已更新，上一份挑战结果不适用于当前快照。可以按新资料重新挑战。',
            'Public data has changed, so the previous challenge does not apply to this snapshot. Start a new challenge with the updated data.'
          )}
        </p>
      )}
      {showingPrevious && (
        <p className="context-data-note" role="status">
          {challenge?.status === 'loading'
            ? t(
                `正在挑战“${currentLabel}”；当前展示上一份“${previousLabel}”结果。`,
                `Researching “${currentLabel}”; the previous “${previousLabel}” result is still shown.`
              )
            : t(
                `本次“${currentLabel}”挑战未完成，保留上一份“${previousLabel}”结果。`,
                `This “${currentLabel}” challenge did not complete. The previous “${previousLabel}” result is retained.`
              )}
        </p>
      )}
      {errorText && (
        <p className="field-error" role="alert">
          {errorText}
        </p>
      )}
      {pollingStopped && (
        <p className="context-data-note" role="status">
          {t(
            '研究仍在处理，已暂停自动刷新；可手动查看最新状态。',
            'Research is still running. Automatic refresh has paused; check its latest status manually.'
          )}
        </p>
      )}
      {(requestError !== undefined || pollingStopped) && canRead && (
        <button
          className="button button-secondary"
          disabled={checking || submitting}
          onClick={() => setVersion((value) => value + 1)}
        >
          <RefreshCw size={13} />
          {t('刷新研究状态', 'Refresh research status')}
        </button>
      )}
      <EvidenceLab
        graph={graph}
        challenge={challenge}
        challengeDisabled={disabled}
        onChallenge={(target: CompanyChallengeTarget) => void startChallenge(target)}
        onRefreshChallenge={(target: CompanyChallengeTarget) => void startChallenge(target, true)}
      />
    </div>
  );
}

/** Scope local trial and request state to one owner and one public source snapshot. */
export function CompanyEvidenceLab({
  run,
  updating = false,
}: {
  run: CompanyResearchRun;
  updating?: boolean;
}) {
  const { user } = useApp();
  const sourceScope = JSON.stringify({
    owner: user?.id || null,
    run: run.id,
    identity: run.identity || null,
    informationGap: run.informationGap || null,
    input: {
      securityCode: run.input.securityCode,
      orgId: run.input.orgId,
      year: run.input.year,
    },
    context: run.context || null,
    industry: run.industry || null,
    assessmentHash: run.assessmentInputHash || null,
  });
  const revision = useRef(0);
  const current = useMemo(
    () => ({ graph: buildCompanyEvidenceLab(run), revision: ++revision.current }),
    [sourceScope]
  );
  return (
    <CompanyEvidenceLabSession
      key={`${user?.id || 'signed-out'}:${run.id}:${current.revision}`}
      run={run}
      graph={current.graph}
      updating={updating}
    />
  );
}

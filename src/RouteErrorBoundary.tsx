import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import type { Translate } from './context';
import { isPageResourceFailure } from './lazy-page';

type Props = { children: ReactNode; resetKey: string; t: Translate; onRetry?: () => void };
type State = { failed: boolean; resourceFailure: boolean; resetKey: string };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resourceFailure: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, resourceFailure: isPageResourceFailure(error) };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    return props.resetKey !== state.resetKey
      ? { failed: false, resourceFailure: false, resetKey: props.resetKey }
      : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the real failure available for local diagnosis. Nothing is sent to a server.
    console.error('Page rendering failed.', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { t } = this.props;
    return (
      <div className="connection-error" role="alert">
        <CircleAlert aria-hidden="true" />
        <h1>{t('暂时无法打开这页', 'This page could not be opened')}</h1>
        <p>
          {this.state.resourceFailure
            ? t(
                '页面资源未能载入。请检查网络后重试打开当前页面。',
                'The page resources could not load. Check your connection and try opening this page again.'
              )
            : t(
                '页面显示遇到问题。请先保留未保存的信息，再尝试重新打开或重新加载当前页面。',
                'The page could not be displayed. Keep any unsaved information before reopening or reloading this page.'
              )}
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            this.props.onRetry?.();
            this.setState({ failed: false, resourceFailure: false });
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t('重试打开', 'Try again')}
        </button>
        <p>
          {t(
            '若重试后仍无法打开，请先保留未保存的信息，再重新加载页面。',
            'If retrying does not help, keep any unsaved information before reloading this page.'
          )}
        </p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => window.location.reload()}
        >
          {t('重新加载页面', 'Reload page')}
        </button>
      </div>
    );
  }
}

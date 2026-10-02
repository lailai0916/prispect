import { Component, type ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import type { Translate } from './context';

type Props = { children: ReactNode; resetKey: string; t: Translate };
type State = { failed: boolean; resetKey: string };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { t } = this.props;
    return (
      <div className="connection-error" role="alert">
        <CircleAlert aria-hidden="true" />
        <h1>{t('暂时无法打开这页', 'This page could not be opened')}</h1>
        <p>
          {t(
            '页面加载遇到问题。请先保留未保存的信息，再重新加载当前页面。',
            'The page could not load. Keep any unsaved information before reloading this page.'
          )}
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t('重新加载页面', 'Reload page')}
        </button>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Translate } from './context';
import './assistant-error.css';

type Props = { children: ReactNode; resetKey: string; t: Translate; onRetry: () => void };
type State = { failed: boolean; resetKey: string };

/** A failed floating assistant must not take the current page or its inputs with it. */
export class AssistantErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Assistant rendering failed.', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { t } = this.props;
    return (
      <aside className="assistant-load-error" role="status" aria-live="polite">
        <p>{t('问答助手暂时无法打开', 'The assistant could not be opened')}</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            this.props.onRetry();
            this.setState({ failed: false });
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {t('重试', 'Retry')}
        </button>
      </aside>
    );
  }
}

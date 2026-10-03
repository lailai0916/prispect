import type { ReactNode } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Dialog } from './components';
import { useApp } from './context';
import { productTerms } from '../shared/product-terms';
import './report-first-shell.css';

/** The standard modal owns focus, Escape, scroll locking and focus restoration. */
export function ResearchNavigationPanel({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const { t, navigate } = useApp();
  return (
    <Dialog
      title={t('研究导航', 'Research navigation')}
      onClose={onClose}
      wide
      className="research-navigation-popup"
    >
      <button className="research-navigation-new" type="button" onClick={() => navigate('/query')}>
        <Plus size={18} aria-hidden="true" />
        <span>{t(...productTerms.newResearch)}</span>
        <ArrowUpRight size={17} aria-hidden="true" />
      </button>
      {children}
    </Dialog>
  );
}

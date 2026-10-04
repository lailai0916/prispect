import { useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Columns2, FileSearch, Menu, PanelsTopLeft } from 'lucide-react';
import { Dialog } from '../components';
import { useApp } from '../context';
import './lite-hermes-theme.css';
import './showcase-navigation.css';

/** Native destinations share actual records; choosing a destination never starts research. */
export function ShowcaseNavigation({
  homeActive = true,
  proLink = '/query',
}: {
  homeActive?: boolean;
  proLink?: string;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const entries = [
    {
      href: '/?view=search',
      label: t('Lite · 查公司', 'Lite · Company search'),
      description: t(
        '从公司名称与年度开始，追到具体依据。',
        'Start with a company and year, then follow its evidence.'
      ),
      icon: FileSearch,
    },
    {
      href: '/companies/compare',
      label: t('Lite · 两家公司对比', 'Lite · Compare companies'),
      description: t(
        '并排查看两家公司的已取得指标与出处。',
        'Read two companies’ acquired figures and sources side by side.'
      ),
      icon: Columns2,
    },
    {
      href: proLink,
      label: t('Pro · 研究工作区', 'Pro · Research workspace'),
      description: t(
        '打开专业研究视图与同一份公司记录。',
        'Open the professional view of the same company records.'
      ),
      icon: PanelsTopLeft,
    },
    {
      href: '/docs',
      label: t('使用文档', 'Documentation'),
      description: t('了解操作、研究方法与数据范围。', 'Read the guide, methodology and coverage.'),
      icon: BookOpen,
    },
  ];
  return (
    <>
      <button
        type="button"
        className="icon-button showcase-menu-trigger"
        aria-label={t('打开导航', 'Open navigation')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={21} aria-hidden="true" />
      </button>
      {open && (
        <Dialog
          title={t('探索析光', 'Explore Prispect')}
          className="showcase-navigation lite-hermes-dialog lite-search-navigation"
          initialFocus={firstLink}
          onClose={() => setOpen(false)}
        >
          <nav
            className="lite-search-navigation-links"
            aria-label={t('Lite 与 Pro 导航', 'Lite and Pro navigation')}
          >
            {entries.map(({ href, label, description, icon: Icon }, index) => (
              <a
                key={href}
                href={href}
                ref={index === 0 ? firstLink : undefined}
                aria-current={index === 0 && homeActive ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={22} aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <ArrowUpRight size={19} aria-hidden="true" />
              </a>
            ))}
          </nav>
          <div className="lite-search-navigation-secondary">
            <a href="/?view=example">
              {t('历史证据样例', 'Historical evidence example')}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <a href="/?view=guide">
              {t('阅读路径', 'Reading guide')}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <a href="/?view=story">
              {t('原版证据介绍', 'Original evidence story')}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </Dialog>
      )}
    </>
  );
}

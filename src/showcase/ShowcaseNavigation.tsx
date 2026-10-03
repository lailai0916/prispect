import { useRef, useState } from 'react';
import { ArrowUpRight, Menu } from 'lucide-react';
import { Dialog } from '../components';
import { useApp } from '../context';
import './showcase.css';
import './showcase-v2.css';
import './showcase-v3.css';

/** Route previews describe real destinations, without displaying invented company records. */
export function ShowcaseNavigation({
  homeActive = true,
  proLink = '/query',
}: {
  homeActive?: boolean;
  proLink?: string;
}) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(0);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const entries = [
    {
      href: '/',
      label: 'Lite',
      detail: t('从一家公司的名字开始。', 'Start with a company name.'),
      route: 'lite',
      headings: [
        t('查公司', 'Find a company'),
        t('看数字', 'Read the numbers'),
        t('追依据', 'Trace the evidence'),
      ],
    },
    {
      href: proLink,
      label: 'Pro',
      detail: t('查询企业，回到现有研究流程。', 'Search companies in the research workspace.'),
      route: 'pro',
      headings: [
        t('研究报告', 'Research report'),
        t('财务趋势', 'Financial trends'),
        t('行业对比', 'Industry comparison'),
      ],
    },
    {
      href: '/docs',
      label: t('文档', 'Documentation'),
      detail: t('了解用法、方法与数据范围。', 'Read the guide, methodology and coverage.'),
      route: 'docs',
      headings: [
        t('开始使用', 'Getting started'),
        t('研究方法', 'Methodology'),
        t('数据范围', 'Data coverage'),
      ],
    },
  ];
  return (
    <>
      <button
        type="button"
        className="icon-button showcase-menu-trigger"
        aria-label={t('打开全屏导航', 'Open full-screen navigation')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setPreview(0);
          setOpen(true);
        }}
      >
        <Menu size={23} aria-hidden="true" />
      </button>
      {open && (
        <Dialog
          title={t('探索析光', 'Explore Prispect')}
          className={`showcase-navigation${locale === 'en' ? ' showcase-navigation-english' : ''}`}
          initialFocus={firstLink}
          onClose={() => setOpen(false)}
        >
          <div className="showcase-navigation-layout">
            <nav aria-label={t('展示版导航', 'Showcase navigation')}>
              {entries.map((entry, index) => (
                <a
                  key={entry.href}
                  href={entry.href}
                  ref={index === 0 ? firstLink : undefined}
                  onPointerEnter={() => setPreview(index)}
                  onFocus={() => setPreview(index)}
                  aria-current={index === 0 && homeActive ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="showcase-menu-index">0{index + 1}</span>
                  <span className="showcase-menu-label" data-label={entry.label}>
                    {entry.label}
                  </span>
                  <ArrowUpRight aria-hidden="true" />
                </a>
              ))}
            </nav>
            <div className="showcase-navigation-preview" aria-hidden="true">
              {entries.map((entry, index) => (
                <div
                  key={entry.href}
                  data-route={entry.route}
                  className={`showcase-menu-route${preview === index ? ' is-active' : ''}`}
                >
                  <span>0{index + 1} / PRISPECT</span>
                  <strong>{entry.label}</strong>
                  {entry.headings.map((heading, step) => (
                    <span className="showcase-menu-route-step" key={heading}>
                      <small>0{step + 1}</small>
                      {heading}
                      <ArrowUpRight size={16} />
                    </span>
                  ))}
                </div>
              ))}
              <p>{entries[preview].detail}</p>
            </div>
          </div>
          <div className="showcase-navigation-footer">
            <span>析光 / Prispect</span>
            <a href="/?view=story">
              {t('原版证据介绍', 'Original evidence story')}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </Dialog>
      )}
    </>
  );
}

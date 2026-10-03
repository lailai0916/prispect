import { ArrowDown, ArrowUpRight, Building2, Check, FileSearch, Search } from 'lucide-react';
import { landingExample } from '../cinematic/landing-content';
import { useApp } from '../context';

/** A labeled historical example, not a simulated live search or current report. */
export function FlowPreview({ step }: { step: number }) {
  const { t, locale } = useApp();
  const amount = (value: string) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  return (
    <div className="showcase-flow-device" data-preview-step={step}>
      <span className="showcase-flow-scope">{t(...landingExample.notices.sample)}</span>
      {step === 0 ? (
        <div className="showcase-flow-identity">
          <div className="showcase-flow-search">
            <Search size={19} />
            <span>{t('松原安全', 'Songyuan Safety')}</span>
            <span>↵</span>
          </div>
          <ArrowDown className="showcase-flow-arrow" size={26} />
          <div className="showcase-flow-match">
            <Building2 size={30} />
            <div>
              <strong>{t('松原安全', 'Songyuan Safety')}</strong>
              <span>300893 · {t('深圳', 'Shenzhen')}</span>
            </div>
            <Check size={22} />
          </div>
          <p>
            {t('先确认主体，再打开财务报告。', 'Confirm the company before opening its report.')}
          </p>
        </div>
      ) : step === 1 ? (
        <div className="showcase-flow-numbers">
          <span>2025 / {t('合并口径 · CNY', 'CONSOLIDATED · CNY')}</span>
          <div className="showcase-flow-value" data-series="profit">
            <span>{t('合并净利润', 'Consolidated net profit')}</span>
            <strong>{amount(landingExample.summary.profit)}</strong>
            <div className="showcase-flow-bar" style={{ width: '100%' }} />
          </div>
          <div className="showcase-flow-value" data-series="cash">
            <span>{t('经营现金净额', 'Operating cash flow')}</span>
            <strong>{amount(landingExample.summary.cash)}</strong>
            <div
              className="showcase-flow-bar"
              style={{
                width: `${(Number(landingExample.summary.cash) / Number(landingExample.summary.profit)) * 100}%`,
              }}
            />
          </div>
          <p>{t('同年度、同币种、同一金额刻度。', 'Same year, currency and amount scale.')}</p>
        </div>
      ) : (
        <div className="showcase-flow-source">
          <div>
            <FileSearch size={27} />
            <strong>{t('2025 年度报告', '2025 annual report')}</strong>
            <span>p.190–191</span>
          </div>
          <img
            src={landingExample.source.crops[0].src}
            width={landingExample.source.crops[0].width}
            height={landingExample.source.crops[0].height}
            alt=""
            loading="lazy"
          />
          <span className="showcase-flow-source-label">
            {t('金额 → 原文 → 继续核查', 'AMOUNT → ORIGINAL → NEXT QUESTION')}
            <ArrowUpRight size={18} />
          </span>
        </div>
      )}
    </div>
  );
}

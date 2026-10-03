import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { buildExampleEvidenceLab } from '../shared/evidence-lab';
import { EvidenceLab } from './EvidenceLab';
import { useApp } from './context';

/** A checked public original, independent of any account or new model research. */
export function PublicResearchExample() {
  const { t, examples, navigate } = useApp();
  const [selected, setSelected] = useState(0);
  const item = examples[selected] || examples[0];
  if (!item) return null;
  return (
    <section className="research-example" aria-labelledby="research-example-title">
      <header className="research-section-heading">
        <div>
          <h2 id="research-example-title">{t('公开年报实例', 'Public annual-report example')}</h2>
          <p>
            {t(
              '选择一条事实查看原文，撤回后观察哪些计算和解释会暂停。',
              'Select a fact to inspect its source. Withdraw it to see which calculations and explanations pause.'
            )}
          </p>
        </div>
        <a href="/docs/methodology">
          {t('方法与范围', 'Methods and scope')}
          <ArrowUpRight size={13} />
        </a>
      </header>
      <div
        className="research-example-selector"
        role="group"
        aria-label={t('选择公开年报', 'Select a public report')}
      >
        {examples.map((example, index) => (
          <button
            key={example.id}
            type="button"
            aria-pressed={item.id === example.id}
            onClick={() => setSelected(index)}
          >
            {example.shortName}
            <span>{example.year}</span>
          </button>
        ))}
      </div>
      <EvidenceLab
        key={item.id}
        graph={item.lab || buildExampleEvidenceLab(item)}
        compact
        example
        onStartResearch={() => navigate('/query?query=' + encodeURIComponent(item.shortName))}
      />
    </section>
  );
}

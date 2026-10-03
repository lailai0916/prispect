import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const base = resolve(root, 'docs/competitive-research');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = read(resolve(base, 'manifest.json'));
const schema = read(resolve(base, 'schema.json'));
const ids = new Set(),
  errors = [],
  boundaries = [],
  projects = [];
const populated = (value) =>
  typeof value === 'string'
    ? value.trim().length > 0
    : value !== null && value !== undefined && (Array.isArray(value) ? value.length > 0 : true);
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const format = (value) =>
  String(value ?? '')
    .replace(/\|/g, '／')
    .replace(/\s+/g, ' ')
    .trim();
const localPaths = (value) =>
  [
    ...JSON.stringify(value ?? '').matchAll(
      /(?:shared|src|server|tests|docs|scripts|data)\/[\w./-]+\.(?:tsx?|json|md|mjs|cjs|css|html|png|pdf|txt|log)/g
    ),
  ].map((match) => match[0]);
assert(manifest.projects.length === 5, 'Expected five fixed competitor projects');
for (const project of manifest.projects) {
  assert(/^[a-f0-9]{40}$/.test(project.sha), `${project.id}: invalid pinned SHA`);
  for (const file of [project.analysis, project.values])
    assert(existsSync(resolve(base, file)), `${project.id}: missing ${file}`);
  if (existsSync(project.source_worktree)) {
    const sha = execFileSync('git', ['-C', project.source_worktree, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    assert(
      sha === project.sha,
      `${project.id}: local clone HEAD differs from pinned research version`
    );
  } else
    boundaries.push(
      `${project.id}: external source clone is absent; pinned manifest and saved evidence only`
    );
  if (!existsSync(project.original_backup))
    boundaries.push(`${project.id}: external original bundle is absent in this checkout`);
  const values = read(resolve(base, project.values)),
    counts = {};
  for (const value of values) {
    const prefix = `${project.id}/${value.id}`;
    assert(!ids.has(value.id), `${prefix}: duplicate ID`);
    ids.add(value.id);
    for (const field of schema.required)
      assert(populated(value[field]), `${prefix}: missing or empty ${field}`);
    assert(value.sha === project.sha, `${prefix}: value SHA differs from pinned project`);
    for (const field of ['verification', 'disposition', 'implementation'])
      assert(schema[field].includes(value[field]), `${prefix}: invalid ${field}`);
    assert(
      !['research', 'planned'].includes(value.implementation),
      `${prefix}: discovered value lacks a final treatment`
    );
    if (value.implementation === 'deferred' || populated(value.remaining_scope)) {
      const transformation = String(value.transformation);
      assert(
        populated(value.prerequisites) || /前置[:：]|prerequisite/i.test(transformation),
        `${prefix}: remaining work prerequisite missing`
      );
      assert(
        populated(value.next_step) || /下一步[:：]|next step/i.test(transformation),
        `${prefix}: remaining work next step missing`
      );
    }
    if (value.implementation === 'rejected')
      assert(
        value.disposition === 'reject' && populated(value.risks) && populated(value.transformation),
        `${prefix}: rejection needs a reason and treatment`
      );
    if (['implemented', 'verified'].includes(value.implementation)) {
      const evidence = [
        value.implementation_evidence,
        value.prispect_evidence,
        value.implementation_paths,
      ].filter(populated);
      assert(populated(evidence), `${prefix}: implementation/source-coverage evidence missing`);
      const paths = localPaths(evidence);
      assert(paths.length > 0, `${prefix}: no inspectable Prispect implementation evidence path`);
      for (const path of paths)
        assert(
          existsSync(resolve(root, path)),
          `${prefix}: absent implementation evidence ${path}`
        );
    }
    for (const evidence of value.evidence)
      if (typeof evidence === 'object' && evidence.sha)
        assert(evidence.sha === project.sha, `${prefix}: source evidence SHA mismatch`);
    counts[value.implementation] = (counts[value.implementation] || 0) + 1;
  }
  projects.push({ project, values, counts });
}
assert(ids.size >= 241, 'Inventory unexpectedly shrank below the recorded 241 discoveries');
const frozenEvidencePath = resolve(base, 'evidence/EVIDENCE-MANIFEST.json');
let frozenEvidenceFiles = 0;
if (existsSync(frozenEvidencePath)) {
  const frozen = read(frozenEvidencePath);
  for (const file of frozen.files) {
    const path = resolve(base, 'evidence', file.path);
    const safePath = path.startsWith(resolve(base, 'evidence') + '/');
    assert(
      safePath && existsSync(path),
      `Frozen evidence absent or outside directory: ${file.path}`
    );
    if (safePath && existsSync(path)) {
      const bytes = readFileSync(path);
      assert(bytes.length === file.bytes, `Frozen evidence byte length changed: ${file.path}`);
      assert(
        createHash('sha256').update(bytes).digest('hex') === file.sha256,
        `Frozen evidence hash changed: ${file.path}`
      );
      frozenEvidenceFiles++;
    }
  }
}
if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exitCode = 1;
} else {
  if (process.argv.includes('--write-index')) {
    const lines = [
      '# 全量价值与处理索引',
      '',
      '本表由 `npm run research:index` 从五个结构化清单生成。implemented/verified 必须结合逐项的验收边界阅读：其中包含保持或增强既有能力，不能把总数理解为新增功能数。verified 不表示真人效果已测，也不表示竞品所有联网服务可用。每项完整触发、源码与交互证据、成本、风险、转化及验收在链接的 JSON 中。',
      '',
      '| 项目 | 固定 SHA | 项数 | implemented | verified | deferred | rejected |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ];
    for (const { project, values, counts } of projects)
      lines.push(
        `| [${project.name}](${project.analysis}) | ${project.sha} | ${values.length} | ${counts.implemented || 0} | ${counts.verified || 0} | ${counts.deferred || 0} | ${counts.rejected || 0} |`
      );
    for (const { project, values } of projects) {
      lines.push(
        '',
        `## ${project.name}`,
        '',
        `完整记录：[${project.values}](${project.values})。`,
        '',
        '| ID | 机制或细节 | 竞品核实方式 | 处理 | 实施状态 | 析光用途与下一步 |',
        '| --- | --- | --- | --- | --- | --- |'
      );
      for (const value of values) {
        const treatment =
          value.implementation === 'deferred'
            ? value.next_step || value.transformation
            : value.handling_result || value.outcome || value.prispect_application;
        const remaining = populated(value.remaining_scope)
          ? `；未完成范围：${format(value.remaining_scope)}；下一步：${format(value.next_step)}`
          : '';
        lines.push(
          `| ${value.id} | ${format(value.title || value.name || value.value)} | ${value.verification} | ${value.disposition} | ${value.implementation} | ${format(treatment)}${remaining} |`
        );
      }
    }
    writeFileSync(resolve(base, 'VALUE-INDEX.md'), lines.join('\n') + '\n');
  }
  process.stdout.write(
    JSON.stringify(
      {
        projects: projects.length,
        values: ids.size,
        status: 'passed',
        frozen_evidence_files: frozenEvidenceFiles,
        external_checkout_boundaries: boundaries,
        index: process.argv.includes('--write-index')
          ? relative(root, resolve(base, 'VALUE-INDEX.md'))
          : null,
      },
      null,
      2
    ) + '\n'
  );
}

# Repository setup and standards

This file is the canonical source for repository standards, initialization, and acceptance.
Read it completely when creating a project; consult the relevant sections when maintaining
an existing repository. Explicit user requirements and established project-local conventions
take precedence within their scope. Personal writing, coding, and design preferences remain
with the caller; they are not duplicated here.

## Lifecycle

The source repository permanently keeps this document, its examples, and its checks together.
In a generated project, this file is a temporary initialization guide. The Agent implements and
verifies the requirements before removing its inherited copy. Reading the guide or ticking boxes
does not establish completion. Missing access blocks only the checks that depend on it.

After acceptance, keep the project's actual configuration and local instructions. Keep this
canonical link in `AGENTS.md` for future README and repository maintenance:

<https://github.com/lailai0916/lailai-template/blob/main/SETUP.md>

Do not copy these standards or the generic checker into downstream manuals. Existing projects
adopt applicable changes deliberately; a newer template revision does not authorize overwriting
their configuration, history, or user changes.

## Initialize

1. Create the repository using **Use this template**. Establish its actual owner, repository name,
   display name, purpose, stack, default branch, and publication scope from the task.
2. Replace the two READMEs, package identity, and `AGENTS.md` project map with real content.
   Keep useful configuration and collaboration files; adapt or remove unused template examples.
3. Implement the standards below. Run the project's real checks and the canonical checker
   with `--initializing`. For a published repository, also verify its live GitHub metadata.
4. Review the acceptance items below against files, command output, and the actual GitHub state.
   The Agent performs this review; do not request another user confirmation for facts already
   established or actions already authorized. Unverified requirements stay outstanding.
5. Configure ongoing checks using a reviewed, fixed revision of this template. Remove only the
   inherited `SETUP.md`, unused `.agents/rules/example.md.template`, `docs/.gitkeep`, and template
   checker/tests that are still unchanged template assets. Preserve project tests and local tools.
   Fix links and CI commands before removing files, then rerun validation without `--initializing`.

Never apply step 5 to `lailai0916/lailai-template` itself. Never delete a project directory wholesale
because it originally came from the template. Git retains removed tracked initialization files.

## Repository standards

- Use lowercase kebab-case repository names and English ASCII paths. Respect ecosystem filenames
  such as `README.md`, `SKILL.md`, and `package.json`; Finder launchers use `start.command`.
  README titles use the actual display name, such as `CSV Diff` for `csv-diff`. Preserve explicit
  brand spellings; the template's own display name is `lailai-template`.
- Commit subjects use Conventional Commits: `type(scope): description`, with optional scope and
  breaking-change marker. Each commit describes one coherent change. Do not append automated
  authorship or promotional signatures; preserve genuine source attribution and license notices.
- Keep `.gitignore` and `.gitattributes`, adapting the supplied dependency/build/editor exclusions
  to the stack. Text uses UTF-8, LF, and a final newline; Windows-native scripts may require CRLF.
- Open-source code defaults to MIT unless a license or explicit requirement dictates otherwise.
  Keep `LICENSE` in each repository. Projects with substantial original text or website content
  default that content to CC BY 4.0 as a separate content license; preserve the applicable license
  and attribution of imported material, including mixed-license projects.
- Use Prettier for supported text files in every new project, including documentation-only repos:
  a development dependency, lockfile, configuration, `format`, and `format:check` scripts.
  Defaults are `printWidth: 100`, `singleQuote: true`, and `trailingComma: "es5"`.
  Language-specific formatters handle unsupported code; TypeScript projects enable `strict`.
- Public repositories provide complete English and Simplified-Chinese READMEs; English is default.
  New user-facing applications also provide en and zh-Hans localization. Preserve existing locale
  choices in established projects. Omit a language only when the user explicitly limits the scope
  to an internal/private script or a single-language deliverable; record the local scope.
- About metadata is part of delivery: a concise English description, 3–8 distinct lowercase
  kebab-case topics, and an actual homepage when one exists. Verify the live values; a local JSON
  file or a successful push alone does not prove that GitHub About is configured.
- Maintain SemVer and `CHANGELOG.md` for versioned releases. Add `.github/CONTRIBUTING.md` when
  external contributions are accepted. Do not add empty release or contribution scaffolds.
- `AGENTS.md` describes the real project, commands, local rules, and conventions. Runtime adapters
  only reference the canonical instructions; shared configuration uses a constant number of root
  imports/links per runtime. Do not create per-skill or per-rule copies for each runtime.

## README standard

Use the two READMEs in this repository as the maintained examples. Their content is about the
template; replace that content with the new project's actual behavior.

1. Use a centered HTML header: display name, language navigation, then real shields.io badges.
   Navigation uses `·`; bold only the current language and link the others. English lives in
   `README.md`; Simplified Chinese in `README.zh-Hans.md`. Translations are complete counterparts.
2. Include last commit, top language, repository size, and license badges using the actual slug.
   Add CI, formatter, coverage, or release badges when the capability exists. CI badges must name
   a real workflow and branch. Never present an unpublished repository as having live checks.
   Show only the primary license badge, normally the code's MIT license. Do not add separate
   documentation or content license badges. If automatic license detection does not show the
   primary license alone, use an explicit static badge that matches the actual license.
3. Keep the exact core H2 names and order from the examples:
   - English project README: `Project Introduction`, `Project Features`, `Getting Started`,
     `Project Structure`.
   - English website README: `Website Introduction`, `Website Features`, `Getting Started`,
     `Project Structure`.
   - Simplified Chinese project README: `项目简介`, `项目特性`, `快速开始`, `项目结构`.
   - Simplified Chinese website README: `网站简介`, `网站特性`, `快速开始`, `项目结构`.
     Use the website variant when the repository's primary deliverable is a website. Relevant extra
     sections follow the structure; `License` / `许可协议` is always last. Do not shorten core
     headings to aliases such as `Introduction`, `Features`, or `特性`.
     Start with one concrete sentence explaining the project. Each feature is a separate paragraph,
     not a bulleted list: emoji, space, **short label**, `—`, explanation. Separate features with a
     blank line. English feature labels use Title Case, preserving exact brand names and identifiers.
     Keep prose factual; omit marketing adjectives and requests for stars.
4. Provide copyable `bash` setup commands. List only useful project-specific paths in a `bash`
   structure tree rooted at the actual repository name. Omit README, LICENSE, Git metadata, and
   Agent configuration such as `AGENTS.md`, `CLAUDE.md`, `.agents/`, and `.codex/`. A packaged Skill's
   `SKILL.md` is its primary product entry, not generic repository configuration, and may be included.
   All listed paths must exist. At every level, directories precede files; sort each group by name.
   Every entry has a useful end-of-line comment. Let `w` be the longest entry before padding,
   including tree connectors and indentation, counted in Unicode characters rather than bytes.
   Every `#` must have exactly `max(w+1,36)` characters before it: normally 36, with at least one
   separating space for longer paths. All entries in one tree share the same comment column.
5. Finish with a license section. Code defaults to MIT. Projects with substantial original text or
   website content default that content to CC BY 4.0 as a separate content license. For ordinary
   MIT code, use the matching sentence exactly:

   English: This project's code is licensed under [MIT License](LICENSE).

   中文：本项目代码采用 [MIT 许可协议](LICENSE)。

   When multiple licenses apply, describe their scopes in one sentence and one paragraph. Join
   English clauses with `, and`; use a natural comma in Chinese, not separate sentences or
   paragraphs. For a website with a separate content license:

   English: This project's code is licensed under [MIT License](LICENSE), and this website's content is licensed under [CC BY 4.0](LICENSE-docs).

   中文：本项目代码采用 [MIT 许可协议](LICENSE)，网站内容采用 [CC BY 4.0 许可协议](LICENSE-docs)。

   Adapt the content subject to the project: documentation, Skill text, or other actual material;
   do not call every project's content website content. Link each applicable license file.
   Document additional content licenses and required source attribution concisely in that section.
   Do not append template-use credits or scaffolding history merely because the project was created
   from this template. Preserve actual copyright notices and imported material's license obligations;
   detailed provenance belongs beside the material, not in repetitive README boilerplate.

## Validation

The checker is maintained only in this repository and accepts an external target directory.
Reuse an existing checkout or obtain a reviewed revision in a separate directory; do not download
and execute a moving script in the target repository on every invocation.

```bash
python3 /path/to/lailai-template/scripts/check_repository.py --root /path/to/project --initializing
python3 /path/to/lailai-template/scripts/check_repository.py --root /path/to/project --github
python3 /path/to/lailai-template/scripts/check_repository.py --commit /path/to/COMMIT_EDITMSG
```

`--github` performs read-only GitHub CLI queries for About metadata and the default branch.
Without it, remote state is explicitly unverified. For scoped maintenance of an existing
repository, `--readme-only` checks the two root READMEs without applying new-project scaffolding
requirements. `--paths` checks explicitly changed paths without scanning unrelated content.
Use `--display-name` for an explicitly established brand spelling, not to excuse an invented name.

For CI, check out the target normally, then check out `lailai0916/lailai-template` into a separate
directory at a full reviewed commit SHA. Invoke its checker with `--root` pointing to the target;
retain the target's own tests and format/build commands. Pin updates are reviewed maintenance.
The template's own CI tests the local checker and its regression fixtures.

## Acceptance

- Both READMEs describe the actual project; navigation, badges, commands, tree, and license agree.
- Repository identity, supported runtimes, local Agent commands, ignore rules, and formatter work.
- Description, topics, homepage, and CI are verified on GitHub when publication is in scope.
- Relevant project checks pass; interpretation, translations, and usefulness receive semantic review.
- The generated repository retains the upstream standards link and an operational validation route.
- After cleanup, no inherited setup document, unused example, stale command, or broken link remains.

Mechanical checks do not prove semantic translation quality, correct licensing decisions, or that
the application works. Report completed, failed, and unverified checks accurately. Publication,
commits, and pushes follow the current task's authorization; this guide grants no new authority.

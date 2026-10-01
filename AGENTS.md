# Repository instructions

This repository owns the shared repository standards, initialization guide, examples, and checker.
Read [SETUP.md](SETUP.md) before changing any of them. Change the standard, working examples,
and affected checks together; keep English and Simplified-Chinese READMEs aligned.

## Generated projects

If the current repository is a project created from this template, follow the inherited setup
guide, replace this project map with actual local commands and rules, and remove the inherited
guide only after acceptance. The template source permanently retains it. Future repository and
README maintenance uses the canonical standard:

[Repository standards](https://github.com/lailai0916/lailai-template/blob/main/SETUP.md).

Keep that link in the generated project's `AGENTS.md`. Store only project-specific differences
locally; do not copy the standard or maintain another version of its checker.

## Project

`lailai-template` is a GitHub template with a dependency-free Python 3.10+ validator and Prettier
for repository text. It owns no personal profile, specialized solution workflow, or application.

## Commands

```bash
python3 scripts/check_repository.py --root .
python3 -m unittest discover -s tests -v
npm ci --ignore-scripts
npm run format:check
```

Use `--github` for read-only verification of the live repository metadata. The ordinary local
check does not claim that remote state is correct. Generated projects record their own runtime,
test, build, and formatting commands here and call the external checker at a reviewed revision.

## Conventions

- The only canonical instruction file is `AGENTS.md`; `CLAUDE.md` is a compatibility import.
- `.agents/rules/example.md.template` illustrates a scoped local rule; it is not an active rule.
- Standards, examples, and validation stay here. No downstream personal or project policy is required.
- Preserve unrelated work. Verify changes before committing and update affected documentation.

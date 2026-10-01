<div align="center">
  <h1>lailai-template</h1>
  <p><strong>English</strong> · <a href="README.zh-Hans.md">简体中文</a></p>
  <p>
    <img src="https://img.shields.io/github/actions/workflow/status/lailai0916/lailai-template/ci.yml?branch=main&style=flat-square" />
    <img src="https://img.shields.io/github/last-commit/lailai0916/lailai-template?style=flat-square" />
    <img src="https://img.shields.io/github/languages/top/lailai0916/lailai-template?style=flat-square" />
    <img src="https://img.shields.io/github/repo-size/lailai0916/lailai-template?style=flat-square" />
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square" />
    <img src="https://img.shields.io/github/license/lailai0916/lailai-template?style=flat-square" />
  </p>
</div>

## Project Introduction

A ready-to-use GitHub template that keeps repository standards, setup guidance, bilingual README
examples, and validation tools together.

## Project Features

📄 **Shared Standards** — [SETUP.md](SETUP.md) owns repository naming, READMEs, GitHub About,
engineering defaults, and acceptance requirements.

🗺️ **Ongoing Maintenance** — Generated projects retain a short upstream reference after removing
their accepted initialization guide.

🧪 **Central Validation** — The Python checker validates external projects; standards and check
implementations are maintained only in the template.

📮 **Working Defaults** — Bilingual documentation, collaboration forms, Git configuration,
Prettier, and an Agent project map are ready to adapt.

## Getting Started

Click **Use this template**, read the complete [setup guide](SETUP.md), and adapt and verify the
generated project:

```bash
npm ci --ignore-scripts
npm run format:check
python3 scripts/check_repository.py --root . --initializing
python3 scripts/check_repository.py --root . --initializing --github
```

`--github` uses GitHub CLI to verify remote metadata without modifying it. Functionality,
translation quality, and deployment require their corresponding checks.

After acceptance, remove the generated project's inherited `SETUP.md`, retain the upstream link,
and run ongoing validation from a fixed template revision. The source template permanently keeps
the guide and tests. Existing projects consult the same guide without copying its contents.

## Project Structure

```bash
lailai-template/
├── scripts/                        # Shared repository validation
├── tests/                          # Migration and initialization regression tests
├── package.json                    # Formatter commands and dependencies
└── SETUP.md                        # Repository standards and initialization guide
```

## Validation

```bash
python3 scripts/check_repository.py --root .
python3 -m unittest discover -s tests -v
npm run format:check
```

[SETUP.md](SETUP.md) owns cross-repository usage, acceptance coverage, and initialization cleanup.

## License

This project's code is licensed under [MIT License](LICENSE).

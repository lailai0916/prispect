# Repository workflow scenarios

Use [SETUP.md](../SETUP.md) and the actual bilingual READMEs as the standard and examples.
These scenarios test decisions that a file checker cannot establish.

## New repository

Create a fictional `csv-diff` TypeScript CLI. Produce complete English and Simplified-Chinese
README drafts, a repository description, topics, and three commit subjects. Apply the setup
standard without inventing live CI results for the fictional repository. Distinguish files and
commands verified locally from GitHub settings that require a real published repository.

## Cleanup and later maintenance

Given an initialized project, verify implementation and checks before removing its inherited
guide. Preserve the guide in the template source, project-specific tests, configuration, and the
upstream link in `AGENTS.md`. Repair CI and local references before deleting template-only files.
On a later README change, follow the retained route without restoring a copied rule manual.

## Website README variant

Given a repository whose primary deliverable is a website, accept `Website Introduction` and
`Website Features` in English, with `网站简介` and `网站特性` in Simplified Chinese. Keep
`Getting Started` / `快速开始` and `Project Structure` / `项目结构` in the same core order.

## Text-heavy content license

Given a repository with substantial original website or text content, keep the code under MIT
License with a link to the code license and state the separate content license as linked CC BY 4.0
in the final license section. Combine the license clauses into one sentence and one paragraph,
using `, and` in English and a comma in Chinese. Name the actual content scope: a Skill is not a
website. Show only the primary license badge in the README header, without a second documentation
license badge. Formatting these notices must not change the underlying license files or remove
required attribution.

## Existing local conventions

Maintain a project with an established non-English default locale and a different formatter.
Respect those explicit local choices, check the parts relevant to the requested change, and
do not reset project configuration merely because the source template changed.

## Incomplete acceptance

The Agent has read every item but an actual test fails or GitHub metadata is inaccessible.
Do not claim completion or remove the guide as though all requirements were verified. Continue
independent work and report the outstanding check precisely; do not invent a successful result.

#!/usr/bin/env python3
"""Validate repository standards at the target, never at the checker's checkout."""

import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


TEMPLATE = "lailai0916/lailai-template"
STANDARD_URL = f"https://github.com/{TEMPLATE}/blob/main/SETUP.md"
MIT_CODE_SENTENCE = {
    "en": "This project's code is licensed under [MIT License](LICENSE).",
    "zh-Hans": "本项目代码采用 [MIT 许可协议](LICENSE)。",
}
MIT_CODE_PATTERN = {
    "en": re.compile(r"This project's code is licensed under \[MIT License\]\([^\s)]+\)(?:\.|,)"),
    "zh-Hans": re.compile(r"本项目代码采用 \[MIT 许可协议\]\([^\s)]+\)(?:。|，)"),
}
CC_BY_4_CONTENT_SENTENCE = {
    "en": "This project's code is licensed under [MIT License](LICENSE), and this website's content is licensed under [CC BY 4.0](LICENSE-docs).",
    "zh-Hans": "本项目代码采用 [MIT 许可协议](LICENSE)，网站内容采用 [CC BY 4.0 许可协议](LICENSE-docs)。",
}
CC_BY_4_LINK_PATTERN = re.compile(r"\[(?:CC BY 4\.0(?: 许可协议)?|知识共享 署名 4\.0 国际许可协议)\]\([^\s)]+\)")
TREE_ENTRY = re.compile(r"^(?P<prefix>(?:│   |    )*)(?:├── |└── )(?P<name>.+)$")
KEBAB = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
COMMIT = re.compile(r"^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([^)]+\))?!?: .+")
HEADINGS = {"## Project Structure", "## 项目结构"}
CORE_SECTIONS = {
    "en": ["## Project Introduction", "## Project Features", "## Getting Started", "## Project Structure"],
    "zh-Hans": ["## 项目简介", "## 项目特性", "## 快速开始", "## 项目结构"],
}
WEBSITE_CORE_SECTIONS = {
    "en": ["## Website Introduction", "## Website Features", "## Getting Started", "## Project Structure"],
    "zh-Hans": ["## 网站简介", "## 网站特性", "## 快速开始", "## 项目结构"],
}
SIGNATURES = ("Co-" + "Authored-By", "Generated " + "with", "Generated " + "by", "AI-" + "generated")


def git(root, *args):
    return subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True, check=False
    )


def repository_slug(root):
    result = git(root, "config", "--get", "remote.origin.url")
    match = re.search(r"github\.com(?::|/)([^/]+/[^/]+?)(?:\.git)?$", result.stdout.strip())
    return match.group(1) if match else None


def read_text(path, errors):
    try:
        raw = path.read_bytes()
        text = raw.decode("utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"{path.name}: file-unreadable: {exc}")
        return None
    if text.startswith("\ufeff") or "\r" in text or not text.endswith("\n"):
        errors.append(f"{path.name}: file-format: use UTF-8 without BOM, LF and a final newline")
    return text


def check_commit(text):
    errors = []
    first = text.strip().splitlines()[0] if text.strip() else ""
    if not first.startswith(("Merge ", "Revert ")) and not COMMIT.fullmatch(first):
        errors.append("commit-conventional: use type(scope): description")
    for marker in SIGNATURES:
        if marker.casefold() in text.casefold():
            errors.append("commit-signature: remove automated authorship or promotional signatures")
    return errors


def check_path(path):
    errors = []
    if not path.isascii():
        errors.append(f"{path}: path-filename-ascii: use English ASCII names")
    if path.endswith(".command") and not KEBAB.fullmatch(Path(path).stem):
        errors.append(f"{path}: command-filename: use a kebab-case launcher name")
    return errors


def check_links(path, text):
    errors = []
    for target in re.findall(r"\]\(([^\s)]+)\)", text):
        if re.match(r"[a-z]+:|#|/", target):
            continue
        local = unquote(target.split("#", 1)[0])
        if local and not (path.parent / local).exists():
            errors.append(f"{path.name}: broken-link: {target}")
    return errors


def combined_content_license(text, language):
    for paragraph in re.split(r"\n\s*\n", text.strip()):
        paragraph = re.sub(r"\s+", " ", paragraph)
        code = MIT_CODE_PATTERN[language].search(paragraph)
        if not code:
            continue
        content = CC_BY_4_LINK_PATTERN.search(paragraph, code.end())
        if not content:
            continue
        clause = paragraph[code.end():content.start()].strip()
        if language == "en":
            if code[0].endswith(",") and clause.startswith("and ") and not re.search(r"[.!?](?:\s|$)", clause):
                return True
        elif code[0].endswith("，") and clause and not re.search(r"[。！？]", clause):
            return True
    return False


def check_tree(block, slug, root=None):
    errors, entries, groups, parents = [], [], {}, []
    lines = block.splitlines()
    if not lines or lines[0] != slug.split("/")[-1] + "/":
        errors.append("project-tree-root: use the actual repository name")
    for raw in lines[1:]:
        if not raw.strip():
            continue
        left = raw.split("#", 1)[0].rstrip()
        match = TREE_ENTRY.fullmatch(left)
        if not match:
            errors.append("project-tree-entry: invalid tree entry")
            continue
        name = match["name"]
        level = len(match["prefix"]) // 4
        if level > len(parents):
            errors.append("project-tree-depth: missing parent directory")
            continue
        parents = parents[:level]
        clean = name.split(" -> ", 1)[0].rstrip("/")
        base = clean.rsplit("/", 1)[-1]
        if base.startswith(("README", "LICENSE")) or base in {
            ".git", ".gitignore", ".gitattributes", ".gitmodules",
            ".agents", ".claude", ".codex", ".cursor", "AGENTS.md", "CLAUDE.md", "GEMINI.md",
        }:
            errors.append("project-tree-common: omit common repository metadata")
        if not clean.isascii():
            errors.append("project-tree-filename: use English ASCII names")
        if root is not None and not root.joinpath(*parents, clean).exists():
            errors.append(f"project-tree-path: listed path does not exist: {'/'.join([*parents, clean])}")
        is_dir = name.split(" -> ", 1)[0].endswith("/")
        groups.setdefault(tuple(parents), []).append((not is_dir, name.casefold()))
        if is_dir:
            parents.append(clean)
        entries.append((raw, len(left)))
        if "#" not in raw or not raw.split("#", 1)[1].strip():
            errors.append("project-tree-comment: every entry needs a useful comment")
    if not entries:
        errors.append("project-tree-empty: include project-specific entries")
    else:
        width = max(36, max(length for _, length in entries) + 1)
        for raw, _ in entries:
            if "#" in raw and raw.index("#") != width:
                errors.append(f"project-tree-align: expected {width} characters before #, got {raw.index('#')}")
    if any(group != sorted(group) for group in groups.values()):
        errors.append("project-tree-order: directories first, each group sorted by name")
    return errors


def check_readme(path, slug, display_name=None, root=None):
    errors = []
    text = read_text(path, errors)
    if text is None:
        return errors
    errors.extend(check_links(path, text))
    chinese = path.name == "README.zh-Hans.md"
    head = text.split("\n## ", 1)[0]
    if not re.search(r'<div\s+align="center">', head):
        errors.append("readme-centered-header: use a centered header")
    title = re.search(r"<h1>([^<]+)</h1>", head)
    if not title:
        errors.append("project-title: missing display name")
    else:
        value = title[1].strip()
        if display_name and value != display_name:
            errors.append("project-title: does not match the established display name")
        if KEBAB.fullmatch(value) and value not in {display_name, TEMPLATE.split("/")[-1]}:
            errors.append("project-title-case: use a display name, not a lowercase repository slug")
    navigation = [
        re.sub(r"\s+", " ", match).strip()
        for match in re.findall(r"<p>(.*?)</p>", head, re.S)
        if "English" in match and "简体中文" in match
    ]
    current = '<strong>简体中文</strong>' if chinese else '<strong>English</strong>'
    other = '<a href="README.md">English</a>' if chinese else '<a href="README.zh-Hans.md">简体中文</a>'
    parts = navigation[0].split(" · ") if navigation else []
    links = [re.fullmatch(r'<a href="(README(?:\.[A-Za-z][A-Za-z0-9-]*)?\.md)">[^<>]+</a>', part) for part in parts if part != current]
    if parts.count(current) != 1 or other not in parts or not all(links) or len(set(parts)) != len(parts):
        errors.append("readme-language-nav: link other languages, bold current language and separate with ·")
    elif any(not (path.parent / link[1]).is_file() for link in links):
        errors.append("readme-language-nav: linked translations must exist")
    sources = re.findall(r'<img\b[^>]*\bsrc="([^"]+)"', head)
    sources += re.findall(r"!\[[^\]]*\]\(([^)]+)\)", head)
    parsed = [urlparse(source.replace("&amp;", "&")) for source in sources]
    for kind in ("last-commit", "languages/top", "repo-size", "license"):
        valid = any(url.netloc == "img.shields.io" and url.path == f"/github/{kind}/{slug}" for url in parsed)
        if kind == "license":
            valid = valid or any(
                url.netloc == "img.shields.io" and url.path.startswith("/badge/license-")
                for url in parsed
            )
        if not valid:
            errors.append(f"readme-required-badges: missing actual {kind} badge for {slug}")
    license_badges = [url for url in parsed if url.netloc == "img.shields.io" and (
        url.path.startswith("/github/license/") or (
            url.path.startswith("/badge/") and re.search(
                r"(?:^|[/_ -])(?:licen[cs]e|cc[_ -](?:by|0))(?:[/_ -]|$)",
                unquote(url.path).casefold(),
            )
        )
    )]
    if len(license_badges) > 1:
        errors.append("readme-license-badges: show only the primary license badge in the header")
    if root:
        workflows = list((root / ".github/workflows").glob("*.yml"))
        workflows += list((root / ".github/workflows").glob("*.yaml"))
        ci_badges = [url for url in parsed if url.path.startswith("/github/actions/workflow/status/")]
        valid = [url for url in ci_badges if url.netloc == "img.shields.io" and url.path.startswith(f"/github/actions/workflow/status/{slug}/")]
        if workflows and not valid:
            errors.append("readme-ci-badge: missing actual workflow badge")
        for url in ci_badges:
            workflow = url.path.rsplit("/", 1)[-1]
            if url not in valid or not (root / ".github/workflows" / workflow).is_file():
                errors.append("readme-ci-badge: workflow or repository does not exist locally")
            if not parse_qs(url.query).get("branch"):
                errors.append("readme-ci-badge: specify the actual branch")
        package = root / "package.json"
        if package.exists():
            try:
                has_prettier = "prettier" in json.loads(package.read_text()).get("devDependencies", {})
            except (ValueError, AttributeError):
                has_prettier = False
            if has_prettier and not any("/badge/code_style-prettier-" in url.path for url in parsed):
                errors.append("readme-formatter-badge: show the configured formatter")
    lines = text.splitlines()
    outside, fence = [], None
    for index, line in enumerate(lines):
        mark = re.match(r"^\s*(`{3,}|~{3,})", line)
        if mark:
            if fence is None:
                fence = mark[1]
            elif line.strip() == fence:
                fence = None
        elif fence is None:
            outside.append((index, line))
    structure = [(index, line) for index, line in outside if line in HEADINGS]
    if len(structure) != 1:
        errors.append("project-tree-missing: include one Project Structure section")
    else:
        start = structure[0][0] + 1
        while start < len(lines) and not lines[start].strip():
            start += 1
        if start >= len(lines) or lines[start] != "```bash":
            errors.append("project-tree-language: tree must use a bash fence")
        else:
            end = start + 1
            while end < len(lines) and lines[end] != "```":
                end += 1
            if end == len(lines):
                errors.append("project-tree-fence: unclosed tree fence")
            else:
                errors.extend(check_tree("\n".join(lines[start + 1:end]), slug, root))
    sections = [(index, line) for index, line in outside if line.startswith("## ")]
    headings = [line for _, line in sections]
    language = "zh-Hans" if chinese else "en"
    website_headings = WEBSITE_CORE_SECTIONS[language]
    expected = website_headings if headings and headings[0] == website_headings[0] else CORE_SECTIONS[language]
    for heading in expected:
        if headings.count(heading) != 1:
            errors.append(f"readme-section-name: require exactly one {heading}")
    if headings[:len(expected)] != expected:
        errors.append("readme-section-order: use the template's exact core headings and order")
    if headings.count(expected[1]) == 1:
        feature_index = headings.index(expected[1])
        start = sections[feature_index][0] + 1
        end = sections[feature_index + 1][0] if feature_index + 1 < len(sections) else len(lines)
        paragraphs = re.split(r"\n\s*\n", "\n".join(lines[start:end]).strip())
        feature_start = r"^[^\x00-\x7f]+ \*\*[^*\n]+\*\* — \S"
        for paragraph in paragraphs:
            if not re.match(feature_start, paragraph) or len(re.findall(feature_start, paragraph, re.M)) != 1:
                errors.append("readme-feature-format: use separate emoji + bold label — explanation paragraphs")
    license_heading = "## 许可协议" if chinese else "## License"
    if not sections or sections[-1][1] != license_heading:
        errors.append("license-section: finish with a license section")
    else:
        license_text = "\n".join(lines[sections[-1][0] + 1:])
        if "MIT" in license_text:
            language = "zh-Hans" if chinese else "en"
            if not re.search(r"\[MIT (?:License|许可协议)\]\([^\s)]+\)", license_text):
                errors.append("license-link: link the code license name")
            if not MIT_CODE_PATTERN[language].search(license_text):
                errors.append("license-wording: use the standard MIT sentence")
            if "CC BY 4.0" in license_text or "知识共享 署名 4.0" in license_text:
                if not CC_BY_4_LINK_PATTERN.search(license_text):
                    errors.append("license-content-link: link the content license name")
                elif not combined_content_license(license_text, language):
                    errors.append("license-combined-sentence: combine code and content licenses in one sentence, using and in English")
    return [error if error.startswith(path.name + ":") else f"{path.name}: {error}" for error in errors]


def check_repository(root, slug, initializing=False, readme_only=False, display_name=None):
    errors = []
    if not re.fullmatch(r"[A-Za-z0-9-]+/[A-Za-z0-9_.-]+", slug):
        return ["repository-name: expected a valid owner/repository"]
    if not readme_only and not KEBAB.fullmatch(slug.split("/")[-1]):
        errors.append("repository-name: new repositories use lowercase kebab-case")
    for name in ("README.md", "README.zh-Hans.md"):
        errors.extend(check_readme(root / name, slug, display_name, root))
    if readme_only:
        return errors
    required = ("AGENTS.md", "LICENSE", ".gitignore", ".gitattributes", "package.json", "package-lock.json", ".prettierrc.json")
    texts = {name: read_text(root / name, errors) for name in required}
    agents = texts["AGENTS.md"] or ""
    errors.extend(check_links(root / "AGENTS.md", agents))
    if STANDARD_URL not in agents:
        errors.append("AGENTS.md: standards-route: retain the canonical standards link")
    for marker in ("<!-- One paragraph", "<!-- Add one row", "REPLACE_PROJECT"):
        if marker in agents:
            errors.append(f"AGENTS.md: unresolved-placeholder: {marker}")
    adapter = root / "CLAUDE.md"
    if adapter.exists() and adapter.read_text().strip() != "@AGENTS.md":
        errors.append("CLAUDE.md: adapter: use only @AGENTS.md")
    if slug == TEMPLATE:
        if not (root / "SETUP.md").is_file():
            errors.append("setup-source: never remove the source guide")
    else:
        if not initializing and (root / "SETUP.md").exists():
            errors.append("setup-cleanup: remove the inherited guide after acceptance")
        if not initializing and (root / ".agents/rules/example.md.template").exists():
            errors.append("setup-cleanup: remove the unused rule example")
        if not initializing and (root / "docs/.gitkeep").exists():
            errors.append("setup-cleanup: remove the unused documentation placeholder")
        if not initializing:
            source = Path(__file__).resolve().parents[1]
            for rel in ("scripts/check_repository.py", "tests/test_repository.py", "tests/scenarios.md", ".github/workflows/ci.yml"):
                target = root / rel
                if target.is_file() and target.read_bytes() == (source / rel).read_bytes():
                    errors.append(f"{rel}: setup-cleanup: replace inherited CI or remove unchanged template-only tooling")
        for name in ("README.md", "README.zh-Hans.md", "AGENTS.md"):
            path = root / name
            if path.is_file():
                for script in re.findall(r"^(?:python3?|node) (scripts/[\w./-]+\.(?:py|js|mjs))\b", path.read_text(), re.M):
                    if not (root / script).is_file():
                        errors.append(f"{name}: stale-command: local script {script} does not exist")
    try:
        package = json.loads(texts["package.json"] or "{}")
        config = json.loads(texts[".prettierrc.json"] or "{}")
        if package.get("name") != slug.split("/")[-1]:
            errors.append("package-identity: replace the template package name")
        if "prettier" not in package.get("devDependencies", {}):
            errors.append("formatter-dependency: declare Prettier")
        scripts = package.get("scripts", {})
        for name, flag in (("format", "--write"), ("format:check", "--check")):
            command = scripts.get(name, "")
            if "prettier" not in command or flag not in command:
                errors.append(f"formatter-script: missing {name}")
        if any(config.get(key) != value for key, value in {
            "printWidth": 100, "singleQuote": True, "trailingComma": "es5"
        }.items()):
            errors.append("formatter-config: use the template defaults")
    except (ValueError, AttributeError, TypeError):
        errors.append("formatter-config: invalid package or formatter JSON")
    return errors


def check_github(root, slug):
    result = subprocess.run(
        ["gh", "repo", "view", slug, "--json", "nameWithOwner,description,repositoryTopics,homepageUrl,defaultBranchRef"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        return ["github-unverified: " + result.stderr.strip()]
    try:
        data = json.loads(result.stdout)
        topics = [item["name"] for item in data.get("repositoryTopics") or []]
        branch = data["defaultBranchRef"]["name"]
    except (ValueError, KeyError, TypeError):
        return ["github-unverified: invalid metadata response"]
    errors = []
    if data.get("nameWithOwner", "").casefold() != slug.casefold():
        errors.append("github-identity: repository mismatch")
    description = data.get("description", "")
    if not description.strip() or re.search(r"[一-鿿]", description):
        errors.append("github-description: provide an English description")
    if not 3 <= len(topics) <= 8 or len(topics) != len(set(topics)) or any(not KEBAB.fullmatch(t) for t in topics):
        errors.append("github-topics: require 3–8 distinct lowercase kebab-case topics")
    homepage = data.get("homepageUrl") or ""
    if homepage and not re.match(r"^https?://[^/\s]+", homepage):
        errors.append("github-homepage: invalid homepage URL")
    for name in ("README.md", "README.zh-Hans.md"):
        path = root / name
        if not path.is_file():
            continue
        for query in re.findall(r"github/actions/workflow/status/[^\s\"<>]+\?([^\s\"<>]+)", path.read_text()):
            if parse_qs(query.replace("&amp;", "&")).get("branch", [None])[0] != branch:
                errors.append(f"{name}: github-branch: badge differs from actual default branch")
    identity = root / "repository.json"
    if identity.exists():
        try:
            expected = json.loads(identity.read_text())
            for key, actual in (("description", description), ("topics", topics), ("homepage", homepage)):
                if key in expected and (sorted(expected[key]) if key == "topics" else expected[key]) != (sorted(actual) if key == "topics" else actual):
                    errors.append(f"repository.json: github-{key}: local and live metadata differ")
        except (ValueError, TypeError):
            errors.append("repository.json: invalid metadata")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--slug")
    parser.add_argument("--display-name")
    parser.add_argument("--initializing", action="store_true")
    parser.add_argument("--readme-only", action="store_true")
    parser.add_argument("--github", action="store_true")
    parser.add_argument("--paths", nargs="+", help="Only validate the listed changed path names")
    parser.add_argument("--commit", type=Path)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    if args.commit:
        try:
            errors = check_commit(args.commit.read_text(encoding="utf-8"))
        except (OSError, UnicodeError) as exc:
            errors = [f"commit-unreadable: {exc}"]
    elif args.paths:
        errors = [error for path in args.paths for error in check_path(path)]
    else:
        slug = args.slug or repository_slug(root)
        if not slug:
            errors = ["repository-identity: configure origin or pass --slug owner/repository"]
        else:
            errors = check_repository(root, slug, args.initializing, args.readme_only, args.display_name)
            if args.github:
                try:
                    errors.extend(check_github(root, slug))
                except OSError as exc:
                    errors.append(f"github-unverified: {exc}")
            else:
                print("GitHub About and default branch were not verified (use --github).")
    for error in errors:
        print(f"ERROR {error}")
    if not errors:
        print("Applicable repository checks passed; semantic and runtime acceptance remain separate.")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())

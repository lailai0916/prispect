import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("checker", ROOT / "scripts/check_repository.py")
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


class RepositoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ("README.md", "README.zh-Hans.md", "AGENTS.md", "LICENSE", ".gitignore",
                     ".gitattributes", "package.json", "package-lock.json", ".prettierrc.json"):
            text = (ROOT / name).read_text().replace(checker.TEMPLATE, "example/csv-diff")
            text = text.replace("lailai-template", "csv-diff")
            text = text.replace("<h1>csv-diff</h1>", "<h1>CSV Diff</h1>")
            text = text.replace("https://github.com/example/csv-diff/blob/main/SETUP.md", checker.STANDARD_URL)
            text = text.replace("](SETUP.md)", "](" + checker.STANDARD_URL + ")")
            text = text.replace("scripts/check_repository.py --root .", "start.py")
            text = text.replace("└── SETUP.md                        #", "└── start.py                        #")
            (self.root / name).write_text(text, encoding="utf-8")
        (self.root / "AGENTS.md").write_text(
            "# CSV Diff\n\nRepository standards: " + checker.STANDARD_URL + "\n",
            encoding="utf-8",
        )
        (self.root / ".github/workflows").mkdir(parents=True)
        (self.root / ".github/workflows/ci.yml").write_text("name: CI\non: push\njobs: {}\n")
        (self.root / "scripts").mkdir()
        (self.root / "tests").mkdir()
        (self.root / "start.py").write_text("print('CSV Diff')\n")
        (self.root / "LICENSE-docs").write_text("CC BY 4.0\n")

    def readme(self, text):
        path = self.root / "README.md"
        path.write_text(text, encoding="utf-8")
        return checker.check_readme(path, "example/csv-diff", root=self.root)

    def test_source_and_generated_repository(self):
        self.assertEqual(checker.check_repository(ROOT, checker.TEMPLATE), [])
        self.assertEqual(checker.check_repository(self.root, "example/csv-diff"), [])

    def test_external_root_ignores_callers_ci_identity(self):
        env = {**os.environ, "GITHUB_REPOSITORY": checker.TEMPLATE}
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/check_repository.py"), "--root", str(self.root),
             "--slug", "example/csv-diff"], cwd=ROOT, env=env, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        (self.root / "README.md").write_text("broken\n")
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/check_repository.py"), "--root", str(self.root),
             "--slug", "example/csv-diff"], cwd=ROOT, env=env, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)

    def test_cleanup_lifecycle_and_permanent_source(self):
        (self.root / "SETUP.md").write_text("# Setup\n")
        self.assertEqual(checker.check_repository(self.root, "example/csv-diff", initializing=True), [])
        self.assertTrue(any("setup-cleanup" in e for e in checker.check_repository(self.root, "example/csv-diff")))
        (self.root / "SETUP.md").unlink()
        self.assertEqual(checker.check_repository(self.root, "example/csv-diff"), [])
        (self.root / "AGENTS.md").write_text("# Local map\n")
        self.assertTrue(any("standards-route" in e for e in checker.check_repository(self.root, "example/csv-diff")))

    def test_missing_files_report_errors(self):
        (self.root / "README.md").unlink()
        (self.root / "package.json").unlink()
        self.assertTrue(checker.check_repository(self.root, "example/csv-diff"))

    def test_cleanup_rejects_broken_links_and_template_copies(self):
        readme = self.root / "README.md"
        readme.write_text(readme.read_text().replace(checker.STANDARD_URL, "SETUP.md"))
        self.assertTrue(any("broken-link" in e for e in checker.check_repository(self.root, "example/csv-diff")))
        shutil.copyfile(ROOT / "scripts/check_repository.py", self.root / "scripts/check_repository.py")
        errors = checker.check_repository(self.root, "example/csv-diff")
        self.assertTrue(any("unchanged template-only tooling" in e for e in errors))
        (self.root / "scripts/check_repository.py").unlink()
        readme.write_text(readme.read_text() + "\n```bash\npython3 scripts/check_repository.py\n```\n")
        self.assertTrue(any("stale-command" in e for e in checker.check_repository(self.root, "example/csv-diff")))

    def test_default_long_and_unicode_tree_alignment(self):
        def tree(names, width):
            return "csv-diff/\n" + "\n".join(name.ljust(width) + "# Comment" for name in names)
        names = ["├── src/", "└── main.py"]
        self.assertEqual(checker.check_tree(tree(names, 36), "example/csv-diff"), [])
        self.assertTrue(any("project-tree-align" in e for e in checker.check_tree(tree(names, 32), "example/csv-diff")))
        names = ["├── src/", "└── a-very-long-project-specific-filename.py"]
        width = len(names[1]) + 1
        self.assertEqual(checker.check_tree(tree(names, width), "example/csv-diff"), [])
        unicode_errors = checker.check_tree(tree(["└── 中文.py"], 36), "example/csv-diff")
        self.assertTrue(any("project-tree-filename" in e for e in unicode_errors))
        self.assertFalse(any("project-tree-align" in e for e in unicode_errors))

    def test_tree_order_comments_and_scope(self):
        tree = "csv-diff/\n├── README.md # Generic\n├── main.py # File\n└── src/\n"
        errors = checker.check_tree(tree, "example/csv-diff")
        for code in ("project-tree-common", "project-tree-order", "project-tree-align", "project-tree-comment"):
            self.assertTrue(any(code in error for error in errors), code)
        nested = "csv-diff/\n" + "\n".join(line.ljust(36) + "# Comment" for line in (
            "├── src/", "│   ├── lib/", "│   │   └── core.py", "│   └── main.py", "└── tests/"))
        self.assertEqual(checker.check_tree(nested, "example/csv-diff"), [])

    def test_navigation_title_badges_and_license(self):
        good = (self.root / "README.md").read_text()
        cases = (
            ('align="center"', 'align="left"', "readme-centered-header"),
            (" · ", " | ", "readme-language-nav"),
            ("<strong>English</strong>", "English", "readme-language-nav"),
            ("<h1>CSV Diff</h1>", "<h1>csv-diff</h1>", "project-title-case"),
            ("github/last-commit/example/csv-diff", "github/last-commit/wrong/repo", "readme-required-badges"),
            ("csv-diff/ci.yml?", "csv-diff/missing.yml?", "readme-ci-badge"),
            ("```bash\ncsv-diff/", "```text\ncsv-diff/", "project-tree-language"),
            ("[MIT License](LICENSE)", "MIT License", "license-link"),
            ("This project's code is licensed under [MIT License](LICENSE).", "Licensed under [MIT License](LICENSE).", "license-wording"),
        )
        for before, after, code in cases:
            with self.subTest(code=code):
                self.assertTrue(any(code in error for error in self.readme(good.replace(before, after))))
        self.assertTrue(any("project-tree-missing" in error for error in self.readme(good.replace("## Project Structure", "## Other"))))
        self.assertEqual(self.readme(good.replace("<p><strong>", "<p>\n<strong>")), [])
        static_license = good.replace(
            "github/license/example/csv-diff",
            "badge/license-MIT-blue",
        )
        self.assertEqual(self.readme(static_license), [])

    def test_text_content_license_wording(self):
        for filename, ordinary, combined in (
            ("README.md", checker.MIT_CODE_SENTENCE["en"], checker.CC_BY_4_CONTENT_SENTENCE["en"]),
            ("README.zh-Hans.md", checker.MIT_CODE_SENTENCE["zh-Hans"], checker.CC_BY_4_CONTENT_SENTENCE["zh-Hans"]),
        ):
            path = self.root / filename
            original = path.read_text()
            website = original.replace(ordinary, combined)
            path.write_text(website)
            with self.subTest(filename=filename):
                self.assertEqual(checker.check_readme(path, "example/csv-diff", root=self.root), [])
                invalid = website.replace(
                    "[CC BY 4.0](LICENSE-docs)" if filename == "README.md" else "[CC BY 4.0 许可协议](LICENSE-docs)",
                    "CC BY 4.0",
                )
                path.write_text(invalid)
                self.assertTrue(any("license-content-link" in error for error in checker.check_readme(path, "example/csv-diff", root=self.root)))
            path.write_text(original)

    def test_only_primary_license_badge(self):
        good = (self.root / "README.md").read_text()
        for source in (
            "badge/docs-CC_BY_4.0-green",
            "badge/docs_license-CC_BY_4.0-green",
            "badge/license-MIT-blue",
            "github/license/example/csv-diff",
        ):
            for image in ('<img src="https://img.shields.io/' + source + '" />',
                          '![License](https://img.shields.io/' + source + ')'):
                with self.subTest(image=image):
                    errors = self.readme(good.replace("</div>", image + "\n</div>", 1))
                    self.assertTrue(any("readme-license-badges" in error for error in errors))
        docs_status = '<img src="https://img.shields.io/badge/docs-online-green" />'
        self.assertEqual(self.readme(good.replace("</div>", docs_status + "\n</div>", 1)), [])

    def test_content_licenses_share_one_sentence(self):
        for filename, language, subject in (
            ("README.md", "en", "Skill text and position material are licensed under"),
            ("README.zh-Hans.md", "zh-Hans", "Skill 文本与思想材料采用"),
        ):
            path = self.root / filename
            original = path.read_text()
            combined = checker.CC_BY_4_CONTENT_SENTENCE[language].replace(
                "this website's content is licensed under" if language == "en" else "网站内容采用",
                subject,
            )
            good = original.replace(checker.MIT_CODE_SENTENCE[language], combined)
            separator = ", and " if language == "en" else "，"
            period = "." if language == "en" else "。"
            valid = (good, good.replace(separator, separator + "\n"),
                     good.replace("](LICENSE)", "](https://github.com/example/csv-diff/blob/main/LICENSE)"))
            for text in valid:
                path.write_text(text)
                self.assertEqual(checker.check_readme(path, "example/csv-diff", root=self.root), [])
            invalid = (period + "\n\n", period + " ", separator + "\n\n")
            if language == "en":
                invalid += (", ",)
            for replacement in invalid:
                with self.subTest(language=language, replacement=replacement):
                    path.write_text(good.replace(separator, replacement))
                    errors = checker.check_readme(path, "example/csv-diff", root=self.root)
                    self.assertTrue(any("license-combined-sentence" in error for error in errors))
            path.write_text(original)

    def test_exact_section_names_and_order(self):
        for filename, cases in (
            ("README.md", (("Project Introduction", "Introduction"),
                           ("Project Features", "Features"),
                           ("Getting Started", "Quick Start"))),
            ("README.zh-Hans.md", (("项目简介", "简介"), ("项目特性", "特性"),
                                   ("快速开始", "安装"))),
        ):
            path = self.root / filename
            good = path.read_text()
            for before, after in cases:
                with self.subTest(filename=filename, heading=before):
                    path.write_text(good.replace("## " + before, "## " + after))
                    errors = checker.check_readme(path, "example/csv-diff", root=self.root)
                    self.assertTrue(any("readme-section-name" in error for error in errors))
            path.write_text(good)
        good = (self.root / "README.md").read_text()
        swapped = good.replace("## Project Introduction", "## TEMP").replace(
            "## Project Features", "## Project Introduction").replace("## TEMP", "## Project Features")
        self.assertTrue(any("readme-section-order" in error for error in self.readme(swapped)))
        duplicate = good.replace("## Project Introduction", "## Project Introduction\n\n## Project Introduction")
        self.assertTrue(any("readme-section-name" in error for error in self.readme(duplicate)))

    def test_website_section_names_and_order(self):
        for filename, replacements in (
            ("README.md", (("Project Introduction", "Website Introduction"),
                           ("Project Features", "Website Features"))),
            ("README.zh-Hans.md", (("项目简介", "网站简介"), ("项目特性", "网站特性"))),
        ):
            path = self.root / filename
            original = path.read_text()
            website = original
            for before, after in replacements:
                website = website.replace("## " + before, "## " + after)
            path.write_text(website)
            self.assertEqual(checker.check_readme(path, "example/csv-diff", root=self.root), [])
            path.write_text(original)

    def test_feature_paragraph_format(self):
        good = (self.root / "README.md").read_text()
        for before, after in (("📄 **Shared Standards** —", "- 📄 **Shared Standards** —"),
                              ("📄 **Shared Standards** —", "📄 **Shared Standards** -"),
                              ("\n\n🗺️ **Ongoing Maintenance**", "\n🗺️ **Ongoing Maintenance**")):
            with self.subTest(after=after):
                errors = self.readme(good.replace(before, after))
                self.assertTrue(any("readme-feature-format" in error for error in errors))

    def test_tree_excludes_agent_metadata_and_checks_paths(self):
        for name in ("AGENTS.md", "CLAUDE.md", "GEMINI.md", ".agents/", ".codex/"):
            with self.subTest(name=name):
                tree = "csv-diff/\n" + ("└── " + name).ljust(36) + "# Metadata"
                self.assertTrue(any("project-tree-common" in e for e in checker.check_tree(tree, "example/csv-diff")))
        skill_tree = "csv-diff/\n" + "└── SKILL.md".ljust(36) + "# Product entry"
        self.assertEqual(checker.check_tree(skill_tree, "example/csv-diff"), [])
        good = (self.root / "README.md").read_text()
        errors = self.readme(good.replace("└── start.py ", "└── ghost.py "))
        self.assertTrue(any("project-tree-path" in error for error in errors))

    def test_explicit_brand_and_legitimate_upstream_reference(self):
        good = (self.root / "README.md").read_text().replace("<h1>CSV Diff</h1>", "<h1>brand</h1>")
        self.readme(good)
        self.assertEqual(checker.check_readme(self.root / "README.md", "example/csv-diff", "brand", self.root), [])
        self.assertEqual(checker.check_readme(self.root / "README.zh-Hans.md", "example/csv-diff", root=self.root), [])

    def test_additional_languages_keep_the_same_navigation_rules(self):
        good = (self.root / "README.md").read_text()
        extended = good.replace('简体中文</a></p>', '简体中文</a> · <a href="README.fr.md">Français</a></p>')
        self.assertTrue(any("linked translations" in e for e in self.readme(extended)))
        (self.root / "README.fr.md").write_text("# CSV Diff\n")
        self.assertEqual(self.readme(extended), [])
        invalid = extended.replace('<a href="README.fr.md">Français</a>', '<strong>Français</strong>')
        self.assertTrue(any("readme-language-nav" in e for e in self.readme(invalid)))

    def test_paths_and_commit_subjects(self):
        self.assertEqual(checker.check_path("tools/start.command"), [])
        self.assertTrue(checker.check_path("tools/启动.command"))
        self.assertTrue(checker.check_path("tools/Start.command"))
        for message in ("fix: align trees", "feat(cli)!: change arguments", "Merge branch 'main'", "Revert old commit"):
            self.assertEqual(checker.check_commit(message), [])
        for message in ("", "update", "fix align", "fix: align\n\nCo-" + "Authored-By: Bot"):
            self.assertTrue(checker.check_commit(message))

    def test_remote_metadata_and_failures(self):
        data = {"nameWithOwner": "example/csv-diff", "description": "Compare CSV files.",
                "repositoryTopics": [{"name": t} for t in ("csv", "cli", "python")],
                "defaultBranchRef": {"name": "main"}, "homepageUrl": ""}
        def response(value):
            return subprocess.CompletedProcess([], 0, json.dumps(value), "")
        with patch.object(checker.subprocess, "run", return_value=response(data)):
            self.assertEqual(checker.check_github(self.root, "example/csv-diff"), [])
        identity = self.root / "repository.json"
        identity.write_text(json.dumps({"homepage": "https://example.com/csv-diff"}))
        with patch.object(checker.subprocess, "run", return_value=response(data)):
            self.assertTrue(any("github-homepage" in e for e in checker.check_github(self.root, "example/csv-diff")))
        data["homepageUrl"] = "https://example.com/csv-diff"
        with patch.object(checker.subprocess, "run", return_value=response(data)):
            self.assertEqual(checker.check_github(self.root, "example/csv-diff"), [])
        data["repositoryTopics"] = []
        data["defaultBranchRef"]["name"] = "develop"
        with patch.object(checker.subprocess, "run", return_value=response(data)):
            errors = checker.check_github(self.root, "example/csv-diff")
            self.assertTrue(any("github-topics" in e for e in errors))
            self.assertTrue(any("github-branch" in e for e in errors))
        with patch.object(checker.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "not authenticated")):
            self.assertTrue(any("github-unverified" in e for e in checker.check_github(self.root, "example/csv-diff")))


if __name__ == "__main__":
    unittest.main()

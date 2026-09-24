import io
import zipfile

from agents.vault import parse_note, read_vault_upload

NOTE = """---
title: "Learning LangChain"
status: To Read
created: 2026-05-25
tags:
  - book
  - review
---

# Learning LangChain

> [!info] Links
> See [[Study Stack]] and [[Home|the dashboard]], plus ![[Assets/cover.png]].
> ![[Assets/book.epub#page=1|right|200]] <div style="color:#fff">x</div>

Tagged #ai/llm inline. Not a tag: `#fff` or [link](http://x.com/#frag).

```python
x = "#notatag"
```
"""


def test_parse_note_frontmatter_tags_links():
    n = parse_note("10 - Books/Learning LangChain.md", NOTE)
    assert n["title"] == "Learning LangChain"
    assert n["folder"] == "10 - Books"
    assert n["frontmatter"]["status"] == "To Read"
    assert n["frontmatter"]["created"] == "2026-05-25"  # YAML date -> JSON-safe string
    assert n["tags"] == ["ai/llm", "book", "review"]
    assert n["links"] == ["Assets/book.epub", "Assets/cover.png", "Home", "Study Stack"]
    assert not n["content"].startswith("---")  # frontmatter stripped from the body


def test_malformed_frontmatter_keeps_note():
    n = parse_note("x.md", "---\n: : bad\n---\nbody")
    assert n["frontmatter"] == {}
    assert n["content"].strip() == "body"


def _zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, text in files.items():
            z.writestr(name, text)
    return buf.getvalue()


def test_zip_upload_strips_vault_root_and_skips_non_notes():
    raw = _zip({
        "Obsidian Vault/10 - Books/A.md": "# A",
        "Obsidian Vault/Home.md": "# Home",
        "Obsidian Vault/.obsidian/workspace.md": "config",
        "Obsidian Vault/Assets/book.pdf": "pdf bytes",
    })
    paths = sorted(n["path"] for n in read_vault_upload([("vault.zip", raw)]))
    assert paths == ["10 - Books/A.md", "Home.md"]


def test_folder_pick_upload_uses_relative_paths():
    notes = read_vault_upload([
        ("Obsidian Vault/20 - Courses/C.md", b"# C"),
        ("Obsidian Vault/.smart-env/x.md", b"cache"),
    ])
    assert [n["path"] for n in notes] == ["20 - Courses/C.md"]


def test_replace_vault_notes_is_full_sync(tracker, test_user):
    tracker.replace_vault_notes(test_user, [parse_note("a.md", "# A [[b]]"), parse_note("b.md", "# B")])
    tracker.replace_vault_notes(test_user, [parse_note("b.md", "# B edited")])
    listed = tracker.list_vault_notes(test_user)
    assert [n["path"] for n in listed] == ["b.md"]  # a.md removed by the resync
    assert tracker.get_vault_note(test_user, "b.md")["content"] == "# B edited"
    hits = tracker.search_vault_notes(test_user, "edited")
    assert hits[0]["path"] == "b.md" and "edited" in hits[0]["snippet"]

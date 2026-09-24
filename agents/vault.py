"""
Obsidian vault import — turns a vault's Markdown notes into rows for the
Learning > Vault tab.

Two entry points feed the same parser:
  - read_vault_dir(path): the `main.py vault-sync` CLI, reading the vault
    straight off disk on the machine where Obsidian lives.
  - read_vault_upload(files): the dashboard's upload button — either one .zip
    of the vault, or the .md files picked from the vault folder in the browser.

Only .md notes are imported. Attachments (PDFs/EPUBs/images under Assets/)
are skipped on purpose: they're what makes a vault hundreds of MB, far over
the API host's request limit, and the notes are the part worth reading here.
"""
import io
import re
import zipfile
from pathlib import Path, PurePosixPath

import yaml

# Obsidian's own config + plugin caches — never user notes.
_SKIP_DIRS = {".obsidian", ".trash", ".makemd", ".smart-env", ".git"}
MAX_NOTE_BYTES = 512 * 1024
MAX_NOTES = 5000

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.S)
# [[Target]], [[Target|alias]], [[Target#Heading]], and ![[embeds]]
_WIKILINK_RE = re.compile(r"!?\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]")
# Inline #tags — not headings ("# Title"), not URL fragments, not hex colors in code
_INLINE_TAG_RE = re.compile(r"(?<![\w&/#])#([A-Za-z][\w/-]*)")
_CODE_RE = re.compile(r"```.*?```|`[^`\n]*`", re.S)


def _is_skipped(rel_path: str) -> bool:
    parts = PurePosixPath(rel_path).parts
    return any(p in _SKIP_DIRS or p.startswith(".") for p in parts[:-1])


def parse_note(rel_path: str, text: str) -> dict:
    """One note -> {path, folder, title, frontmatter, tags, links, content}.
    `content` is the body with frontmatter stripped; rendering (callouts,
    wikilinks, dataview placeholders) happens in the frontend."""
    rel_path = rel_path.replace("\\", "/").lstrip("/")
    p = PurePosixPath(rel_path)

    frontmatter: dict = {}
    body = text
    m = _FRONTMATTER_RE.match(text)
    if m:
        try:
            loaded = yaml.safe_load(m.group(1))
            if isinstance(loaded, dict):
                frontmatter = loaded
        except yaml.YAMLError:
            pass  # malformed frontmatter: keep the note, just without properties
        body = text[m.end():]

    tags = frontmatter.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in re.split(r"[,\s]+", tags) if t.strip()]
    tags = {str(t).lstrip("#") for t in tags if t}
    # Inline #tags only from prose: code, [[links/embeds#page=1]], HTML
    # (style="...#fff") and link URLs all contain '#' that isn't a tag.
    prose = _CODE_RE.sub("", body)
    prose = re.sub(r"!?\[\[[^\]]*\]\]|<[^>\n]*>|\]\([^)]*\)|https?://\S+", "", prose)
    tags |= set(_INLINE_TAG_RE.findall(prose))

    links = sorted({l.strip() for l in _WIKILINK_RE.findall(body)})

    return {
        "path": rel_path,
        "folder": str(p.parent) if str(p.parent) != "." else "",
        "title": p.stem,
        # YAML turns bare dates into date objects — stringify so it's JSON-safe
        "frontmatter": {str(k): (v if isinstance(v, (str, int, float, bool, list, type(None))) else str(v))
                        for k, v in frontmatter.items()},
        "tags": sorted(tags),
        "links": links,
        "content": body,
    }


def _collect(entries) -> list[dict]:
    """entries: iterable of (rel_path, raw_bytes). Filters, decodes, parses."""
    notes = []
    for rel_path, raw in entries:
        rel_path = rel_path.replace("\\", "/")
        if not rel_path.lower().endswith(".md") or _is_skipped(rel_path):
            continue
        if len(raw) > MAX_NOTE_BYTES:
            continue
        notes.append(parse_note(rel_path, raw.decode("utf-8", errors="replace")))
        if len(notes) >= MAX_NOTES:
            break
    return notes


def _strip_common_root(paths: list[str]) -> str:
    """A zip of "Obsidian Vault/" (or a browser folder pick) prefixes every
    path with the vault's own folder name — drop it so paths match what
    Obsidian shows (e.g. "10 - Books/x.md", not "Obsidian Vault/10 - Books/x.md")."""
    firsts = {PurePosixPath(p).parts[0] for p in paths if len(PurePosixPath(p).parts) > 1}
    if len(firsts) == 1 and all(len(PurePosixPath(p).parts) > 1 for p in paths):
        return firsts.pop() + "/"
    return ""


def read_vault_dir(vault_path: str) -> list[dict]:
    root = Path(vault_path).expanduser()
    if not root.is_dir():
        raise FileNotFoundError(f"Vault folder not found: {root}")
    entries = []
    for f in sorted(root.rglob("*.md")):
        rel = f.relative_to(root).as_posix()
        if _is_skipped(rel):
            continue
        entries.append((rel, f.read_bytes()))
    return _collect(entries)


def read_vault_upload(files: list[tuple[str, bytes]]) -> list[dict]:
    """files: [(filename, raw)] — a single .zip, or .md files whose filenames
    carry their path inside the vault (the browser's webkitRelativePath)."""
    if len(files) == 1 and files[0][0].lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(files[0][1])) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".md") and not n.startswith("__MACOSX/")]
            prefix = _strip_common_root(names)
            entries = [(n[len(prefix):], z.read(n)) for n in names if z.getinfo(n).file_size <= MAX_NOTE_BYTES]
        return _collect(entries)

    prefix = _strip_common_root([name for name, _ in files])
    return _collect((name[len(prefix):], raw) for name, raw in files)

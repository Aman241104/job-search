'use client';

import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import {
  CaretRight, CircleNotch, FileText, FolderSimple, FolderOpen, FolderSimpleDashed,
  MagnifyingGlass, Paperclip, UploadSimple, FileZip, ArrowBendUpLeft, Lightning, Hash,
} from '@phosphor-icons/react';
import { api, VaultNote, VaultNoteMeta, VaultSearchHit } from '@/lib/api';
import { useToast } from '@/components/Toast';

// ── Obsidian -> plain Markdown ───────────────────────────────────────────────
// react-markdown understands GFM, not Obsidian. Rewrite the Obsidian-only
// syntax into things it can render: wikilinks become in-app links, callouts
// get a marker the blockquote renderer picks up, and plugin blocks
// (dataview etc.) that only execute inside Obsidian become a short notice.

const CALLOUT_TOKEN = '⟦callout:';
const LIVE_BLOCK_LANGS = /^(dataviewjs|dataview|tasks|meta-bind[\w-]*|button|kanban|mindmap|excalidraw)$/;
const VAULT_HREF = '#vault=';

function obsidianToMarkdown(body: string): string {
  const out: string[] = [];
  const lines = body.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const bare = line.replace(/^(?:>\s?)*/, '');
    if (bare.startsWith('```')) inFence = !inFence;
    // Obsidian renders every single newline as a line break; Markdown joins
    // them. Trailing double-space = hard break (skipped inside code).
    else if (!inFence && bare.trim() && !/^\s*(\||#|- |\* |\d+\. |---)/.test(bare)) line = `${line}  `;

    // Plugin code fences (possibly inside callouts, so keep the "> " prefix).
    const fence = line.match(/^((?:>\s?)*)```\s*([\w-]+)\s*$/);
    if (fence && LIVE_BLOCK_LANGS.test(fence[2])) {
      const prefix = fence[1];
      while (i + 1 < lines.length && !lines[i + 1].replace(/^(?:>\s?)*/, '').startsWith('```')) i++;
      i++; // closing fence
      inFence = false;
      out.push(`${prefix}*⚡ Live ${fence[2]} block — runs inside Obsidian*`);
      continue;
    }

    // Callout header: "> [!type] Title" at any nesting depth. The empty ">"
    // line after it keeps the title in its own paragraph.
    const callout = line.match(/^((?:>\s?)+)\[!([\w-]+)\][+-]?\s*(.*)$/);
    if (callout) {
      const prefix = callout[1];
      out.push(`${prefix}${CALLOUT_TOKEN}${callout[2].toLowerCase()}⟧ ${callout[3]}`);
      out.push(prefix.trimEnd());
      continue;
    }
    // Raw HTML isn't rendered (no rehype-raw — vault HTML is untrusted-ish
    // and mostly Obsidian-CSS layout anyway); keep its text. Trim what's
    // left, or the HTML's own indentation turns it into a code block.
    if (/<\/?[a-zA-Z][^>\n]*>/.test(line)) {
      const prefix = line.match(/^(?:>\s?)*/)?.[0] ?? '';
      const text = line.slice(prefix.length).replace(/<\/?[a-zA-Z][^>\n]*>/g, '').trim();
      if (text) out.push(`${prefix}${text}`);
      continue;
    }
    out.push(line);
  }

  return out
    .join('\n')
    // ![[embed]] -> attachment/note link; [[target#heading|alias]] -> link
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, (_, t: string) =>
      `[\u{1F4CE} ${t.split('/').pop()}](${VAULT_HREF}${encodeURIComponent(t.trim())})`)
    .replace(/\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (_, t: string, h?: string, alias?: string) =>
      `[${alias || (h ? `${t} › ${h}` : t)}](${VAULT_HREF}${encodeURIComponent(t.trim())})`)
    // ==highlight==
    .replace(/==([^=\n]+)==/g, '**$1**');
}

const CALLOUT_STYLES: Record<string, string> = {
  info: 'border-accent-cyan/30 bg-accent-cyan/5',
  note: 'border-accent-cyan/30 bg-accent-cyan/5',
  abstract: 'border-accent-cyan/30 bg-accent-cyan/5',
  summary: 'border-accent-cyan/30 bg-accent-cyan/5',
  todo: 'border-accent-cyan/30 bg-accent-cyan/5',
  tip: 'border-accent-green/30 bg-accent-green/5',
  success: 'border-accent-green/30 bg-accent-green/5',
  done: 'border-accent-green/30 bg-accent-green/5',
  question: 'border-accent-yellow/30 bg-accent-yellow/5',
  warning: 'border-accent-yellow/30 bg-accent-yellow/5',
  caution: 'border-accent-yellow/30 bg-accent-yellow/5',
  danger: 'border-accent-pink/30 bg-accent-pink/5',
  error: 'border-accent-pink/30 bg-accent-pink/5',
  bug: 'border-accent-pink/30 bg-accent-pink/5',
  example: 'border-accent-purple/30 bg-accent-purple/5',
  quote: 'border-white/15 bg-white/[0.03]',
};

// Plain text of a hast node — used to spot the callout marker.
type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] };
function hastText(n?: HastNode): string {
  if (!n) return '';
  if (n.type === 'text') return n.value || '';
  return (n.children || []).map(hastText).join('');
}

function Blockquote({ node, children }: { node?: HastNode; children?: ReactNode }) {
  const firstP = node?.children?.find((c) => c.type === 'element' && c.tagName === 'p');
  const head = hastText(firstP);
  const m = head.match(/^⟦callout:([\w-]+)⟧\s*([\s\S]*)$/);
  if (!m) return <blockquote>{children}</blockquote>;

  const [, type, title] = m;
  // Drop the marker paragraph; everything after it is the callout body.
  let dropped = false;
  const body = Children.toArray(children).filter((c) => {
    if (!dropped && isValidElement(c) && c.type === 'p') {
      dropped = true;
      return false;
    }
    return true;
  });

  if (type === 'multi-column') {
    return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 my-4 [&>*]:my-0">{body}</div>;
  }
  return (
    <div className={clsx('rounded-xl border px-4 py-3 my-4', CALLOUT_STYLES[type] || 'border-white/10 bg-white/[0.03]')}>
      {title.trim() && <p className="!mt-0 !mb-2 text-sm font-semibold text-white/85">{title.trim()}</p>}
      <div className="text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{body}</div>
    </div>
  );
}

// ── Link resolution ──────────────────────────────────────────────────────────

function stem(path: string) {
  return (path.split('/').pop() || path).replace(/\.md$/i, '');
}

/** Obsidian resolves [[X]] by exact path first, then by note name anywhere. */
function resolveLink(target: string, notes: VaultNoteMeta[]): VaultNoteMeta | null {
  const t = target.replace(/\.md$/i, '').toLowerCase();
  return (
    notes.find((n) => n.path.replace(/\.md$/i, '').toLowerCase() === t) ||
    notes.find((n) => stem(n.path).toLowerCase() === stem(t)) ||
    null
  );
}

// Frontmatter keys that are Obsidian plumbing, not something to read.
const HIDDEN_PROPS = new Set(['title', 'tags', 'cssclasses', 'cssclass', 'cover_url', 'pdf_file', 'aliases']);

function Properties({ fm }: { fm: Record<string, unknown> }) {
  const total = Number(fm.total_pages ?? fm.total_hours ?? 0);
  const done = Number(fm.completed_pages ?? fm.completed_hours ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  const entries = Object.entries(fm).filter(
    ([k, v]) => !HIDDEN_PROPS.has(k) && !/^(total|completed)_(pages|hours)$/.test(k) && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  );
  if (entries.length === 0 && pct === null) return null;

  return (
    <div className="glass-panel rounded-2xl p-4 mb-6">
      {pct !== null && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-white/45 mb-1.5">
            <span>Progress</span>
            <span className="font-mono">{done}/{total} · {pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-accent-green transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1.5 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/35 capitalize">{k.replace(/_/g, ' ')}</dt>
            <dd className="text-white/75 break-words">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Folder tree ──────────────────────────────────────────────────────────────

type Tree = { folders: Record<string, Tree>; notes: VaultNoteMeta[] };

function buildTree(notes: VaultNoteMeta[]): Tree {
  const root: Tree = { folders: {}, notes: [] };
  for (const n of notes) {
    let node = root;
    for (const part of n.folder ? n.folder.split('/') : []) {
      node = node.folders[part] ??= { folders: {}, notes: [] };
    }
    node.notes.push(n);
  }
  return root;
}

function TreeView({ tree, depth, open, toggle, selected, onSelect, prefix }: {
  tree: Tree; depth: number; open: Set<string>; toggle: (p: string) => void;
  selected: string | null; onSelect: (p: string) => void; prefix: string;
}) {
  return (
    <>
      {Object.keys(tree.folders).sort().map((name) => {
        const path = prefix ? `${prefix}/${name}` : name;
        const isOpen = open.has(path);
        // Johnny-Decimal style "10 - Books": dim the number, keep the name
        const num = name.match(/^(\d+)\s*-\s*(.*)$/);
        return (
          <div key={path}>
            <button
              onClick={() => toggle(path)}
              className="w-full flex items-center gap-1.5 py-1.5 pr-2 rounded-lg text-xs text-white/60 hover:bg-white/5 hover:text-white/85"
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              <CaretRight size={10} className={clsx('flex-shrink-0 transition-transform', isOpen && 'rotate-90')} />
              {isOpen ? <FolderOpen size={14} className="flex-shrink-0 text-accent-yellow/80" /> : <FolderSimple size={14} className="flex-shrink-0 text-accent-yellow/70" />}
              <span className="truncate font-medium">
                {num ? <><span className="font-mono text-white/25 mr-1">{num[1]}</span>{num[2]}</> : name}
              </span>
            </button>
            {isOpen && (
              <TreeView tree={tree.folders[name]} depth={depth + 1} open={open} toggle={toggle}
                selected={selected} onSelect={onSelect} prefix={path} />
            )}
          </div>
        );
      })}
      {tree.notes.map((n) => (
        <button
          key={n.path}
          onClick={() => onSelect(n.path)}
          className={clsx(
            'w-full flex items-center gap-1.5 py-1.5 pr-2 rounded-lg text-xs text-left transition-colors',
            selected === n.path ? 'bg-accent-green/10 text-accent-green' : 'text-white/55 hover:bg-white/5 hover:text-white/85'
          )}
          style={{ paddingLeft: 22 + depth * 14 }}
          title={n.path}
        >
          <FileText size={13} className="flex-shrink-0" />
          <span className="truncate">{n.title}</span>
        </button>
      ))}
    </>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function VaultPanel() {
  const { toast } = useToast();
  const [notes, setNotes] = useState<VaultNoteMeta[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<VaultNote | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<VaultSearchHit[] | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const noteScroll = useRef<HTMLDivElement>(null);

  const load = async (keepSelection = false) => {
    try {
      const data = await api.listVault();
      setNotes(data.notes);
      setSyncedAt(data.synced_at);
      if (!keepSelection && data.notes.length) {
        // Open on the vault's home/dashboard note if there is one
        const home = data.notes.find((n) => /^(home|index|dashboard)$/i.test(n.title)) || data.notes[0];
        setSelected(home.path);
        setOpen(new Set(home.folder ? home.folder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/')) : []));
      }
    } catch {
      toast('Failed to load your vault', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setNoteLoading(true);
    api.getVaultNote(selected)
      .then((n) => { if (!cancelled) setNote(n); })
      .catch(() => { if (!cancelled) toast('Failed to open note', 'error'); })
      .finally(() => { if (!cancelled) setNoteLoading(false); });
    noteScroll.current?.scrollTo({ top: 0 });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Server-side full-text search, debounced
  useEffect(() => {
    if (query.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => {
      api.searchVault(query.trim()).then(setHits).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const tree = useMemo(() => buildTree(tag ? notes.filter((n) => n.tags.includes(tag)) : notes), [notes, tag]);
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    notes.forEach((n) => n.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [notes]);

  const backlinks = useMemo(() => {
    if (!note) return [];
    return notes.filter((n) => n.path !== note.path && n.links.some((l) => resolveLink(l, notes)?.path === note.path));
  }, [note, notes]);

  const openFolder = (p: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });

  const selectNote = (path: string) => {
    setSelected(path);
    const folder = notes.find((n) => n.path === path)?.folder;
    if (folder) setOpen((prev) => new Set([...Array.from(prev), ...folder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))]));
  };

  const handleUpload = async (list: FileList | null, kind: 'folder' | 'zip') => {
    if (!list || list.length === 0) return;
    // Folder pick: only the notes go up — Assets/ PDFs and EPUBs would blow
    // far past the upload limit and aren't rendered here anyway.
    const files = Array.from(list).filter((f) =>
      kind === 'zip' || (f.name.toLowerCase().endsWith('.md') && !/(^|\/)\.[^/]+\//.test(f.webkitRelativePath))
    );
    if (files.length === 0) { toast('No .md notes found in that folder', 'error'); return; }
    setUploading(true);
    try {
      const res = await api.uploadVault(files);
      toast(`Vault synced — ${res.note_count} notes`, 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Vault upload failed', 'error');
    } finally {
      setUploading(false);
      if (folderInput.current) folderInput.current.value = '';
      if (zipInput.current) zipInput.current.value = '';
    }
  };

  const markdown = useMemo(() => (note ? obsidianToMarkdown(note.content) : ''), [note]);

  const uploadButtons = (
    <div className="flex gap-2">
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        // non-standard attributes React doesn't type — needed for folder pick
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => handleUpload(e.target.files, 'folder')}
      />
      <input ref={zipInput} type="file" accept=".zip" className="hidden" onChange={(e) => handleUpload(e.target.files, 'zip')} />
      <button
        onClick={() => folderInput.current?.click()}
        disabled={uploading}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-accent-green/30 text-accent-green hover:bg-accent-green/5 disabled:opacity-50"
      >
        {uploading ? <CircleNotch size={13} className="animate-spin" /> : <UploadSimple size={13} />}
        {uploading ? 'Syncing…' : 'Choose vault folder'}
      </button>
      <button
        onClick={() => zipInput.current?.click()}
        disabled={uploading}
        title="Upload a .zip of your vault"
        className="flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-border text-white/50 hover:text-white/80 disabled:opacity-50"
      >
        <FileZip size={13} /> .zip
      </button>
    </div>
  );

  if (!loading && notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="glass-panel max-w-lg w-full rounded-3xl p-8 text-center">
          <FolderSimpleDashed size={40} className="mx-auto mb-4 text-accent-yellow/70" />
          <h2 className="text-lg font-semibold text-white/90 mb-1">Bring in your Obsidian vault</h2>
          <p className="text-sm text-white/45 mb-6">
            Your notes show up here with folders, callouts, working [[links]], backlinks and search. Only .md notes are imported, not attachments.
          </p>
          {uploadButtons}
          <p className="text-xs text-white/35 mt-5">
            Or, from your laptop:{' '}
            <code className="font-mono text-white/60 bg-white/5 px-1.5 py-0.5 rounded">.venv/bin/python main.py vault-sync</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0">
      {/* Sidebar: sync, search, tags, tree */}
      <div className="md:w-80 xl:w-96 border-r border-border flex-shrink-0 flex flex-col min-h-0 max-h-[45vh] md:max-h-none">
        <div className="p-4 space-y-3 border-b border-border">
          {uploadButtons}
          <p className="text-[11px] text-white/35 font-mono">
            {notes.length} notes · synced {timeAgo(syncedAt)}
          </p>
          <div className="relative">
            <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full bg-bg-2 border border-border rounded-xl pl-8 pr-3 py-2 text-xs text-white/80 placeholder:text-white/25"
            />
          </div>
          {topTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topTags.map(([t, c]) => (
                <button
                  key={t}
                  onClick={() => setTag(tag === t ? null : t)}
                  className={clsx(
                    'flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                    tag === t ? 'border-accent-purple/40 bg-accent-purple/10 text-accent-purple' : 'border-border text-white/40 hover:text-white/70'
                  )}
                >
                  <Hash size={9} />{t}<span className="opacity-50 ml-0.5">{c}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-6 rounded-lg" />)}</div>
          ) : hits ? (
            hits.length === 0 ? (
              <p className="text-xs text-white/30 text-center py-6">No notes match &ldquo;{query}&rdquo;</p>
            ) : (
              hits.map((h) => (
                <button key={h.path} onClick={() => selectNote(h.path)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5">
                  <p className="text-xs font-medium text-white/80 truncate">{h.title}</p>
                  {h.snippet && <p className="text-[11px] text-white/35 line-clamp-2 mt-0.5">{h.snippet}</p>}
                </button>
              ))
            )
          ) : (
            <TreeView tree={tree} depth={0} open={open} toggle={openFolder} selected={selected} onSelect={selectNote} prefix="" />
          )}
        </div>
      </div>

      {/* Note */}
      <div ref={noteScroll} className="flex-1 overflow-y-auto min-h-[500px]">
        {noteLoading && !note ? (
          <div className="p-8 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-5 rounded" />)}</div>
        ) : note ? (
          <article className={clsx('max-w-3xl mx-auto px-6 md:px-10 py-8 transition-opacity', noteLoading && 'opacity-50')}>
            {note.folder && (
              <p className="text-[11px] font-mono text-white/30 mb-2">{note.folder.split('/').join(' / ')}</p>
            )}
            <h2 className="text-2xl font-bold text-white/90 mb-3">{note.title}</h2>
            {note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {note.tags.map((t) => (
                  <button key={t} onClick={() => setTag(t)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple">#{t}</button>
                ))}
              </div>
            )}
            <Properties fm={note.frontmatter} />
            <div className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  blockquote: Blockquote as never,
                  a: ({ href, children }) => {
                    if (href?.startsWith(VAULT_HREF)) {
                      const target = decodeURIComponent(href.slice(VAULT_HREF.length));
                      const hit = resolveLink(target, notes);
                      if (!hit) {
                        return (
                          <span className="inline-flex items-center gap-1 text-white/40" title="Attachment or note not in the synced vault">
                            <Paperclip size={12} />{children}
                          </span>
                        );
                      }
                      return (
                        <a href="#" onClick={(e) => { e.preventDefault(); selectNote(hit.path); }}
                          className="text-accent-purple hover:underline">{children}</a>
                      );
                    }
                    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                  },
                  em: ({ children }) => {
                    const text = Children.toArray(children).join('');
                    if (text.startsWith('⚡ Live')) {
                      return (
                        <span className="inline-flex items-center gap-1.5 text-[11px] not-italic px-2 py-1 rounded-lg bg-white/5 text-white/40">
                          <Lightning size={11} />{text.slice(2)}
                        </span>
                      );
                    }
                    return <em>{children}</em>;
                  },
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>

            {backlinks.length > 0 && (
              <div className="mt-10 pt-5 border-t border-border">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-white/45 mb-3">
                  <ArrowBendUpLeft size={13} /> Linked from {backlinks.length} note{backlinks.length > 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {backlinks.map((b) => (
                    <button key={b.path} onClick={() => selectNote(b.path)}
                      className="text-xs px-3 py-1.5 rounded-xl border border-border text-white/60 hover:text-accent-purple hover:border-accent-purple/30">
                      {b.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        ) : null}
      </div>
    </div>
  );
}

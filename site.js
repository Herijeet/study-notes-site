/*
 * Static reader for the exported notes and news.
 *
 * Note HTML is inserted as HTML because it was produced by Markdig with raw HTML disabled at build time, so it can
 * only contain markup the renderer itself emitted. Everything that came from a news feed is written with
 * textContent instead - that content is third-party, and the server-side stripping is not something this page
 * should have to trust twice.
 */
const state = {
  index: null,
  news: null,
  notes: new Map(),
  filter: '',
  track: null,
  releasesOnly: false,
  current: null
};

const el = id => document.getElementById(id);

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }

  return response.json();
}

/* ---------- notes ---------- */

function renderTree() {
  const host = el('note-tree');
  const needle = state.filter.trim().toLowerCase();

  host.replaceChildren();

  for (const folder of state.index.folders) {
    const matches = folder.notes.filter(
      note => needle === '' || note.title.toLowerCase().includes(needle) || note.relativePath.toLowerCase().includes(needle)
    );

    if (matches.length === 0) {
      continue;
    }

    const group = document.createElement('details');
    group.open = needle !== '' || folder === state.index.folders[0];

    const label = document.createElement('summary');
    label.textContent = `${folder.name} (${matches.length})`;
    group.append(label);

    const list = document.createElement('ul');

    for (const note of matches) {
      const item = document.createElement('li');
      const link = document.createElement('a');

      link.href = `#/notes/${encodeURIComponent(note.slug)}`;
      link.textContent = note.title;
      link.className = note.slug === state.current ? 'selected' : '';

      item.append(link);
      list.append(item);
    }

    group.append(list);
    host.append(group);
  }

  if (!host.hasChildNodes()) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nothing matches that filter.';
    host.append(empty);
  }
}

async function openNote(slug) {
  const reader = el('reader');

  if (!state.notes.has(slug)) {
    try {
      state.notes.set(slug, await loadJson(`data/notes/${slug}.json`));
    } catch {
      reader.replaceChildren();
      const failed = document.createElement('p');
      failed.className = 'empty';
      failed.textContent = 'That note could not be loaded.';
      reader.append(failed);
      return;
    }
  }

  const note = state.notes.get(slug);
  state.current = slug;

  reader.replaceChildren();

  const heading = document.createElement('h1');
  heading.textContent = note.title;

  const meta = document.createElement('p');
  meta.className = 'meta';
  // Extension dropped for the same reason as in the app: every note is markdown, so ".md" on all of them is noise.
  // The path itself is untouched - it is still what the note is fetched by.
  const shownPath = note.relativePath.replace(/\.md$/i, '');
  meta.textContent = `${shownPath} - ${Math.max(1, Math.round(note.sizeBytes / 1024))} kB - updated ${new Date(note.modifiedAt).toLocaleDateString()}`;

  const body = document.createElement('div');
  body.className = 'markdown';
  body.innerHTML = note.html;

  reader.append(heading, meta, body);

  await enhance(body);
  renderTree();
  reader.scrollIntoView({ block: 'start' });
}

/** Diagrams first, then highlighting: mermaid replaces its source block, and highlighting it would be wasted. */
async function enhance(host) {
  const diagrams = [...host.querySelectorAll('pre > code.language-mermaid, pre > code.language-Mermaid')];

  if (diagrams.length > 0 && window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
    });

    for (const [index, code] of diagrams.entries()) {
      const source = code.textContent ?? '';
      const target = code.parentElement;

      try {
        const { svg } = await window.mermaid.render(`diagram-${Date.now()}-${index}`, source);
        const figure = document.createElement('figure');
        figure.className = 'diagram';
        figure.innerHTML = svg;
        target.replaceWith(figure);
      } catch (error) {
        // Show the source and the reason rather than an empty gap, so a broken diagram is fixable.
        const note = document.createElement('p');
        note.className = 'diagram-error';
        note.textContent = `Diagram could not be drawn: ${error?.message ?? error}`;
        target.after(note);
      }
    }
  }

  if (window.hljs) {
    host.querySelectorAll('pre > code:not(.language-mermaid)').forEach(block => window.hljs.highlightElement(block));
  }
}

/* ---------- news ---------- */

const TRACKS = [
  { value: null, label: 'Everything' },
  { value: 'DotNet', label: '.NET' },
  { value: 'Python', label: 'Python' },
  { value: 'Web', label: 'Angular & TS' },
  { value: 'Cloud', label: 'Azure' },
  { value: 'Data', label: 'Databases' },
  { value: 'Engineering', label: 'Engineering' }
];

function ago(iso) {
  if (!iso) {
    return 'undated';
  }

  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 60) {
    return `${Math.max(1, minutes)}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  return days < 30 ? `${days}d ago` : `${Math.round(days / 30)}mo ago`;
}

function renderTracks() {
  const host = el('news-tracks');
  host.replaceChildren();

  for (const choice of TRACKS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.track === choice.value ? 'track selected' : 'track';
    button.textContent = choice.label;
    button.addEventListener('click', () => {
      state.track = choice.value;
      renderTracks();
      renderNews();
    });
    host.append(button);
  }
}

function renderNews() {
  const host = el('news-items');
  host.replaceChildren();

  const items = (state.news?.items ?? []).filter(item =>
    (state.track === null || item.track === state.track) && (!state.releasesOnly || item.kind === 'Release')
  );

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = state.news?.items?.length ? 'Nothing matches that filter.' : 'No news was captured in this build.';
    host.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement('li');
    row.className = item.kind === 'Release' ? 'item release' : 'item';

    const head = document.createElement('div');
    head.className = 'item-head';

    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = item.kind;

    const source = document.createElement('span');
    source.className = 'source';
    source.textContent = item.source;

    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = ago(item.publishedAt);

    head.append(kind, source, when);

    const link = document.createElement('a');
    link.className = 'title';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title;

    row.append(head, link);

    if (item.summary) {
      const summary = document.createElement('p');
      summary.className = 'summary';
      summary.textContent = item.summary;
      row.append(summary);
    }

    host.append(row);
  }
}

/* ---------- routing ---------- */

function showView(name) {
  el('view-notes').classList.toggle('hidden', name !== 'notes');
  el('view-news').classList.toggle('hidden', name !== 'news');
  el('nav-notes').classList.toggle('active', name === 'notes');
  el('nav-news').classList.toggle('active', name === 'news');
}

async function route() {
  const hash = location.hash || '#/notes';

  if (hash.startsWith('#/news')) {
    showView('news');
    return;
  }

  showView('notes');

  const slug = decodeURIComponent(hash.replace('#/notes', '').replace(/^\//, ''));
  const first = state.index?.folders?.[0]?.notes?.[0]?.slug;

  if (slug) {
    await openNote(slug);
  } else if (first) {
    location.hash = `#/notes/${encodeURIComponent(first)}`;
  }
}

async function start() {
  try {
    state.index = await loadJson('data/index.json');
  } catch {
    el('reader').textContent = 'Could not load the notes index.';
    return;
  }

  document.title = state.index.title;
  el('brand').textContent = state.index.title;
  el('stamp').textContent = `${state.index.noteCount} notes - built ${new Date(state.index.generatedAt).toLocaleString()}`;

  renderTree();

  el('note-filter').addEventListener('input', event => {
    state.filter = event.target.value;
    renderTree();
  });

  el('releases-only').addEventListener('change', event => {
    state.releasesOnly = event.target.checked;
    renderNews();
  });

  try {
    state.news = await loadJson('data/news.json');
    const live = (state.news.sources ?? []).filter(source => source.ok).length;
    el('news-stamp').textContent = state.news.fetchedAt
      ? `${live} feeds, captured ${new Date(state.news.fetchedAt).toLocaleString()}. Refreshed when the site rebuilds.`
      : '';
  } catch {
    state.news = { items: [], sources: [] };
  }

  renderTracks();
  renderNews();

  window.addEventListener('hashchange', route);
  await route();
}

start();

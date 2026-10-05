/*
 * Static reader for the exported notes and news.
 *
 * Note HTML is inserted as HTML because it was produced by Markdig with raw HTML disabled at build time, so it can
 * only contain markup the renderer itself emitted. Everything that came from a news feed is written with
 * textContent instead - that content is third-party, and the server-side stripping is not something this page
 * should have to trust twice.
 *
 * Notes are organised by the catalog (catalog.json in the exporter): categories -> optional sections -> notes, each
 * with a display title. The folders the notes live in never reach the page.
 */
const state = {
  index: null,
  news: null,
  notes: new Map(),
  filter: '',
  track: null,
  releasesOnly: false,
  current: null,
  disposeHero: null,
  heroLoading: false,
  flat: []
};

const el = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A section's index note (00_INDEX.md) belongs at the top. The exporter sorts by file name, where "00_" lands after
// "001_" because '_' sorts above the digits, so every new numbered note would push the index further down.
const isIndexNote = note => /(^|\/)00_INDEX\.md$/i.test(note.relativePath ?? '');

function pinIndexNotesFirst(index) {
  for (const category of index.categories) {
    for (const section of category.sections) {
      section.notes.sort((a, b) => isIndexNote(b) - isIndexNote(a));
    }
  }
  return index;
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }

  return response.json();
}

function make(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(child => child !== null && child !== undefined));
  return node;
}

/** Loads a classic script once; later calls share the same promise. */
const scripts = new Map();

function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const script = make('script', { src, async: true });
      script.addEventListener('load', resolve);
      script.addEventListener('error', () => {
        scripts.delete(src);
        reject(new Error(`${src} failed to load`));
      });
      document.head.append(script);
    }));
  }

  return scripts.get(src);
}

// Same order as the 3D scene's palette (hero3d.js), so a topic has one colour everywhere on the site.
const COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#fb7185', '#c084fc', '#2dd4bf'];

/** Every note in catalog order, with its category, section and colour attached. */
function flatten(index) {
  return index.categories.flatMap((category, c) => category.sections.flatMap(section =>
    section.notes.map(note => ({
      ...note,
      category: category.name,
      categoryId: category.id,
      section: section.name ?? null,
      color: COLORS[c % COLORS.length]
    }))));
}

const entryFor = slug => state.flat.find(note => note.slug === slug);

/* ---------- home ---------- */

const DESIGN_CATEGORY = 'system-design';
const DESIGN_SECTION = 'Design chapters';

function designChapters() {
  return state.index.categories.find(category => category.id === DESIGN_CATEGORY)
    ?.sections.find(section => section.name === DESIGN_SECTION)?.notes ?? [];
}

function initials(name) {
  const words = name.replace(/[&]/g, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function renderHome() {
  const notes = state.flat;
  const chapters = designChapters();
  const diagrams = notes.reduce((sum, note) => sum + (note.images?.length ?? 0), 0);

  const stats = el('stats');
  stats.replaceChildren();

  for (const [value, label] of [
    [notes.length, 'notes'],
    [state.index.categories.length, 'topics'],
    [chapters.filter(note => Number(note.number) > 0).length, 'design chapters'],
    [diagrams, 'diagrams']
  ]) {
    if (value > 0) {
      stats.append(make('div', {}, make('dt', { textContent: label }), make('dd', { textContent: value.toLocaleString() })));
    }
  }

  if (notes[0]) el('cta-start').href = `#/notes/${encodeURIComponent(notes[0].slug)}`;

  if (chapters.length > 0) {
    el('cta-design').href = `#/notes/${encodeURIComponent(chapters[0].slug)}`;
  } else {
    el('cta-design').classList.add('hidden');
  }

  // Topics
  const topics = el('collections');
  topics.replaceChildren();

  state.index.categories.forEach((category, c) => {
    const count = category.sections.reduce((sum, section) => sum + section.notes.length, 0);
    const first = category.sections[0].notes[0];
    const card = make('a', { className: 'card tilt topic', href: `#/notes/${encodeURIComponent(first.slug)}` },
      make('span', { className: 'collection-icon', textContent: category.short ?? initials(category.name), ariaHidden: 'true' }),
      make('h3', { textContent: category.name }),
      make('p', { textContent: category.description ?? '' }),
      make('span', { className: 'count', textContent: `${count} ${count === 1 ? 'note' : 'notes'}` })
    );
    card.style.setProperty('--topic', COLORS[c % COLORS.length]);
    topics.append(card);
  });

  // Chapter gallery, with each chapter's first diagram as its thumbnail
  const gallery = el('gallery');
  gallery.replaceChildren();
  el('gallery-section').classList.toggle('hidden', chapters.length === 0);

  for (const note of chapters) {
    const image = note.images?.[0];
    const thumb = image
      ? make('div', { className: 'thumb' }, make('img', { src: image, alt: '', loading: 'lazy', decoding: 'async' }))
      : make('div', { className: 'thumb placeholder', textContent: note.number ?? '', ariaHidden: 'true' });

    gallery.append(make('a', { className: 'card chapter tilt', href: `#/notes/${encodeURIComponent(note.slug)}` },
      thumb,
      make('span', { className: 'num', textContent: Number(note.number) > 0 ? `Chapter ${note.number}` : 'Overview' }),
      make('h3', { textContent: note.title })
    ));
  }

  enableTilt(document.querySelectorAll('#view-home .tilt'));
  reveal(document.querySelectorAll('#collections .card'));
  reveal(document.querySelectorAll('#gallery .card'));
}

async function mountHero() {
  if (state.disposeHero || state.heroLoading) return;

  state.heroLoading = true;

  try {
    const { mountHero: mount } = await import('./hero3d.js?v=20261005160703');
    const notes = state.flat.map(note => ({ slug: note.slug, title: note.title, collection: note.category }));

    state.disposeHero = mount({
      canvas: el('hero-canvas'),
      tip: el('hero-tip'),
      notes,
      onOpen: slug => { location.hash = `#/notes/${encodeURIComponent(slug)}`; }
    });
  } catch (error) {
    // The page is complete without the scene; a missing WebGL or module just leaves the gradient.
    console.warn('3D scene unavailable:', error);
    el('hero-canvas').hidden = true;
  } finally {
    state.heroLoading = false;
  }
}

function unmountHero() {
  state.disposeHero?.();
  state.disposeHero = null;
}

/** Cards lean toward the pointer. Skipped entirely for reduced motion and for touch, where there is no hover. */
function enableTilt(cards) {
  if (reducedMotion || !matchMedia('(hover: hover)').matches) return;

  for (const card of cards) {
    if (card.dataset.tilt) continue;
    card.dataset.tilt = '1';

    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--ry', `${x * 10}deg`);
      card.style.setProperty('--rx', `${-y * 10}deg`);
      card.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
      card.style.setProperty('--my', `${(y + 0.5) * 100}%`);
    });

    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--rx', '0deg');
    });
  }
}

/**
 * Elements rise into place as they scroll into view, and settle back as they leave, entering from above when the
 * page is scrolled up past them. Without IntersectionObserver or with reduced motion they are simply visible.
 */
const revealer = !reducedMotion && 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const above = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
      entry.target.classList.toggle('in', entry.isIntersecting);
      // Where it left decides where it comes back from: above the viewport when the page was scrolled down past it.
      if (!entry.isIntersecting) entry.target.classList.toggle('from-above', above);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
  : null;

function reveal(elements) {
  if (!revealer) return;

  [...elements].forEach((element, i) => {
    if (element.dataset.reveal) return;
    element.dataset.reveal = '1';
    element.classList.add('reveal');
    // A short stagger across a row; capped so a long list never waits seconds for its last card.
    element.style.setProperty('--delay', `${(i % 6) * 70}ms`);
    revealer.observe(element);
  });
}

/** The hero's copy drifts up and fades as the page scrolls, while the scene sinks behind it. */
function trackHeroScroll() {
  if (reducedMotion) return;

  const hero = document.querySelector('.hero');
  let pending = false;

  addEventListener('scroll', () => {
    if (pending || el('view-home').classList.contains('hidden')) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const progress = Math.min(1, Math.max(0, scrollY / Math.max(1, hero.offsetHeight)));
      hero.style.setProperty('--hero-p', progress.toFixed(3));
    });
  }, { passive: true });
}

/* ---------- note list ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function chevron() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon chevron');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'm9 6 6 6-6 6');
  svg.append(path);
  return svg;
}

/** Text with the filter match wrapped in <mark>, built from text nodes so a note title is never parsed as HTML. */
function highlighted(text, needle) {
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;

  if (at < 0) {
    return [document.createTextNode(text)];
  }

  return [
    document.createTextNode(text.slice(0, at)),
    make('mark', { textContent: text.slice(at, at + needle.length) }),
    document.createTextNode(text.slice(at + needle.length))
  ];
}

function noteMatches(note, category, section, needle) {
  return needle === ''
    || note.title.toLowerCase().includes(needle)
    || category.name.toLowerCase().includes(needle)
    || (section.name ?? '').toLowerCase().includes(needle);
}

function renderTree() {
  const host = el('note-tree');
  const needle = state.filter.trim().toLowerCase();

  host.replaceChildren();

  state.index.categories.forEach((category, c) => {
    const total = category.sections.reduce((sum, section) => sum + section.notes.length, 0);
    const sections = category.sections
      .map(section => ({ section, notes: section.notes.filter(note => noteMatches(note, category, section, needle)) }))
      .filter(group => group.notes.length > 0);
    const shown = sections.reduce((sum, group) => sum + group.notes.length, 0);

    if (shown === 0) {
      return;
    }

    const holdsCurrent = category.sections.some(section => section.notes.some(note => note.slug === state.current));
    const group = document.createElement('details');
    group.style.setProperty('--dot', COLORS[c % COLORS.length]);
    group.open = needle !== '' || holdsCurrent || (state.current === null && c === 0);

    group.append(make('summary', {},
      chevron(),
      make('span', { className: 'folder-dot', ariaHidden: 'true' }),
      make('span', { className: 'folder-name', textContent: category.name }),
      make('span', { className: 'pill', textContent: needle ? `${shown}/${total}` : `${total}` })
    ));

    for (const { section, notes } of sections) {
      if (section.name && category.sections.length > 1) {
        group.append(make('p', { className: 'section-label', textContent: section.name }));
      }

      const list = document.createElement('ul');

      for (const note of notes) {
        const selected = note.slug === state.current;
        const link = make('a', { href: `#/notes/${encodeURIComponent(note.slug)}`, className: selected ? 'selected' : '', title: note.title },
          note.number ? make('span', { className: 'n', textContent: note.number, ariaHidden: 'true' }) : null,
          make('span', {}, ...highlighted(note.title, needle))
        );

        if (selected) {
          link.setAttribute('aria-current', 'page');
        }

        list.append(make('li', {}, link));
      }

      group.append(list);
    }

    host.append(group);
  });

  if (!host.hasChildNodes()) {
    host.append(make('p', { className: 'empty', textContent: 'Nothing matches that filter.' }));
  }

  host.querySelector('a.selected')?.scrollIntoView({ block: 'nearest' });
}

/* ---------- note list drawer (small screens) ---------- */

const drawerQuery = matchMedia('(max-width: 62rem)');

function openDrawer() {
  if (!drawerQuery.matches) {
    el('note-filter').focus();
    return;
  }

  el('sidebar').classList.add('open');
  el('drawer-backdrop').hidden = false;
  el('browse-open').setAttribute('aria-expanded', 'true');
  document.body.classList.add('drawer-open');
  el('sidebar').querySelector('a.selected')?.scrollIntoView({ block: 'center' });

  // Focusing the filter on a phone raises the keyboard over half the list; only do it where there is a real keyboard.
  if (matchMedia('(hover: hover)').matches) {
    el('note-filter').focus({ preventScroll: true });
  } else {
    el('browse-close').focus({ preventScroll: true });
  }
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (!el('sidebar').classList.contains('open')) return;

  el('sidebar').classList.remove('open');
  el('drawer-backdrop').hidden = true;
  el('browse-open').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('drawer-open');

  if (restoreFocus) el('browse-open').focus({ preventScroll: true });
}

/** Position within the note's category, in catalog order. */
function positionOf(slug) {
  const entry = entryFor(slug);
  const siblings = entry ? state.flat.filter(note => note.categoryId === entry.categoryId) : [];
  return { entry, siblings, index: siblings.findIndex(note => note.slug === slug) };
}

/** Keeps the small-screen bar saying where you are: topic, note, and position within the topic. */
function updateBrowseBar(slug) {
  const { entry, siblings, index } = positionOf(slug);

  el('browse-folder').textContent = entry ? [entry.category, entry.section].filter(Boolean).join(' · ') : 'Browse notes';
  el('browse-title').textContent = entry ? entry.title : 'All notes';
  el('browse-count').textContent = entry ? `${index + 1} / ${siblings.length}` : `${state.index.noteCount}`;
}

/* ---------- reader ---------- */

async function openNote(slug) {
  const reader = el('reader');

  if (!state.notes.has(slug)) {
    try {
      state.notes.set(slug, await loadJson(`data/notes/${slug}.json`));
    } catch {
      reader.replaceChildren(make('p', { className: 'empty', textContent: 'That note could not be loaded.' }));
      el('toc').replaceChildren();
      return;
    }
  }

  const note = state.notes.get(slug);
  const entry = entryFor(slug);
  const title = entry?.title ?? note.title;
  state.current = slug;
  document.title = `${title} · ${state.index.title}`;

  const minutes = Math.max(1, Math.round(note.sizeBytes / 1400));
  const crumb = entry ? [entry.category, entry.section].filter(Boolean).join(' › ') : '';
  const meta = make('p', { className: 'meta' },
    crumb ? make('span', { className: 'crumb', textContent: crumb }) : null,
    make('span', { textContent: `${minutes} min read` }),
    make('span', { textContent: `updated ${new Date(note.modifiedAt).toLocaleDateString()}` })
  );

  const body = make('div', { className: 'markdown' });
  body.innerHTML = note.html;

  // The note's own first heading repeats the title shown above it.
  const firstHeading = body.querySelector('h1');
  if (firstHeading && firstHeading.textContent.trim() === note.title.trim()) firstHeading.remove();

  reader.replaceChildren(make('h1', { textContent: title }), meta, body);
  updateBrowseBar(slug);
  closeDrawer({ restoreFocus: false });

  if (entry?.images?.length) {
    reader.append(figureLinks(entry.images));
  }

  reader.append(pager(slug));

  anchorHeadings(body, note.headings ?? []);
  rewriteNoteLinks(body, note.relativePath);
  wrapTables(body);
  renderToc(body);
  renderTree();
  window.scrollTo({ top: 0, behavior: 'instant' });
  updateProgress();
  await enhance(body);
}

/** Links to the chapter's generated diagram files: they open in the viewer, and can be saved from there. */
function figureLinks(images) {
  const links = make('div', { className: 'figure-links' });

  for (const image of images) {
    const name = image.split('/').pop().replace(/\.[a-z]+$/i, '').replace(/^\d+-/, '').replace(/-/g, ' ');
    const link = make('a', { href: image, textContent: name });
    link.addEventListener('click', event => {
      event.preventDefault();
      openViewer(make('img', { src: image, alt: name }), name);
    });
    links.append(link);
  }

  return make('section', { className: 'figures' }, make('h2', { textContent: 'Diagram files' }), links);
}

/** Previous / next within the same topic. */
function pager(slug) {
  const { siblings, index } = positionOf(slug);
  const nav = make('nav', { className: 'pager', ariaLabel: 'Previous and next' });

  const link = (note, label, className) => make('a', { href: `#/notes/${encodeURIComponent(note.slug)}`, className },
    make('small', { textContent: label }), note.title);

  if (index > 0) nav.append(link(siblings[index - 1], '← Previous', 'prev'));
  if (index >= 0 && index < siblings.length - 1) nav.append(link(siblings[index + 1], 'Next →', 'next'));

  return nav;
}

/** Markdig emits bare headings; give them the anchors the exporter computed, in document order. */
function anchorHeadings(host, headings) {
  const queue = headings.filter(heading => heading.level >= 2);

  for (const element of host.querySelectorAll('h2, h3, h4')) {
    const index = queue.findIndex(heading => heading.text.trim() === element.textContent.trim());

    if (index >= 0) {
      element.id = queue[index].anchor;
      queue.splice(0, index + 1);
    }
  }
}

/**
 * Wide tables scroll sideways inside a wrapper instead of squeezing every column. The wrapper shows a fade on the
 * side that has more to see, so it is obvious on a phone that the table continues.
 */
function wrapTables(host) {
  for (const table of host.querySelectorAll('table')) {
    // Two-column tables (term | meaning) are prose: they read better wrapped to the screen than scrolled.
    const columns = table.rows[0]?.cells.length ?? 0;
    const wrap = make('div', { className: columns <= 2 ? 'table-wrap fit' : 'table-wrap' });
    table.replaceWith(wrap);
    wrap.append(table);

    const update = () => {
      const more = wrap.scrollWidth - wrap.clientWidth;
      wrap.classList.toggle('more-right', more > 2 && wrap.scrollLeft < more - 2);
      wrap.classList.toggle('more-left', wrap.scrollLeft > 2);
    };

    wrap.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(wrap);
  }
}

let tocObserver = null;

function renderToc(host) {
  const toc = el('toc');
  toc.replaceChildren();
  tocObserver?.disconnect();

  const headings = [...host.querySelectorAll('h2[id], h3[id]')];
  if (headings.length < 3) return;

  const list = make('ol');
  const buttons = new Map();

  for (const heading of headings) {
    const button = make('button', { type: 'button', textContent: heading.textContent });
    button.addEventListener('click', () => heading.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }));
    buttons.set(heading, button);
    list.append(make('li', { className: heading.tagName === 'H3' ? 'l3' : 'l2' }, button));
  }

  toc.append(make('p', { textContent: 'On this page' }), list);

  tocObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        buttons.forEach(button => button.classList.remove('current'));
        buttons.get(entry.target)?.classList.add('current');
      }
    }
  }, { rootMargin: '-80px 0px -70% 0px' });

  headings.forEach(heading => tocObserver.observe(heading));
}

function updateProgress() {
  const bar = el('progress');

  if (el('view-notes').classList.contains('hidden')) {
    bar.style.transform = 'scaleX(0)';
    return;
  }

  const scrollable = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${scrollable > 0 ? Math.min(1, scrollY / scrollable) : 0})`;
}

/**
 * Notes link to each other by relative file path ("05_CONSISTENT_HASHING.md"), which reads correctly on GitHub but
 * points at nothing here, where a note lives at "#/notes/<slug>". Resolve the path against the current note and
 * rebuild the slug the same way the exporter does (Program.cs, Slug), so one link works in both places. Relative
 * image paths are resolved the same way, because the exporter copies images to the same relative location.
 */
function resolveRelative(folder, relative) {
  const segments = folder ? folder.split('/') : [];

  for (const part of decodeURIComponent(relative.replace(/#.*$/, '')).split('/')) {
    if (part === '..') {
      segments.pop();
    } else if (part && part !== '.') {
      segments.push(part);
    }
  }

  return segments;
}

function rewriteNoteLinks(host, currentPath) {
  const folder = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '';
  const external = /^([a-z][a-z0-9+.-]*:|\/|#)/i;

  host.querySelectorAll('a[href]').forEach(anchor => {
    const href = anchor.getAttribute('href');

    if (!/\.md(#.*)?$/i.test(href) || external.test(href)) {
      return;
    }

    const slug = resolveRelative(folder, href).join('-').replace(/\.md$/i, '').replace(/[^A-Za-z0-9._-]/g, '-').toLowerCase();

    // A link to a note that is not on this site (hidden by the catalog, or private) becomes plain text.
    if (!entryFor(slug)) {
      anchor.replaceWith(make('span', { textContent: anchor.textContent }));
      return;
    }

    anchor.setAttribute('href', `#/notes/${encodeURIComponent(slug)}`);
  });

  host.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');

    if (!external.test(src)) {
      image.setAttribute('src', resolveRelative(folder, src).map(encodeURIComponent).join('/'));
      image.loading = 'lazy';
    }

    makeZoomable(image, image.alt || 'Image', () => image.cloneNode());
  });
}

/**
 * Diagrams first, then highlighting: mermaid replaces its source block, and highlighting it would be wasted.
 * Both libraries load on first use: mermaid alone is ~3.5 MB, which a phone should not fetch for a note without
 * diagrams.
 */
async function enhance(host) {
  const slug = state.current;
  const diagrams = [...host.querySelectorAll('pre > code.language-mermaid, pre > code.language-Mermaid')];
  const code = host.querySelectorAll('pre > code:not(.language-mermaid):not(.language-Mermaid)');

  if (code.length > 0) {
    loadScript('vendor/highlight.min.js?v=20261005160703')
      .then(() => code.forEach(block => window.hljs.highlightElement(block)))
      .catch(() => {});
  }

  if (diagrams.length === 0) return;

  for (const block of diagrams) {
    block.parentElement.classList.add('diagram-pending');
  }

  try {
    await loadScript('vendor/mermaid.min.js?v=20261005160703');
  } catch {
    diagrams.forEach(block => block.parentElement.classList.remove('diagram-pending'));
    return;
  }

  // The reader moved on while mermaid was downloading; these blocks are no longer on the page.
  if (state.current !== slug) return;

  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    fontFamily: 'Inter, system-ui, sans-serif',
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
  });

  for (const [index, block] of diagrams.entries()) {
    const source = block.textContent ?? '';
    const target = block.parentElement;

    try {
      const { svg } = await window.mermaid.render(`diagram-${Date.now()}-${index}`, source);
      const figure = make('figure', { className: 'diagram' });
      figure.innerHTML = svg;
      const title = /^title:\s*(.+)$/m.exec(source)?.[1]?.trim() ?? nearestHeading(target) ?? 'Diagram';
      makeZoomable(figure, title, () => figure.querySelector('svg').cloneNode(true));
      target.replaceWith(figure);
    } catch (error) {
      // Show the source and the reason rather than an empty gap, so a broken diagram is fixable.
      target.classList.remove('diagram-pending');
      target.after(make('p', { className: 'diagram-error', textContent: `Diagram could not be drawn: ${error?.message ?? error}` }));
    }
  }
}

/** The heading a block sits under, used to name an untitled diagram in the viewer. */
function nearestHeading(node) {
  for (let current = node.previousElementSibling; current; current = current.previousElementSibling) {
    if (/^H[2-4]$/.test(current.tagName)) return current.textContent.trim();
  }

  return null;
}

/* ---------- full-screen viewer: pinch / wheel to zoom, drag to pan ---------- */

function makeZoomable(element, title, content) {
  element.classList.add('zoomable');
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `${title} — open full screen`);

  const hint = make('span', { className: 'zoom-hint', ariaHidden: 'true', textContent: matchMedia('(hover: hover)').matches ? 'Click to zoom' : 'Tap to zoom' });

  if (element.tagName === 'FIGURE') {
    element.append(hint);
  }

  const open = () => openViewer(content(), title);
  element.addEventListener('click', open);
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}

const view = { scale: 1, x: 0, y: 0, fit: 1, width: 0, height: 0, pointers: new Map(), pinch: null, lastTap: 0, opener: null };

function applyView() {
  el('viewer-content').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

function fitView() {
  const stage = el('viewer-stage').getBoundingClientRect();
  view.fit = Math.min(stage.width / view.width, stage.height / view.height) * 0.94;
  view.scale = view.fit;
  view.x = (stage.width - view.width * view.scale) / 2;
  view.y = (stage.height - view.height * view.scale) / 2;
  applyView();
}

/** Zoom by a factor around a point in stage coordinates, keeping that point still under the finger or cursor. */
function zoomAt(factor, px, py) {
  const next = Math.min(Math.max(view.scale * factor, view.fit * 0.5), Math.max(view.fit * 8, 4));
  const ratio = next / view.scale;
  view.x = px - (px - view.x) * ratio;
  view.y = py - (py - view.y) * ratio;
  view.scale = next;
  applyView();
}

function openViewer(node, title) {
  const viewer = el('viewer');
  const host = el('viewer-content');

  view.opener = document.activeElement;
  host.replaceChildren(node);
  el('viewer-title').textContent = title;
  viewer.hidden = false;
  document.body.classList.add('viewer-open');

  const measure = () => {
    if (node.tagName === 'IMG') {
      view.width = node.naturalWidth || 800;
      view.height = node.naturalHeight || 600;
    } else {
      const box = node.viewBox?.baseVal;
      view.width = box?.width || node.getBoundingClientRect().width || 800;
      view.height = box?.height || node.getBoundingClientRect().height || 600;
    }

    node.style.width = `${view.width}px`;
    node.style.height = `${view.height}px`;
    node.style.maxWidth = 'none';
    fitView();
  };

  if (node.tagName === 'IMG' && !node.complete) {
    node.addEventListener('load', measure, { once: true });
  } else {
    requestAnimationFrame(measure);
  }

  el('viewer-close').focus({ preventScroll: true });
}

function closeViewer() {
  if (el('viewer').hidden) return;

  el('viewer').hidden = true;
  el('viewer-content').replaceChildren();
  document.body.classList.remove('viewer-open');
  view.pointers.clear();
  view.opener?.focus?.({ preventScroll: true });
}

function wireViewer() {
  const stage = el('viewer-stage');
  const local = event => {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const centre = () => {
    const rect = stage.getBoundingClientRect();
    return [rect.width / 2, rect.height / 2];
  };

  el('viewer-close').addEventListener('click', closeViewer);
  el('viewer-in').addEventListener('click', () => zoomAt(1.4, ...centre()));
  el('viewer-out').addEventListener('click', () => zoomAt(1 / 1.4, ...centre()));
  el('viewer-fit').addEventListener('click', fitView);

  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const { x, y } = local(event);
    zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025)), x, y);
  }, { passive: false });

  stage.addEventListener('pointerdown', event => {
    stage.setPointerCapture(event.pointerId);
    view.pointers.set(event.pointerId, local(event));

    if (view.pointers.size === 2) {
      const [a, b] = [...view.pointers.values()];
      view.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }

    // Double tap / double click: zoom in 2.5× there, or back to fit if already zoomed.
    const now = Date.now();
    if (view.pointers.size === 1 && now - view.lastTap < 300) {
      const { x, y } = local(event);
      if (view.scale > view.fit * 1.2) fitView(); else zoomAt(2.5, x, y);
    }
    view.lastTap = now;
  });

  stage.addEventListener('pointermove', event => {
    if (!view.pointers.has(event.pointerId)) return;

    const previous = view.pointers.get(event.pointerId);
    const current = local(event);
    view.pointers.set(event.pointerId, current);

    if (view.pointers.size === 2 && view.pinch) {
      const [a, b] = [...view.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(distance / view.pinch.distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
      view.pinch.distance = distance;
    } else if (view.pointers.size === 1) {
      view.x += current.x - previous.x;
      view.y += current.y - previous.y;
      applyView();
    }
  });

  const release = event => {
    view.pointers.delete(event.pointerId);
    if (view.pointers.size < 2) view.pinch = null;
  };

  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  addEventListener('resize', () => {
    if (!el('viewer').hidden) fitView();
  });
}

/* ---------- news ---------- */

const TRACKS = [
  { value: null, label: 'Everything' },
  { value: 'DotNet', label: '.NET' },
  { value: 'Python', label: 'Python' },
  { value: 'Web', label: 'Angular & TS' },
  { value: 'Cloud', label: 'Azure' },
  { value: 'AI', label: 'AI' },
  { value: 'DataEngineering', label: 'Data engineering' },
  { value: 'Data', label: 'Databases' },
  { value: 'Engineering', label: 'Engineering' }
];

const TRACK_COLORS = {
  AI: '#f472b6',
  DataEngineering: '#fbbf24',
  Data: '#34d399',
  DotNet: '#a78bfa',
  Python: '#60a5fa',
  Web: '#fb7185',
  Cloud: '#22d3ee',
  Engineering: '#2dd4bf'
};

const trackLabel = track => TRACKS.find(choice => choice.value === track)?.label ?? track;

/** The newest What's New notes (highest number first), skipping the folder's index. */
function whatsNewNotes(limit) {
  const category = state.index.categories.find(c => c.id === 'whats-new');
  const notes = category?.sections.flatMap(section => section.notes) ?? [];
  return notes.filter(note => !/\/00_[^/]*$/.test(note.relativePath ?? '')).reverse().slice(0, limit);
}

function noteCard(note) {
  return make('a', { className: 'latest-card note-card', href: `#/notes/${encodeURIComponent(note.slug)}` },
    make('span', { className: 'chip', textContent: "What's New note" }),
    make('h3', { textContent: note.title }),
    make('span', { className: 'latest-meta', textContent: 'Explained: what it is, why it matters, how to use it' })
  );
}

function newsCard(item) {
  const card = make('a', { className: 'latest-card', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
    make('span', { className: 'chip', textContent: trackLabel(item.track) }),
    make('h3', { textContent: item.title }),
    item.summary ? make('p', { textContent: item.summary }) : null,
    make('span', { className: 'latest-meta', textContent: `${item.source} · ${ago(item.publishedAt)}` })
  );
  card.style.setProperty('--track', TRACK_COLORS[item.track] ?? 'var(--accent)');
  return card;
}

/** Home page: the newest AI and data engineering items, led by any What's New notes. */
function renderLatest() {
  const host = el('latest');
  const items = state.news?.items ?? [];
  const focus = items.filter(item => item.track === 'AI' || item.track === 'DataEngineering');
  const picks = (focus.length >= 4 ? focus : items).slice(0, 10);
  const notes = whatsNewNotes(3);

  host.replaceChildren(...notes.map(noteCard), ...picks.map(newsCard));
  el('latest-section').classList.toggle('hidden', host.childElementCount === 0);
  reveal(host.children);

  // News page: the same notes above the feed, so a headline and its explanation sit together.
  const notesHost = el('news-notes');
  const allNotes = whatsNewNotes(6);
  notesHost.replaceChildren();
  if (allNotes.length > 0) {
    notesHost.append(
      make('header', { className: 'section-head' },
        make('h3', { textContent: "What's New notes" }),
        make('p', { textContent: 'Recent releases, written up as full notes.' })),
      make('div', { className: 'latest' }, ...allNotes.map(noteCard))
    );
  }
}

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
    const button = make('button', {
      type: 'button',
      className: state.track === choice.value ? 'track selected' : 'track',
      textContent: choice.label
    });
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
    host.append(make('p', {
      className: 'empty',
      textContent: state.news?.items?.length ? 'Nothing matches that filter.' : 'No news was captured in this build.'
    }));
    return;
  }

  for (const item of items) {
    const row = make('li', { className: item.kind === 'Release' ? 'item release' : 'item' },
      make('div', { className: 'item-head' },
        make('span', { className: 'chip', textContent: trackLabel(item.track) }),
        make('span', { className: 'kind', textContent: item.kind }),
        make('span', { className: 'source', textContent: item.source }),
        make('span', { className: 'when', textContent: ago(item.publishedAt) })
      ),
      make('a', { className: 'title', href: item.url, target: '_blank', rel: 'noopener noreferrer', textContent: item.title })
    );

    if (item.summary) {
      row.append(make('p', { className: 'summary', textContent: item.summary }));
    }

    row.style.setProperty('--track', TRACK_COLORS[item.track] ?? 'var(--border)');
    host.append(row);
  }

  reveal(host.children);
}


/* ---------- routing ---------- */

function showView(name) {
  for (const viewName of ['home', 'notes', 'news']) {
    el(`view-${viewName}`).classList.toggle('hidden', name !== viewName);
    el(`nav-${viewName}`).classList.toggle('active', name === viewName);
    el(`nav-${viewName}`).toggleAttribute('aria-current', name === viewName);
  }

  if (name === 'home') {
    mountHero();
  } else {
    unmountHero();
  }

  if (name !== 'notes') {
    document.title = state.index?.title ?? document.title;
    state.current = null;
    closeDrawer({ restoreFocus: false });
  }

  closeViewer();
  updateProgress();
}

async function route() {
  const hash = location.hash || '#/';

  if (hash.startsWith('#/news')) {
    showView('news');
    window.scrollTo({ top: 0 });
    return;
  }

  if (!hash.startsWith('#/notes')) {
    showView('home');
    window.scrollTo({ top: 0 });
    return;
  }

  showView('notes');

  const slug = decodeURIComponent(hash.replace('#/notes', '').replace(/^\//, ''));
  const first = state.flat[0]?.slug;

  if (slug) {
    await openNote(slug);
  } else if (first) {
    location.replace(`#/notes/${encodeURIComponent(first)}`);
  }
}

/** The masthead's real height, so sticky elements below it sit flush on every screen size. */
function trackMasthead() {
  const masthead = document.querySelector('.masthead');
  const set = () => document.documentElement.style.setProperty('--masthead-h', `${masthead.offsetHeight}px`);
  new ResizeObserver(set).observe(masthead);
  set();
}

async function start() {
  trackMasthead();
  wireViewer();
  trackHeroScroll();

  try {
    state.index = pinIndexNotesFirst(await loadJson('data/index.json'));
    state.flat = flatten(state.index);
  } catch {
    showView('notes');
    el('reader').textContent = 'Could not load the notes index.';
    return;
  }

  document.title = state.index.title;
  el('brand').textContent = state.index.title;
  el('stamp').textContent = `${state.index.noteCount} notes · updated ${new Date(state.index.generatedAt).toLocaleDateString()}`;

  renderHome();
  renderTree();

  el('note-filter').addEventListener('input', event => {
    state.filter = event.target.value;
    renderTree();
  });

  el('browse-open').addEventListener('click', openDrawer);
  el('browse-close').addEventListener('click', () => closeDrawer());
  el('drawer-backdrop').addEventListener('click', () => closeDrawer());
  drawerQuery.addEventListener('change', () => closeDrawer({ restoreFocus: false }));
  el('note-tree').addEventListener('click', event => {
    if (event.target.closest('a')) closeDrawer({ restoreFocus: false });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!el('viewer').hidden) closeViewer(); else closeDrawer();
    }
  });

  // Enter in the filter opens the first match - the quickest way from "/" to a note.
  el('note-filter').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const first = el('note-tree').querySelector('a');
      if (first) location.hash = first.getAttribute('href');
    }
  });

  el('releases-only').addEventListener('change', event => {
    state.releasesOnly = event.target.checked;
    renderNews();
  });

  // "/" jumps to the note filter, as on most documentation sites.
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') && el('viewer').hidden) {
      event.preventDefault();
      if (!location.hash.startsWith('#/notes')) location.hash = '#/notes';
      openDrawer();
    }
  });

  addEventListener('scroll', updateProgress, { passive: true });

  window.addEventListener('hashchange', route);
  await route();

  // News is its own view: fetch it after the first page is on screen, not before.
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
  renderLatest();
}

start();

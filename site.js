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
    const { mountHero: mount } = await import('./hero3d.js?v=20261128012951');
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
    loadScript('vendor/highlight.min.js?v=20261128012951')
      .then(() => code.forEach(block => window.hljs.highlightElement(block)))
      .catch(() => {});
  }

  if (diagrams.length === 0) return;

  for (const block of diagrams) {
    block.parentElement.classList.add('diagram-pending');
  }

  try {
    await loadScript('vendor/mermaid.min.js?v=20261128012951');
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
    theme: isDark() ? 'dark' : 'default'
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
  { value: 'Lakehouse', label: 'Lakehouse' },
  { value: 'Markets', label: 'Markets & regulators' },
  { value: 'Data', label: 'Databases' },
  { value: 'Engineering', label: 'Engineering' }
];

const TRACK_COLORS = {
  AI: '#f472b6',
  DataEngineering: '#fbbf24',
  Lakehouse: '#38bdf8',
  Markets: '#f97316',
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

/** Home page: the newest AI, data engineering and lakehouse items, led by any What's New notes. */
function renderLatest() {
  const host = el('latest');
  const items = state.news?.items ?? [];
  const focus = items.filter(item => ['AI', 'DataEngineering', 'Lakehouse'].includes(item.track));
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


/* ---------- jobs ---------- */

/*
 * Postings from the last week, collected at build time into data/jobs.json. Everything here is filtering on the
 * device: the reader's roles and years of experience are kept in localStorage and never leave the browser.
 */
const JOBS_KEY = 'jobs-profile';
const JOBS_PAGE = 60;
const jobs = { data: null, shown: JOBS_PAGE, profile: { roles: 'software engineer, backend, full stack, .NET, C#, data engineer', years: 5, where: 'both', age: '7', kind: 'all', level: true } };

// The years of experience a title usually asks for. A guess from the wording, which is why it can be switched off.
const LEVELS = [
  [/\b(intern|internship|trainee|apprentice|graduate|campus|fresher)\b/i, 0, 1],
  [/\b(principal|distinguished|director|head of|vice president|vp|chief)\b/i, 10, 40],
  [/\b(staff|architect|engineering manager|manager)\b/i, 7, 40],
  [/\b(lead)\b/i, 5, 20],
  [/\b(senior|sr\.?|sde ?(2|3|ii|iii)|engineer (ii|iii|2|3)|ii|iii|mts ?[23])\b/i, 3, 12],
  [/\b(junior|jr\.?|associate|entry|sde ?(1|i)|engineer (i|1))\b/i, 0, 3],
];

function levelRange(title) {
  for (const [pattern, min, max] of LEVELS) {
    if (pattern.test(title)) return [min, max];
  }
  return [1, 8];
}

// "Remote" often means remote inside one country. Count a remote role as open to India only when its location says
// India, names no place at all, or names a region that includes India.
function openRemote(item) {
  if (!item.remote) return false;
  const place = item.location.replace(/remote|[-–,·()/]|friendly|hybrid/gi, ' ').trim();
  return item.india || place === '' || /anywhere|worldwide|global|international|apac|asia/i.test(item.location);
}

function loadJobsProfile() {
  try {
    Object.assign(jobs.profile, JSON.parse(localStorage.getItem(JOBS_KEY) ?? '{}'));
  } catch { /* private mode or a damaged value: the defaults stand */ }

  el('jobs-roles').value = jobs.profile.roles;
  el('jobs-years').value = jobs.profile.years;
  el('jobs-where').value = jobs.profile.where;
  el('jobs-age').value = jobs.profile.age;
  el('jobs-kind').value = jobs.profile.kind;
  el('jobs-level').checked = jobs.profile.level;
}

function readJobsProfile() {
  Object.assign(jobs.profile, {
    roles: el('jobs-roles').value,
    years: Math.max(0, Number(el('jobs-years').value) || 0),
    where: el('jobs-where').value,
    age: el('jobs-age').value,
    kind: el('jobs-kind').value,
    level: el('jobs-level').checked,
  });

  try { localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.profile)); } catch { /* not saved, still applied */ }
}

function matchingJobs() {
  const { roles, years, where, age, kind, level } = jobs.profile;
  const wanted = roles.split(',').map(role => role.trim().toLowerCase()).filter(Boolean);
  const search = el('jobs-search').value.trim().toLowerCase();
  const oldest = Date.now() - Number(age) * 24 * 60 * 60 * 1000;

  return (jobs.data?.jobs ?? []).filter(item => {
    if (new Date(item.postedAt).getTime() < oldest) return false;
    if (where === 'india' && !item.india) return false;
    if (where === 'remote' && !openRemote(item)) return false;
    if (where === 'anyremote' && !item.remote) return false;
    if (where === 'both' && !item.india && !openRemote(item)) return false;
    if (kind === 'company' && item.kind !== 'company') return false;
    if (kind === 'remote' && item.kind !== 'remote') return false;
    if (kind === 'contract' && !item.contract) return false;

    const title = item.title.toLowerCase();
    if (wanted.length > 0 && !wanted.some(role => title.includes(role))) return false;
    if (search && !`${title} ${item.company} ${item.location} ${item.team}`.toLowerCase().includes(search)) return false;

    if (level) {
      const [min, max] = levelRange(item.title);
      if (years < min || years > max) return false;
    }

    return true;
  });
}

function renderJobs() {
  if (!jobs.data) return;

  const host = el('jobs-items');
  const found = matchingJobs();
  host.replaceChildren();

  el('jobs-count').textContent = `${found.length.toLocaleString()} of ${jobs.data.jobs.length.toLocaleString()} postings match.`;
  el('jobs-more').classList.toggle('hidden', found.length <= jobs.shown);

  if (found.length === 0) {
    host.append(make('p', { className: 'empty', textContent: 'Nothing matches. Clear the roles box to see every posting, or widen "Posted within".' }));
    return;
  }

  for (const item of found.slice(0, jobs.shown)) {
    const head = make('div', { className: 'item-head' },
      make('span', { className: 'chip', textContent: item.company }),
      make('span', { className: 'source', textContent: item.location || 'Location not stated' }),
      make('span', { className: 'when', textContent: ago(item.postedAt) })
    );
    if (item.remote) head.append(make('span', { className: 'kind', textContent: 'Remote' }));
    if (item.contract) head.append(make('span', { className: 'kind', textContent: 'Contract' }));

    const row = make('li', { className: 'item job' }, head,
      make('a', { className: 'title', href: item.url, target: '_blank', rel: 'noopener noreferrer', textContent: item.title }));

    const origin = item.kind === 'company' ? `${item.company} careers` : `via ${item.source}`;
    row.append(make('p', { className: 'summary', textContent: [item.team, origin].filter(Boolean).join(' · ') }));
    host.append(row);
  }
}

async function startJobs() {
  try {
    jobs.data = await loadJson('data/jobs.json');
  } catch {
    return; // no jobs file in this build (the public site): the page and its link stay hidden
  }

  if (!Array.isArray(jobs.data?.jobs)) return;

  el('nav-jobs').classList.remove('hidden');
  loadJobsProfile();

  const sources = jobs.data.sources ?? [];
  const answered = sources.filter(source => source.ok).length;
  el('jobs-stamp').textContent = `${answered} of ${sources.length} sources answered, captured ${new Date(jobs.data.fetchedAt).toLocaleString()}. `
    + `Only postings from the last ${jobs.data.windowDays} days, in India or remote. Refreshed twice a day.`;

  el('jobs-sources').replaceChildren(...sources.map(source => make('li', {
    textContent: source.ok
      ? `${source.name}: ${source.kept} recent of ${source.total} open (${source.type.toLowerCase()})`
      : `${source.name}: did not answer this time`,
    className: source.ok ? '' : 'failed'
  })));

  el('jobs-links').replaceChildren(...(jobs.data.links ?? []).map(link =>
    make('a', { className: 'button ghost', href: link.url, target: '_blank', rel: 'noopener noreferrer', textContent: link.name })));

  const changed = () => { jobs.shown = JOBS_PAGE; readJobsProfile(); renderJobs(); };
  el('jobs-profile').addEventListener('input', changed);
  el('jobs-profile').addEventListener('submit', event => event.preventDefault());
  el('jobs-more').addEventListener('click', () => { jobs.shown += JOBS_PAGE; renderJobs(); });
  // On a phone the roles box is enough to start; the other filters open on request so results show on the first screen.
  el('jobs-filters-toggle').addEventListener('click', () => {
    const open = el('jobs-profile').classList.toggle('filters-open');
    el('jobs-filters-toggle').setAttribute('aria-expanded', String(open));
    el('jobs-filters-toggle').textContent = open ? 'Fewer filters' : 'More filters';
  });

  renderJobs();
  if (location.hash.startsWith('#/jobs')) showView('jobs');
}

/* ---------- routing ---------- */

// The guided plan is private-site material: its home section appears only when the note is in this build.
const PLAN_SLUG = 'engineering-kb-product-company-prep-09_sixteen_week_roadmap';

function showPlan() {
  if (!entryFor(PLAN_SLUG)) return;

  el('plan-open').href = `#/notes/${PLAN_SLUG}`;
  el('plan-section').classList.remove('hidden');
}

function showView(name) {
  for (const viewName of ['home', 'notes', 'news', 'jobs']) {
    el(`view-${viewName}`).classList.toggle('hidden', name !== viewName);
    el(`nav-${viewName}`).classList.toggle('active', name === viewName);
    el(`nav-${viewName}`).toggleAttribute('aria-current', name === viewName);
  }

  // The reader fills the screen and scrolls on its own; the footer belongs to the pages that end.
  el('site-footer').classList.toggle('hidden', name === 'notes');

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
  if (!el('offline-panel').hidden) setOfflinePanel(false);
  updateProgress();
}

async function route() {
  const hash = location.hash || '#/';

  if (hash.startsWith('#/news')) {
    showView('news');
    window.scrollTo({ top: 0 });
    return;
  }

  // Without a jobs file the address falls through to the home page.
  if (hash.startsWith('#/jobs') && jobs.data) {
    showView('jobs');
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

/*
 * Offline reading. sw.js answers requests from the cache when the network is gone; this part lets the reader save
 * the whole site up front. The list of files comes from data/offline.json, written by the exporter. Metadata about
 * the saved copy lives in the same cache (offline-meta.json), so it is removed together with the files.
 */
const OFFLINE_CACHE = 'notes-offline';
const OFFLINE_META = 'offline-meta.json';
const offline = { saving: false, list: null };

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function readOfflineMeta() {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const response = await cache.match(OFFLINE_META);
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function offlineList() {
  offline.list ??= await loadJson('data/offline.json');
  return offline.list;
}

async function renderOffline() {
  const meta = await readOfflineMeta();
  const label = el('offline-label');
  const status = el('offline-status');
  const save = el('offline-save');
  const toggle = el('offline-toggle');

  toggle.classList.toggle('is-saved', Boolean(meta));
  toggle.classList.toggle('is-offline', !navigator.onLine);
  el('offline-remove').hidden = !meta || offline.saving;

  if (offline.saving) return;

  let list = null;
  try { list = await offlineList(); } catch { /* offline, or an older build without the list */ }

  if (!navigator.onLine) {
    label.textContent = 'Offline';
    status.textContent = meta
      ? `You are offline. Reading the copy saved on ${new Date(meta.savedAt).toLocaleString()}.`
      : 'You are offline. Notes you opened before are still available.';
    save.hidden = true;
    return;
  }

  save.hidden = false;
  save.disabled = !list;

  if (!meta) {
    label.textContent = 'Offline';
    status.textContent = list
      ? `Save every note, diagram and picture on this device (${formatMb(list.bytes)}) so the site opens without a connection.`
      : 'Saving for offline is not available right now.';
    save.textContent = 'Save for offline';
  } else if (list && list.build !== meta.build) {
    label.textContent = 'Update';
    status.textContent = `Saved ${new Date(meta.savedAt).toLocaleDateString()}. The notes have changed since; update to get the latest (${formatMb(list.bytes)}).`;
    save.textContent = 'Update offline copy';
  } else {
    label.textContent = 'Saved';
    status.textContent = `All ${meta.files} files are on this device (${formatMb(meta.bytes)}, saved ${new Date(meta.savedAt).toLocaleString()}). The site opens without a connection.`;
    save.textContent = 'Save again';
  }
}

async function saveOffline() {
  if (offline.saving) return;
  offline.saving = true;

  const status = el('offline-status');
  const meter = el('offline-meter');
  const bar = el('offline-bar');
  const save = el('offline-save');
  save.disabled = true;
  el('offline-remove').hidden = true;
  meter.hidden = false;

  try {
    offline.list = null;
    const list = await offlineList();
    // Ask the browser not to evict the copy under storage pressure. A refusal is fine: it still works until evicted.
    navigator.storage?.persist?.().catch(() => {});

    // Fill a fresh cache, then swap: a failed save never leaves a half-updated copy behind.
    const staging = `${OFFLINE_CACHE}-staging`;
    await caches.delete(staging);
    const cache = await caches.open(staging);
    const queue = [...list.files];
    let done = 0;

    const worker = async () => {
      while (queue.length) {
        const path = queue.shift();
        const response = await fetch(path, { cache: 'no-cache' });
        if (!response.ok || response.redirected) throw new Error(`${path} responded ${response.status}`);
        await cache.put(path, response);
        done++;
        bar.style.width = `${Math.round((done / list.files.length) * 100)}%`;
        status.textContent = `Saving ${done} of ${list.files.length} files…`;
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));

    const meta = { build: list.build, bytes: list.bytes, files: list.files.length, savedAt: new Date().toISOString() };
    await cache.put(OFFLINE_META, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));

    await caches.delete(OFFLINE_CACHE);
    const final = await caches.open(OFFLINE_CACHE);
    for (const request of await cache.keys()) {
      await final.put(request, await cache.match(request));
    }
    await caches.delete(staging);
  } catch (error) {
    await caches.delete(`${OFFLINE_CACHE}-staging`).catch(() => {});
    offline.saving = false;
    meter.hidden = true;
    save.disabled = false;
    status.textContent = `Saving stopped: ${error.message}. Check the connection and try again.`;
    return;
  }

  offline.saving = false;
  meter.hidden = true;
  bar.style.width = '0';
  await renderOffline();
}

async function removeOffline() {
  await caches.delete(OFFLINE_CACHE);
  await renderOffline();
}

function setOfflinePanel(open) {
  el('offline-panel').hidden = !open;
  el('offline-toggle').setAttribute('aria-expanded', String(open));
  if (open) renderOffline();
}

/* ---------- app updates ---------- */

/*
 * Installing. Chrome, Edge and Samsung Internet on Android fire beforeinstallprompt once the page qualifies; it can
 * come before this script has finished starting, so it is caught here, at the top level. Safari never fires it: an
 * iPhone installs from the Share menu, so the button explains the steps instead of doing nothing.
 */
let installPrompt = window.installOffer ?? null;

addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  showInstallHelp('Installed. Open Study Notes from your home screen or app list.');
});

const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function installSteps() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Apps such as WhatsApp, Instagram and Gmail open links in their own browser, which cannot install anything.
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\/|; wv\)/.test(ua)) {
    return 'This page is open inside another app. Open it in Chrome (Android) or Safari (iPhone) first: use the menu and choose "Open in browser", then install from there.';
  }
  if (iOS) {
    return 'On an iPhone or iPad: tap the Share button (the square with an arrow), scroll down, tap "Add to Home Screen", then "Add".';
  }
  if (/SamsungBrowser/.test(ua)) {
    return 'In Samsung Internet: open the menu (three lines), tap "Add page to", then "Home screen".';
  }
  if (/Firefox/.test(ua) && /Android/.test(ua)) {
    return 'In Firefox: open the menu (three dots), then tap "Install" or "Add to Home screen".';
  }
  if (/Android/.test(ua)) {
    return 'In Chrome: open the menu (three dots, top right), then tap "Install app" or "Add to Home screen". If neither is there, reload the page once and try again.';
  }
  return 'On a computer: click the install icon at the right end of the address bar, or open the browser menu and choose "Install Study Notes".';
}

function showInstallHelp(text) {
  el('install-help').textContent = text;
  el('install-help').hidden = false;
}

function wireInstall() {
  if (isInstalled()) {
    el('install-app').hidden = true;
    return;
  }

  el('install-app').addEventListener('click', async () => {
    installPrompt ??= window.installOffer ?? null;
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = window.installOffer = null;
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome !== 'accepted') showInstallHelp('Not installed. Press the button again whenever you want it.');
      return;
    }
    showInstallHelp(installSteps());
  });
}

let toastTimer = 0;

function toast(text, action) {
  // A message that needs an answer (reload) is not replaced by one that does not.
  if (!action && !el('toast').hidden && !el('toast-action').hidden) return;

  el('toast-text').textContent = text;
  const button = el('toast-action');
  button.hidden = !action;

  if (action) {
    button.textContent = action.label;
    button.onclick = action.run;
  }

  el('toast').hidden = false;
  clearTimeout(toastTimer);
  if (!action) toastTimer = setTimeout(() => { el('toast').hidden = true; }, 6000);
}

/** A saved copy follows the notes: when the build changes and there is a connection, it is fetched again quietly. */
async function refreshOfflineCopy() {
  if (offline.saving || !navigator.onLine || navigator.connection?.saveData) return;

  const meta = await readOfflineMeta();
  if (!meta) return;

  try {
    offline.list = null;
    const list = await offlineList();
    if (list.build === meta.build) return;
  } catch {
    return;
  }

  await saveOffline();
  const after = await readOfflineMeta();
  if (after && after.build !== meta.build) toast('The offline copy was updated with the latest notes.');
}

function wireAppUpdates(registration) {
  // A new build installs in the background; the open page still runs the old script until it reloads.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('New notes are ready.', { label: 'Reload', run: () => location.reload() });
  });

  // An installed app can stay open for days: look for a new build whenever it comes back to the front.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    registration?.update().catch(() => {});
    refreshOfflineCopy();
  });
  addEventListener('online', refreshOfflineCopy);
  refreshOfflineCopy();

}

function wireOffline() {
  // Service workers need a secure context (https or localhost); without one the site simply stays online-only.
  if (!('serviceWorker' in navigator) || !('caches' in window) || !isSecureContext) return;

  navigator.serviceWorker.register('sw.js').then(wireAppUpdates).catch(() => wireAppUpdates(null));

  el('offline-toggle').hidden = false;
  el('offline-toggle').addEventListener('click', () => setOfflinePanel(el('offline-panel').hidden));
  el('offline-save').addEventListener('click', saveOffline);
  el('offline-remove').addEventListener('click', removeOffline);

  document.addEventListener('click', event => {
    if (!el('offline-panel').hidden && !event.target.closest('#offline-panel, #offline-toggle')) setOfflinePanel(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !el('offline-panel').hidden) setOfflinePanel(false);
  });

  addEventListener('online', renderOffline);
  addEventListener('offline', renderOffline);
  renderOffline();
}

/* ---------- light and dark ---------- */

/** The theme in effect: the reader's choice if they made one, otherwise the device setting. */
function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme() {
  const chosen = document.documentElement.dataset.theme;
  // highlight.js ships one stylesheet per theme, switched by their media attribute.
  el('hljs-light').media = chosen ? (chosen === 'light' ? 'all' : 'not all') : '(prefers-color-scheme: light)';
  el('hljs-dark').media = chosen ? (chosen === 'dark' ? 'all' : 'not all') : '(prefers-color-scheme: dark)';
  el('theme-toggle').setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  el('theme-toggle').setAttribute('aria-pressed', String(isDark()));
}

function wireTheme() {
  applyTheme();
  el('theme-toggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* applies for this visit only */ }
    applyTheme();
    // Live diagrams are drawn in the theme's colours, so the open note is drawn again.
    if (state.current && document.querySelector('#reader .mermaid, #reader .diagram svg')) openNote(state.current);
  });
}

async function start() {
  trackMasthead();
  wireTheme();
  wireInstall();
  wireOffline();
  wireViewer();
  trackHeroScroll();

  try {
    state.index = await loadJson('data/index.json');
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
  showPlan();

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
  startJobs();
}

start();

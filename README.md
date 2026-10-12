<div align="center">

<img src="icons/icon.svg" alt="" width="88" height="88" />

# Engineering Notes

**100+ in-depth engineering study notes in one fast, private, installable web app.**

System design · C# & .NET · Angular · Databases · Data Engineering · Azure & DevOps · Security · DSA · AI/ML

### [🌐 Open the site → herijeet.github.io/study-notes-site](https://herijeet.github.io/study-notes-site/)

[![Live site](https://img.shields.io/badge/live-herijeet.github.io%2Fstudy--notes--site-22d3ee?style=for-the-badge)](https://herijeet.github.io/study-notes-site/)
[![Deploy](https://img.shields.io/github/actions/workflow/status/Herijeet/study-notes-site/deploy-pages.yml?style=for-the-badge&label=deploy)](https://github.com/Herijeet/study-notes-site/actions/workflows/deploy-pages.yml)
![No tracking](https://img.shields.io/badge/tracking-none-8b5cf6?style=for-the-badge)

</div>

---

## Why this exists

These are the notes I wrote while preparing for senior backend and system design interviews and while working day to day on .NET, Angular and Azure. Each note is written to be studied, not skimmed. It explains the idea, shows how it works with diagrams and code, covers the trade-offs, and ends with questions to test yourself.

The site is free and open to everyone, with no sign-up, ads or tracking.

## What you'll find

| Area | What it covers |
|------|----------------|
| 🆕 **What's New** | Recent releases in software and AI: what each one is, why it matters and how to use it. Updated regularly. |
| 🏗️ **System Design** | Scaling basics, back-of-the-envelope estimation, and 25 worked designs: rate limiter, URL shortener, chat, news feed, YouTube, payments, stock exchange and more |
| 🧱 **Architecture & APIs** | Architecture styles, domain-driven design, messaging and event-driven systems, API design |
| 🟣 **C# & .NET** | The runtime, the language, ASP.NET Core, EF Core vs Dapper, performance |
| 🅰️ **Frontend** | Angular, TypeScript, change detection, signals, RxJS |
| 📊 **Data Engineering** | Spark, Databricks, Delta Lake, data modelling, storage formats, streaming, orchestration and governance |
| 🗄️ **Databases** | Relational internals, SQL, NoSQL stores, caching |
| ☁️ **DevOps & Cloud** | CI/CD, GitHub Actions, Azure DevOps, Azure services, Git, observability |
| 🔐 **Security** | Threat modelling, identity, OWASP, encryption in practice |
| 🧮 **Data Structures & Algorithms** | Core structures and patterns, from arrays and binary search to graphs and dynamic programming |
| 🧩 **Programming Principles** | OOP, SOLID, design patterns, concurrency |
| 🖥️ **CS Foundations** | Networking and operating systems, tied back to what they mean in production |
| 🤖 **AI & Machine Learning** | ML foundations, LLM engineering and RAG, AI in the development lifecycle |
| ✅ **Testing & Quality** | Test strategy, test doubles, flaky tests, CI gates |
| 💹 **Domain Knowledge** | Financial-domain basics for engineers |

There's also a **What's new** feed with curated engineering news.

## Features

- **Made for studying.** Every note has a table of contents, reading time, syntax-highlighted code and Mermaid diagrams.
- **Quick to search.** Press <kbd>/</kbd> to filter notes across every category.
- **Shareable links.** Every note has its own URL, such as `#/notes/<slug>`.
- **Installable.** Choose *Add to Home Screen* on a phone, or *Install* in Chrome or Edge, and it opens full screen like an app.
- **Light and dark themes** that follow your system setting.
- **Private by design.** Every script, style and font is served from the site itself. A strict Content-Security-Policy blocks third-party requests, so nothing you read is sent anywhere.
- **No backend.** It's plain static files on GitHub Pages, so it's fast and needs no maintenance.

## Quick links

| | |
|---|---|
| Home | https://herijeet.github.io/study-notes-site/ |
| Browse all notes | https://herijeet.github.io/study-notes-site/#/notes |
| What's new feed | https://herijeet.github.io/study-notes-site/#/news |

## How it's built

```
 Markdown notes ──► exporter (Markdig) ──► gh-pages branch ──► Deploy workflow ──► GitHub Pages
                     HTML + JSON index      raw export          fix-ups applied      live site
```

1. The notes are written in Markdown. An exporter renders them to HTML and writes a JSON catalogue of categories and notes.
2. Each export is pushed to the **`gh-pages`** branch as one fresh commit, which replaces whatever was there before.
3. The **[Deploy site](.github/workflows/deploy-pages.yml)** workflow in this branch picks up the latest export, applies fix-ups from [`scripts/`](scripts), and publishes it with GitHub Pages.

Fix-ups live here, not in `gh-pages`, so new exports never undo them. The current fix-up is
[`pin_index_notes.py`](scripts/pin_index_notes.py). It keeps each section's **Index** note at the top, so the
What's New index stays first however many notes are added.

The front end is plain HTML, CSS and JavaScript with no framework. It uses hash-based routing, and
highlight.js, Mermaid and the Inter font are bundled locally.

## Run it locally

```bash
git clone --branch gh-pages https://github.com/Herijeet/study-notes-site.git
cd study-notes-site
python3 -m http.server 8080      # then open http://localhost:8080
```

Serve the folder over HTTP rather than opening `index.html` directly, because the notes load with `fetch`.

## Feedback

Spotted a mistake, or want a topic covered? [Open an issue](https://github.com/Herijeet/study-notes-site/issues). Corrections are always welcome.

If you find it useful, a ⭐ helps other people find it.

---

<div align="center">
Built by <a href="https://github.com/Herijeet">Abhijeet Gautam</a>
</div>

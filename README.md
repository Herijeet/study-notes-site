# Engineering Study Notes

A fast, offline-friendly study site with **103 engineering notes**: system design, C#/.NET, Angular, databases, data engineering, cloud/DevOps, security, algorithms, AI/ML and more.

## 🌐 Live site

**https://herijeet.github.io/study-notes-site/**

It's free to use and needs no sign-up. It works on desktop and mobile.

| Page | URL |
|------|-----|
| Home | https://herijeet.github.io/study-notes-site/#/ |
| All notes | https://herijeet.github.io/study-notes-site/#/notes |
| Tech news | https://herijeet.github.io/study-notes-site/#/news |
| A single note | `https://herijeet.github.io/study-notes-site/#/notes/<slug>` |

> **Install it as an app:** open the site on your phone or in Chrome/Edge, then pick **Add to Home Screen** or **Install**. It opens full screen like a native app.

## 📚 What's inside

| Category | Notes | Covers |
|----------|------:|--------|
| What's New | 3 | Recent releases in software and AI: what each one is, why it matters and how to use it |
| System Design | 32 | Scaling, estimation and 25 worked designs, from rate limiters to stock exchanges |
| Architecture & APIs | 3 | Architecture styles, DDD, messaging, API design |
| C# & .NET | 4 | The runtime, the language, ASP.NET Core, EF Core, performance |
| Frontend | 1 | Angular, TypeScript, change detection, signals, RxJS |
| Data Engineering | 14 | Spark, Databricks, Delta Lake, data modelling, streaming, governance |
| Databases | 4 | Relational internals, SQL, NoSQL, caching |
| DevOps & Cloud | 18 | CI/CD, GitHub Actions, Azure DevOps, Azure services, Git, observability |
| Security | 2 | Threat modelling, identity, OWASP, encryption |
| Data Structures & Algorithms | 12 | Core structures and patterns, from arrays to dynamic programming |
| Programming Principles | 3 | OOP, SOLID, design patterns, concurrency |
| CS Foundations | 2 | Networking and operating systems |
| AI & Machine Learning | 3 | ML foundations, LLM engineering, RAG |
| Testing & Quality | 1 | Test strategy, test doubles, flakiness, CI gates |
| Domain Knowledge | 1 | Financial-domain basics for engineers |

## ✨ Features

- **Rich notes** with syntax-highlighted code and Mermaid diagrams
- **Light and dark themes** that follow your system setting
- **Installable PWA**, with direct links to any note
- **Private by design**: every script, style and font is served from this site. There are no trackers, analytics or third-party requests (enforced by a strict Content-Security-Policy).
- **Static hosting only**: no backend, no build step to view it

## 🗂️ Project structure

```
index.html             App shell (hash-based routing)
site.js / site.css     App logic and styles
markdown.css           Note typography
hero3d.js              Home page hero animation
manifest.webmanifest   PWA manifest
data/index.json        Catalogue of categories and notes
data/notes/*.json      Content of each note
data/news.json         Tech news feed
Engineering-KB/        Images used by the notes
vendor/                Bundled highlight.js, Mermaid and the Inter font
icons/                 App icons
```

## 💻 Run locally

The site loads JSON with `fetch`, so serve the folder over HTTP rather than opening `index.html` directly:

```bash
git clone https://github.com/herijeet/study-notes-site.git
cd study-notes-site
python3 -m http.server 8080
# then open http://localhost:8080
```

## 🚀 Deploy your own copy

1. Fork this repository.
2. Go to **Settings → Pages** and set **Source** to *Deploy from a branch*, using the default branch and `/ (root)`.
3. Your copy goes live at `https://<your-username>.github.io/study-notes-site/`.

The `.nojekyll` file makes GitHub Pages serve the files as they are.

## 🤝 Feedback

Found a mistake or want a topic covered? [Open an issue](https://github.com/herijeet/study-notes-site/issues).

# Bible Show Pro

Desktop-first church presentation platform for Bible verses, service planning, and live output control.

## Stack

- **Tauri 2** (Rust) — desktop shell, SQLite, multi-window output
- **React + TypeScript + Vite** — control UI
- **Tailwind CSS** — styling
- **Zustand** — state management
- **SQLite + FTS5** — offline Bible search

## Features (MVP)

- Bible reference and keyword search (offline, FTS5)
- Service plan builder with drag-and-drop ordering
- Preview / Program live presentation workflow
- Audience output window (borderless)
- Basic theme editor with contrast warnings
- Media library (path references)
- Auto-save, backup/restore, pre-service checklist
- Keyboard shortcuts for live operation

## Prerequisites

- Node.js 20+
- Rust (stable)
- Windows (primary target)

## Development

```bash
npm install
npm run tauri dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server only |
| `npm run tauri dev` | Full desktop app |
| `npm run build` | Build frontend |
| `npm run tauri build` | Build Windows installer |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E tests |

## Keyboard Shortcuts (Live Presentation)

| Key | Action |
|-----|--------|
| Enter | Go Live (preview → program) |
| B | Blackout |
| C | Clear text |
| Ctrl+Z | Undo |
| L | Logo screen |
| F | Freeze / unfreeze |

## Bible Data

The app ships with a sample KJV dataset (Genesis 1, Psalm 23, John 3, Romans 8). Import full translations via JSON using the format in `database/seed/kjv-sample.json`.

## Project Structure

```
src/              React frontend (modules, stores, engine)
src-tauri/        Rust backend (SQLite, Tauri commands)
database/         SQL schema and seed data
```

## License

Application code: MIT. Bible translation text is public domain where noted; licensed translations must be imported separately.

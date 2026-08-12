# AGENTS.md

## Cursor Cloud specific instructions

Bible Show Pro is a single desktop app (not a monorepo): a Tauri 2 (Rust) shell wrapping a
React + TypeScript + Vite frontend, with an embedded SQLite (FTS5) database. There is no server
tier — the "backend" is the Rust/Tauri process and its local SQLite file. Standard commands live in
`README.md` and `package.json` scripts; only the non-obvious caveats are captured below.

### Toolchain caveats
- **Rust must be stable >= 1.85.** A transitive dependency (`dlopen2_derive`) requires edition 2024,
  so older toolchains fail to even parse the manifest. The prepared environment has current stable
  installed via `rustup default stable`.
- **Tauri Linux system libraries are required** for `cargo test` and `npm run tauri dev` (notably
  `webkit2gtk-4.1`, GTK3, libsoup-3, ayatana appindicator, librsvg, libxdo). These are already
  installed in the environment; they are not tracked in the repo.
- The first `cargo` build is slow (compiles the whole Tauri app + a vendored `oximedia-ndi` crate);
  `src-tauri/target/` is gitignored so it recompiles on a fresh checkout.

### Running the app
- `npm run dev` — frontend only (Vite on port **1420**, `strictPort`). This has **no Tauri backend**,
  so the SQLite DB / Bible data is unavailable and the UI shows "0 versions". Fine for UI work and
  the Playwright E2E harness, not for real Bible/search behavior.
- `npm run tauri dev` — full desktop app. Requires an X display (`DISPLAY=:1` is available). It
  spawns its own Vite via `beforeDevCommand`, so do **not** also run a standalone `npm run dev` on
  1420 first (the port is strict and will collide). SQLite is auto-created in the app-data dir and
  seeded with a small sample KJV (Genesis 1, Psalm 23, John 3, Romans 8). Use the in-app "Install
  now" prompt (or Settings → Bible Versions) to import full translations for complete coverage.
- Expect harmless `libEGL warning: DRI3 ...` output under software rendering; the app still renders.

### Testing notes
- `npm test` (Vitest) and `cargo test --manifest-path src-tauri/Cargo.toml` both pass.
- `npm run test:e2e` (Playwright, auto-starts Vite on 1420): the harness works, but the 4 assertions
  in `e2e/app.spec.ts` currently **fail on `main` too** — they assert headings like "Dashboard",
  "Service Builder", and "Live Presentation" that no longer exist after the UI was refactored (e.g.
  `/present` is now folded into the Bible Search production view). Treat these as pre-existing stale
  tests, not an environment problem.

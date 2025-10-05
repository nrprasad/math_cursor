# Cursor for Math Proofs – Desktop

Electron-based desktop app for experimenting with structured math proof projects. The UI is still built with React/Tailwind, but it now runs fully inside an Electron renderer process and talks directly to the main process for persistence, proof drafting, and LaTeX export.

## Requirements
- Node.js 18+
- npm 9+

## Setup
```bash
npm install
```

## Run in Development
```bash
npm run dev
```
This starts Vite (renderer hot-reload) and the Electron main process. The window reloads automatically as you edit files under `renderer/` or `electron/`.

## Build & Run Production Bundle
```bash
npm run build   # produces renderer assets in ./dist
npm run start   # launches Electron pointing at the built assets
```

## Data Storage
- Projects are stored as JSON documents at `<user-data>/cursor-math-projects/<id>/project.json` (e.g. `~/Library/Application Support/cursor-math-proofs` on macOS, `%APPDATA%` on Windows, or `~/.config` on Linux).
- To reuse the legacy `./storage` directory (or point to a custom location), set `PROJECT_STORAGE_DIR=/path/to/storage` before launching the app.

## LLM Integration
- Drafting proofs is currently stubbed in `electron/backend/llm.js`.
- To connect to a real model (e.g. OpenAI), replace `draftProofResponse` with an API call and inject API keys via environment variables or secure storage.

## Project Structure
```
electron/    # Main process, storage helpers, LaTeX export, LLM stubs
renderer/    # Vite-powered React renderer (HashRouter, Tailwind, KaTeX)
storage/     # Optional sample projects (use PROJECT_STORAGE_DIR to load)
package.json
README.md
```

## Verifying the Desktop Flow
- Create a project on the home screen and confirm navigation to `/p/<id>`.
- Use the “Open an Existing Project” table on the home screen to load a saved project and verify the editor state matches disk.
- Add/edit notation, lemmas, facts, ideas, pitfalls, conjectures, and use **File → Save Project**. Reload from the same menu to confirm persistence (ETag collisions still surface as conflict warnings).
- Draft a proof for any lemma via **File → Draft Proof** to see the placeholder markdown + warning banner tied to the currently selected lemma.
- Export LaTeX from **File → Export LaTeX** and ensure the downloaded zip contains `main.tex`, `notation.tex`, `facts.tex`, `lemmas.tex`, and `conjectures.tex`.
- Resize the editor/chat split using the center drag handle to position the panes to your liking.

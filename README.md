# Cursor for Math Proofs – Desktop

Electron-based desktop app for experimenting with structured math proof projects. The UI is still built with React/Tailwind, but it now runs fully inside an Electron renderer process and talks directly to the main process for persistence, proof drafting, and LaTeX export.

## Quick Install (macOS · Windows · Linux)

Prerequisite: [Node.js 18+](https://nodejs.org/) (npm ships with Node).

```bash
# 1. Clone and enter the project
git clone https://github.com/<your-org>/cursor-math-proofs-desktop.git
cd cursor-math-proofs-desktop

# 2. Run the cross-platform setup script (installs dependencies & build)
./scripts/setup.sh

# 3. Launch the packaged desktop app
npm run start
```

The setup script works on macOS, Linux, and WSL (it only needs Node.js). After the build completes, `npm run start` launches Electron pointing at the bundled assets.

Need live-reload while hacking? Skip the setup script and run `npm install` followed by `npm run dev` to start the Vite + Electron development loop.

### Want a packaged build?
```bash
npm run build   # bundles the renderer into ./dist
npm run start   # launches Electron against the bundled assets
```
For installers (DMG/EXE/AppImage, etc.), layer a packager such as `electron-builder` or `electron-forge` on top of the build output.

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

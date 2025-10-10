# Cursor for Math Proofs – Desktop

Electron-based desktop app for experimenting with structured math proof projects. The UI is still built with React/Tailwind, but it now runs fully inside an Electron renderer process and talks directly to the main process for persistence, proof drafting, and LaTeX export.

## Quick Install (macOS · Windows · Linux)
1. **Install Node.js 18 or newer** (includes npm). Download from [nodejs.org](https://nodejs.org/) and follow the installer.
2. **Download the app code**.
   - Easiest: click the green **Code → Download ZIP** button on GitHub, then unzip it.
   - Git users can run `git clone https://github.com/<your-org>/cursor-math-proofs-desktop.git`.
3. **Open a terminal in the project folder** and install dependencies:
   ```bash
   npm install
   ```
4. **Launch the desktop app**:
   ```bash
   npm run dev
   ```
   A window opens automatically. Leave the terminal running; it hot-reloads changes if you edit files.

### Want a packaged build?
```bash
npm run build   # bundles the renderer into ./dist
npm run start   # launches Electron against the bundled assets
```
Wrap the build with a packager like `electron-builder` if you need installers for distribution.

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

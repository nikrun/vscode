# AI Agent Guidelines (`nikrun/vscode`)

**Nikrun** is a zero-config, user-scope toolchain and developer ecosystem for **Object Pascal / Free Pascal**, organized across three repositories under `https://github.com/nikrun`:

1. **[`nikrun/vscode`](https://github.com/nikrun/vscode)** *(this repository)* — Official `vscode-nikrun` Visual Studio Code extension (`src/*.ts`, `syntaxes/`, `schemas/`).
2. **[`nikrun/cli`](https://github.com/nikrun/cli)** — Standalone `nik` CLI (`nik sdk`, `nik init`, `nik build`, `nik lsp`) and `nikrun-lsp-protocol`.
3. **[`nikrun/sdk`](https://github.com/nikrun/sdk)** — Portable Free Pascal SDK build pipeline and GitHub Releases (`latest`).

---

## Core Engineering Rules

- **Terminology & Typography:**
  - **Nikrun** (capitalized prose, no backticks) refers to the overall project and ecosystem.
  - **`nik`** (lowercase in inline code backticks in Markdown; `nik` in terminal output) refers specifically to the CLI tool binary and its commands.
  - Keep technical identifiers (`~/.nikrun`, `--nikrun-home`, `NIKRUN_HOME`, `nikrun-fpc-sdk-*`, `vscode-nikrun`, `nik.yaml`) in their exact lowercase technical form.
- **Thin IDE Client over `nik` CLI:** Keep compiler, manifest, SDK, and semantic analysis logic inside the `nik` CLI (`nik lsp`, `nik build`, `nik sdk --json`, `nik init --json`) so terminal workflows, CI, AI agents, and editors share one deterministic source of truth.
- **Schema Parity:** Keep `schemas/nik-yaml.schema.json` synchronized with `nik.manifest.io.pas` in `nikrun/cli` (and `../docs/specs/nik-yaml.md` when present locally).
- **Single-Source Diagnostics:** When `nikrun.lsp.enabled` is active (default), `nik lsp` owns the VS Code Problems panel; task executions must not register competing problem matchers that leave stale duplicate markers.

---

## Build & Verification Commands

Run commands from the repository root:

```powershell
# Install dependencies
npm install

# Typecheck & compile TypeScript to out/
npm run compile
```

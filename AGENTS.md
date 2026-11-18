# AI Agent Guidelines (`nikrun/vscode`)

**Nikrun** is a zero-config, user-scope toolchain and developer ecosystem for **Free Pascal & Object Pascal**, organized across six repositories under `https://github.com/nikrun`:

1. **[`nikrun/vscode`](https://github.com/nikrun/vscode)** *(this repository)* — Official **Nikrun for VS Code** (`nikrun.vscode`) extension (`src/*.ts`, `syntaxes/`, `schemas/`).
2. **[`nikrun/cli`](https://github.com/nikrun/cli)** — Standalone `nik` CLI (`nik sdk`, `nik init`, `nik pkg`, `nik build`, `nik lsp`) and `nikrun-lsp-protocol`.
3. **[`nikrun/sdk`](https://github.com/nikrun/sdk)** — Portable Free Pascal SDK build pipeline and GitHub Releases (`latest`).
4. **[`nikrun/web`](https://github.com/nikrun/web)** — Official `nikrun.dev` website, VitePress documentation, and CLI installer endpoints.
5. **[`nikrun/brand`](https://github.com/nikrun/brand)** — Canonical vector marks, icons, favicons, and social preview cards.
6. **[`nikrun/build-lib`](https://github.com/nikrun/build-lib)** — Shared PowerShell build, packaging, SBOM, and release automation library.

> *(Local multi-repo workspace)* Consult **`../docs/messaging.md`** for binding terminology, Marketplace copy, and the uniform README blueprint, and run `../docs/sync-ecosystem.ps1 -Check` after editing `README.md`.

---

## Core Engineering Rules

- **Terminology & Typography:**
  - **Nikrun** (capitalized prose, no backticks) refers to the overall project and ecosystem.
  - **`nik`** (lowercase in inline code backticks in Markdown; `nik` in terminal output) refers specifically to the CLI tool binary and its commands.
  - Keep technical identifiers (`~/.nikrun`, `--nikrun-home`, `NIKRUN_HOME`, `nikrun-fpc-sdk-*`, `nikrun.vscode`, `nik.yaml`) in their exact lowercase technical form.
- **Thin IDE Client over `nik` CLI:** Keep compiler, manifest, SDK, and semantic analysis logic inside the `nik` CLI (`nik lsp`, `nik build`, `nik sdk --json`, `nik init --json`) so terminal workflows, CI, AI agents, and editors share one deterministic source of truth.
- **Schema Parity:** Keep `schemas/nik-yaml.schema.json` synchronized with `nik.manifest.io.pas` in `nikrun/cli` (and `../docs/specs/nik-yaml.md` when present locally).
- **Single-Source Diagnostics:** When `nikrun.lsp.enabled` is active (default), `nik lsp` owns the VS Code Problems panel; task executions must not register competing problem matchers that leave stale duplicate markers.

---

## Build & Verification Commands

Run commands from the repository root:

```powershell
# Initialize shared build-lib submodule (first-time setup)
git submodule update --init --recursive

# Full build, test, CycloneDX SBOM & VSIX package pipeline (outputs to .out/)
.\build.ps1

# Install dependencies & compile/bundle TypeScript to dist/extension.js for F5 debugging
npm install
npm run compile
```

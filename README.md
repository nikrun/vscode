# Nikrun for Visual Studio Code (`vscode-nikrun`)

[![Build and Test](https://github.com/nikrun/vscode/actions/workflows/build.yml/badge.svg)](https://github.com/nikrun/vscode/actions/workflows/build.yml)

> **Official Visual Studio Code Extension for [Nikrun](https://github.com/nikrun) (Free Pascal & Object Pascal)**

`vscode-nikrun` turns Visual Studio Code into a zero-config Object Pascal / Free Pascal development environment powered directly by the **`nik` CLI** ([`nikrun/cli`](https://github.com/nikrun/cli)) and its built-in **`nik lsp`** Language Server.

### Related Nikrun Repositories

- **[`nikrun/vscode`](https://github.com/nikrun/vscode)** *(this repository)* — Official `vscode-nikrun` Visual Studio Code extension
- **[`nikrun/cli`](https://github.com/nikrun/cli)** — Standalone `nik` CLI (`nik sdk`, `nik init`, `nik build`, `nik lsp`) and `nik.yaml` specifications
- **[`nikrun/sdk`](https://github.com/nikrun/sdk)** — Portable Free Pascal SDK build pipeline and GitHub Releases (`3.2.2`, `3.2.4`, `3.2.5`, `3.3.1`)

---

## Features

- **Zero-Config Language Server (`nik lsp`):**
  - Automatically launches `nik lsp --stdio --profile <activeProfile>` (after a fast `nik lsp --help` pre-flight check).
  - Live Free Pascal compiler diagnostics (`ppc* -Cn` errors, warnings, notes, hints) with 250 ms debouncing and checkout-local unsaved editor overlays mapped to exact source lines & columns.
  - Hierarchical `Document Symbols` (Outline & Breadcrumbs), `Workspace Symbols`, `Go to Definition` (across local packages and bundled Nikrun SDK `source/rtl` & `source/packages`), PasDoc `Hover` documentation, `Signature Help`, and `Completion`.
- **Project Initialization, SDK & Profile Switchers:**
  - Initialize new projects (`Nikrun: Initialize Project` / `nik init`), switch your project's `nik.yaml` `toolchain.fpc` version (`3.2.2`, `3.2.4`, `3.3.1`), or install missing prebuilt SDKs directly from the status bar.
  - Switch active `nik.yaml` profiles (`debug`, `release`, or custom project profiles) with automatic `nik lsp` reload.
- **`nik.yaml` Schema Validation & Autocompletion:**
  - Ships a complete JSON Schema (`schemas/nik-yaml.schema.json`) for `program`, `library`, and `package` manifests (automatically wired into the Red Hat YAML extension).
- **Integrated Build Tasks & Problem Matcher (`$nik-fpc`):**
  - Built-in `nik` task provider (`Nikrun: Build Project`, `Nikrun: Clean & Rebuild Project`, `Ctrl+Shift+B`), cleanly delegating diagnostic ownership to `nik lsp` when enabled so markers never duplicate.
- **Modern Object Pascal Syntax Highlighting:**
  - Dedicated TextMate grammar and language configuration for `.pas`, `.pp`, `.lpr`, `.dpr`, and `.inc` files (supporting `&`-escaped identifiers, dot-member names, structured compiler directives, and attributes).

---

## Development & Local Testing

1. Build the `nik` CLI in a sibling [`nikrun/cli`](https://github.com/nikrun/cli) checkout (or install it into `~/.nikrun/bin`):
   ```powershell
   cd ..\cli
   .\build.ps1 -Profile release -Install -RunTests:$false
   ```
2. Initialize submodules, install extension dependencies, and compile/bundle TypeScript (`dist/extension.js`):
   ```powershell
   cd ..\vscode
   git submodule update --init --recursive
   npm install
   npm run compile
   ```
   Or run the full release packaging & test pipeline (`.vsix`, CycloneDX SBOM, `release-notes.json`, and `manifest.json` in `.out/`):
   ```powershell
   .\build.ps1
   ```
3. Open this repository (or the parent `nikrun.code-workspace`) in VS Code and press **`F5`** (*Run vscode-nikrun Extension*) to launch an Extension Development Host window.

---

## License

Licensed under the [MIT License](./LICENSE).

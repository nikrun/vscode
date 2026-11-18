<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://nikrun.dev/brand/nikrun-lockup-dark-mono.png">
    <img alt="Nikrun" src="https://nikrun.dev/brand/nikrun-lockup-light.png" height="52">
  </picture>
</p>

# Nikrun for VS Code

[![Build and Test](https://github.com/nikrun/vscode/actions/workflows/build.yml/badge.svg)](https://github.com/nikrun/vscode/actions/workflows/build.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](./LICENSE)
[![Website: nikrun.dev](https://img.shields.io/badge/website-nikrun.dev-0b0e14)](https://nikrun.dev)

> **Official Visual Studio Code extension for zero-config Free Pascal & Object Pascal development powered by `nik lsp`.**

[nikrun.dev](https://nikrun.dev) · [`nik` CLI](https://github.com/nikrun/cli) · [Free Pascal SDKs](https://github.com/nikrun/sdk) · **[VS Code Extension](https://github.com/nikrun/vscode)** · [Website & Docs](https://github.com/nikrun/web) · [Brand Assets](https://github.com/nikrun/brand) · [Build Library](https://github.com/nikrun/build-lib)

---

**Nikrun for VS Code** (`nikrun.vscode`) turns Visual Studio Code into a modern, zero-config **Free Pascal & Object Pascal** IDE. It connects VS Code directly to the standalone **`nik` CLI** ([`nikrun/cli`](https://github.com/nikrun/cli)) and its built-in Language Server (**`nik lsp`**) — eliminating manual compiler path configuration, missing RTL source lookups, and duplicate diagnostic markers.

---

## Features

- **Instant Code Intelligence (`nik lsp`):**
  - Automatically launches `nik lsp --stdio --profile <activeProfile>` with zero path guessing.
  - Real Free Pascal compiler diagnostics (`ppc* -Cn` errors, warnings, notes, hints) live as you type, using 250 ms debouncing and checkout-local unsaved editor overlays mapped to exact source lines & columns.
  - Hierarchical `Document Symbols` (Outline & Breadcrumbs), `Workspace Symbols`, `Go to Definition` deep into local packages and bundled Free Pascal `source/rtl` & `source/packages`, PasDoc `Hover` documentation, `Signature Help`, and `Completion`.
- **One-Click SDK & Profile Switching:**
  - Scaffold new projects (`Nikrun: Initialize Project` / `nik init`), switch your project's `nik.yaml` `toolchain.fpc` version (`3.2.2`, `3.2.4`, `3.3.1`), or install missing prebuilt SDKs straight from the status bar.
  - Toggle `debug`, `release`, or custom `nik.yaml` build profiles with automatic `nik lsp` reload.
- **First-Class `nik.yaml` Authoring:**
  - Ships a complete JSON Schema (`schemas/nik-yaml.schema.json`) with validation and autocompletion for `program`, `library`, and `package` manifests.
- **Duplicate-Free Build Tasks (`$nik-fpc`):**
  - Integrated `nik build` and `nik build --clean` tasks (`Ctrl+Shift+B`) that coordinate cleanly with `nik lsp` so the *Problems* panel never accumulates stale or duplicate markers.
- **Modern Object Pascal Syntax:**
  - Dedicated TextMate grammar and language configuration for `.pas`, `.pp`, `.lpr`, `.dpr`, and `.inc` files — supporting `&`-escaped identifiers, dotted unit/member names, structured compiler directives, and attributes.

---

## Quick Start

1. **Install the `nik` CLI** in user scope (`~/.nikrun` — no administrator or root rights required):
   - **Windows (PowerShell):** `irm https://nikrun.dev/install.ps1 | iex`
   - **Linux & macOS:** `curl -fsSL https://nikrun.dev/install.sh | bash`
2. **Install a Free Pascal SDK** (or let **Nikrun for VS Code** prompt to install the pinned SDK automatically when opening a project):
   ```bash
   nik sdk install 3.2.4
   ```
3. **Open any folder containing `nik.yaml`** (or run **`Nikrun: Initialize Project`** from the VS Code Command Palette).

---

## Repository Structure

```text
vscode/
├── .github/
│   ├── actions/build/                 # Composite GitHub Action for VSIX build, test & packaging
│   └── workflows/                     # CI build & release automation workflows
├── brand/                             # Shared Nikrun brand & icon assets (Git submodule)
├── build-lib/                         # Shared Nikrun build & release library (Git submodule)
├── images/                            # Extension icon, file icons & status-bar icon font
├── schemas/
│   └── nik-yaml.schema.json           # JSON Schema for program, library & package manifests
├── scripts/                           # esbuild bundler, brand sync & VSIX validation scripts
├── src/
│   ├── extension.ts                   # Extension activation & command registration
│   ├── cli.ts                         # `nik` binary resolution & JSON command execution
│   ├── lspClient.ts                   # `vscode-languageclient` lifecycle over `nik lsp --stdio`
│   ├── statusBar.ts                   # Free Pascal SDK & active profile status-bar switchers
│   ├── taskProvider.ts                # `nik build` / `nik build --clean` task provider
│   └── version.ts                     # Build/channel version metadata
├── syntaxes/
│   └── objectpascal.tmLanguage.json   # Modern Object Pascal TextMate grammar
├── language-configuration.json        # Brackets, comments, folding & indentation rules
├── package.json                       # Extension manifest (`nikrun.vscode`)
├── version.txt                        # Single source of truth SemVer
├── changelog.yml                      # Structured Keep-a-Changelog release history
└── build.ps1                          # Full compile, test, CycloneDX SBOM & VSIX build script
```

---

## Development & Testing

1. Build and install the `nik` CLI from a sibling [`nikrun/cli`](https://github.com/nikrun/cli) checkout into `~/.nikrun/bin`:
   ```powershell
   cd ..\cli
   .\build.ps1 -Profile release -Install -RunTests:$false
   ```
2. Initialize submodules, install extension dependencies, and bundle TypeScript (`dist/extension.js`):
   ```powershell
   cd ..\vscode
   git submodule update --init --recursive
   npm install
   npm run compile
   ```
   Or run the full release packaging & verification pipeline (`.vsix`, CycloneDX SBOM, `release-notes.json`, and `manifest.json` in `.out/`):
   ```powershell
   .\build.ps1
   ```
3. Open this repository (or the parent `nikrun.code-workspace`) in VS Code and press **`F5`** (*Run Nikrun for VS Code Extension*) to launch an Extension Development Host window.

---

## License

Copyright (c) 2026 The Nikrun Contributors.

Licensed under the **GNU General Public License v3.0 or later** (`GPL-3.0-or-later`) — see [LICENSE](./LICENSE).

> **Note on Projects Built with Nikrun:** Using `nik` or **Nikrun for VS Code** to initialize (`nik init`), analyze (`nik lsp`), or compile (`nik build`) your own Free Pascal & Object Pascal applications, libraries, or packages imposes **no** licensing restrictions on your source code or compiled binaries. You remain free to license and distribute your own projects under any open-source or commercial/proprietary terms.

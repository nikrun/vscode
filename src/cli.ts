import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export interface InstalledSdkItem {
  sdkId: string;
  fpcVersion: string;
  targetOs: string;
  targetCpu: string;
  targetTriplet: string;
  installPath: string;
}

export interface RemoteSdkItem {
  sdkId: string;
  fpcVersion: string;
  targetOs: string;
  targetCpu: string;
  targetTriplet: string;
  sizeBytes: number;
  installed: boolean;
}

export interface SdkListResponse {
  nikrunHome: string;
  sdks: InstalledSdkItem[];
}

export interface InitProjectResponse {
  success: boolean;
  projectDir: string;
  manifestPath: string;
  kind: string;
  name: string;
  fpcVersion: string;
  usedTemplate: boolean;
  templatePath: string | null;
  createdFiles: string[];
  error?: string;
}

export interface RemoteSdkListResponse {
  releaseTag: string;
  sdks: RemoteSdkItem[];
}

let extPath = '';
let isDevExtensionHost = false;

export function initCliContext(context: vscode.ExtensionContext): void {
  extPath = context.extensionPath;
  isDevExtensionHost = context.extensionMode === vscode.ExtensionMode.Development;
}

export function getConfiguredNikrunHome(): string {
  const cfg = vscode.workspace.getConfiguration('nikrun');
  const explicitHome = (cfg.get<string>('nikrunHome') ?? '').trim();
  if (explicitHome.length > 0) {
    return explicitHome;
  }
  const envHome = (process.env.NIKRUN_HOME ?? '').trim();
  if (envHome.length > 0) {
    return envHome;
  }
  return path.join(os.homedir(), '.nikrun');
}

export function getActiveProfile(): string {
  const cfg = vscode.workspace.getConfiguration('nikrun');
  const prof = (cfg.get<string>('profile') ?? 'debug').trim();
  return prof.length > 0 ? prof : 'debug';
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

export function resolveNikExecutable(): string | undefined {
  const exeName = process.platform === 'win32' ? 'nik.exe' : 'nik';
  const cfg = vscode.workspace.getConfiguration('nikrun');
  const configuredPath = (cfg.get<string>('cliPath') ?? '').trim();

  if (configuredPath.length > 0) {
    return isExecutableFile(configuredPath) ? configuredPath : undefined;
  }

  // In Extension Development Host (F5), prefer the sibling repo/worktree cli/bin/nik(.exe)
  // so local development always tests the freshly built CLI binary even if ~/.nikrun/bin/nik is older.
  if (isDevExtensionHost && extPath.length > 0) {
    const siblingCliBin = path.join(path.dirname(extPath), 'cli', 'bin', exeName);
    if (isExecutableFile(siblingCliBin)) {
      return siblingCliBin;
    }
  }

  // 1. User-scope ~/.nikrun/bin/nik(.exe)
  const nikHomeBin = path.join(getConfiguredNikrunHome(), 'bin', exeName);
  if (isExecutableFile(nikHomeBin)) {
    return nikHomeBin;
  }

  // 2. Sibling cli/bin/nik(.exe) next to extension or open workspace folders
  if (extPath.length > 0) {
    const siblingCliBin = path.join(path.dirname(extPath), 'cli', 'bin', exeName);
    if (isExecutableFile(siblingCliBin)) {
      return siblingCliBin;
    }
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (fs.existsSync(path.join(folder.uri.fsPath, 'src', 'nik.pas'))) {
      const cliRepoBin = path.join(folder.uri.fsPath, 'bin', exeName);
      if (isExecutableFile(cliRepoBin)) {
        return cliRepoBin;
      }
    }
    const localCliBin = path.join(folder.uri.fsPath, 'cli', 'bin', exeName);
    if (isExecutableFile(localCliBin)) {
      return localCliBin;
    }
    const parentCliBin = path.join(path.dirname(folder.uri.fsPath), 'cli', 'bin', exeName);
    if (isExecutableFile(parentCliBin)) {
      return parentCliBin;
    }
  }

  // 3. System PATH lookup
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    const cand = path.join(dir, exeName);
    if (isExecutableFile(cand)) {
      return cand;
    }
  }

  return undefined;
}

export function buildGlobalNikArgs(subArgs: string[]): string[] {
  const args: string[] = ['--no-color'];
  const cfg = vscode.workspace.getConfiguration('nikrun');
  const explicitHome = (cfg.get<string>('nikrunHome') ?? '').trim();
  if (explicitHome.length > 0) {
    args.push('--nikrun-home', explicitHome);
  }
  args.push(...subArgs);
  return args;
}

export function verifyNikSupportsLsp(nikExe: string): Promise<{ supported: boolean; detail: string }> {
  return new Promise((resolve) => {
    cp.execFile(
      nikExe,
      ['--no-color', 'lsp', '--help'],
      { windowsHide: true, timeout: 5000 },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ supported: true, detail: stdout.trim() });
          return;
        }
        const combined = `${stderr ?? ''}\n${stdout ?? ''}\n${err.message ?? ''}`.trim();
        resolve({ supported: false, detail: combined });
      }
    );
  });
}

export function execNikJson<T>(nikExe: string, subArgs: string[], cwd?: string): Promise<T> {
  const fullArgs = buildGlobalNikArgs([...subArgs, '--json']);
  return new Promise<T>((resolve, reject) => {
    cp.execFile(
      nikExe,
      fullArgs,
      {
        cwd,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024
      },
      (err, stdout, stderr) => {
        const trimmed = stdout.trim();
        if (err && trimmed.length === 0) {
          reject(new Error(stderr.trim() || err.message));
          return;
        }
        try {
          resolve(JSON.parse(trimmed) as T);
        } catch (parseErr) {
          reject(
            new Error(
              `Failed to parse JSON from '${path.basename(nikExe)} ${subArgs.join(' ')}': ${
                stderr.trim() || String(parseErr)
              }`
            )
          );
        }
      }
    );
  });
}

export function discoverProfilesFromManifest(workspaceRoot?: string): string[] {
  const defaults = ['debug', 'release'];
  if (!workspaceRoot) {
    return defaults;
  }

  const candidates = [
    path.join(workspaceRoot, 'nik.yaml'),
    path.join(workspaceRoot, 'nik.yml')
  ];
  const manifestFile = candidates.find((f) => fs.existsSync(f));
  if (!manifestFile) {
    return defaults;
  }

  try {
    const lines = fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/);
    let profilesIndent = -1;
    const found = new Set<string>(defaults);

    for (const rawLine of lines) {
      const stripped = rawLine.replace(/#.*$/, '');
      if (stripped.trim().length === 0) {
        continue;
      }
      const indentMatch = /^(\s*)([A-Za-z0-9_-]+)\s*:\s*$/.exec(stripped);
      if (!indentMatch) {
        if (profilesIndent >= 0) {
          const curIndent = (/^(\s*)/.exec(stripped)?.[1] ?? '').length;
          if (curIndent <= profilesIndent) {
            profilesIndent = -1;
          }
        }
        continue;
      }

      const indent = indentMatch[1].length;
      const key = indentMatch[2];

      if (profilesIndent >= 0 && indent <= profilesIndent) {
        profilesIndent = -1;
      }

      if (key === 'profiles' && indent >= 2) {
        profilesIndent = indent;
        continue;
      }

      if (profilesIndent >= 0 && indent > profilesIndent && indent <= profilesIndent + 4) {
        found.add(key);
      }
    }

    return Array.from(found);
  } catch {
    return defaults;
  }
}

export function findWorkspaceManifestPath(workspaceRoot?: string): string | undefined {
  if (!workspaceRoot) {
    return undefined;
  }
  const candidates = [
    path.join(workspaceRoot, 'nik.yaml'),
    path.join(workspaceRoot, 'nik.yml')
  ];
  return candidates.find((f) => fs.existsSync(f));
}

export function readManifestFpcVersion(manifestPath: string): string | undefined {
  try {
    const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/);
    let inToolchain = false;
    let toolchainIndent = -1;

    for (const rawLine of lines) {
      const stripped = rawLine.replace(/#.*$/, '');
      if (stripped.trim().length === 0) {
        continue;
      }
      const curIndent = (/^(\s*)/.exec(stripped)?.[1] ?? '').length;
      if (inToolchain && curIndent <= toolchainIndent) {
        inToolchain = false;
      }
      if (/^\s*toolchain\s*:\s*$/.test(stripped) && curIndent === 2) {
        inToolchain = true;
        toolchainIndent = curIndent;
        continue;
      }
      if (inToolchain) {
        const fpcMatch = /^\s*fpc\s*:\s*["']?([0-9]+\.[0-9]+\.[0-9]+)["']?\s*$/.exec(stripped);
        if (fpcMatch) {
          return fpcMatch[1];
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function updateManifestFpcVersion(manifestPath: string, newVersion: string): boolean {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const lineEnding = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/);
    let inToolchain = false;
    let toolchainIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].replace(/#.*$/, '');
      if (stripped.trim().length === 0) {
        continue;
      }
      const curIndent = (/^(\s*)/.exec(stripped)?.[1] ?? '').length;
      if (inToolchain && curIndent <= toolchainIndent) {
        inToolchain = false;
      }
      if (/^\s*toolchain\s*:\s*$/.test(stripped) && curIndent === 2) {
        inToolchain = true;
        toolchainIndent = curIndent;
        continue;
      }
      if (inToolchain) {
        const match = /^(\s*fpc\s*:\s*)(["']?)[^#"']*?\2(\s*(?:#.*)?)$/.exec(lines[i]);
        if (match) {
          const quote = match[2] ?? '';
          lines[i] = `${match[1]}${quote}${newVersion}${quote}${match[3] ?? ''}`;
          fs.writeFileSync(manifestPath, lines.join(lineEnding), 'utf8');
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

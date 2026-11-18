import * as vscode from 'vscode';
import {
  discoverProfilesFromManifest,
  execNikJson,
  findWorkspaceManifestPath,
  formatShortCommit,
  getActiveProfile,
  getHostTargetOsCpu,
  initCliContext,
  InitProjectResponse,
  readManifestFpcVersion,
  RemoteSdkItem,
  RemoteSdkListResponse,
  resolveNikExecutable,
  SdkListResponse,
  updateManifestFpcVersion
} from './cli';
import { NikLspManager } from './lspClient';
import { NikStatusBar } from './statusBar';
import { NikTaskProvider } from './taskProvider';

let lspManager: NikLspManager | undefined;
let statusBar: NikStatusBar | undefined;

function pickHostRemoteEntry(entries: RemoteSdkItem[], version: string): RemoteSdkItem | undefined {
  const verEntries = entries.filter((s) => s.fpcVersion === version);
  const installed = verEntries.find((s) => s.installed);
  if (installed) {
    return installed;
  }
  const host = getHostTargetOsCpu();
  const exactHost = verEntries.find((s) => s.targetOs === host.os && s.targetCpu === host.cpu);
  if (exactHost) {
    return exactHost;
  }
  if (host.os === 'win64' && host.cpu === 'aarch64') {
    const winX64 = verEntries.find((s) => s.targetOs === 'win64' && s.targetCpu === 'x86_64');
    if (winX64) {
      return winX64;
    }
  }
  return verEntries[0];
}

async function promptInstallSdkFlow(nikExe: string, preselectedVersion?: string): Promise<void> {
  if (preselectedVersion) {
    const term = vscode.window.createTerminal('Nikrun SDK Installer');
    term.show();
    term.sendText(`"${nikExe}" sdk install ${preselectedVersion}`);
    return;
  }

  try {
    const remote = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Nikrun: Fetching available prebuilt Free Pascal SDKs...'
      },
      () => execNikJson<RemoteSdkListResponse>(nikExe, ['sdk', 'list', '--remote'])
    );

    const uniqueVersions = Array.from(new Set(remote.sdks.map((s) => s.fpcVersion)));
    const items: Array<vscode.QuickPickItem & { version: string; subcommand: 'install' | 'update' }> =
      uniqueVersions.map((ver) => {
        const entry = pickHostRemoteEntry(remote.sdks, ver);
        const remCommit = entry?.gitCommit ? formatShortCommit(entry.gitCommit) : '';
        if (entry?.installed && entry.updateAvailable) {
          const instCommit = formatShortCommit(entry.installedCommit);
          return {
            label: `$(sync) FPC ${ver}`,
            description: `Update available (${instCommit} -> ${remCommit || 'latest'})`,
            detail: `nik sdk update ${ver}`,
            version: ver,
            subcommand: 'update'
          };
        }
        if (entry?.installed) {
          const instCommit = formatShortCommit(entry.installedCommit ?? entry.gitCommit);
          return {
            label: `$(check) FPC ${ver}`,
            description: `Installed (${instCommit})`,
            detail: `nik sdk install ${ver}`,
            version: ver,
            subcommand: 'install'
          };
        }
        return {
          label: `$(cloud-download) FPC ${ver}`,
          description: remCommit ? `Download & Install (${remCommit})` : 'Download & Install',
          detail: `nik sdk install ${ver}`,
          version: ver,
          subcommand: 'install'
        };
      });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a prebuilt Free Pascal SDK version to install or update in ~/.nikrun'
    });
    if (!picked) {
      return;
    }

    const term = vscode.window.createTerminal('Nikrun SDK Installer');
    term.show();
    term.sendText(`"${nikExe}" sdk ${picked.subcommand} ${picked.version}`);
  } catch (err) {
    void vscode.window.showErrorMessage(`Nikrun: Failed to query remote SDK index: ${String(err)}`);
  }
}

async function runUpdateInstalledSdks(): Promise<void> {
  const nikExe = resolveNikExecutable();
  if (!nikExe) {
    const action = await vscode.window.showWarningMessage(
      'Nikrun (`nik`) executable was not found. Configure `nikrun.cliPath` or install Nikrun into `~/.nikrun/bin`.',
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'nikrun.cliPath');
    }
    return;
  }

  const term = vscode.window.createTerminal('Nikrun SDK Updater');
  term.show();
  term.sendText(`"${nikExe}" sdk update`);
}

async function initWorkspaceProject(): Promise<void> {
  const nikExe = resolveNikExecutable();
  if (!nikExe) {
    const action = await vscode.window.showWarningMessage(
      'Nikrun (`nik`) executable was not found. Configure `nikrun.cliPath` or install Nikrun into `~/.nikrun/bin`.',
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'nikrun.cliPath');
    }
    return;
  }

  const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!rootDir) {
    void vscode.window.showWarningMessage('Nikrun: Open a folder first before running `nik init`.');
    return;
  }

  const kindItems: Array<vscode.QuickPickItem & { flag: string }> = [
    {
      label: '$(terminal) Application (program)',
      description: 'Executable Free Pascal binary (`src/main.pas`)',
      flag: '--program'
    },
    {
      label: '$(SymbolLibrary) Shared Library (library)',
      description: 'Native `.dll` / `.so` / `.dylib` library',
      flag: '--lib'
    },
    {
      label: '$(package) Unit Package (package)',
      description: 'Reusable Object Pascal source unit collection',
      flag: '--pkg'
    }
  ];

  const chosenKind = await vscode.window.showQuickPick(kindItems, {
    placeHolder: 'Select project type for nik.yaml'
  });
  if (!chosenKind) {
    return;
  }

  try {
    const res = await execNikJson<InitProjectResponse>(nikExe, ['init', chosenKind.flag], rootDir);
    if (!res.success) {
      void vscode.window.showErrorMessage(`Nikrun init failed: ${res.error ?? 'Unknown error'}`);
      return;
    }

    const doc = await vscode.workspace.openTextDocument(res.manifestPath);
    await vscode.window.showTextDocument(doc);
    await statusBar?.refresh();
    await lspManager?.restart();
    void vscode.window.showInformationMessage(
      `Nikrun: Initialized ${res.kind} '${res.name}' (FPC ${res.fpcVersion}).`
    );
  } catch (err) {
    void vscode.window.showErrorMessage(`Nikrun init failed: ${String(err)}`);
  }
}

async function selectOrInstallSdk(): Promise<void> {
  const nikExe = resolveNikExecutable();
  if (!nikExe) {
    const action = await vscode.window.showWarningMessage(
      'Nikrun (`nik`) executable was not found. Configure `nikrun.cliPath` or install Nikrun into `~/.nikrun/bin`.',
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'nikrun.cliPath');
    }
    return;
  }

  const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const manifestPath = findWorkspaceManifestPath(rootDir);
  const currentFpc = manifestPath ? readManifestFpcVersion(manifestPath) : undefined;

  try {
    const local = await execNikJson<SdkListResponse>(nikExe, ['sdk', 'list']);
    const items: Array<
      vscode.QuickPickItem & { action: 'switch' | 'install' | 'installMissing' | 'updateAll'; version?: string }
    > = [];

    if (currentFpc && !local.sdks.some((s) => s.fpcVersion === currentFpc)) {
      items.push({
        label: `$(cloud-download) Install required FPC ${currentFpc}`,
        description: 'Configured in workspace nik.yaml',
        action: 'installMissing',
        version: currentFpc
      });
    }

    const seenVersions = new Set<string>();
    for (const sdk of local.sdks) {
      if (seenVersions.has(sdk.fpcVersion)) {
        continue;
      }
      seenVersions.add(sdk.fpcVersion);
      const isActive = sdk.fpcVersion === currentFpc;
      const shortSha = formatShortCommit(sdk.gitCommit);
      items.push({
        label: `${isActive ? '$(check) ' : ''}FPC ${sdk.fpcVersion}`,
        description: `${sdk.targetTriplet} · ${shortSha}${isActive ? ' (nik.yaml)' : ''}`,
        detail: sdk.installPath,
        action: 'switch',
        version: sdk.fpcVersion
      });
    }

    if (local.sdks.length > 0) {
      items.push({
        label: '$(sync) Update installed Free Pascal SDKs',
        description: 'Check remote builds and run nik sdk update',
        action: 'updateAll'
      });
    }

    items.push({
      label: '$(cloud-download) Install or browse Free Pascal SDKs...',
      description: 'Query remote prebuilt Nikrun SDKs (shows commits & updates)',
      action: 'install'
    });

    const chosen = await vscode.window.showQuickPick(items, {
      placeHolder: manifestPath
        ? 'Select Free Pascal version for nik.yaml, update, or install a new SDK'
        : 'Install or update a Free Pascal SDK in ~/.nikrun'
    });
    if (!chosen) {
      return;
    }

    if (chosen.action === 'updateAll') {
      await runUpdateInstalledSdks();
      return;
    }

    if (chosen.action === 'install') {
      await promptInstallSdkFlow(nikExe);
      return;
    }

    if (chosen.action === 'installMissing' && chosen.version) {
      await promptInstallSdkFlow(nikExe, chosen.version);
      return;
    }

    if (chosen.action === 'switch' && chosen.version) {
      if (!manifestPath) {
        await initWorkspaceProject();
        return;
      }

      if (updateManifestFpcVersion(manifestPath, chosen.version)) {
        await statusBar?.refresh();
        await lspManager?.restart();
        void vscode.window.showInformationMessage(`Nikrun: Updated nik.yaml toolchain.fpc to ${chosen.version}.`);
      } else {
        const doc = await vscode.workspace.openTextDocument(manifestPath);
        await vscode.window.showTextDocument(doc);
        void vscode.window.showWarningMessage(
          `Could not locate toolchain.fpc in nik.yaml automatically. Please set 'fpc: ${chosen.version}' under 'toolchain:'.`
        );
      }
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Nikrun SDK selection failed: ${String(err)}`);
  }
}

async function selectActiveProfile(): Promise<void> {
  const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const profiles = discoverProfilesFromManifest(rootDir);
  const current = getActiveProfile();

  const items: vscode.QuickPickItem[] = profiles.map((name) => ({
    label: name,
    description: name === current ? 'active' : undefined
  }));

  const chosen = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select active nik.yaml profile for builds and nik lsp'
  });
  if (!chosen || chosen.label === current) {
    return;
  }

  const targetScope = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await vscode.workspace.getConfiguration('nikrun').update('profile', chosen.label, targetScope);
  await statusBar?.refresh();
  await lspManager?.restart();
}

async function executeBuildTask(clean: boolean): Promise<void> {
  const provider = new NikTaskProvider();
  const profile = getActiveProfile();
  const label = clean ? `build --clean (${profile})` : `build (${profile})`;
  const task = provider.createBuildTask(label, {
    type: NikTaskProvider.NikTaskType,
    command: 'build',
    profile,
    clean
  });
  await vscode.tasks.executeTask(task);
}

async function checkInitialOnboarding(): Promise<void> {
  const nikExe = resolveNikExecutable();
  if (!nikExe) {
    return;
  }
  try {
    const local = await execNikJson<SdkListResponse>(nikExe, ['sdk', 'list']);
    if (local.sdks.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        'Nikrun: No Free Pascal SDK is installed in ~/.nikrun yet. Would you like to install one now?',
        'Install SDK'
      );
      if (choice === 'Install SDK') {
        await promptInstallSdkFlow(nikExe);
      }
    }
  } catch {
    // Ignore silent background onboarding check failure
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  initCliContext(context);
  lspManager = new NikLspManager();
  statusBar = new NikStatusBar();
  const taskProvider = new NikTaskProvider();

  context.subscriptions.push(
    lspManager,
    statusBar,
    vscode.tasks.registerTaskProvider(NikTaskProvider.NikTaskType, taskProvider),
    vscode.commands.registerCommand('nikrun.initProject', initWorkspaceProject),
    vscode.commands.registerCommand('nikrun.restartLanguageServer', async () => {
      await statusBar?.refresh();
      const ok = await lspManager?.restart();
      if (ok) {
        void vscode.window.showInformationMessage('Nikrun: Language Server restarted.');
      }
    }),
    vscode.commands.registerCommand('nikrun.selectSdk', selectOrInstallSdk),
    vscode.commands.registerCommand('nikrun.updateSdks', runUpdateInstalledSdks),
    vscode.commands.registerCommand('nikrun.selectProfile', selectActiveProfile),
    vscode.commands.registerCommand('nikrun.buildProject', () => executeBuildTask(false)),
    vscode.commands.registerCommand('nikrun.cleanBuildProject', () => executeBuildTask(true)),
    vscode.commands.registerCommand('nikrun.showOutput', () => lspManager?.showOutput())
  );

  // Refresh status bar on nik.yaml edits; restart LSP if nik.yaml is created/deleted externally
  const manifestWatcher = vscode.workspace.createFileSystemWatcher('**/nik.{yaml,yml}');
  manifestWatcher.onDidChange(() => void statusBar?.refresh(), null, context.subscriptions);
  const restartOnCreateOrDelete = async (): Promise<void> => {
    await statusBar?.refresh();
    if (lspManager?.isRunning) {
      await lspManager.restart();
    } else {
      await lspManager?.start();
    }
  };
  manifestWatcher.onDidCreate(restartOnCreateOrDelete, null, context.subscriptions);
  manifestWatcher.onDidDelete(restartOnCreateOrDelete, null, context.subscriptions);
  context.subscriptions.push(manifestWatcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('nikrun')) {
        await statusBar?.refresh();
        await lspManager?.restart();
      }
    })
  );

  await statusBar.refresh();
  await lspManager.start();
  void checkInitialOnboarding();
}

export async function deactivate(): Promise<void> {
  await lspManager?.stop();
}

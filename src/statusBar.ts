import * as vscode from 'vscode';
import {
  execNikJson,
  findWorkspaceManifestPath,
  formatShortCommit,
  getActiveProfile,
  readManifestFpcVersion,
  resolveNikExecutable,
  SdkListResponse
} from './cli';

export class NikStatusBar implements vscode.Disposable {
  private readonly sdkItem: vscode.StatusBarItem;
  private readonly profileItem: vscode.StatusBarItem;

  constructor() {
    this.sdkItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.sdkItem.command = 'nikrun.selectSdk';
    this.sdkItem.tooltip = 'Nikrun: Click to select project FPC version or install an SDK';

    this.profileItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.profileItem.command = 'nikrun.selectProfile';
    this.profileItem.tooltip = 'Nikrun: Click to switch the active nik.yaml build & LSP profile';
  }

  public async refresh(): Promise<void> {
    const nikExe = resolveNikExecutable();
    const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const manifestPath = findWorkspaceManifestPath(rootDir);

    if (!nikExe) {
      this.sdkItem.command = 'nikrun.selectSdk';
      this.sdkItem.text = '$(warning) Nikrun: CLI not found';
      this.sdkItem.tooltip = 'Configure nikrun.cliPath or install nik into ~/.nikrun/bin';
      this.sdkItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.sdkItem.show();
      this.profileItem.hide();
      return;
    }

    if (!manifestPath) {
      this.sdkItem.command = 'nikrun.initProject';
      this.sdkItem.text = '$(nikrun) Nikrun: Init Project';
      this.sdkItem.tooltip = 'No nik.yaml found in workspace. Click to initialize a Nikrun project (nik init).';
      this.sdkItem.backgroundColor = undefined;
      this.sdkItem.show();
      this.profileItem.hide();
      return;
    }

    const profile = getActiveProfile();
    this.profileItem.text = `$(nikrun) nik: ${profile}`;
    this.profileItem.show();

    this.sdkItem.command = 'nikrun.selectSdk';
    const configuredFpc = readManifestFpcVersion(manifestPath);

    try {
      const sdkList = await execNikJson<SdkListResponse>(nikExe, ['sdk', 'list']);

      if (!configuredFpc) {
        this.sdkItem.text = '$(warning) FPC: Missing toolchain.fpc';
        this.sdkItem.tooltip = 'Set toolchain.fpc in nik.yaml (or click to select an installed SDK version).';
        this.sdkItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        const match = sdkList.sdks.find((s) => s.fpcVersion === configuredFpc);
        if (match) {
          this.sdkItem.text = `$(package) FPC ${match.fpcVersion}`;
          this.sdkItem.tooltip = `Project FPC SDK (nik.yaml): ${match.sdkId}\nTarget: ${match.targetTriplet}\nCommit: ${formatShortCommit(match.gitCommit)}\nClick to change version, update, or install another SDK`;
          this.sdkItem.backgroundColor = undefined;
        } else {
          this.sdkItem.text = `$(cloud-download) FPC ${configuredFpc} (Install)`;
          this.sdkItem.tooltip = `nik.yaml requires FPC ${configuredFpc}, which is not installed yet.\nClick to install FPC ${configuredFpc}.`;
          this.sdkItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
      }
      this.sdkItem.show();
    } catch {
      this.sdkItem.text = '$(error) FPC: SDK check failed';
      this.sdkItem.backgroundColor = undefined;
      this.sdkItem.show();
    }
  }

  public dispose(): void {
    this.sdkItem.dispose();
    this.profileItem.dispose();
  }
}

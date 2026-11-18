import * as vscode from 'vscode';
import {
  CloseAction,
  ErrorAction,
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State
} from 'vscode-languageclient/node';
import {
  buildGlobalNikArgs,
  getActiveProfile,
  resolveNikExecutable,
  verifyNikSupportsLsp
} from './cli';
import { Version } from './version';

export class NikLspManager implements vscode.Disposable {
  private client: LanguageClient | undefined;
  private syncWatcher: vscode.FileSystemWatcher | undefined;
  private lifecycleChain: Promise<void> = Promise.resolve();
  private readonly outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Nikrun Language Server');
    this.outputChannel.appendLine(`[Nikrun] Extension vscode-nikrun ${Version} loaded.`);
  }

  public get isRunning(): boolean {
    return this.client !== undefined && this.client.state === State.Running;
  }

  public showOutput(): void {
    this.outputChannel.show(true);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.lifecycleChain.then(operation, operation);
    this.lifecycleChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  public start(): Promise<boolean> {
    return this.enqueue(() => this.startInternal());
  }

  public stop(): Promise<void> {
    return this.enqueue(() => this.stopInternal());
  }

  public restart(): Promise<boolean> {
    return this.enqueue(async () => {
      await this.stopInternal();
      return this.startInternal();
    });
  }

  private async startInternal(): Promise<boolean> {
    const cfg = vscode.workspace.getConfiguration('nikrun');
    if (!cfg.get<boolean>('lsp.enabled', true)) {
      await this.stopInternal();
      return false;
    }

    const nikExe = resolveNikExecutable();
    if (!nikExe) {
      this.outputChannel.appendLine(
        '[vscode-nikrun] Could not locate `nik` executable. Configure `nikrun.cliPath` or install Nikrun into `~/.nikrun/bin`.'
      );
      return false;
    }

    // Pre-flight check: verify that the resolved `nik` binary actually supports `nik lsp`
    // before handing it to vscode-languageclient (avoids EPIPE crash loops on older binaries).
    const preflight = await verifyNikSupportsLsp(nikExe);
    if (!preflight.supported) {
      this.outputChannel.appendLine(
        `[vscode-nikrun] Pre-flight check failed for '${nikExe} lsp --help':\n${preflight.detail}`
      );
      const choice = await vscode.window.showWarningMessage(
        `Nikrun: The resolved CLI binary (${nikExe}) does not support 'nik lsp' (likely an older build). Update ~/.nikrun/bin/nik or configure 'nikrun.cliPath'.`,
        'Configure cliPath',
        'Show Output'
      );
      if (choice === 'Configure cliPath') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'nikrun.cliPath');
      } else if (choice === 'Show Output') {
        this.showOutput();
      }
      return false;
    }

    await this.stopInternal();

    const profile = getActiveProfile();
    const lspSubArgs: string[] = ['lsp', '--stdio', '--profile', profile];

    const logFile = (cfg.get<string>('lsp.logFile') ?? '').trim();
    if (logFile.length > 0) {
      lspSubArgs.push('--log-file', logFile);
    }

    const args = buildGlobalNikArgs(lspSubArgs);
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const runExecutable: Executable = {
      command: nikExe,
      args,
      options: cwd ? { cwd } : undefined
    };

    const serverOptions: ServerOptions = {
      run: runExecutable,
      debug: runExecutable
    };

    let consecutiveCrashes = 0;
    this.syncWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{yaml,yml,lock,pas,pp,dpr,lpr,inc}'
    );

    const clientOptions: LanguageClientOptions = {
      documentSelector: [
        { scheme: 'file', language: 'objectpascal' },
        { scheme: 'untitled', language: 'objectpascal' },
        { scheme: 'file', language: 'pascal' },
        { scheme: 'untitled', language: 'pascal' },
        { scheme: 'file', pattern: '**/nik.yaml' },
        { scheme: 'file', pattern: '**/nik.yml' }
      ],
      outputChannel: this.outputChannel,
      synchronize: {
        fileEvents: this.syncWatcher
      },
      errorHandler: {
        error: () => ({ action: ErrorAction.Continue }),
        closed: () => {
          consecutiveCrashes += 1;
          if (consecutiveCrashes <= 2) {
            return { action: CloseAction.Restart };
          }
          return {
            action: CloseAction.DoNotRestart,
            message: 'Nikrun Language Server stopped unexpectedly. Check the Nikrun Language Server output channel for details.'
          };
        }
      }
    };

    this.outputChannel.appendLine(`[vscode-nikrun] Starting: ${nikExe} ${args.join(' ')}`);
    const nextClient = new LanguageClient(
      'nikrunLsp',
      'Nikrun Free Pascal Language Server',
      serverOptions,
      clientOptions
    );

    try {
      await nextClient.start();
      this.client = nextClient;
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`[vscode-nikrun] Failed to start language server: ${String(err)}`);
      return false;
    }
  }

  private async stopInternal(): Promise<void> {
    const current = this.client;
    this.client = undefined;
    const watcher = this.syncWatcher;
    this.syncWatcher = undefined;
    try {
      if (current && current.needsStop()) {
        await current.stop();
      }
    } catch (err) {
      this.outputChannel.appendLine(`[vscode-nikrun] Ignored error while stopping client: ${String(err)}`);
    } finally {
      watcher?.dispose();
    }
  }

  public dispose(): void {
    void this.stop();
    this.outputChannel.dispose();
  }
}

import * as vscode from 'vscode';
import { buildGlobalNikArgs, getActiveProfile, resolveNikExecutable } from './cli';

interface NikTaskDefinition extends vscode.TaskDefinition {
  command: 'build';
  profile?: string;
  clean?: boolean;
  manifest?: string;
}

export class NikTaskProvider implements vscode.TaskProvider {
  public static readonly NikTaskType = 'nik';

  public provideTasks(): vscode.ProviderResult<vscode.Task[]> {
    const activeProfile = getActiveProfile();
    const tasks: vscode.Task[] = [
      this.createBuildTask(`build (${activeProfile})`, {
        type: NikTaskProvider.NikTaskType,
        command: 'build',
        profile: activeProfile
      }),
      this.createBuildTask('build (release)', {
        type: NikTaskProvider.NikTaskType,
        command: 'build',
        profile: 'release'
      }),
      this.createBuildTask(`build --clean (${activeProfile})`, {
        type: NikTaskProvider.NikTaskType,
        command: 'build',
        profile: activeProfile,
        clean: true
      })
    ];
    return tasks;
  }

  public resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
    const def = task.definition as NikTaskDefinition;
    if (def.command === 'build') {
      const label = def.clean
        ? `build --clean (${def.profile ?? getActiveProfile()})`
        : `build (${def.profile ?? getActiveProfile()})`;
      return this.createBuildTask(label, def, task.scope);
    }
    return undefined;
  }

  public createBuildTask(
    label: string,
    definition: NikTaskDefinition,
    scope: vscode.WorkspaceFolder | vscode.TaskScope = vscode.TaskScope.Workspace
  ): vscode.Task {
    const nikExe = resolveNikExecutable() ?? 'nik';
    const subArgs: string[] = ['build'];

    const profile = (definition.profile ?? getActiveProfile()).trim();
    if (profile.length > 0) {
      subArgs.push('--profile', profile);
    }
    if (definition.clean) {
      subArgs.push('--clean');
    }
    if (definition.manifest && definition.manifest.trim().length > 0) {
      subArgs.push('--manifest', definition.manifest.trim());
    }

    const cwd =
      typeof scope === 'object' && 'uri' in scope
        ? scope.uri.fsPath
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const execution = new vscode.ProcessExecution(
      nikExe,
      buildGlobalNikArgs(subArgs),
      cwd ? { cwd } : undefined
    );

    // Delegate Problems-panel diagnostics exclusively to `nik lsp` when enabled (avoids
    // duplicate entries and sticky build-task errors after editing); fall back to task
    // problemMatchers only when the user explicitly disabled `nik lsp`.
    const lspEnabled = vscode.workspace
      .getConfiguration('nikrun')
      .get<boolean>('lsp.enabled', true);
    const problemMatchers = lspEnabled ? [] : ['$nik-fpc', '$nik-manifest'];

    const task = new vscode.Task(
      definition,
      scope,
      label,
      'nik',
      execution,
      problemMatchers
    );
    task.group = vscode.TaskGroup.Build;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Shared,
      clear: true
    };
    return task;
  }
}

import * as vscode from 'vscode';
import * as path from 'path';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';

// Aliases
const fsReaddir = fs.readdir;
const fsMkdir = fs.mkdir;
const fsAccess = fs.access;
const fsCopyFile = fs.copyFile;

// ---------------- Arduino Project Manager (Sidebar) ----------------
export function activate(context: vscode.ExtensionContext) {
  const provider = new ArduinoProjectManagerProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('arduinoExplorerView', provider)
  );

  vscode.commands.registerCommand('embeddedCopilot.createNewProject', async () => {
    const folder = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      openLabel: 'Select Folder for New Project',
    });
    if (!folder || folder.length === 0) return;

    const folderPath = folder[0].fsPath;
    const name = await vscode.window.showInputBox({ prompt: 'Enter project name' });
    if (!name) return;

    const projectPath = path.join(folderPath, name);
    await fsMkdir(projectPath, { recursive: true });

    const inoPath = path.join(projectPath, `${name}.ino`);
    await fs.writeFile(
      inoPath,
      `void setup() {\n  // setup code\n}\n\nvoid loop() {\n  // main loop\n}`
    );

    vscode.window.showInformationMessage(`Created new Arduino project: ${name}`);
    provider.refresh();
  });

  initializeEmbeddedCopilot(context, provider);
}

// ---------------- Embedded Copilot Main Logic ----------------
async function initializeEmbeddedCopilot(
  context: vscode.ExtensionContext,
  provider: ArduinoProjectManagerProvider
) {
  let backendMode: 'openai' | 'ollama' = process.env.OPENAI_API_KEY ? 'openai' : 'ollama';

  console.log('Embedded Copilot extension activated');

  async function trackEvent(event: string, data: Record<string, any> = {}) {
    try {
      await fetch('https://embedded-copilot-stats.vercel.app/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          version:
            vscode.extensions.getExtension('yourpublisher.embedded-copilot-ext')?.packageJSON.version,
          data,
        }),
      });
    } catch (err) {
      console.warn('Telemetry failed:', err);
    }
  }

  await trackEvent('activate');

  vscode.window.showInformationMessage(
    backendMode === 'openai'
      ? 'Embedded Copilot running in Online (OpenAI) mode'
      : 'Embedded Copilot running in Offline (Ollama) mode'
  );

  // Feedback Command
  context.subscriptions.push(
    vscode.commands.registerCommand('embeddedCopilot.feedback', async () => {
      const feedback = await vscode.window.showInputBox({
        prompt: 'Please share your feedback or feature request',
      });
      if (feedback) {
        await trackEvent('feedback', { feedback });
        vscode.window.showInformationMessage('Thank you for your feedback!');
      }
    })
  );

  // Switch Backend Command
  context.subscriptions.push(
    vscode.commands.registerCommand('embeddedCopilot.switchBackend', async () => {
      const newMode = await vscode.window.showQuickPick(['openai', 'ollama'], {
        placeHolder: 'Select backend mode',
      });
      if (newMode) {
        backendMode = newMode as 'openai' | 'ollama';
        vscode.window.showInformationMessage(
          backendMode === 'openai'
            ? 'Switched to Online (OpenAI) mode'
            : 'Switched to Offline (Ollama) mode'
        );
      }
    })
  );

  // Ask Command
  context.subscriptions.push(
    vscode.commands.registerCommand('embeddedCopilot.ask', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showErrorMessage('Open a file to use Embedded Copilot');

      const selection = editor.document.getText(editor.selection) || '';
      const filePreview = editor.document.getText(
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(200, 0))
      );

      const mode =
        (await vscode.window.showQuickPick(['completion', 'explain', 'comment2code', 'qa'], {
          placeHolder: 'Select mode',
        })) || 'completion';

      const question = await vscode.window.showInputBox({
        prompt: 'Describe the request (e.g., "Finish function", "Explain bug", "Write code from comment")',
      });
      if (question === undefined) return;

      let completion = '';
      try {
        if (backendMode === 'openai') {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            vscode.window.showErrorMessage('Missing OpenAI API key. Set it with: setx OPENAI_API_KEY "your_key_here"');
            return;
          }

          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Embedded Copilot (OpenAI)...' },
            async () => {
              const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  messages: [
                    { role: 'system', content: 'You are Embedded Copilot, an AI assistant for embedded systems.' },
                    {
                      role: 'user',
                      content: `Mode: ${mode}\nQuestion: ${question}\nSelection:\n${selection}\nFile:\n${filePreview}`,
                    },
                  ],
                }),
              });

              const data: any = await resp.json();
              completion = data.choices?.[0]?.message?.content || 'No response.';
              const out = vscode.window.createOutputChannel('Embedded Copilot');
              out.show(true);
              out.appendLine(completion);

              const replace = await vscode.window.showQuickPick(['No', 'Replace selection with completion'], {
                placeHolder: 'Insert completion into file?',
              });
              if (replace === 'Replace selection with completion') {
                editor.edit((editBuilder) => {
                  if (editor.selection.isEmpty) {
                    editBuilder.insert(editor.selection.active, '\n' + completion + '\n');
                  } else {
                    editBuilder.replace(editor.selection, completion);
                  }
                });
              }
            }
          );
        } else {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Embedded Copilot (Ollama)...' },
            async () => {
              const resp = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'mistral',
                  prompt: `Mode: ${mode}\nQuestion: ${question}\nSelection:\n${selection}\nFile:\n${filePreview}`,
                }),
              });
              const text = await resp.text();
              completion = text.trim();
              const out = vscode.window.createOutputChannel('Embedded Copilot');
              out.show(true);
              out.appendLine(completion);
            }
          );
        }
        await trackEvent('ask_used', { mode, questionLength: question?.length });
      } catch (err: any) {
        vscode.window.showErrorMessage('Error: ' + err.message);
      }
    })
  );
}

// ---------------- Arduino Project Manager Provider ----------------
class ArduinoProjectManagerProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private _contextUri: vscode.Uri;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._contextUri = _extensionUri;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._contextUri] };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'openProject') {
        const uri = vscode.Uri.file(msg.path);
        vscode.commands.executeCommand('vscode.openFolder', uri, true);
      }
    });
  }

  public refresh() {
    this.view?.webview.postMessage({ command: 'refresh' });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._contextUri, 'media', 'projectManager.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._contextUri, 'media', 'style.css'));

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="${styleUri}">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Arduino Project Manager</title>
      </head>
      <body>
        <div id="container">
          <h2>Arduino Projects</h2>
          <button id="createBtn">+ New Project</button>
          <ul id="projectList"></ul>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {}

import * as vscode from 'vscode';
import fetch from 'node-fetch';

let backendMode: 'openai' | 'ollama' = process.env.OPENAI_API_KEY ? 'openai' : 'ollama';

export function activate(context: vscode.ExtensionContext) {
  console.log('Embedded Copilot extension activated');

  vscode.window.showInformationMessage(
    backendMode === 'openai'
      ? 'Embedded Copilot running in Online (OpenAI) mode'
      : 'Embedded Copilot running in Offline (Ollama) mode'
  );

  // Command: switch backend manually
  const switchBackend = vscode.commands.registerCommand('embeddedCopilot.switchBackend', async () => {
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
  });

  // Main AI interaction
  const askCommand = vscode.commands.registerCommand('embeddedCopilot.ask', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showErrorMessage('Open a file to use Embedded Copilot');

    const selection = editor.document.getText(editor.selection) || '';
    const filePreview = editor.document.getText(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.min(200, editor.document.lineCount), 0))
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
          vscode.window.showErrorMessage('Missing OpenAI API key. Set it using: setx OPENAI_API_KEY "your_key_here"');
          return;
        }

        vscode.window.withProgress(
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
            out.appendLine('--- Embedded Copilot (OpenAI) ---');
            out.appendLine(completion);

            const replace = await vscode.window.showQuickPick(['No', 'Replace selection with completion'], {
              placeHolder: 'Insert completion into file?',
            });
            if (replace === 'Replace selection with completion') {
              editor.edit(editBuilder => {
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
        vscode.window.withProgress(
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
            out.appendLine('--- Embedded Copilot (Ollama) ---');
            out.appendLine(completion);
          }
        );
      }
    } catch (err: any) {
      vscode.window.showErrorMessage('Error: ' + err.message);
    }
  });

  context.subscriptions.push(askCommand, switchBackend);
}

export function deactivate() {}

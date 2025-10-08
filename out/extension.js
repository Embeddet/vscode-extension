"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_fetch_1 = __importDefault(require("node-fetch"));
let backendMode = process.env.OPENAI_API_KEY ? 'openai' : 'ollama';
function activate(context) {
    console.log('Embedded Copilot extension activated');
    vscode.window.showInformationMessage(backendMode === 'openai'
        ? 'Embedded Copilot running in Online (OpenAI) mode'
        : 'Embedded Copilot running in Offline (Ollama) mode');
    // Command: switch backend manually
    const switchBackend = vscode.commands.registerCommand('embeddedCopilot.switchBackend', async () => {
        const newMode = await vscode.window.showQuickPick(['openai', 'ollama'], {
            placeHolder: 'Select backend mode',
        });
        if (newMode) {
            backendMode = newMode;
            vscode.window.showInformationMessage(backendMode === 'openai'
                ? 'Switched to Online (OpenAI) mode'
                : 'Switched to Offline (Ollama) mode');
        }
    });
    // Main AI interaction
    const askCommand = vscode.commands.registerCommand('embeddedCopilot.ask', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return vscode.window.showErrorMessage('Open a file to use Embedded Copilot');
        const selection = editor.document.getText(editor.selection) || '';
        const filePreview = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.min(200, editor.document.lineCount), 0)));
        const mode = (await vscode.window.showQuickPick(['completion', 'explain', 'comment2code', 'qa'], {
            placeHolder: 'Select mode',
        })) || 'completion';
        const question = await vscode.window.showInputBox({
            prompt: 'Describe the request (e.g., "Finish function", "Explain bug", "Write code from comment")',
        });
        if (question === undefined)
            return;
        let completion = '';
        try {
            if (backendMode === 'openai') {
                const apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey) {
                    vscode.window.showErrorMessage('Missing OpenAI API key. Set it using: setx OPENAI_API_KEY "your_key_here"');
                    return;
                }
                vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Embedded Copilot (OpenAI)...' }, async () => {
                    const resp = await (0, node_fetch_1.default)('https://api.openai.com/v1/chat/completions', {
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
                    const data = await resp.json();
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
                            }
                            else {
                                editBuilder.replace(editor.selection, completion);
                            }
                        });
                    }
                });
            }
            else {
                vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Embedded Copilot (Ollama)...' }, async () => {
                    const resp = await (0, node_fetch_1.default)('http://localhost:11434/api/generate', {
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
                });
            }
        }
        catch (err) {
            vscode.window.showErrorMessage('Error: ' + err.message);
        }
    });
    context.subscriptions.push(askCommand, switchBackend);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
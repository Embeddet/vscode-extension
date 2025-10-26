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
const path = __importStar(require("path"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const fs_1 = require("fs");
// Aliases for readability
const fsReaddir = fs_1.promises.readdir;
const fsMkdir = fs_1.promises.mkdir;
const fsAccess = fs_1.promises.access;
const fsCopyFile = fs_1.promises.copyFile;
let backendMode = process.env.OPENAI_API_KEY ? 'openai' : 'ollama';
// -------------------- Activation --------------------
async function activate(context) {
    console.log('Embedded Copilot extension activated');
    // Lightweight telemetry
    async function trackEvent(event, data = {}) {
        try {
            await (0, node_fetch_1.default)('https://embedded-copilot-stats.vercel.app/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event,
                    timestamp: new Date().toISOString(),
                    version: vscode.extensions.getExtension('yourpublisher.embedded-copilot-ext')?.packageJSON.version,
                    data,
                }),
            });
        }
        catch (err) {
            console.warn('Telemetry failed:', err);
        }
    }
    await trackEvent('activate');
    vscode.window.showInformationMessage(backendMode === 'openai'
        ? 'Embedded Copilot running in Online (OpenAI) mode'
        : 'Embedded Copilot running in Offline (Ollama) mode');
    // -------------------- Feedback Command --------------------
    const feedbackCmd = vscode.commands.registerCommand('embeddedCopilot.feedback', async () => {
        const feedback = await vscode.window.showInputBox({
            prompt: 'Please share your feedback or feature request',
        });
        if (feedback) {
            await trackEvent('feedback', { feedback });
            vscode.window.showInformationMessage('Thank you for your feedback!');
        }
    });
    context.subscriptions.push(feedbackCmd);
    // -------------------- Switch Backend --------------------
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
    context.subscriptions.push(switchBackend);
    // -------------------- Ask Command --------------------
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
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Embedded Copilot (OpenAI)...' }, async () => {
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
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Embedded Copilot (Ollama)...' }, async () => {
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
            await trackEvent('ask_used', { mode, questionLength: question?.length });
        }
        catch (err) {
            vscode.window.showErrorMessage('Error: ' + err.message);
        }
    });
    context.subscriptions.push(askCommand);
    // -------------------- Arduino Sketch Browser --------------------
    const arduinoBrowser = vscode.commands.registerCommand('embeddedCopilot.openArduinoSketch', async () => {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            openLabel: 'Select Arduino Sketch Folder',
        });
        if (!folderUri || folderUri.length === 0)
            return;
        const folderPath = folderUri[0].fsPath;
        const sketches = await findArduinoSketchesInFolder(folderPath);
        if (sketches.length === 0) {
            vscode.window.showWarningMessage('No Arduino sketches (.ino) found.');
            return;
        }
        const picked = await vscode.window.showQuickPick(sketches.map(s => s.displayName), {
            placeHolder: 'Select a sketch to open',
        });
        const selected = sketches.find(s => s.displayName === picked);
        if (selected) {
            const doc = await vscode.workspace.openTextDocument(selected.mainFile);
            await vscode.window.showTextDocument(doc);
        }
    });
    context.subscriptions.push(arduinoBrowser);
    // -------------------- Arduino Project Manager Sidebar --------------------
    const provider = new ArduinoProjectManagerProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('arduinoExplorerView', provider));
    vscode.commands.registerCommand('embeddedCopilot.createNewProject', async () => {
        const folder = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            openLabel: 'Select Folder for New Project'
        });
        if (!folder || folder.length === 0)
            return;
        const folderPath = folder[0].fsPath;
        const name = await vscode.window.showInputBox({ prompt: 'Enter project name' });
        if (!name)
            return;
        const projectPath = path.join(folderPath, name);
        await fsMkdir(projectPath);
        const inoPath = path.join(projectPath, `${name}.ino`);
        await fs_1.promises.writeFile(inoPath, `void setup() {\n  // setup code\n}\n\nvoid loop() {\n  // main loop\n}`);
        vscode.window.showInformationMessage(`Created new Arduino project: ${name}`);
        provider.refresh();
    });
}
// -------------------- WebView Provider --------------------
class ArduinoProjectManagerProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        this._contextUri = _extensionUri;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._contextUri]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'openProject') {
                const uri = vscode.Uri.file(msg.path);
                vscode.commands.executeCommand('vscode.openFolder', uri, true);
            }
        });
    }
    refresh() {
        this.view?.webview.postMessage({ command: 'refresh' });
    }
    getHtml(webview) {
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
// -------------------- Helper Functions --------------------
async function findArduinoSketchesInFolder(folderPath) {
    const items = [];
    try {
        const entries = await fsReaddir(folderPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const dir = path.join(folderPath, entry.name);
                const dirFiles = await fsReaddir(dir);
                const inoFiles = dirFiles.filter(f => f.endsWith('.ino'));
                if (inoFiles.length > 0) {
                    const mainFile = path.join(dir, inoFiles[0]);
                    items.push({ displayName: entry.name, mainFile });
                }
            }
            else if (entry.name.endsWith('.ino')) {
                items.push({ displayName: entry.name, mainFile: path.join(folderPath, entry.name) });
            }
        }
    }
    catch (err) {
        console.warn('Error scanning sketches:', err);
    }
    return items;
}
async function copyFolderRecursive(src, dest, overwrite = false) {
    await fsMkdir(dest, { recursive: true });
    const entries = await fsReaddir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyFolderRecursive(srcPath, destPath, overwrite);
        }
        else {
            if (!overwrite) {
                try {
                    await fsAccess(destPath);
                    continue;
                }
                catch {
                    // File doesn’t exist
                }
            }
            await fsCopyFile(srcPath, destPath);
        }
    }
}
function isProUser() {
    return vscode.workspace.getConfiguration('embeddedCopilot').get('licenseKey') === 'PRO_USER';
}
function proFeatureCheck(feature) {
    if (!isProUser()) {
        vscode.window.showWarningMessage(`"${feature}" is a Pro feature. Coming soon!`);
        return false;
    }
    return true;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
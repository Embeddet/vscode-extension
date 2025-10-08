# VS Code Extension (Embedded Copilot MVP v3)

Open the folder in VS Code and run `npm install` (to install dev deps), then `npm run compile`.

Press F5 to open Extension Development Host. Use Command Palette -> "Embedded Copilot: Ask".

To configure backend URL, add to workspace settings:

```json
"embeddedCopilot.backendUrl": "http://localhost:3000/api/complete"
```

const vscode = acquireVsCodeApi();

window.addEventListener('message', (event) => {
  const { command } = event.data;
  if (command === 'refresh') {
    loadProjects();
  }
});

document.getElementById('createBtn').addEventListener('click', () => {
  vscode.postMessage({ command: 'createNewProject' });
});

function loadProjects() {
  const list = document.getElementById('projectList');
  list.innerHTML = '<li>Scanning...</li>';
  vscode.postMessage({ command: 'getProjects' });
}

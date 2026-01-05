const gatewayDefaults = {
  url: window.XTERM_GATEWAY || localStorage.getItem('gateway') || window.location.origin,
  path: window.XTERM_SOCKET_PATH || localStorage.getItem('socketPath') || '/socket.io'
};
let socket;
const socket = io();
const sessions = new Map();
let activeSessionId = null;
let autoReconnect = true;
let lastActivity = null;
let globalLog = '';

const theme = {
  dark: {
    background: '#0a0a0f',
    foreground: '#f2f2f2',
    cursor: '#c41e3a',
    red: '#c41e3a'
  },
  alt: {
    background: '#0b0b10',
    foreground: '#d1d1d1',
    cursor: '#f54768',
    red: '#f54768'
  }
};
let currentTheme = 'dark';

const elements = {
  statusIndicator: document.getElementById('status-indicator'),
  statusText: document.getElementById('status-text'),
  connectBtn: document.getElementById('connect-btn'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  newTab: document.getElementById('new-tab'),
  tabBar: document.getElementById('tab-bar'),
  terminalArea: document.getElementById('terminal-area'),
  gateway: document.getElementById('gateway'),
  socketPath: document.getElementById('socketPath'),
  wrapToggle: document.getElementById('wrap-toggle'),
  cursorToggle: document.getElementById('cursor-toggle'),
  bellToggle: document.getElementById('bell-toggle'),
  copyBtn: document.getElementById('copy-selection'),
  pasteBtn: document.getElementById('paste-clipboard'),
  clearBtn: document.getElementById('clear-terminal'),
  searchBtn: document.getElementById('search-terminal'),
  fullscreenBtn: document.getElementById('fullscreen'),
  fontPlus: document.getElementById('font-plus'),
  fontMinus: document.getElementById('font-minus'),
  downloadLog: document.getElementById('download-log'),
  clearLog: document.getElementById('clear-log'),
  notifications: document.getElementById('notifications'),
  tabCount: document.getElementById('tab-count'),
  lastActivity: document.getElementById('last-activity'),
  transferStatus: document.getElementById('transfer-status'),
  sftpDir: document.getElementById('sftp-dir'),
  sftpList: document.getElementById('sftp-list'),
  sftpProgress: document.getElementById('sftp-progress'),
  previewPane: document.getElementById('preview-pane'),
  toggleTheme: document.getElementById('toggle-theme'),
  profiles: document.getElementById('profiles'),
  deleteProfile: document.getElementById('delete-profile'),
  loadProfile: document.getElementById('load-profile'),
  saveProfile: document.getElementById('save-profile'),
};


// seed gateway inputs for static hosting (e.g., GitHub Pages)
document.getElementById('gateway').value = gatewayDefaults.url;
document.getElementById('socketPath').value = gatewayDefaults.path;


function setStatus(state, text) {
  elements.statusIndicator.className = `status status-${state}`;
  elements.statusText.textContent = text;
}

function addNotification(message) {
  const div = document.createElement('div');
  div.className = 'notification';
  div.textContent = message;
  elements.notifications.prepend(div);
  setTimeout(() => div.remove(), 8000);
}

function updateMetrics() {
  elements.tabCount.textContent = sessions.size;
  elements.lastActivity.textContent = lastActivity ? new Date(lastActivity).toLocaleTimeString() : 'never';
}


function resolveGateway() {
  const url = (elements.gateway.value || gatewayDefaults.url || window.location.origin).trim();
  const path = (elements.socketPath.value || gatewayDefaults.path || '/socket.io').trim() || '/socket.io';
  localStorage.setItem('gateway', url);
  localStorage.setItem('socketPath', path);
  return { url, path };
}

function initSocket() {
  const { url, path } = resolveGateway();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = io(url, { path, transports: ['websocket'] });
  bindSocketEvents(socket);
  addNotification(`Gateway set to ${url}${path}`);
}


function createTerminal(sessionId) {
  const term = new Terminal({
    convertEol: true,
    disableStdin: false,
    fontFamily: 'Fira Code, monospace',
    fontSize: 14,
    cursorBlink: elements.cursorToggle.checked,
    bellStyle: elements.bellToggle.checked ? 'sound' : 'none',
    theme: theme[currentTheme],
    scrollback: 5000,
    allowProposedApi: true,
    wordSeparator: ' '
  });
  const fitAddon = new FitAddon.FitAddon();
  const searchAddon = new SearchAddon.SearchAddon();
  const linkAddon = new WebLinksAddon.WebLinksAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(linkAddon);
  term.open(elements.terminalArea);
  term.setOption('wrapAround', elements.wrapToggle.checked);
  fitAddon.fit();

  term.onData((data) => {
    socket.emit('input', { sessionId, data });
    lastActivity = Date.now();
    updateMetrics();
  });

  term.onResize(({ cols, rows }) => socket.emit('resize', { sessionId, cols, rows }));

  sessions.set(sessionId, { term, fitAddon, searchAddon, linkAddon, log: '' });
  switchTab(sessionId);
}

function switchTab(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  activeSessionId = sessionId;
  sessions.forEach(({ term }, id) => {
    term.element.style.display = id === sessionId ? 'block' : 'none';
  });
  Array.from(document.querySelectorAll('.tab-button')).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.session === sessionId);
  });
  updateMetrics();
}

function createSessionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addTab(title = 'shell') {
  const sessionId = createSessionId();
  const button = document.createElement('button');
  button.className = 'tab-button active';
  button.dataset.session = sessionId;
  button.innerHTML = `${title} <span data-close="${sessionId}">×</span>`;
  elements.tabBar.insertBefore(button, elements.newTab);
  Array.from(document.querySelectorAll('.tab-button')).forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  button.addEventListener('click', (e) => {
    if (e.target.dataset.close === sessionId) {
      closeTab(sessionId);
    } else {
      switchTab(sessionId);
    }
  });
  socket.emit('open_session', { sessionId, cols: 120, rows: 32 });
  createTerminal(sessionId);
}

function closeTab(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.term.dispose();
    sessions.delete(sessionId);
    socket.emit('input', { sessionId, data: '\u0003exit\n' });
  }
  const btn = document.querySelector(`.tab-button[data-session="${sessionId}"]`);
  if (btn) btn.remove();
  if (activeSessionId === sessionId) {
    const next = sessions.keys().next();
    if (!next.done) switchTab(next.value);
    else activeSessionId = null;
  }
  updateMetrics();
}

function loadProfiles() {
  const profiles = JSON.parse(localStorage.getItem('profiles') || '[]');
  elements.profiles.innerHTML = '';
  profiles.forEach((p, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${p.username}@${p.host}:${p.port}`;
    elements.profiles.appendChild(opt);
  });
}

function saveProfile() {
  const profiles = JSON.parse(localStorage.getItem('profiles') || '[]');
  profiles.push(readConfig());
  localStorage.setItem('profiles', JSON.stringify(profiles));
  loadProfiles();
  addNotification('Profile saved');
}

function readConfig() {
  return {
    host: document.getElementById('host').value,
    port: Number(document.getElementById('port').value || 22),
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    privateKey: document.getElementById('privateKey').value || undefined,
    passphrase: document.getElementById('passphrase').value,
    keepAliveInterval: Number(document.getElementById('keepAliveInterval').value || 15000),
  };
}

function applyConfig(cfg) {
  document.getElementById('host').value = cfg.host || '';
  document.getElementById('port').value = cfg.port || 22;
  document.getElementById('username').value = cfg.username || '';
  document.getElementById('password').value = cfg.password || '';
  document.getElementById('privateKey').value = cfg.privateKey || '';
  document.getElementById('passphrase').value = cfg.passphrase || '';
  document.getElementById('keepAliveInterval').value = cfg.keepAliveInterval || 15000;
}

function connectSSH() {
  if (!socket) initSocket();
  const cfg = readConfig();
  autoReconnect = document.getElementById('autoReconnect').checked;
  setStatus('pending', 'Connecting...');
  socket.emit('connect_ssh', cfg);
}

function disconnectSSH() {
  socket.emit('disconnect_ssh');
  sessions.forEach(({ term }) => term.dispose());
  sessions.clear();
  activeSessionId = null;
  elements.tabBar.querySelectorAll('.tab-button').forEach(btn => btn.remove());
  elements.disconnectBtn.disabled = true;
  elements.downloadLog.disabled = true;
  elements.clearLog.disabled = true;
  setStatus('disconnected', 'Disconnected');
  addNotification('Disconnected');
}

function sendQuickCommand(cmd) {
  if (!activeSessionId) return;
  socket.emit('input', { sessionId: activeSessionId, data: cmd });
}

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyT') {
      e.preventDefault();
      addTab('shell');
    }
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyW') {
      e.preventDefault();
      if (activeSessionId) closeTab(activeSessionId);
    }
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
      e.preventDefault();
      if (!elements.downloadLog.disabled) downloadSessionLog();
    }
    if (e.ctrlKey && e.code === 'KeyF') {
      e.preventDefault();
      searchActiveTerminal();
    }
  });
}

function copySelection() {
  const session = sessions.get(activeSessionId);
  if (!session) return;
  const text = session.term.getSelection();
  if (text) navigator.clipboard.writeText(text);
}

async function pasteClipboard() {
  const text = await navigator.clipboard.readText();
  const session = sessions.get(activeSessionId);
  if (session) socket.emit('input', { sessionId: activeSessionId, data: text });
}

function searchActiveTerminal() {
  const session = sessions.get(activeSessionId);
  if (!session) return;
  const term = session.term;
  const query = prompt('Find text:');
  if (query) session.searchAddon.findNext(query, { incremental: true, caseSensitive: false });
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'alt' : 'dark';
  sessions.forEach(({ term }) => term.setOption('theme', theme[currentTheme]));
  document.body.style.background = currentTheme === 'dark' ? 'radial-gradient(circle at top left, #1a0f16, #050506 60%)' : '#0b0b10';
}

function adjustFont(delta) {
  sessions.forEach(({ term }) => term.setOption('fontSize', term.getOption('fontSize') + delta));
}

function downloadSessionLog() {
  const session = sessions.get(activeSessionId);
  if (!session) return;
  const blob = new Blob([session.log || ''], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xterminal-${activeSessionId}.log`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearSessionLog() {
  const session = sessions.get(activeSessionId);
  if (!session) return;
  session.log = '';
  addNotification('Log cleared');
}

function refreshSftp(dir) {
  elements.sftpDir.value = dir || elements.sftpDir.value;
  socket.emit('sftp_list', elements.sftpDir.value);
}

function renderSftpList(files) {
  elements.sftpList.innerHTML = '';
  files.forEach(file => {
    const row = document.createElement('div');
    row.className = 'sftp-entry';
    row.innerHTML = `<span class="name">${file.type === 'd' ? '📁' : '📄'} ${file.name}</span><span class="meta">${file.size} bytes</span>`;
    row.addEventListener('click', () => {
      if (file.type === 'd') {
        const newDir = pathJoin(elements.sftpDir.value, file.name);
        refreshSftp(newDir);
      } else {
        document.getElementById('download-remote').value = pathJoin(elements.sftpDir.value, file.name);
      }
    });
    elements.sftpList.appendChild(row);
  });
}

function pathJoin(dir, name) {
  if (!dir.endsWith('/')) return `${dir}/${name}`;
  return `${dir}${name}`;
}

function uploadFile() {
  const fileInput = document.getElementById('upload-file');
  const remotePath = document.getElementById('upload-remote').value;
  if (!fileInput.files[0] || !remotePath) return;
  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    const data = new Uint8Array(reader.result);
    socket.emit('sftp_upload', { remotePath, file: { name: file.name, data } });
  };
  reader.readAsArrayBuffer(file);
}

function downloadFile() {
  const remotePath = document.getElementById('download-remote').value;
  if (!remotePath) return;
  socket.emit('sftp_download', { remotePath });
}

function previewFile() {
  const remotePath = document.getElementById('preview-remote').value;
  if (!remotePath) return;
  socket.emit('sftp_preview', { remotePath });
}

function setupDragUpload() {
  elements.sftpList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  elements.sftpList.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      const remotePath = pathJoin(elements.sftpDir.value, file.name);
      socket.emit('sftp_upload', { remotePath, file: { name: file.name, data } });
    };
    reader.readAsArrayBuffer(file);
  });
}

function bindUi() {
  elements.connectBtn.addEventListener('click', connectSSH);
  elements.disconnectBtn.addEventListener('click', disconnectSSH);
  elements.gateway.addEventListener('change', initSocket);
  elements.socketPath.addEventListener('change', initSocket);
  elements.newTab.addEventListener('click', () => addTab('shell'));
  document.querySelectorAll('.quick-commands button').forEach(btn => btn.addEventListener('click', () => sendQuickCommand(btn.dataset.cmd)));
  elements.copyBtn.addEventListener('click', copySelection);
  elements.pasteBtn.addEventListener('click', pasteClipboard);
  elements.clearBtn.addEventListener('click', () => {
    const session = sessions.get(activeSessionId);
    if (session) session.term.reset();
  });
  elements.fullscreenBtn.addEventListener('click', () => document.documentElement.requestFullscreen());
  elements.searchBtn.addEventListener('click', searchActiveTerminal);
  elements.fontPlus.addEventListener('click', () => adjustFont(1));
  elements.fontMinus.addEventListener('click', () => adjustFont(-1));
  elements.wrapToggle.addEventListener('change', () => sessions.forEach(({ term }) => term.setOption('wrapAround', elements.wrapToggle.checked)));
  elements.cursorToggle.addEventListener('change', () => sessions.forEach(({ term }) => term.setOption('cursorBlink', elements.cursorToggle.checked)));
  elements.bellToggle.addEventListener('change', () => sessions.forEach(({ term }) => term.setOption('bellStyle', elements.bellToggle.checked ? 'sound' : 'none')));
  elements.toggleTheme.addEventListener('click', toggleTheme);
  elements.downloadLog.addEventListener('click', downloadSessionLog);
  elements.clearLog.addEventListener('click', clearSessionLog);
  document.getElementById('refresh-sftp').addEventListener('click', () => refreshSftp());
  document.getElementById('nav-home').addEventListener('click', () => refreshSftp('.'));
  document.getElementById('nav-root').addEventListener('click', () => refreshSftp('/'));
  document.getElementById('nav-up').addEventListener('click', () => {
    const parts = elements.sftpDir.value.split('/');
    parts.pop();
    const dir = parts.join('/') || '/';
    refreshSftp(dir);
  });
  document.getElementById('mkdir-btn').addEventListener('click', () => socket.emit('sftp_mkdir', { dir: document.getElementById('mkdir-path').value }));
  document.getElementById('delete-btn').addEventListener('click', () => socket.emit('sftp_delete', { remotePath: document.getElementById('delete-path').value }));
  document.getElementById('rename-btn').addEventListener('click', () => socket.emit('sftp_rename', { from: document.getElementById('rename-from').value, to: document.getElementById('rename-to').value }));
  document.getElementById('upload-btn').addEventListener('click', uploadFile);
  document.getElementById('download-btn').addEventListener('click', downloadFile);
  document.getElementById('preview-btn').addEventListener('click', previewFile);
  elements.saveProfile.addEventListener('click', saveProfile);
  elements.loadProfile.addEventListener('click', () => {
    const profiles = JSON.parse(localStorage.getItem('profiles') || '[]');
    const idx = Number(elements.profiles.value);
    if (profiles[idx]) applyConfig(profiles[idx]);
  });
  elements.deleteProfile.addEventListener('click', () => {
    const profiles = JSON.parse(localStorage.getItem('profiles') || '[]');
    const idx = Number(elements.profiles.value);
    profiles.splice(idx, 1);
    localStorage.setItem('profiles', JSON.stringify(profiles));
    loadProfiles();
  });
  setupShortcuts();
  setupDragUpload();
}


function bindSocketEvents(sock) {
  sock.on('ssh_ready', () => {
    setStatus('connected', 'SSH ready');
    elements.connectBtn.disabled = true;
    elements.disconnectBtn.disabled = false;
    elements.downloadLog.disabled = false;
    elements.clearLog.disabled = false;
    addNotification('SSH connection established');
    addTab('shell');
    refreshSftp('/');
  });

  sock.on('sftp_ready', () => addNotification('SFTP channel ready'));

  sock.on('data', ({ sessionId, data }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.term.write(data);
    session.log += data;
    globalLog += data;
    lastActivity = Date.now();
    updateMetrics();
  });

  sock.on('session_closed', (sessionId) => {
    addNotification(`Session ${sessionId} closed`);
    closeTab(sessionId);
  });

  sock.on('error_message', (msg) => addNotification(`Error: ${msg}`));

 sock.on('disconnected', () => {
    setStatus('disconnected', 'Disconnected');
    if (autoReconnect) setTimeout(connectSSH, 3000);
  });

  sock.on('sftp_files', (files) => renderSftpList(files));

  sock.on('sftp_mkdir_success', (dir) => { addNotification(`Created ${dir}`); refreshSftp(dir); });
  sock.on('sftp_delete_success', (remotePath) => { addNotification(`Deleted ${remotePath}`); refreshSftp(); });
  sock.on('sftp_rename_success', ({ from, to }) => { addNotification(`Renamed ${from} -> ${to}`); refreshSftp(); });
  sock.on('sftp_progress', ({ type, transferred, total, remotePath }) => {
    elements.transferStatus.textContent = `${type} ${Math.round((transferred / total) * 100)}% for ${remotePath}`;
    elements.sftpProgress.textContent = `${type} ${transferred}/${total}`;
  });

  sock.on('sftp_upload_success', (remotePath) => {
    addNotification(`Uploaded ${remotePath}`);
    elements.transferStatus.textContent = 'idle';
    elements.sftpProgress.textContent = '';
    refreshSftp();
  });

  sock.on('sftp_download_success', ({ remotePath, data }) => {
    addNotification(`Downloaded ${remotePath}`);
    const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = remotePath.split('/').pop();
    link.click();
    URL.revokeObjectURL(url);
    elements.transferStatus.textContent = 'idle';
  });

  sock.on('sftp_preview_data', ({ remotePath, content }) => {
    elements.previewPane.textContent = `${remotePath}\n\n${content}`;
  });
}

// socket events
socket.on('ssh_ready', () => {
  setStatus('connected', 'SSH ready');
  elements.connectBtn.disabled = true;
  elements.disconnectBtn.disabled = false;
  elements.downloadLog.disabled = false;
  elements.clearLog.disabled = false;
  addNotification('SSH connection established');
  addTab('shell');
  refreshSftp('/');
});

socket.on('sftp_ready', () => addNotification('SFTP channel ready'));

socket.on('data', ({ sessionId, data }) => {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.term.write(data);
  session.log += data;
  globalLog += data;
  lastActivity = Date.now();
  updateMetrics();
});

socket.on('session_closed', (sessionId) => {
  addNotification(`Session ${sessionId} closed`);
  closeTab(sessionId);
});

socket.on('error_message', (msg) => addNotification(`Error: ${msg}`));

socket.on('disconnected', () => {
  setStatus('disconnected', 'Disconnected');
  if (autoReconnect) setTimeout(connectSSH, 3000);
});

socket.on('sftp_files', (files) => renderSftpList(files));

socket.on('sftp_mkdir_success', (dir) => { addNotification(`Created ${dir}`); refreshSftp(dir); });
socket.on('sftp_delete_success', (remotePath) => { addNotification(`Deleted ${remotePath}`); refreshSftp(); });
socket.on('sftp_rename_success', ({ from, to }) => { addNotification(`Renamed ${from} -> ${to}`); refreshSftp(); });
socket.on('sftp_progress', ({ type, transferred, total, remotePath }) => {
  elements.transferStatus.textContent = `${type} ${Math.round((transferred / total) * 100)}% for ${remotePath}`;
  elements.sftpProgress.textContent = `${type} ${transferred}/${total}`;
});

socket.on('sftp_upload_success', (remotePath) => {
  addNotification(`Uploaded ${remotePath}`);
  elements.transferStatus.textContent = 'idle';
  elements.sftpProgress.textContent = '';
  refreshSftp();
});

socket.on('sftp_download_success', ({ remotePath, data }) => {
  addNotification(`Downloaded ${remotePath}`);
  const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = remotePath.split('/').pop();
  link.click();
  URL.revokeObjectURL(url);
  elements.transferStatus.textContent = 'idle';
});

socket.on('sftp_preview_data', ({ remotePath, content }) => {
  elements.previewPane.textContent = `${remotePath}\n\n${content}`;
});


bindUi();
loadProfiles();
updateMetrics();
initSocket();
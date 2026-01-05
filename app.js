import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { AttachAddon } from 'xterm-addon-attach';

const socket = io();
let term;
let fitAddon;

function connectSSH() {
  const config = {
    host: document.getElementById('host').value,
    port: parseInt(document.getElementById('port').value),
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    privateKey: document.getElementById('privateKey').value || undefined
  };

  socket.emit('connect_ssh', config);

  socket.on('ssh_ready', () => {
    document.getElementById('connection-form').style.display = 'none';
    document.getElementById('terminal-container').style.display = 'block';
    document.getElementById('sftp-panel').style.display = 'block';

    term = new Terminal({
      theme: {
        background: '#000000',
        foreground: '#00BFFF',
        cursor: '#00BFFF',
        cursorAccent: '#001F3F',
        black: '#000000',
        blue: '#00BFFF',
        brightBlue: '#00FFFF'
      },
      fontFamily: 'monospace',
      fontSize: 14
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal-container'));
    fitAddon.fit();

    const attachAddon = new AttachAddon(socket, { bidirectional: true });
    term.loadAddon(attachAddon);

    term.onData((data) => socket.emit('data', data));

    // Additional features: Resize handling, fullscreen
    window.addEventListener('resize', () => fitAddon.fit());
    term.onKey((e) => {
      if (e.domEvent.ctrlKey && e.domEvent.key === 'f') {
        term.toggleFullscreen();
      }
    });

    // Command history (simple local storage)
    let history = JSON.parse(localStorage.getItem('cmd_history')) || [];
    let historyIndex = history.length;
    term.onKey((e) => {
      if (e.domEvent.key === 'ArrowUp') {
        if (historyIndex > 0) term.write(history[--historyIndex]);
      } else if (e.domEvent.key === 'ArrowDown') {
        if (historyIndex < history.length) term.write(history[++historyIndex]);
      } else if (e.domEvent.key === 'Enter') {
        history.push(e.key);
        localStorage.setItem('cmd_history', JSON.stringify(history));
        historyIndex = history.length;
      }
    });
  });

  socket.on('sftp_ready', () => {
    console.log('SFTP ready');
  });

  socket.on('data', (data) => term.write(data));
  socket.on('error', (msg) => alert('Error: ' + msg));
  socket.on('disconnected', () => alert('Disconnected'));
}

function listSFTP() {
  const dir = document.getElementById('sftp-dir').value;
  socket.emit('sftp_list', dir);
  socket.on('sftp_files', (files) => {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    files.forEach(file => {
      const li = document.createElement('li');
      li.textContent = `${file.type} ${file.name} (${file.size} bytes)`;
      list.appendChild(li);
    });
  });
}

function uploadSFTP() {
  const localPath = document.getElementById('upload-local').value;
  const remotePath = document.getElementById('upload-remote').value;
  socket.emit('sftp_upload', { localPath, remotePath });
  socket.on('sftp_upload_success', () => alert('Upload success'));
}

function downloadSFTP() {
  const remotePath = document.getElementById('download-remote').value;
  const localPath = document.getElementById('download-local').value;
  socket.emit('sftp_download', { remotePath, localPath });
  socket.on('sftp_download_success', () => alert('Download success'));
}

// Auto-reconnect example
socket.on('disconnected', () => {
  setTimeout(connectSSH, 5000); // Retry after 5s
});

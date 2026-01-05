const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ssh2 = require('ssh2');
const SftpClient = require('ssh2-sftp-client');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  let sshClient;
  let sftp;
  const sessions = new Map();
  let keepAliveTimer;

  socket.on('connect_ssh', async (config) => {
    if (sshClient) {
      socket.emit('error_message', 'SSH already connected');
      return;
    }

    sshClient = new ssh2.Client();
    const keepAliveInterval = Number(config.keepAliveInterval) || 15000;
    const readyHandler = () => {
      socket.emit('ssh_ready');
      const sock = sshClient._sock;
      if (sock) {
        sock.setKeepAlive(true, keepAliveInterval);
      }
      keepAliveTimer = setInterval(() => {
        try {
          sshClient.exec('echo keepalive', () => {});
        } catch (err) {
          socket.emit('error_message', err.message);
        }
      }, keepAliveInterval);

      sftp = new SftpClient();
      sftp.connect(config).then(() => {
        socket.emit('sftp_ready');
      }).catch(err => socket.emit('error_message', err.message));
    };

    sshClient.on('ready', readyHandler);
    sshClient.on('error', (err) => socket.emit('error_message', err.message));
    sshClient.on('end', () => socket.emit('disconnected'));

    try {
      const connectConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        tryKeyboard: true,
        readyTimeout: 20000,
      };

      if (config.privateKey) {
        connectConfig.privateKey = config.privateKey;
        if (config.passphrase) connectConfig.passphrase = config.passphrase;
      } else {
        connectConfig.password = config.password;
      }

      sshClient.connect(connectConfig);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('open_session', ({ sessionId, cols, rows }) => {
    if (!sshClient) {
      socket.emit('error_message', 'SSH not connected');
      return;
    }
    sshClient.shell({ cols, rows }, (err, stream) => {
      if (err) {
        socket.emit('error_message', err.message);
        return;
      }
      sessions.set(sessionId, stream);
      stream.on('data', (data) => socket.emit('data', { sessionId, data: data.toString('utf8') }));
      stream.stderr.on('data', (data) => socket.emit('data', { sessionId, data: data.toString('utf8') }));
      stream.on('close', () => {
        socket.emit('session_closed', sessionId);
        sessions.delete(sessionId);
      });
    });
  });

  socket.on('resize', ({ sessionId, cols, rows }) => {
    const stream = sessions.get(sessionId);
    if (stream) stream.setWindow(rows, cols, rows, cols);
  });

  socket.on('input', ({ sessionId, data }) => {
    const stream = sessions.get(sessionId);
    if (stream) stream.write(data);
  });

  socket.on('sftp_list', async (dir) => {
    if (!sftp) return socket.emit('error_message', 'SFTP not connected');
    try {
      const files = await sftp.list(dir || '.');
      socket.emit('sftp_files', files);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('sftp_mkdir', async ({ dir }) => {
    if (!sftp) return;
    try {
      await sftp.mkdir(dir, true);
      socket.emit('sftp_mkdir_success', dir);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('sftp_delete', async ({ remotePath }) => {
    if (!sftp) return;
    try {
      await sftp.delete(remotePath);
      socket.emit('sftp_delete_success', remotePath);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('sftp_rename', async ({ from, to }) => {
    if (!sftp) return;
    try {
      await sftp.rename(from, to);
      socket.emit('sftp_rename_success', { from, to });
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('sftp_upload', async ({ remotePath, file }) => {
    if (!sftp || !file || !remotePath) return;
    try {
      const buffer = Buffer.from(file.data);
      await sftp.put(buffer, remotePath, {
        step: (transferred, chunk, total) => {
          socket.emit('sftp_progress', { type: 'upload', transferred, total, remotePath });
        }
      });
      socket.emit('sftp_upload_success', remotePath);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('sftp_download', async ({ remotePath }) => {
    if (!sftp || !remotePath) return;
    try {
      const buffer = await sftp.get(remotePath);
      socket.emit('sftp_download_success', { remotePath, data: buffer });
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('sftp_preview', async ({ remotePath, length = 4000 }) => {
    if (!sftp || !remotePath) return;
    try {
      const stream = await sftp.createReadStream(remotePath, { start: 0, end: length });
      let collected = '';
      stream.on('data', (chunk) => {
        collected += chunk.toString('utf8');
      });
      stream.on('end', () => socket.emit('sftp_preview_data', { remotePath, content: collected }));
      stream.on('error', (err) => socket.emit('error_message', err.message));
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('disconnect_ssh', () => {
    sessions.forEach((stream) => stream.end());
    sessions.clear();
    if (sshClient) sshClient.end();
    if (sftp) sftp.end();
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    sshClient = undefined;
    sftp = undefined;
  });

  socket.on('disconnect', () => {
    sessions.forEach((stream) => stream.end());
    sessions.clear();
    if (sshClient) sshClient.end();
    if (sftp) sftp.end();
    if (keepAliveTimer) clearInterval(keepAliveTimer);
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));

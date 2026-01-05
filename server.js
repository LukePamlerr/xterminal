const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const ssh2 = require('ssh2');
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  let sshClient;
  let sftp;

  socket.on('connect_ssh', async (config) => {
    sshClient = new ssh2.Client();
    sshClient.on('ready', () => {
      socket.emit('ssh_ready');
      sshClient.shell((err, stream) => {
        if (err) return socket.emit('error', err.message);
        socket.on('data', (data) => stream.write(data));
        stream.on('data', (data) => socket.emit('data', data));
        stream.on('close', () => sshClient.end());
      });

      // SFTP setup
      sftp = new SftpClient();
      sftp.connect(config).then(() => {
        socket.emit('sftp_ready');
      }).catch(err => socket.emit('error', err.message));
    });

    sshClient.on('error', (err) => socket.emit('error', err.message));
    sshClient.on('end', () => socket.emit('disconnected'));

    try {
      if (config.privateKey) config.privateKey = fs.readFileSync(config.privateKey);
      sshClient.connect(config);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // SFTP operations
  socket.on('sftp_list', async (dir) => {
    if (!sftp) return socket.emit('error', 'SFTP not connected');
    try {
      const files = await sftp.list(dir);
      socket.emit('sftp_files', files);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('sftp_upload', async ({ localPath, remotePath }) => {
    if (!sftp) return;
    try {
      await sftp.upload(localPath, remotePath);
      socket.emit('sftp_upload_success');
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('sftp_download', async ({ remotePath, localPath }) => {
    if (!sftp) return;
    try {
      await sftp.download(remotePath, localPath);
      socket.emit('sftp_download_success');
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('disconnect_ssh', () => {
    if (sshClient) sshClient.end();
    if (sftp) sftp.end();
  });

  socket.on('disconnect', () => {
    if (sshClient) sshClient.end();
    if (sftp) sftp.end();
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));

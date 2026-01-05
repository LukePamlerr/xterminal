# XTerminal

A full-featured, no-mock terminal emulator for Linux servers (Debian, Ubuntu, CentOS and more) built with xterm.js, SSH2, and SFTP.

## Features (40+ real capabilities)
1. Secure SSH transport powered by `ssh2`.
2. Password authentication.
3. Encrypted private-key authentication with passphrase support.
4. Configurable keep-alive interval to hold long-lived sessions.
5. Auto-reconnect toggle on disconnect.
6. Multi-tab terminal sessions, each mapped to a unique SSH shell.
7. Per-tab close controls with automatic focus reassignment.
8. Responsive terminal resizing via the fit addon and resize events.
9. Black/red aesthetic theme with a toggleable alternate palette.
10. Cursor blink toggle.
11. Bell toggle for audible terminal alerts.
12. Word-wrap toggle.
13. Font zoom controls (A+/A-).
14. Fullscreen shortcut/button.
15. Copy selection to clipboard.
16. Paste from clipboard into the active session.
17. Clear/reset terminal content.
18. Quick-command palette buttons (ls, whoami, sudo, htop, journalctl, etc.).
19. Terminal search powered by the xterm search addon.
20. Link detection using the web-links addon.
21. Downloadable session logs per tab.
22. Clearable session log buffer.
23. Connection status indicator (connected/pending/disconnected).
24. Activity metrics (last activity timestamp, active tab count, transfer status).
25. Local profile save/load/delete for connection presets.
26. SFTP channel established over the same SSH config.
27. Remote directory listing with clickable navigation.
28. Breadcrumb-style quick navigation (home, root, up one level).
29. Drag-and-drop upload into the current directory.
30. Upload via file picker to custom remote path.
31. Download remote files directly to the browser.
32. Transfer progress indicators for uploads/downloads.
33. Remote mkdir (recursive) support.
34. Remote delete support.
35. Remote rename/move support.
36. Remote file preview (streamed first bytes) in a preview pane.
37. SFTP list auto-refresh after mutations.
38. Transfer status banner and notifications feed.
39. Shortcut help strip with documented hotkeys.
40. Auto-wrap responsive grid layout for smaller screens.
41. Per-session keepalive ping to guard idle shells.
42. Quick navigation field to set arbitrary remote directories.
43. Tab-aware metrics and status reporting.
44. Drag-and-drop and file-picker uploads both supported simultaneously.
45. Browser-side metrics for tab count and transfer state updates.

## Running locally
```bash
npm install
npm start
```
Then open http://localhost:3000.

> Note: The app relies on real SSH/SFTP servers. Provide reachable hosts plus valid credentials or keys. All features operate against the live server—no mocks or fakes are used.

 codex/build-terminal-emulator-with-xterm.js
## GitHub Pages / static hosting
- The `/public` folder is fully static and now uses the Socket.IO CDN. You can publish it directly with GitHub Pages.
- Host the Node.js gateway (this repo’s `server.js`) somewhere reachable over HTTPS/WSS. In the UI set **Gateway URL** and **Socket path** to that deployment; the values persist in `localStorage` and will be used after reload.
- Alternatively, define `window.XTERM_GATEWAY` and `window.XTERM_SOCKET_PATH` via an inline script before `app.js` when serving from Pages to hardcode your backend endpoint.

main
## Keyboard shortcuts
- **Ctrl+Shift+T**: open a new tab
- **Ctrl+Shift+W**: close current tab
- **Ctrl+F**: search in the active terminal
- **Ctrl+Shift+L**: download the current tab log

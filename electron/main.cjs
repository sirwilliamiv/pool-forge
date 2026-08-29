/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, Menu, dialog, ipcMain, systemPreferences } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const http = require('node:http')

const { installVoiceHost } = require('./voice/host.cjs')

// `next dev` reads .env for the web process; the main process is separate and
// would otherwise start with no GCP project and voice quietly disabled.
function loadDotEnv() {
  // `app.getAppPath()` points inside the asar in a packaged build and at the
  // launch directory in dev, which is not reliably the repo root. The directory
  // above this file is, in both cases, where the env files sit.
  const roots = [path.join(__dirname, '..'), app.getAppPath(), process.cwd()]
  const seen = new Set()

  for (const root of roots) {
    for (const name of ['.env.local', '.env']) {
      const file = path.join(root, name)
      if (seen.has(file)) continue
      seen.add(file)
      loadEnvFile(file)
    }
  }
}

function loadEnvFile(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    if (process.env[key] !== undefined) continue
    // Values from Secret Manager and from editors alike arrive with quotes or
    // a trailing newline; both break header and comparison use downstream.
    process.env[key] = match[2].trim().replace(/^["']|["']$/g, '')
  }
}

loadDotEnv()

const IS_DEV = !app.isPackaged
const DEV_URL = process.env.POOL_FORGE_DEV_URL || 'http://localhost:3001'
const PROD_PORT = Number(process.env.POOL_FORGE_PORT || 3010)
const PROD_URL = `http://127.0.0.1:${PROD_PORT}`

// NextAuth requires AUTH_URL to match the origin the browser loads from.
// Set it before any Next.js process (dev wait or prod spawn) reads env.
process.env.AUTH_URL = IS_DEV ? DEV_URL : PROD_URL

let mainWindow = null
let nextServer = null

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) return resolve()
        retry()
      })
      req.on('error', retry)
      req.setTimeout(2000, () => req.destroy())
    }
    function retry() {
      if (Date.now() - start > timeoutMs) return reject(new Error(`server didn't come up: ${url}`))
      setTimeout(attempt, 250)
    }
    attempt()
  })
}

function startNextProductionServer() {
  // In production we run the standalone Next server bundled into the app.
  // Resources are copied under resources/standalone (set by electron-builder).
  const standalonePath = path.join(process.resourcesPath, 'standalone')
  const serverScript = path.join(standalonePath, 'server.js')
  nextServer = spawn(process.execPath, [serverScript], {
    cwd: standalonePath,
    env: { ...process.env, PORT: String(PROD_PORT), HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
    stdio: 'pipe',
  })
  nextServer.stdout.on('data', (b) => process.stdout.write(`[next] ${b}`))
  nextServer.stderr.on('data', (b) => process.stderr.write(`[next] ${b}`))
  nextServer.on('exit', (code) => {
    console.log(`[next] exited with code ${code}`)
    if (mainWindow) mainWindow.close()
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Pool Forge',
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'voice', 'preload.cjs'),
    },
  })

  // Without this the renderer's console is invisible from the terminal, so a
  // preload that failed to load or a component that threw looks identical to a
  // feature nobody clicked.
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = level >= 2 ? 'error' : 'log'
    console.log(`[renderer:${tag}] ${message}${sourceId ? ` (${sourceId}:${line})` : ''}`)
  })
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.log(`[preload] failed: ${preloadPath}: ${error && error.message}`)
  })

  // getUserMedia inside the renderer is denied by default and fails silently,
  // which looks exactly like a broken microphone. Grant audio, refuse the rest.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture')
  })

  // Open external links in the user's default browser instead of new windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const target = IS_DEV ? DEV_URL : PROD_URL

  try {
    if (!IS_DEV) startNextProductionServer()
    await waitForServer(target)
    await mainWindow.loadURL(target)
  } catch (err) {
    dialog.showErrorBox(
      'Failed to load Pool Forge',
      `Could not reach ${target}.\n\n${err && err.message ? err.message : err}`,
    )
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Pool Forge on the web',
          click: () => shell.openExternal('https://anthropic.com'),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  buildMenu()

  // macOS gates the microphone at the OS level as well. Asking here means the
  // prompt appears once at launch rather than in the middle of a sentence.
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone')
    } catch (err) {
      console.log('[voice] microphone access request failed:', err && err.message)
    }
  }

  installVoiceHost({
    ipcMain,
    getWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
    log: (event, fields) => console.log(`[voice] ${event}`, JSON.stringify(fields)),
  })

  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (nextServer) {
    try {
      nextServer.kill('SIGTERM')
    } catch {}
    nextServer = null
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (nextServer) {
    try {
      nextServer.kill('SIGTERM')
    } catch {}
    nextServer = null
  }
})

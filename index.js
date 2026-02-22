const { app, BrowserWindow, globalShortcut, ipcMain, screen, desktopCapturer, dialog, shell } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile } = require('child_process');

const APP_VERSION = '1.1.1';
const GITHUB_REPO = 'yobi7979/D2R-HUD';

let mainWindow;
const posFilePath = path.join(app.getPath('userData'), 'window-pos.json');

function createWindow() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  // Calculate total bounds covering all monitors
  const totalBounds = displays.reduce((acc, display) => {
    return {
      x: Math.min(acc.x, display.bounds.x),
      y: Math.min(acc.y, display.bounds.y),
      maxX: Math.max(acc.maxX, display.bounds.x + display.bounds.width),
      maxY: Math.max(acc.maxY, display.bounds.y + display.bounds.height)
    };
  }, { x: Infinity, y: Infinity, maxX: -Infinity, maxY: -Infinity });

  const windowWidth = totalBounds.maxX - totalBounds.x;
  const windowHeight = totalBounds.maxY - totalBounds.y;

  let windowPos = { x: undefined, y: undefined };
  try {
    if (fs.existsSync(posFilePath)) {
      windowPos = JSON.parse(fs.readFileSync(posFilePath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load window position', e);
  }

  // If no saved position, default to center of primary display (UI position, not window position)
  // Note: the window itself now covers ALL monitors, but we keep windowPos for the UI elements' reference if needed.
  // Actually, the web UI uses absolute positioning within this large window.
  // So windowPos in this context might be used by the renderer to place the HUD.

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: totalBounds.x,
    y: totalBounds.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    hasShadow: false,
    enableLargerThanScreen: true,
    skipTaskbar: true, // HUD이므로 작업표시줄 제외 (필요시)
  });

  // 개발자 도구 단축키 (F12)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // We don't really 'move' this large window, but we keep the logic for future-proofing
  const savePos = () => {
    // This is currently unused as the window covers all screens, 
    // but the HUD position within the window is saved by the renderer in localStorage.
  };
  mainWindow.on('move', savePos);

  // 웹 버전에서 UI를 로드 - 웹 업데이트 시 앱 재배포 없이 자동 반영
  const startUrl = isDev ? 'http://localhost:5173' : 'https://d2hud.pages.dev/';
  mainWindow.loadURL(startUrl);

  mainWindow.webContents.on('did-finish-load', () => {
    // 시작 시 저장된 HUD 위치값 및 모니터 설정 강제 삭제 (매번 주모니터 중앙에서 시작하여 '사라짐' 현상 방지)
    mainWindow.webContents.executeJavaScript(`
      localStorage.removeItem('hud-pos');
      localStorage.removeItem('selected-monitor-id');
    `);

    const primaryDisplay = screen.getPrimaryDisplay();
    mainWindow.webContents.send('primary-display-info', {
      id: primaryDisplay.id,
      x: primaryDisplay.bounds.x - totalBounds.x,
      y: primaryDisplay.bounds.y - totalBounds.y,
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Re-calculate and resize window when display metrics change
  const handleDisplayChange = () => {
    const info = getAllDisplaysInfo();
    const { totalBounds } = info;
    if (mainWindow) {
      mainWindow.setBounds({
        x: totalBounds.x,
        y: totalBounds.y,
        width: totalBounds.width,
        height: totalBounds.height
      });
      mainWindow.webContents.send('all-displays-info', info);
    }
  };

  screen.on('display-metrics-changed', handleDisplayChange);
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
}

// --- IPC Communication Logic ---

function getAllDisplaysInfo() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  // Calculate total bounds again to ensure accuracy
  const totalBounds = displays.reduce((acc, display) => {
    return {
      x: Math.min(acc.x, display.bounds.x),
      y: Math.min(acc.y, display.bounds.y),
      maxX: Math.max(acc.maxX, display.bounds.x + display.bounds.width),
      maxY: Math.max(acc.maxY, display.bounds.y + display.bounds.height)
    };
  }, { x: Infinity, y: Infinity, maxX: -Infinity, maxY: -Infinity });

  return {
    displays: displays.map(d => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === primaryDisplay.id,
      relativeX: d.bounds.x - totalBounds.x,
      relativeY: d.bounds.y - totalBounds.y
    })),
    totalBounds: {
      x: totalBounds.x,
      y: totalBounds.y,
      width: totalBounds.maxX - totalBounds.x,
      height: totalBounds.maxY - totalBounds.y
    }
  };
}

// Renderer asks for display info
ipcMain.on('get-all-displays-info', (event) => {
  event.reply('all-displays-info', getAllDisplaysInfo());
});

ipcMain.on('get-primary-display-info', (event) => {
  const info = getAllDisplaysInfo();
  const primary = info.displays.find(d => d.isPrimary);
  event.reply('primary-display-info', {
    id: primary.id,
    x: primary.relativeX,
    y: primary.relativeY,
    width: primary.bounds.width,
    height: primary.bounds.height
  });
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options);
  }
});

// --- Auto-Hide Logic ---
let autoHideConfig = {
  enabled: false, // 앱 시작 시 초기 상태는 무조건 비활성화
  x: 0,
  y: 0,
  targetColor: '#000000',
  tolerance: 30,
  interval: 500
};

// --- Hotkey Registry ---
let currentToggleHotkey = 'Control+Q';
let manualHide = false; // 단축키를 통한 수동 숨김 상태 추적

const registerToggleHotkey = (accelerator) => {
  if (currentToggleHotkey) {
    globalShortcut.unregister(currentToggleHotkey);
  }
  try {
    const ret = globalShortcut.register(accelerator, () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
          manualHide = true;
          stopAutoHide(false); // 수동으로 끌 때는 감시 중단
          writeLog('Manual HIDE (Hotkey) - Auto-hide suspended');
        } else {
          mainWindow.show();
          manualHide = false;
          // 설정에서 자동 숨김이 켜져 있을 때만 다시 감지 시작
          if (autoHideConfig.enabled) {
            startAutoHide();
            writeLog('Manual SHOW (Hotkey) - Auto-hide resumed');
          } else {
            writeLog('Manual SHOW (Hotkey) - Auto-hide remains disabled (settings off)');
          }
        }
      }
    });
    if (ret) {
      currentToggleHotkey = accelerator;
      console.log('Registered toggle hotkey:', accelerator);
    }
  } catch (error) {
    console.error('Failed to register hotkey:', error);
  }
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function colorsMatch(c1, c2, tolerance) {
  if (!c1 || !c2) return false;
  return Math.abs(c1.r - c2.r) <= tolerance &&
    Math.abs(c1.g - c2.g) <= tolerance &&
    Math.abs(c1.b - c2.b) <= tolerance;
}

const logFilePath = path.join(os.tmpdir(), 'd2hud_autohide.log');
function writeLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFilePath, line, 'utf8');
  console.log(msg);
}

// --- 픽셀 체크용 persistent PowerShell 프로세스 관리 ---
let pixelProcess = null;

function initPixelProcess() {
  if (pixelProcess) return;

  const { spawn } = require('child_process');
  pixelProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'
  ]);

  // PowerShell 초기 로직 (함수 정의)
  const setupScript = `
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(1, 1)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    function Get-PixelColor($px, $py) {
      $g.CopyFromScreen($px, $py, 0, 0, [System.Drawing.Size]::new(1, 1))
      $c = $bmp.GetPixel(0, 0)
      Write-Output "$($c.R),$($c.G),$($c.B)"
    }
  `;
  pixelProcess.stdin.write(setupScript + "\n");

  pixelProcess.stdout.on('data', (data) => {
    const stdout = data.toString().trim();
    if (!stdout) return;

    const parts = stdout.split(',');
    if (parts.length === 3) {
      const r = parseInt(parts[0]), g = parseInt(parts[1]), b = parseInt(parts[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const isMatch = colorsMatch({ r, g, b }, hexToRgb(autoHideConfig.targetColor), autoHideConfig.tolerance);

        if (mainWindow && !mainWindow.isDestroyed() && !manualHide) {
          if (isMatch) {
            if (mainWindow.isVisible()) {
              mainWindow.hide();
              writeLog(`HIDE pixel=(${r},${g},${b})`);
            }
          } else {
            if (!mainWindow.isVisible()) {
              mainWindow.show();
              writeLog(`SHOW pixel=(${r},${g},${b})`);
            }
          }
        }
      }
    }
  });

  pixelProcess.stderr.on('data', (data) => {
    console.error(`[PS Error] ${data}`);
  });

  pixelProcess.on('close', () => {
    pixelProcess = null;
    if (autoHideRunning) initPixelProcess(); // 자동 재시작
  });
}

function checkPixel() {
  if (!pixelProcess) initPixelProcess();
  const cmd = `Get-PixelColor ${autoHideConfig.x} ${autoHideConfig.y}\n`;
  pixelProcess.stdin.write(cmd);
}

let autoHideRunning = false;
let autoHideTimer = null;

function scheduleNextCheck() {
  if (!autoHideConfig.enabled || !autoHideRunning) return;
  autoHideTimer = setTimeout(async () => {
    await checkPixel();
    scheduleNextCheck();
  }, autoHideConfig.interval || 500);
}

function startAutoHide() {
  if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  autoHideRunning = true;
  scheduleNextCheck();
}

function stopAutoHide(forceShow = true) {
  autoHideRunning = false;
  if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  if (forceShow && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show();
  }
}

ipcMain.on('toggle-auto-hide', (event, config) => {
  writeLog(`toggle-auto-hide received: enabled=${config.enabled} x=${config.x} y=${config.y} color=${config.targetColor}`);
  autoHideConfig = { ...autoHideConfig, ...config };
  if (autoHideConfig.enabled) startAutoHide(); else stopAutoHide();
});

ipcMain.on('update-toggle-hotkey', (event, newHotkey) => {
  console.log('Updating toggle hotkey to:', newHotkey);
  registerToggleHotkey(newHotkey);
});

ipcMain.on('snap-pixel-color', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  try {
    // 캡처 전 창 숨기기 (HUD가 캡처에 찍히지 않도록)
    win.hide();
    await new Promise(resolve => setTimeout(resolve, 150));

    const point = screen.getCursorScreenPoint();
    const targetDisplay = screen.getDisplayNearestPoint(point);
    const scaleFactor = targetDisplay.scaleFactor;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.floor(targetDisplay.size.width * scaleFactor),
        height: Math.floor(targetDisplay.size.height * scaleFactor)
      }
    });

    const source = sources.find(s =>
      (s.display_id && s.display_id.toString() === targetDisplay.id.toString()) ||
      (s.id && s.id.includes(targetDisplay.id.toString()))
    ) || sources[0];

    if (source) {
      const localX = point.x - targetDisplay.bounds.x;
      const localY = point.y - targetDisplay.bounds.y;
      const scaledX = Math.floor(localX * scaleFactor);
      const scaledY = Math.floor(localY * scaleFactor);

      const sampleSize = 3;
      const offset = Math.floor(sampleSize / 2);
      const pixelImg = source.thumbnail.crop({
        x: Math.max(0, scaledX - offset),
        y: Math.max(0, scaledY - offset),
        width: sampleSize,
        height: sampleSize
      });
      const bitmap = pixelImg.toBitmap();

      if (bitmap.length >= 12) {
        let rSum = 0, gSum = 0, bSum = 0, pc = 0;
        for (let i = 0; i < bitmap.length; i += 4) {
          bSum += bitmap[i]; gSum += bitmap[i + 1]; rSum += bitmap[i + 2]; pc++;
        }
        const r = Math.floor(rSum / pc), g = Math.floor(gSum / pc), b = Math.floor(bSum / pc);
        const hexColor = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        console.log(`[Calibration] Captured at (${point.x}, ${point.y}) => ${hexColor}`);

        win.show();
        win.webContents.send('calibration-complete', { x: point.x, y: point.y, color: hexColor });
        return;
      }
    }
    win.show();
    win.webContents.send('calibration-failed', 'No pixel data captured');
  } catch (err) {
    console.error("[Calibration] Snap Error:", err);
    if (win && !win.isDestroyed()) win.show();
    win.webContents.send('calibration-failed', err.message);
  }
});

ipcMain.on('quit-app', () => { app.quit(); });

// --- File-based Guide Management ---

// Save Guide Dialog & Writing
ipcMain.handle('save-guide-dialog', async (event, guideData) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: '가이드 파일 저장',
    defaultPath: `guide_${guideData.meta.title || 'new'}.json`,
    filters: [
      { name: 'JSON 가이드 파일', extensions: ['json'] },
      { name: '모든 파일', extensions: ['*'] }
    ]
  });

  if (canceled || !filePath) return null;

  try {
    fs.writeFileSync(filePath, JSON.stringify(guideData, null, 2), 'utf8');
    return filePath;
  } catch (err) {
    console.error('Failed to save file:', err);
    throw err;
  }
});

// Open Guide Dialog & Reading
ipcMain.handle('open-guide-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: '가이드 파일 열기',
    properties: ['openFile'],
    filters: [
      { name: 'JSON 가이드 파일', extensions: ['json'] },
      { name: '모든 파일', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) return null;

  try {
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return { filePath, data: parsed };
  } catch (err) {
    console.error('Failed to open file:', err);
    throw err;
  }
});

// Direct Read Guide from Path
ipcMain.handle('read-guide-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.log('File does not exist:', filePath);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Failed to read file:', err);
    return null;
  }
});

// Direct Save to Path
ipcMain.handle('save-guide-to-path', async (event, { filePath, guideData }) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(guideData, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save to path:', err);
    throw err;
  }
});

// Direct Save (Alias or unified version)
ipcMain.handle('save-guide-direct', async (event, filePath, guideData) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(guideData, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save direct:', err);
    throw err;
  }
});

// Check File Existence
ipcMain.handle('check-file-exists', async (event, filePath) => {
  return fs.existsSync(filePath);
});

// Get App Version
ipcMain.handle('get-app-version', () => APP_VERSION);

// Check for Update via GitHub Releases API
ipcMain.handle('check-update', async () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': 'D2R-HUD-App' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = release.tag_name.replace(/^v/, '');
          const hasUpdate = latestVersion !== APP_VERSION;
          const zipAsset = release.assets?.find(a => a.name.endsWith('.zip'));
          const exeAsset = release.assets?.find(a => a.name.endsWith('.exe'));
          const asset = zipAsset || exeAsset;
          resolve({
            hasUpdate,
            currentVersion: APP_VERSION,
            latestVersion,
            releaseNotes: release.body || '',
            downloadUrl: asset?.browser_download_url || null,
            releaseName: release.name || `v${latestVersion}`
          });
        } catch (e) {
          reject(new Error('버전 정보를 파싱할 수 없습니다.'));
        }
      });
    }).on('error', () => reject(new Error('GitHub에 연결할 수 없습니다.')));
  });
});

// Download & Install Update
ipcMain.handle('download-and-install-update', async (event, downloadUrl) => {
  const tempPath = path.join(os.tmpdir(), 'D2R-HUD-Update.exe');

  // 삭제 시도 강화
  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch (e) {
    console.error('Failed to delete old temp file:', e);
  }

  const doDownload = (url) => new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'D2R-HUD-App' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        doDownload(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`다운로드 실패 (상태 코드: ${res.statusCode})`));
        return;
      }

      const total = parseInt(res.headers['content-length'] || '0');
      let downloaded = 0;
      const file = fs.createWriteStream(tempPath);

      res.on('data', chunk => {
        downloaded += chunk.length;
        file.write(chunk);
        if (total > 0) {
          const percent = Math.round(downloaded / total * 100);
          event.sender.send('update-download-progress', {
            percent,
            downloaded,
            total
          });
        }
      });

      res.on('end', () => {
        file.end();
        resolve(tempPath);
      });

      res.on('error', (err) => {
        file.end();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });

  try {
    await doDownload(downloadUrl);
    event.sender.send('update-download-progress', { percent: 100, status: 'completed' });

    // 실행 프로그램 열기
    setTimeout(() => {
      shell.openPath(tempPath).then(err => {
        if (err) {
          console.error('Failed to open update file:', err);
          event.sender.send('update-download-progress', { status: 'error', message: '설치 파일을 실행할 수 없습니다.' });
        } else {
          // 설치 프로그램이 실행되면 앱 종료 (선택 사항)
          // app.quit();
        }
      });
    }, 500);

    return { success: true };
  } catch (err) {
    console.error('Download error:', err);
    event.sender.send('update-download-progress', { percent: 0, status: 'error', message: err.message });
    throw err;
  }
});

app.whenReady().then(() => {
  initPixelProcess(); // Fast pixel checker 초기화
  createWindow();
  registerToggleHotkey(currentToggleHotkey); // 초기 등록
  globalShortcut.register('Control+F8', () => { if (mainWindow) mainWindow.webContents.send('cycle-monitor'); });
  globalShortcut.register('Control+F9', () => { if (mainWindow) mainWindow.webContents.send('snap-to-corner', 'top-left'); });
  globalShortcut.register('Control+F10', () => { if (mainWindow) mainWindow.webContents.send('snap-to-corner', 'top-right'); });
  globalShortcut.register('Control+F11', () => { if (mainWindow) mainWindow.webContents.send('snap-to-corner', 'bottom-left'); });
  globalShortcut.register('Control+F12', () => { if (mainWindow) mainWindow.webContents.send('snap-to-corner', 'bottom-right'); });
  globalShortcut.register('Control+Right', () => { if (mainWindow) mainWindow.webContents.send('next-step'); });
  globalShortcut.register('Control+Left', () => { if (mainWindow) mainWindow.webContents.send('prev-step'); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// --- Cleanup on Exit ---
app.on('will-quit', () => {
  if (pixelProcess) {
    pixelProcess.kill();
    pixelProcess = null;
    console.log('Persistent pixel process terminated.');
  }
  globalShortcut.unregisterAll();
});

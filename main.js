const { app, BrowserWindow, Notification, Tray, Menu, ipcMain, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const schedule = require('node-schedule');
const fs = require('fs');

let mainWindow;
let tray = null;
let scheduledJobs = [];

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false // Don't show until ready
    });

    mainWindow.loadFile('index.html');

    // Show when ready to prevent flashing
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Fallback: show window after timeout if ready-to-show doesn't fire
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            console.log('Fallback: showing window after timeout');
            mainWindow.show();
        }
    }, 3000);

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();

            // Show notification that app is still running
            if (Notification.isSupported()) {
                new Notification({
                    title: 'Wellness Tracker',
                    body: 'Running in background. Click the tray icon to open.',
                    silent: true
                }).show();
            }
        }
        return false;
    });
}

function createTray() {
    // Use the icon.png file
    const iconPath = path.join(__dirname, 'icon.png');
    let trayIcon = nativeImage.createFromPath(iconPath);

    // Resize for tray (16x16 is standard tray icon size)
    trayIcon = trayIcon.resize({ width: 16, height: 16 });

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Wellness Tracker',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            }
        },
        { type: 'separator' },
        {
            label: 'Quick Check-In',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send('open-checkin');
            }
        },
        { type: 'separator' },
        {
            label: 'Test Notification',
            click: () => {
                showNotification('Test Notification', 'Notifications are working!');
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Wellness Tracker');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

// Create a bright icon programmatically
function createSimpleIcon() {
    // 16x16 PNG with bright lime green color (highly visible)
    const size = 16;
    const channels = 4; // RGBA
    const buffer = Buffer.alloc(size * size * channels);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * channels;
            // Create a circle
            const centerX = size / 2;
            const centerY = size / 2;
            const radius = size / 2 - 1;
            const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

            if (distance <= radius) {
                buffer[idx] = 0;       // R
                buffer[idx + 1] = 255; // G (bright green)
                buffer[idx + 2] = 128; // B
                buffer[idx + 3] = 255; // A
            } else {
                buffer[idx + 3] = 0; // Transparent
            }
        }
    }

    return buffer;
}

function showNotification(title, body) {
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: title,
            body: body,
            icon: path.join(__dirname, 'icon.png'),
            urgency: 'critical',
            timeoutType: 'never', // Keep notification until user dismisses
            silent: false // Play sound!
        });

        notification.on('click', () => {
            mainWindow.show();
            mainWindow.focus();
        });

        notification.show();
    }
}

// Setup medication reminders using node-schedule (works reliably in background)
function setupReminders(medications, checkinReminder) {
    // Clear existing jobs
    scheduledJobs.forEach(job => job.cancel());
    scheduledJobs = [];

    console.log('Setting up reminders for', medications.length, 'medications');

    medications.forEach(med => {
        if (!med.reminderEnabled || !med.time) return;

        const [hours, minutes] = med.time.split(':').map(Number);

        if (med.schedule === 'daily') {
            // Daily reminder
            const job = schedule.scheduleJob({ hour: hours, minute: minutes }, () => {
                console.log(`Reminder triggered for ${med.name} at ${new Date().toLocaleTimeString()}`);
                showNotification(
                    `Time for ${med.name}!`,
                    `Don't forget to take your ${med.name}`
                );
            });
            if (job) scheduledJobs.push(job);
            console.log(`Scheduled daily reminder for ${med.name} at ${med.time}`);
        } else if (med.schedule === 'every-other-day') {
            // Every-other-day reminder — schedule daily but check the date before firing
            const eodStartDate = med.eodStartDate || new Date().toISOString().slice(0, 10);
            const job = schedule.scheduleJob({ hour: hours, minute: minutes }, () => {
                const start = new Date(eodStartDate + 'T12:00:00');
                const today = new Date();
                today.setHours(12, 0, 0, 0);
                const daysDiff = Math.round((today - start) / (1000 * 60 * 60 * 24));
                if (daysDiff % 2 === 0) {
                    console.log(`EOD reminder triggered for ${med.name} (day ${daysDiff}) at ${new Date().toLocaleTimeString()}`);
                    showNotification(
                        `Time for ${med.name}!`,
                        `Every-other-day dose — don't forget your ${med.name}`
                    );
                } else {
                    console.log(`EOD skip for ${med.name} (day ${daysDiff} — not a dose day)`);
                }
            });
            if (job) scheduledJobs.push(job);
            console.log(`Scheduled every-other-day reminder for ${med.name} at ${med.time} (start: ${eodStartDate})`);
        } else if (med.schedule === 'weekly' && med.days && med.days.length > 0) {
            // Weekly reminder on specific days
            med.days.forEach(day => {
                const job = schedule.scheduleJob({ hour: hours, minute: minutes, dayOfWeek: day }, () => {
                    console.log(`Reminder triggered for ${med.name} at ${new Date().toLocaleTimeString()}`);
                    showNotification(
                        `Time for ${med.name}!`,
                        `It's ${getDayName(day)} - time for your ${med.name}`
                    );
                });
                if (job) scheduledJobs.push(job);
                console.log(`Scheduled weekly reminder for ${med.name} on day ${day} at ${med.time}`);
            });
        }
    });

    // Morning check-in reminder
    if (checkinReminder && checkinReminder.enabled && checkinReminder.time) {
        const [hours, minutes] = checkinReminder.time.split(':').map(Number);
        const job = schedule.scheduleJob({ hour: hours, minute: minutes }, () => {
            console.log(`Morning check-in reminder triggered at ${new Date().toLocaleTimeString()}`);
            showNotification(
                'Morning Check-In Time!',
                'How are you feeling today? Log your motivation, energy, and track your progress.'
            );
        });
        if (job) scheduledJobs.push(job);
        console.log(`Scheduled morning check-in at ${checkinReminder.time}`);
    }

    console.log(`Total scheduled jobs: ${scheduledJobs.length}`);
}

function getDayName(dayNum) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNum];
}

// IPC handlers for communication with renderer
ipcMain.on('setup-reminders', (event, data) => {
    console.log('Received reminder setup request');
    setupReminders(data.medications, data.checkinReminder);
});

ipcMain.on('show-notification', (event, data) => {
    showNotification(data.title, data.body);
});

ipcMain.handle('get-scheduled-jobs', () => {
    return scheduledJobs.map(job => ({
        nextInvocation: job.nextInvocation()?.toISOString()
    }));
});

// Auto-backup handler
ipcMain.handle('save-auto-backup', (event, data) => {
    try {
        const backupPath = path.join(__dirname, 'wellness-tracker-auto-backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
        console.log(`Auto-backup saved to ${backupPath}`);
        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Auto-backup failed:', error);
        return { success: false, error: error.message };
    }
});

// Request backup from renderer
function requestAutoBackup() {
    if (mainWindow && mainWindow.webContents) {
        console.log('Requesting auto-backup from renderer...');
        mainWindow.webContents.send('request-auto-backup');
    }
}

// Schedule daily auto-backup at 11:55 PM
let autoBackupJob = null;
function setupAutoBackup() {
    if (autoBackupJob) autoBackupJob.cancel();
    autoBackupJob = schedule.scheduleJob({ hour: 23, minute: 55 }, () => {
        console.log('Triggering daily auto-backup...');
        requestAutoBackup();
    });
    console.log('Auto-backup scheduled for 11:55 PM daily');
}

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    createTray();
    setupAutoBackup();

    // Listen for system resume (wake from sleep/hibernate)
    powerMonitor.on('resume', () => {
        console.log('System resumed from sleep - notifying renderer to check date');
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('system-resumed');
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Don't quit on macOS
    if (process.platform !== 'darwin') {
        // Actually, we want to keep running in tray, so don't quit
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
});

// Auto-start on login
const isPackaged = app.isPackaged;
if (isPackaged) {
    // Production: use the packaged exe directly
    app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath('exe')
    });
} else {
    // Development (running from a checkout via `npx electron .`): do NOT self-register.
    // Every dev copy wrote the SAME registry value ("electron.app.Electron"), so whichever
    // copy launched last hijacked startup — on 2026-09-30 that left a stale, unsynced
    // checkout opening at login instead of the maintained one. Open-at-login for a checkout
    // is handled by the Startup-folder shortcut that update-shortcut.ps1 creates, which
    // always points at the folder it was run from. Clearing the setting here also removes
    // any leftover self-registered entry the next time the app runs.
    app.setLoginItemSettings({ openAtLogin: false });
}

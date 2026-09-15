const {app, BrowserWindow} = require('electron');
const path = require('path');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

function createWindow () {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 640,
        title: 'Sokbanawarp - Collaborative TurboWarp',
        icon: path.join(__dirname, 'static', 'favicon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // Allow WebRTC for P2P collaboration
            webSecurity: true
        },
        backgroundColor: '#1e1e2e',
        show: false
    });

    // Load the built web app
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Remove the default menu bar
    mainWindow.setMenuBarVisibility(false);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const path = require('path')
const dns = require('./modules/dns2');
const cfresolve = require('./modules/cloudflare');
const { count } = require('console');
const { Packet, Client: udpResolve } = dns;
const FindProxyForURL = require('./modules/gfwlist');
var LRU = require("lru-cache")
    , options = {
        max: 2500
        , length: function (n, key) { return 1 }
        , maxAge: 1000 * 60 * 60
    }
    , cache = new LRU(options)

const queryType = ["A", "NS", "MD", "MF", "CNAME", "SOA", "MB", "MG", "MR", "NULL", "WKS", "PTR", "HINFO", "MINFO", "MX", "TXT", "AAAA", "SRV", "EDNS", "SPF", "AXFR", "MAILB", "MAILA", "ANY", "CAA"];
var server;
var dnsCount = 0;
var gfwStatus = 0;
Menu.setApplicationMenu(null);

function createMainWindow() {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 900,
        height: 600,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
        }
    })

    // and load the index.html of the app.
    mainWindow.loadFile('./resource/html/index.html')

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()
}

function createHelpWindow() {
    // Create the browser window.
    const helpWindow = new BrowserWindow({
        width: 900,
        height: 600,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
        }
    })

    // and load the index.html of the app.
    helpWindow.loadFile('./resource/html/help.html')

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    createMainWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.on('openHelpWindow', (event, arg) => {
    createHelpWindow()
})

function initDNSServer() {
    server = dns.createServer((request, send, rinfo) => {
        const response = Packet.createResponseFromRequest(request);
        const [question] = request.questions;
        const { name, type } = question;
        const cls = question.class;
        (async () => {
            if (cache.has(name + queryType[type - 1] + cls)) {
                var cacheResponse = cache.get(name + queryType[type - 1] + cls);
                cacheResponse.header.id = request.header.id;
                send(cacheResponse);
            } else if (name == 'cloudflare-dns.com') {
                const cfServer = await udpResolve({ dns: '1.1.1.1' })('cloudflare-dns.com', 'A', cls);
                cfServer.answers.forEach(element => {
                    response.answers.push(element);
                });
                cfServer.authorities.forEach(element => {
                    response.authorities.push(element);
                });
                cfServer.additionals.forEach(element => {
                    response.additionals.push(element);
                });
                cache.set(name + queryType[type - 1] + cls, response)
                send(response);
            } else {
                const cfRes = await cfresolve(name, queryType[type - 1]);
                if (cfRes.Answer) {
                    cfRes.Answer.forEach(element => {
                        element.address = element.data;
                        element.class = cls;
                        response.answers.push(element);
                    });
                }
                if (cfRes.Authority) {
                    cfRes.Authority.forEach(element => {
                        element.ns = element.name;
                        element.class = cls;
                        response.authorities.push(element);
                    });
                }
                cache.set(name + queryType[type - 1] + cls, response)
                send(response);
            }
        })();
        dnsCount += 1;
    });
    server.on('request', (request, response, rinfo) => {
        console.log(request.header.id, request.questions[0]);
    });
}

function initGFWDNSServer() {
    server = dns.createServer((request, send, rinfo) => {
        const response = Packet.createResponseFromRequest(request);
        const [question] = request.questions;
        const { name, type } = question;
        const cls = question.class;
        (async () => {
            if (cache.has(name + queryType[type - 1] + cls)) {
                var cacheResponse = cache.get(name + queryType[type - 1] + cls);
                cacheResponse.header.id = request.header.id;
                send(cacheResponse);
            } else if (name == 'cloudflare-dns.com' || FindProxyForURL('', name) == 'DIRECT') {
                const cfRes = await udpResolve({ dns: '223.5.5.5' })(name, queryType[type - 1], cls);
                cfRes.answers.forEach(element => {
                    response.answers.push(element);
                });
                cfRes.authorities.forEach(element => {
                    response.authorities.push(element);
                });
                cfRes.additionals.forEach(element => {
                    response.additionals.push(element);
                });
                cache.set(name + queryType[type - 1] + cls, response)
                send(response);
            } else {
                const cfRes = await cfresolve(name, queryType[type - 1]);
                if (cfRes.Answer) {
                    cfRes.Answer.forEach(element => {
                        element.address = element.data;
                        element.class = cls;
                        response.answers.push(element);
                    });
                }
                if (cfRes.Authority) {
                    cfRes.Authority.forEach(element => {
                        element.ns = element.name;
                        element.class = cls;
                        response.authorities.push(element);
                    });
                }
                cache.set(name + queryType[type - 1] + cls, response)
                send(response);
            }
        })();
        dnsCount += 1;
    });
    server.on('request', (request, response, rinfo) => {
        console.log(request.header.id, request.questions[0]);
    });
}

ipcMain.on('switchDNSNow', (event, arg) => {
    if(!gfwStatus){
        if (arg) {
            initDNSServer();
            server.listen(53);
            event.reply('statusChange', 1);
        } else {
            server.close();
            event.reply('statusChange', 0);
        }
    } else {
        if (arg) {
            initGFWDNSServer();
            server.listen(53);
            event.reply('statusChange', 1);
        } else {
            server.close();
            event.reply('statusChange', 0);
        }
    }
})

ipcMain.on('getDNSCount', (event, arg) => {
    event.returnValue = dnsCount;
})

ipcMain.on('getCacheCount', (event, arg) => {
    event.returnValue = cache.length;
})

ipcMain.on('changeGFWMode', (event, arg) => {
    gfwStatus = ~gfwStatus;
})

ipcMain.on('cleanCache', (event, arg) => {
    cache.reset();
})
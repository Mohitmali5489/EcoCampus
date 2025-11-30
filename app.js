import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, toggleSidebar, showPage, logUserActivity, debounce } from './utils.js';
import { loadDashboardData, renderDashboard, setupFileUploads, loadHistoryData } from './dashboard.js';
import { loadStoreAndProductData, loadUserRewardsData, renderRewards } from './store.js';
import { loadLeaderboardData } from './social.js';
import { loadChallengesData } from './challenges.js';
import { loadEventsData } from './events.js'; 
import { loadGalleryData } from './gallery.js'; 
import { loadPlasticLogData } from './plastic-log.js'; // <--- NEW IMPORT

// Auth
const checkAuth = async () => {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) { 
            console.error('Auth Check: Session Error:', error.message); 
            redirectToLogin(); 
            return; 
        }
        if (!session) { 
            console.warn('Auth Check: No active session found. Redirecting to login.'); 
            redirectToLogin(); 
            return; 
        }
        state.userAuth = session.user;
        await initializeApp();
    } catch (err) { 
        console.error('CRITICAL: Auth check failed unexpectedly:', err); 
    }
};

const initializeApp = async () => {
    try {
        console.log('Init: Fetching user profile...');
        const { data: userProfile, error } = await supabase.from('users').select('*').eq('auth_user_id', state.userAuth.id).single();
        
        if (error) {
            console.error('Init: Failed to fetch user profile:', error.message);
            alert('Could not load profile. Logging out.'); 
            await handleLogout(); 
            return; 
        }
        if (!userProfile) {
            console.error('Init: User profile is null despite valid session.');
            alert('Profile not found. Logging out.');
            await handleLogout();
            return;
        }
        
        state.currentUser = userProfile;
        logUserActivity('login', 'User logged in');

        // Initialize History State
        history.replaceState({ pageId: 'dashboard' }, '', '#dashboard');

        // Initial Dashboard Load (Robust)
        try {
            await loadDashboardData();
            renderDashboard(); 
        } catch (dashErr) {
            console.error("Init: Dashboard data load failed (non-fatal):", dashErr);
        }
        
        setTimeout(() => document.getElementById('app-loading').classList.add('loaded'), 500);
        if(window.lucide) window.lucide.createIcons();
        
        // Parallel Data Load with individual error tracking
        console.log('Init: Starting parallel data fetch...');
        const results = await Promise.allSettled([
            loadStoreAndProductData(),
            loadLeaderboardData(),
            loadHistoryData(),
            loadChallengesData(),
            loadEventsData(),
            loadUserRewardsData(),
            loadGalleryData(),
            loadPlasticLogData() // <--- NEW: Load Plastic Log Data
        ]);

        // Log failures for specific modules
        const moduleNames = ['Store', 'Leaderboard', 'History', 'Challenges', 'Events', 'Rewards', 'Gallery', 'PlasticLog'];
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Init: Module '${moduleNames[index]}' failed to load:`, result.reason);
            }
        });
        
        setupFileUploads();
        setupRealtimeSubscriptions(); 

    } catch (err) { 
        console.error('CRITICAL: App initialization crashed:', err); 
    }
};

// --- REALTIME SUBSCRIPTIONS ---
const setupRealtimeSubscriptions = () => {
    try {
        // 1. User Profile Updates
        const userSub = supabase
            .channel('public:users')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${state.currentUser.id}` }, (payload) => {
                console.log('Realtime: User profile updated:', payload);
                state.currentUser = { ...state.currentUser, ...payload.new };
                renderDashboard(); 
            })
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') console.log('Realtime: Subscribed to user updates');
                if (status === 'CHANNEL_ERROR') console.error('Realtime: User subscription error:', err);
            });
        state.activeSubscriptions.push(userSub);

        // 2. Order Updates
        const ordersSub = supabase
            .channel('public:orders')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `user_id=eq.${state.currentUser.id}` }, () => {
                 console.log('Realtime: Order status updated');
                 loadUserRewardsData(); 
                 refreshUserData(); 
            })
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') console.log('Realtime: Subscribed to order updates');
                if (status === 'CHANNEL_ERROR') console.error('Realtime: Order subscription error:', err);
            });
        state.activeSubscriptions.push(ordersSub);
    } catch (err) {
        console.error('Realtime: Failed to setup subscriptions:', err);
    }
};

const handleLogout = async () => {
    try {
        console.log('Logout: Initiating logout sequence...');
        logUserActivity('logout', 'User logged out');
        
        state.activeSubscriptions.forEach(sub => {
            try { supabase.removeChannel(sub); } catch(e) { console.warn('Logout: Failed to remove channel', e); }
        });
        state.activeSubscriptions = [];

        const { error } = await supabase.auth.signOut();
        if (error) console.error('Logout: Supabase signOut error:', error.message);
        
        redirectToLogin();
    } catch (err) { 
        console.error('Logout: Critical error during logout:', err); 
    }
};

const redirectToLogin = () => { window.location.replace('login.html'); };

export const refreshUserData = async () => {
    try {
        const { data: userProfile, error } = await supabase.from('users').select('*').eq('id', state.currentUser.id).single();
        if (error) {
            console.error('RefreshData: Failed to fetch user:', error.message);
            return;
        }
        if (!userProfile) {
            console.warn('RefreshData: User profile missing.');
            return;
        }
        
        const existingState = {
            isCheckedInToday: state.currentUser.isCheckedInToday,
            checkInStreak: state.currentUser.checkInStreak,
            impact: state.currentUser.impact
        };

        state.currentUser = { ...userProfile, ...existingState };

        const header = document.getElementById('user-points-header');
        if(header) {
            header.classList.add('points-pulse'); 
            header.textContent = userProfile.current_points;
        }
        
        const sidebarPoints = document.getElementById('user-points-sidebar');
        if(sidebarPoints) sidebarPoints.textContent = userProfile.current_points;
        
        setTimeout(() => header?.classList.remove('points-pulse'), 400);
        renderDashboard();
    } catch (err) { 
        console.error('RefreshData: Unexpected error:', err); 
    }
};

// Event Listeners
if(els.storeSearch) {
    els.storeSearch.addEventListener('input', debounce(() => {
        renderRewards();
    }, 300));
}
if(els.storeSearchClear) els.storeSearchClear.addEventListener('click', () => { els.storeSearch.value = ''; renderRewards(); });
if(els.sortBy) els.sortBy.addEventListener('change', renderRewards);

document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => toggleSidebar());
document.getElementById('logout-button')?.addEventListener('click', handleLogout);

// Theme Logic
const themeBtn = document.getElementById('theme-toggle-btn');
const themeText = document.getElementById('theme-text');
const themeIcon = document.getElementById('theme-icon');

const applyTheme = (isDark) => {
    try {
        document.documentElement.classList.toggle('dark', isDark);
        if(themeText) themeText.textContent = isDark ? 'Dark Mode' : 'Light Mode';
        if(themeIcon) themeIcon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
        if(window.lucide) window.lucide.createIcons();
    } catch (e) { console.error('Theme: Apply failed', e); }
};

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('eco-theme', isDark ? 'dark' : 'light');
        applyTheme(isDark);
        logUserActivity('theme_change', `Switched to ${isDark ? 'dark' : 'light'} mode`);
    });
}

const savedTheme = localStorage.getItem('eco-theme');
applyTheme(savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches));

// --- FORM LOGIC ---

const changePwdForm = document.getElementById('change-password-form');
if (changePwdForm) {
    changePwdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const passwordInput = document.getElementById('new-password');
        const newPassword = passwordInput.value;
        const msgEl = document.getElementById('password-message');
        const btn = document.getElementById('change-password-button');

        if (newPassword.length < 6) {
             msgEl.textContent = 'Password must be at least 6 characters.';
             msgEl.className = 'text-sm text-center text-red-500 font-bold';
             return;
        }

        btn.disabled = true;
        btn.textContent = 'Updating...';
        msgEl.textContent = '';

        try {
            const { data, error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            msgEl.textContent = 'Password updated successfully!';
            msgEl.className = 'text-sm text-center text-green-600 font-bold';
            passwordInput.value = ''; 
            logUserActivity('password_change', 'User changed password');

        } catch (err) {
            console.error('Password Change: API Error:', err);
            msgEl.textContent = err.message || 'Failed to update password.';
            msgEl.className = 'text-sm text-center text-red-500 font-bold';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Update Password';
            setTimeout(() => { if (msgEl.textContent.includes('success')) msgEl.textContent = ''; }, 3000);
        }
    });
}

const redeemForm = document.getElementById('redeem-code-form');
if (redeemForm) {
    redeemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const codeInput = document.getElementById('redeem-input');
        const code = codeInput.value.trim();
        const msgEl = document.getElementById('redeem-message');
        const btn = document.getElementById('redeem-submit-btn');
        
        btn.disabled = true; 
        btn.innerText = 'Verifying...'; 
        msgEl.textContent = '';
        msgEl.className = 'text-sm text-center h-5'; 

        try {
            const { data, error } = await supabase.rpc('redeem_coupon', { p_code: code });
            
            if (error) throw error;
            
            msgEl.textContent = `Success! You earned ${data.points_awarded} points.`; 
            msgEl.classList.add('text-green-600', 'font-bold');
            codeInput.value = ''; 
            
            logUserActivity('redeem_code_success', `Redeemed code: ${code}`);
            await refreshUserData(); 
            
        } catch (err) { 
            console.error("Redeem Code: RPC Error:", err);
            msgEl.textContent = err.message || "Invalid or expired code."; 
            msgEl.classList.add('text-red-500', 'font-bold'); 
            logUserActivity('redeem_code_fail', `Failed to redeem code: ${code}`);
        } finally { 
            btn.disabled = false; 
            btn.innerText = 'Redeem Points';
            setTimeout(() => { 
                msgEl.textContent = ''; 
                msgEl.classList.remove('text-red-500', 'text-green-600', 'font-bold'); 
            }, 4000); 
        }
    });
}

window.handleLogout = handleLogout;

// Start
checkAuth();

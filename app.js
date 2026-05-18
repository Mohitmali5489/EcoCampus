/**
 * EcoCampus - Main Application Logic (app.js)
 * Final Version: Standard Dashboard State + Valentine's Auto-Trigger + AdMob
 */

import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, toggleSidebar, showPage, logUserActivity, debounce, showToast, applyValentineTheme } from './utils.js';
import { loadDashboardData, renderDashboard, setupFileUploads } from './dashboard.js';
import { loadEventsData } from './events.js'; 

// --- AUTHENTICATION CHECK & STARTUP ---

/**
 * Checks for a valid Supabase session on startup.
 * Redirects to login if session is missing or invalid.
 */
const checkAuth = async () => {
    try {
        // 1. APPLY THEME IMMEDIATELY (Fix for White Background)
        applyValentineTheme();

        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) { 
            console.error('Auth Check: Session Error:', error.message); 
            showToast('Authentication error. Please log in again.', 'error');
            redirectToLogin(); 
            return; 
        }

        if (!session) { 
            console.warn('Auth Check: No active session found.');
            redirectToLogin(); 
            return; 
        }

        // Store auth user and begin app initialization
        state.userAuth = session.user;
        await initializeApp();
    } catch (err) { 
        console.error('CRITICAL: Auth check failed unexpectedly:', err); 
        showToast('System error. Please refresh the page.', 'error');
        // Emergency loader removal
        const loader = document.getElementById('app-loading');
        if(loader) loader.style.display = 'none';
    }
};

/**
 * Fetches the specific user profile from the database and initializes UI modules.
 */
const initializeApp = async () => {
    try {
        console.log('Init: Fetching user profile...');
        
        // Console Art
        console.log("%c🌿 EcoCampus Loaded.", "color: #fbbf24; font-size: 16px; font-weight: bold; background: #064e3b; padding: 5px; border-radius: 5px;");

        // Fetch specific columns to optimize bandwidth
        const { data: userProfile, error } = await supabase
            .from('users')
            .select('id, full_name, student_id, course, current_points, lifetime_points, profile_img_url, tick_type')
            .eq('auth_user_id', state.userAuth.id)
            .single();
        
        if (error) {
            console.error('Init: Failed to fetch user profile:', error.message);
            showToast('Could not load profile. Logging out.', 'error');
            await handleLogout(); 
            return; 
        }

        if (!userProfile) {
            showToast('Profile not found. Please contact support.', 'error');
            await handleLogout();
            return;
        }
        
        state.currentUser = userProfile;
        
        // Log login activity only once per session
        if (!sessionStorage.getItem('login_logged')) {
            logUserActivity('login', 'User logged in');
            sessionStorage.setItem('login_logged', '1');
            
            showToast(`Welcome back, ${userProfile.full_name}!`, 'success');
        }

        // Set initial navigation state
        history.replaceState({ pageId: 'dashboard' }, '', '#dashboard');

        // --- LOAD DATA ---
        try {
            // 1. Load Dashboard Data (Check-ins, Stats)
            if (!state.dashboardLoaded) {
                await loadDashboardData();
                state.dashboardLoaded = true;
            }
            renderDashboard();

            // 2. Load Events Data (Background Fetch)
            loadEventsData().then(() => {
                console.log("Init: Events loaded.");
            });

        } catch (dashErr) {
            console.error("Init: Data load failed:", dashErr);
            showToast('Partial data load failure.', 'warning');
        }
        
        setupFileUploads();

    } catch (err) { 
        console.error('CRITICAL: App initialization crashed:', err);
        showToast('App failed to initialize.', 'error');
    } finally {
        // --- LOADER FAIL-SAFE REMOVAL ---
        // This runs regardless of errors to ensure user isn't stuck on white screen
        setTimeout(() => {
            const loader = document.getElementById('app-loading');
            if (loader) {
                loader.classList.add('loaded'); // Try CSS transition
                // FORCE REMOVE via inline style after short delay
                setTimeout(() => { loader.style.display = 'none'; }, 300);
            }
        }, 500);

        // Initialize Lucide icons
        if(window.lucide) window.lucide.createIcons();
    }
};

/**
 * Handles the user logout sequence.
 */
const handleLogout = async () => {
    try {
        console.log('Logout: Initiating...');
        
        if (sessionStorage.getItem('login_logged')) {
            logUserActivity('logout', 'User logged out');
            sessionStorage.removeItem('login_logged');
        }
        
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Logout: Error:', error.message);
        
        redirectToLogin();
    } catch (err) { 
        console.error('Logout: Critical error:', err);
        redirectToLogin(); 
    }
};

const redirectToLogin = () => { window.location.replace('login.html'); };

/**
 * Refreshes user point balance and profile data from the database.
 */
export const refreshUserData = async () => {
    try {
        const { data: userProfile, error } = await supabase
            .from('users')
            .select('id, current_points, lifetime_points, profile_img_url, tick_type')
            .eq('id', state.currentUser.id)
            .single();

        if (error) {
            console.error('RefreshData: Error:', error.message);
            return;
        }
        
        if (!userProfile) return;
        
        state.currentUser = { ...state.currentUser, ...userProfile };

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

// --- EVENT LISTENERS & UI LOGIC ---

// Store Search with Debounce
if(els.storeSearch) {
    els.storeSearch.addEventListener('input', debounce(() => {
        if (state.storeLoaded && window.renderRewardsWrapper) window.renderRewardsWrapper();
    }, 300));
}

if(els.storeSearchClear) {
    els.storeSearchClear.addEventListener('click', () => { 
        els.storeSearch.value = ''; 
        if (state.storeLoaded && window.renderRewardsWrapper) window.renderRewardsWrapper(); 
    });
}

if(els.sortBy) {
    els.sortBy.addEventListener('change', () => {
        if (state.storeLoaded && window.renderRewardsWrapper) window.renderRewardsWrapper();
    });
}

document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => toggleSidebar());
document.getElementById('logout-button')?.addEventListener('click', handleLogout);

// --- THEME MANAGEMENT ---

const themeBtn = document.getElementById('theme-toggle-btn');
const themeText = document.getElementById('theme-text');
const themeIcon = document.getElementById('theme-icon');

const applyTheme = (isDark) => {
    try {
        document.documentElement.classList.toggle('dark', isDark);
        if(themeText) themeText.textContent = isDark ? 'Dark Mode' : 'Light Mode';
        if(themeIcon) themeIcon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
        if(window.lucide) window.lucide.createIcons();
    } catch (e) { console.error('Theme Apply Error:', e); }
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

// --- ACCOUNT SECURITY: CHANGE PASSWORD ---

const changePwdForm = document.getElementById('change-password-form');
if (changePwdForm) {
    changePwdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const passwordInput = document.getElementById('new-password');
        const newPassword = passwordInput.value;
        const btn = document.getElementById('change-password-button');

        if (newPassword.length < 6) {
             showToast('Password must be at least 6 characters.', 'error');
             return;
        }

        btn.disabled = true;
        btn.textContent = 'Updating...';

        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            const { error: tableError } = await supabase
                .from('users')
                .update({ password_plain: newPassword })
                .eq('id', state.currentUser.id);

            if (tableError) throw tableError;

            showToast('Password updated successfully!', 'success');
            passwordInput.value = ''; 
            logUserActivity('password_change', 'User changed password');

        } catch (err) {
            console.error('Password Change Error:', err);
            showToast(err.message || 'Failed to update password.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Update Password';
        }
    });
}

// --- BONUS POINTS: REDEEM CODE ---

const redeemForm = document.getElementById('redeem-code-form');
if (redeemForm) {
    redeemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const codeInput = document.getElementById('redeem-input');
        const code = codeInput.value.trim();
        const btn = document.getElementById('redeem-submit-btn');
        
        btn.disabled = true; 
        btn.innerText = 'Verifying...'; 

        try {
            const { data, error } = await supabase.rpc('redeem_coupon', { p_code: code });
            
            if (error) throw error;
            
            showToast(`Success! You earned ${data.points_awarded} points.`, 'success');
            codeInput.value = ''; 
            
            logUserActivity('redeem_code_success', `Redeemed code: ${code}`);
            await refreshUserData(); 
            
        } catch (err) { 
            console.error("Redeem Code Error:", err);
            showToast(err.message || "Invalid or expired code.", "error");
            logUserActivity('redeem_code_fail', `Failed to redeem code: ${code}`);
        } finally { 
            btn.disabled = false; 
            btn.innerText = 'Redeem Points';
        }
    });
}

// --- START APP ---
window.handleLogout = handleLogout;
checkAuth();

// --- CAPACITOR PLUGINS (UNITY ADS) ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check if running in a native Capacitor app with Unity Ads installed
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.UnityAds) {
        const UnityAds = window.Capacitor.Plugins.UnityAds;
        const App = window.Capacitor.Plugins.App;
        
        // 🚨 REPLACE THESE WITH THE IDs FROM YOUR UNITY DASHBOARD 🚨
        const GAME_ID = '1234567'; // Your 7-digit Android Game ID
        const AD_UNIT_ID = 'Interstitial_Android'; // Your Ad Unit / Placement ID

        try {
            // 1. Initialize Unity Ads
            await UnityAds.initialize({
                gameId: GAME_ID,
                testMode: true // IMPORTANT: Set this to false when you publish to the Play Store!
            });

            // 2. Helper function to safely load and show the ad
            const showUnityAd = async () => {
                try {
                    // Tell Unity to fetch an ad from the internet
                    await UnityAds.loadInterstitial({ placementId: AD_UNIT_ID });
                    
                    // Wait for the ad to finish downloading, checking every half-second
                    let attempts = 0;
                    const checkLoad = setInterval(async () => {
                        attempts++;
                        const { loaded } = await UnityAds.isInterstitialLoaded();
                        
                        if (loaded) {
                            clearInterval(checkLoad);
                            await UnityAds.showInterstitial(); // Show the ad!
                        } else if (attempts > 10) {
                            clearInterval(checkLoad); // Stop trying if it takes longer than 5 seconds
                        }
                    }, 500);
                } catch (err) {
                    console.log("Unity Ad Load Error:", err);
                }
            };

            // 3. Request the very first ad when the app opens
            showUnityAd();

            // 4. Listen for the app resuming from the background
            if (App) {
                App.addListener('appStateChange', (state) => {
                    // If the app becomes active again, show a new ad
                    if (state.isActive) {
                        showUnityAd();
                    }
                });
            }
        } catch (error) {
            console.error("Unity Ads Initialization Error:", error);
        }
    }
});

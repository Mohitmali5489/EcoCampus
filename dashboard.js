/**
 * EcoCampus - Dashboard Module (dashboard.js)
 * Updated: Valentine's "Eco-Romantic" Immersive Edition
 * Features: Randomized Particle Rain, Dynamic Theme Buttons, Quote Widget
 */

import { supabase } from './supabase-client.js';
import { state, VALENTINE_DAYS } from './state.js'; 
import { 
    els, 
    formatDate, 
    getIconForHistory, 
    getPlaceholderImage, 
    getTickImg, 
    getUserInitials, 
    getUserLevel, 
    uploadToCloudinary, 
    getTodayIST, 
    logUserActivity, 
    showToast,
    getValentineTheme,
    isLowDataMode
} from './utils.js';
import { refreshUserData } from './app.js';
import { loadLeaderboardData } from './social.js';

// --- DASHBOARD CORE DATA LOADING ---

export const loadDashboardData = async () => {
    // Optimization: One-Time Load Per Session unless forced refresh
    if (state.dashboardLoaded) {
        renderDashboard();
        return;
    }

    try {
        const userId = state.currentUser.id;
        const todayIST = getTodayIST(); 

        // Parallel fetching for speed
        const [
            { data: checkinData },
            { data: streakData },
            { data: impactData },
            { data: userData }
        ] = await Promise.all([
            supabase.from('daily_checkins').select('id').eq('user_id', userId).eq('checkin_date', todayIST).limit(1),
            supabase.from('user_streaks').select('current_streak, last_checkin_date').eq('user_id', userId).single(),
            supabase.from('user_impact').select('total_plastic_kg, co2_saved_kg, events_attended').eq('user_id', userId).maybeSingle(),
            supabase.from('users').select('is_volunteer').eq('id', userId).single()
        ]);
        
        // Update Global State
        state.currentUser.isCheckedInToday = (checkinData && checkinData.length > 0);
        state.currentUser.checkInStreak = streakData ? streakData.current_streak : 0;
        state.currentUser.lastCheckInDate = streakData ? streakData.last_checkin_date : null; 
        state.currentUser.impact = impactData || { total_plastic_kg: 0, co2_saved_kg: 0, events_attended: 0 };
        state.currentUser.is_volunteer = userData ? userData.is_volunteer : false;
        
        state.dashboardLoaded = true;

        renderDashboard();

    } catch (err) {
        console.error('Dashboard Data Error:', err);
        showToast('Failed to load dashboard data.', 'error');
    }
};

export const renderDashboard = () => {
    if (!state.currentUser) return; 
    renderDashboardUI();
    renderCheckinButtonState();
    renderValentineWidget(); // NEW: Check and render Valentine theme
    initAQI(); 
};

// --- VALENTINE'S THEME LOGIC (ECO-ROMANTIC UPDATE) ---

const renderValentineWidget = () => {
    const theme = getValentineTheme();
    const dashboardLeftCol = document.querySelector('#dashboard > div.grid > div:first-child');
    
    // Cleanup existing widget if any
    const existingWidget = document.getElementById('vday-hero-card');
    if (existingWidget) existingWidget.remove();
    
    // Cleanup visuals if theme expired
    if (!theme) {
        const visuals = document.getElementById('vday-visuals');
        const bgLayer = document.querySelector('.heart-bg-layer');
        if (visuals) visuals.remove();
        if (bgLayer) bgLayer.remove();
        return;
    }

    if (!dashboardLeftCol) return;

    const today = new Date().getDate();
    // Fallback to 14 if testing or out of range
    const config = VALENTINE_DAYS[today] || VALENTINE_DAYS[14]; 

    // 1. Render Hero Card with "Eco-Romantic" Style
    // Uses glow-card and glass-card-love for pink tint
    const card = document.createElement('div');
    card.id = 'vday-hero-card';
    card.className = "glass-card-love glow-card p-6 mb-6 relative overflow-hidden group animate-slideUp";
    
    // Dynamic content: Quote focused, no buttons
    // ADDED HEART ICON in the bottom right of the quote area
    card.innerHTML = `
        <div class="absolute -right-6 -top-6 opacity-20 transform rotate-12 group-hover:scale-110 transition-transform duration-1000">
            <i data-lucide="${config.icon}" class="w-40 h-40 ${config.color.split(' ')[0]}"></i>
        </div>
        
        <div class="relative z-10">
            <div class="flex items-center gap-2 mb-3">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-white/60 dark:bg-black/30 backdrop-blur-md border border-white/40 shadow-sm ${config.color} uppercase tracking-wider">
                    <i data-lucide="sparkles" class="w-3 h-3 mr-1"></i> ${config.title}
                </span>
            </div>

            <h3 class="text-xl font-bold ${config.color} mb-2 font-jakarta leading-tight">
                ${config.desc}
            </h3>

            <div class="mt-4 relative">
                <div class="absolute -left-2 -top-2 text-4xl opacity-20 ${config.color}">“</div>
                <div class="bg-white/40 dark:bg-black/20 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-inner">
                    <p class="text-lg md:text-xl text-gray-800 dark:text-gray-100 font-dancing text-center leading-relaxed glow-text">
                        ${config.quote}
                    </p>
                    
                    <div class="flex justify-center mt-3 gap-2">
                        <i data-lucide="leaf" class="w-5 h-5 text-green-600 dark:text-green-400"></i>
                        <i data-lucide="heart" class="w-5 h-5 text-red-500 fill-red-500 animate-pulse"></i>
                    </div>

                </div>
                <div class="absolute -right-1 -bottom-4 text-4xl opacity-20 ${config.color}">”</div>
            </div>
        </div>
    `;

    // Insert as first item
    dashboardLeftCol.prepend(card);
    
    // 2. Trigger Visuals (Hearts & Background)
    renderValentineVisuals(config);

    if (window.lucide) window.lucide.createIcons();
};

const renderValentineVisuals = (config) => {
    if (isLowDataMode()) return;

    // A. Inject Scrolling Heart Background (Safe check)
    if (!document.querySelector('.heart-bg-layer')) {
        const bgLayer = document.createElement('div');
        bgLayer.className = 'heart-bg-layer';
        document.body.prepend(bgLayer); 
    }

    // B. Floating Emojis (The Love Shower)
    // Only create container if it doesn't exist
    if (document.getElementById('vday-visuals')) return;

    const container = document.createElement('div');
    container.id = 'vday-visuals';
    container.className = 'v-floating-container';

    // Map icons to emojis
    const emojiMap = {
        'flower': '🌹',
        'heart-handshake': '💍',
        'cookie': '🍫',
        'smile': '🧸',
        'shield-check': '🤞',
        'users': '🤗',
        'heart': '💋',
        'sparkles': '💖'
    };
    const emoji = emojiMap[config.icon] || '❤️';

    // Create 15 floating items with RANDOMIZED positions for organic rain effect
    let html = '';
    for(let i=0; i<15; i++) {
        // Random horizontal position (0-100%)
        const left = Math.floor(Math.random() * 100);
        // Random animation duration (6s to 12s)
        const duration = 6 + Math.random() * 6;
        // Random delay (-5s to 0s) so they start at different heights immediately
        const delay = -(Math.random() * 5);
        // Random size scaling (0.8 to 1.5)
        const scale = 0.8 + Math.random() * 0.7;

        html += `<div class="v-float-item" style="left: ${left}%; animation-duration: ${duration}s; animation-delay: ${delay}s; font-size: ${scale}rem;">${emoji}</div>`;
    }
    container.innerHTML = html;
    
    document.body.appendChild(container);
};

// --- UI RENDERING HELPERS ---

const renderDashboardUI = () => {
    const user = state.currentUser;
    
    // Update Header Elements
    if(els.userPointsHeader) els.userPointsHeader.textContent = user.current_points;
    if(els.userNameGreeting) els.userNameGreeting.textContent = user.full_name;
    
    // Update Sidebar Elements
    const sidebarName = document.getElementById('user-name-sidebar');
    const sidebarPoints = document.getElementById('user-points-sidebar');
    const sidebarLevel = document.getElementById('user-level-sidebar');
    const sidebarAvatar = document.getElementById('user-avatar-sidebar');

    if (sidebarName) sidebarName.innerHTML = `${user.full_name} ${getTickImg(user.tick_type)}`;
    if (sidebarPoints) sidebarPoints.textContent = user.current_points;
    
    if (sidebarLevel) {
        const level = getUserLevel(user.lifetime_points);
        sidebarLevel.textContent = level.title;
    }
    
    if (sidebarAvatar) {
        sidebarAvatar.src = user.profile_img_url || getPlaceholderImage('80x80', getUserInitials(user.full_name));
    }

    // Update Impact Cards
    const impactRecycled = document.getElementById('impact-recycled');
    const impactCo2 = document.getElementById('impact-co2');
    const impactEvents = document.getElementById('impact-events');

    if(impactRecycled) impactRecycled.textContent = `${(user.impact?.total_plastic_kg || 0).toFixed(1)} kg`;
    if(impactCo2) impactCo2.textContent = `${(user.impact?.co2_saved_kg || 0).toFixed(1)} kg`;
    if(impactEvents) impactEvents.textContent = user.impact?.events_attended || 0;

    // --- RENDER VOLUNTEER BUTTON IF ELIGIBLE ---
    const dashboardGrid = document.querySelector('#dashboard > div.grid > div:first-child');
    let volunteerBtn = document.getElementById('dashboard-volunteer-btn');

    if (user.is_volunteer) {
        if (!volunteerBtn && dashboardGrid) {
            const btn = document.createElement('button');
            btn.id = "dashboard-volunteer-btn";
            btn.onclick = () => window.location.href = 'volunteer/index.html'; 
            
            // DYNAMIC COLOR: Uses Theme Variables!
            // Defaults to Green, turns Pink/Red if theme is active
            btn.className = "w-full bg-gradient-to-r from-[var(--v-primary)] to-[var(--v-accent)] text-white p-4 rounded-2xl shadow-lg flex items-center justify-between active:scale-[0.98] transition-all mb-6";
            
            btn.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="bg-white/20 p-2 rounded-full">
                        <i data-lucide="shield-check" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="text-left">
                        <h3 class="font-bold text-lg leading-tight">Volunteer Mode</h3>
                        <p class="text-xs text-white/90 font-medium">Access scanner & logs</p>
                    </div>
                </div>
                <i data-lucide="chevron-right" class="w-6 h-6 text-white/80"></i>
            `;
            
            // If Valentine hero exists, insert after it, else prepend
            const vHero = document.getElementById('vday-hero-card');
            if (vHero) {
                vHero.after(btn);
            } else {
                dashboardGrid.prepend(btn);
            }
            if(window.lucide) window.lucide.createIcons();
        }
    } else {
        if (volunteerBtn) volunteerBtn.remove();
    }
};

const renderCheckinButtonState = () => {
    const streak = state.currentUser.checkInStreak || 0;
    
    // Update Streak Counters (Pre/Post Animation)
    const preEl = document.getElementById('dashboard-streak-text-pre');
    const postEl = document.getElementById('dashboard-streak-text-post');
    if(preEl) preEl.textContent = streak;
    if(postEl) postEl.textContent = streak;
    
    const btn = els.dailyCheckinBtn;
    if (!btn) return; 

    // Toggle Button Style based on status
    if (state.currentUser.isCheckedInToday) {
        btn.classList.add('checkin-completed'); 
        btn.classList.remove('from-yellow-400', 'to-orange-400', 'dark:from-yellow-500', 'dark:to-orange-500', 'bg-gradient-to-r');
        btn.onclick = null; 
    } else {
        btn.classList.remove('checkin-completed');
        // Keep Check-in Gold/Orange for "Points" context
        btn.classList.add('from-yellow-400', 'to-orange-400', 'dark:from-yellow-500', 'dark:to-orange-500', 'bg-gradient-to-r');
        btn.onclick = openCheckinModal;
    }
};

// --- AQI (AIR QUALITY INDEX) LOGIC ---

const initAQI = () => {
    const card = document.getElementById('dashboard-aqi-card');
    if (!card) return;

    if (card.innerHTML.trim() === "") {
        if (navigator.geolocation) {
            card.classList.remove('hidden');
            card.innerHTML = `
                <div class="glass-card p-4 rounded-xl flex items-center justify-center">
                    <i data-lucide="loader-2" class="w-5 h-5 animate-spin text-gray-400 mr-2"></i>
                    <span class="text-sm text-gray-500">Detecting Location...</span>
                </div>`;
            
            navigator.geolocation.getCurrentPosition(
                (position) => fetchAQI(position.coords.latitude, position.coords.longitude),
                (error) => {
                    console.warn("AQI Location Error:", error);
                    card.innerHTML = `
                        <div class="glass-card p-4 rounded-xl text-center">
                            <p class="text-sm text-gray-500">Enable location to see local Air Quality.</p>
                        </div>`;
                }
            );
        }
    }
};

const fetchAQI = async (lat, lon) => {
    const card = document.getElementById('dashboard-aqi-card');
    try {
        const aqiRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`);
        const aqiData = await aqiRes.json();
        
        const locRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        const locData = await locRes.json();
        
        const city = locData.locality || locData.city || "Campus Area";
        const aqi = aqiData.current.us_aqi;
        
        renderAQICard(card, aqi, city);
    } catch (err) {
        console.error("AQI Fetch Error:", err);
        card.classList.add('hidden');
    }
};

const renderAQICard = (card, aqi, city) => {
    let status = 'Good';
    let colorClass = 'from-green-100 to-emerald-50 dark:from-green-900/40 dark:to-emerald-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800';
    let icon = 'wind';
    let advice = "Great day for a nature walk on campus!";

    if (aqi > 50 && aqi <= 100) {
        status = 'Moderate';
        colorClass = 'from-yellow-100 to-orange-50 dark:from-yellow-900/40 dark:to-orange-900/20 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
        icon = 'cloud';
        advice = "Air is okay. Good for saving energy indoors.";
    } else if (aqi > 100) {
        status = 'Unhealthy';
        colorClass = 'from-red-100 to-rose-50 dark:from-red-900/40 dark:to-rose-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
        icon = 'alert-triangle';
        advice = "High pollution. Wear a mask if outside!";
    }

    // AQI Card uses new styles too
    card.innerHTML = `
        <div class="bg-gradient-to-br ${colorClass} border p-5 rounded-2xl shadow-sm relative overflow-hidden animate-breathe">
            <div class="relative z-10 flex justify-between items-start">
                <div>
                    <div class="flex items-center gap-1 mb-1 opacity-70">
                        <i data-lucide="map-pin" class="w-3 h-3"></i>
                        <p class="text-xs font-bold uppercase tracking-wider">${city}</p>
                    </div>
                    <h3 class="text-3xl font-black flex items-center gap-2">
                        ${aqi} <span class="text-lg font-medium opacity-80">(${status})</span>
                    </h3>
                    <p class="text-sm font-medium mt-2 opacity-90">${advice}</p>
                </div>
                <div class="w-12 h-12 rounded-full bg-white/40 dark:bg-black/20 flex items-center justify-center backdrop-blur-sm">
                    <i data-lucide="${icon}" class="w-6 h-6"></i>
                </div>
            </div>
            <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-white/20 dark:bg-white/5 rounded-full blur-xl"></div>
            <div class="absolute -top-4 -left-4 w-20 h-20 bg-white/20 dark:bg-white/5 rounded-full blur-xl"></div>
        </div>
    `;
    if(window.lucide) window.lucide.createIcons();
};

// --- HISTORY & PROFILE MODULES ---

export const loadHistoryData = async () => {
    if (state.historyLoaded) {
        if (document.getElementById('history').classList.contains('active')) renderHistory();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('points_ledger')
            .select('source_type, description, points_delta, created_at')
            .eq('user_id', state.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(20); 

        if (error) return;

        state.history = data.map(item => ({
            type: item.source_type, 
            description: item.description, 
            points: item.points_delta,
            date: formatDate(item.created_at), 
            icon: getIconForHistory(item.source_type)
        }));
        
        state.historyLoaded = true;

        if (document.getElementById('history').classList.contains('active')) renderHistory();
    } catch (err) { console.error('History Load Error:', err); }
};

export const renderHistory = () => {
    els.historyList.innerHTML = '';
    if (state.history.length === 0) {
        els.historyList.innerHTML = `<p class="text-sm text-center text-gray-500">No activity history yet.</p>`;
        return;
    }
    state.history.forEach(h => {
        els.historyList.innerHTML += `
            <div class="glass-card p-3 rounded-xl flex items-center justify-between">
                <div class="flex items-center">
                    <span class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mr-3"><i data-lucide="${h.icon}" class="w-5 h-5 text-gray-700 dark:text-gray-200"></i></span>
                    <div><p class="text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-1">${h.description}</p><p class="text-xs text-gray-500 dark:text-gray-400">${h.date}</p></div>
                </div>
                <span class="text-sm font-bold ${h.points >= 0 ? 'text-green-600' : 'text-red-500'}">${h.points > 0 ? '+' : ''}${h.points}</span>
            </div>`;
    });
    if(window.lucide) window.lucide.createIcons();
};

export const renderProfile = () => {
    const u = state.currentUser;
    if (!u) return;
    
    // Log profile view (Once per session)
    if (!sessionStorage.getItem('profile_view_logged')) {
        logUserActivity('view_profile', 'Viewed profile page');
        sessionStorage.setItem('profile_view_logged', '1');
    }

    const l = getUserLevel(u.lifetime_points);
    
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const joinedEl = document.getElementById('profile-joined');
    const avatarEl = document.getElementById('profile-avatar');
    
    if(nameEl) nameEl.innerHTML = `${u.full_name} ${getTickImg(u.tick_type)}`;
    if(emailEl) emailEl.textContent = u.email;
    if(joinedEl) joinedEl.textContent = `Joined ${formatDate(u.joined_at, { month: 'long', year: 'numeric' })}`;
    if(avatarEl) avatarEl.src = u.profile_img_url || getPlaceholderImage('112x112', getUserInitials(u.full_name));

    const levelTitle = document.getElementById('profile-level-title');
    const levelNum = document.getElementById('profile-level-number');
    const levelProg = document.getElementById('profile-level-progress');
    const levelNext = document.getElementById('profile-level-next');

    if(levelTitle) levelTitle.textContent = l.title;
    if(levelNum) levelNum.textContent = l.level;
    if(levelProg) levelProg.style.width = l.progress + '%';
    if(levelNext) levelNext.textContent = l.progressText;

    const studentId = document.getElementById('profile-student-id');
    const course = document.getElementById('profile-course');
    const mobile = document.getElementById('profile-mobile');
    const emailPersonal = document.getElementById('profile-email-personal');
    
    if(studentId) studentId.textContent = u.student_id;
    if(course) course.textContent = u.course;
    if(mobile) mobile.textContent = u.mobile || 'Not Set'; 
    if(emailPersonal) emailPersonal.textContent = u.email;
};

export const setupFileUploads = () => {
    const profileInput = document.getElementById('profile-upload-input');
    if (profileInput) {
        const newProfileInput = profileInput.cloneNode(true);
        profileInput.parentNode.replaceChild(newProfileInput, profileInput);

        newProfileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const avatarEl = document.getElementById('profile-avatar');
            const originalSrc = avatarEl.src;
            avatarEl.style.opacity = '0.5';
            
            try {
                showToast('Updating profile picture...', 'warning');
                
                // Upload to Cloudinary via Utils
                const imageUrl = await uploadToCloudinary(file);
                
                // Update DB
                const { error } = await supabase.from('users').update({ profile_img_url: imageUrl }).eq('id', state.currentUser.id);
                if (error) throw error;
                
                // Update Local State & UI
                state.currentUser.profile_img_url = imageUrl;
                const sidebarAvatar = document.getElementById('user-avatar-sidebar');
                if(sidebarAvatar) sidebarAvatar.src = imageUrl;

                renderProfile();
                renderDashboardUI(); 
                showToast('Profile updated successfully!', 'success');

            } catch (err) {
                console.error('Profile Upload Failed:', err);
                showToast('Upload failed. Try a smaller image.', 'error');
                avatarEl.src = originalSrc; 
            } finally {
                avatarEl.style.opacity = '1';
                newProfileInput.value = ''; 
            }
        });
    }
};

// --- CHECK-IN & STREAK LOGIC ---

export const openCheckinModal = () => {
    if (state.currentUser.isCheckedInToday) return;
    
    // Check if streak is broken to display correct UI
    let isStreakBroken = false;
    let savedStreak = 0;

    if (state.currentUser.lastCheckInDate) {
        const lastDate = new Date(state.currentUser.lastCheckInDate);
        const today = new Date(); 
        
        lastDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 1) {
            isStreakBroken = true;
            savedStreak = state.currentUser.checkInStreak;
        }
    }

    const checkinModal = document.getElementById('checkin-modal');
    checkinModal.classList.add('open');
    checkinModal.classList.remove('invisible', 'opacity-0');
    
    const calendarContainer = document.getElementById('checkin-modal-calendar');
    const streakDisplay = document.getElementById('checkin-modal-streak');
    const btnContainer = document.getElementById('checkin-modal-button-container');

    // Display Logic
    const displayStreak = isStreakBroken ? 0 : (state.currentUser.checkInStreak || 0);

    streakDisplay.innerHTML = isStreakBroken 
        ? `<span class="text-red-500 line-through opacity-50 text-2xl mr-2">${savedStreak}</span> 0 Days`
        : `${displayStreak} Days`;
    
    // Calendar Rendering
    calendarContainer.innerHTML = '';
    const today = new Date(); 
    for (let i = -3; i <= 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const isToday = i === 0;
        calendarContainer.innerHTML += `
            <div class="flex flex-col items-center text-xs ${isToday ? 'font-bold text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}">
                <span class="mb-1">${['S','M','T','W','T','F','S'][d.getDay()]}</span>
                <span class="w-8 h-8 flex items-center justify-center rounded-full ${isToday ? 'bg-yellow-100 dark:bg-yellow-900' : ''}">${d.getDate()}</span>
            </div>`;
    }

    // Button Logic: Standard Check-in OR Restore Option
    let buttonsHTML = '';

    if (isStreakBroken) {
        const canRestore = state.currentUser.current_points >= 50;
        
        // Restore Button
        if (canRestore) {
            buttonsHTML += `
                <button onclick="handleStreakRestore()" class="w-full mb-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-purple-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="zap" class="w-4 h-4 fill-yellow-400 text-yellow-400"></i>
                    Restore ${savedStreak} Day Streak (-50 Pts)
                </button>
            `;
        } else {
             buttonsHTML += `
                <div class="w-full mb-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                    <p class="text-xs text-gray-500">Need 50 Pts to restore ${savedStreak} day streak.</p>
                </div>
            `;
        }

        // Start New Streak Button
        buttonsHTML += `
            <button onclick="handleDailyCheckin()" class="w-full bg-white dark:bg-gray-800 border-2 border-green-500 text-green-600 dark:text-green-400 font-bold py-3 px-4 rounded-xl hover:bg-green-50 dark:hover:bg-gray-700 transition-transform active:scale-95">
                Start New Streak (+${state.checkInReward} Pts)
            </button>`;
            
    } else {
        // Standard Check-in
        buttonsHTML = `
            <button onclick="handleDailyCheckin()" class="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-green-700 shadow-lg transition-transform active:scale-95">
                Check-in &amp; Earn ${state.checkInReward} Points
            </button>`;
    }

    btnContainer.innerHTML = buttonsHTML;
    
    if(window.lucide) window.lucide.createIcons();
};

export const closeCheckinModal = () => {
    const checkinModal = document.getElementById('checkin-modal');
    checkinModal.classList.remove('open');
    checkinModal.classList.add('invisible', 'opacity-0');
};

export const handleStreakRestore = async () => {
    const btnContainer = document.getElementById('checkin-modal-button-container');
    const originalContent = btnContainer.innerHTML;
    btnContainer.innerHTML = '<button disabled class="w-full bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-bold py-3 px-4 rounded-xl animate-pulse cursor-wait">Restoring Streak...</button>';

    try {
        const { data, error } = await supabase.rpc('restore_streak_v1');

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        logUserActivity('streak_restore', 'Restored streak with points');
        
        // Update Local State for points only (Streak will be updated by handleDailyCheckin)
        state.currentUser.current_points -= 50;
        
        showToast("Streak Restored! Checking you in...", "success");
        
        // FIX: Immediately trigger daily check-in to continue the streak correctly
        await handleDailyCheckin();

    } catch (err) {
        console.error("Streak Restore Error:", err);
        showToast(err.message || "Failed to restore streak.", "error");
        btnContainer.innerHTML = originalContent; // Revert buttons on failure
    }
};

export const handleDailyCheckin = async () => {
    const checkinButton = document.querySelector('#checkin-modal-button-container button');
    if(checkinButton) {
        checkinButton.disabled = true;
        checkinButton.textContent = 'Checking in...';
    }

    try {
        const todayIST = getTodayIST();
        
        // 1. Insert Check-in
        const { error } = await supabase.from('daily_checkins').insert({ 
            user_id: state.currentUser.id, 
            points_awarded: state.checkInReward,
            checkin_date: todayIST 
        });
        
        if (error) throw error;
        
        // 2. Fetch new streak from Trigger (Database Trigger handles increment or reset)
        const { data: newStreak } = await supabase.from('user_streaks').select('current_streak').eq('user_id', state.currentUser.id).single();
        const finalStreak = newStreak ? newStreak.current_streak : 1;
        
        logUserActivity('checkin_success', `Daily check-in completed.`);
        closeCheckinModal();

        // 3. Update Local State
        state.currentUser.checkInStreak = finalStreak;
        state.currentUser.isCheckedInToday = true;
        state.currentUser.current_points += state.checkInReward; 
        
        renderCheckinButtonState();
        renderDashboardUI();
        await refreshUserData(); 

        if (state.leaderboardLoaded) await loadLeaderboardData();
        showToast(`Check-in success! +${state.checkInReward} pts`, 'success');

    } catch (err) {
        console.error('Check-in error:', err.message);
        logUserActivity('checkin_error', err.message);
        showToast("Check-in failed. Please try again.", "error");
        
        if(checkinButton) {
            checkinButton.disabled = false;
            checkinButton.textContent = `Check-in & Earn ${state.checkInReward} Points`;
        }
    }
};

// --- GLOBAL EXPORTS ---
window.openCheckinModal = openCheckinModal;
window.closeCheckinModal = closeCheckinModal;
window.handleDailyCheckin = handleDailyCheckin;
window.handleStreakRestore = handleStreakRestore;

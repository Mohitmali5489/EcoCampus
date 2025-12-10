import { supabase } from './supabase-client.js';
import { state } from './state.js';
// ADDED getIconForHistory TO THIS IMPORT LIST:
import { els, formatDate, getPlaceholderImage, getTickImg, getUserInitials, getUserLevel, uploadToCloudinary, getTodayIST, logUserActivity, getIconForHistory } from './utils.js';
import { refreshUserData } from './app.js';
import { loadLeaderboardData } from './social.js'; 

// --- DASHBOARD CORE ---

export const loadDashboardData = async () => {
    try {
        const userId = state.currentUser.id;
        const todayIST = getTodayIST(); 

        // - We fetch 'last_checkin_date' to detect broken streaks
        const [
            { data: checkinData },
            { data: streakData },
            { data: impactData }
        ] = await Promise.all([
            supabase.from('daily_checkins').select('id').eq('user_id', userId).eq('checkin_date', todayIST).limit(1),
            supabase.from('user_streaks').select('current_streak, last_checkin_date').eq('user_id', userId).single(),
            supabase.from('user_impact').select('*').eq('user_id', userId).maybeSingle()
        ]);
        
        state.currentUser.isCheckedInToday = (checkinData && checkinData.length > 0);
        state.currentUser.checkInStreak = streakData ? streakData.current_streak : 0;
        state.currentUser.lastCheckInDate = streakData ? streakData.last_checkin_date : null; 
        state.currentUser.impact = impactData || { total_plastic_kg: 0, co2_saved_kg: 0, events_attended: 0 };
        
    } catch (err) {
        console.error('Dashboard Data Error:', err);
    }
};

export const renderDashboard = () => {
    if (!state.currentUser) return; 
    renderDashboardUI();
    renderCheckinButtonState();
    initAQI(); 
};

const renderDashboardUI = () => {
    const user = state.currentUser;
    
    if(els.userPointsHeader) els.userPointsHeader.textContent = user.current_points;
    if(els.userNameGreeting) els.userNameGreeting.textContent = user.full_name;
    
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

    const impactRecycled = document.getElementById('impact-recycled');
    const impactCo2 = document.getElementById('impact-co2');
    const impactEvents = document.getElementById('impact-events');

    if(impactRecycled) impactRecycled.textContent = `${(user.impact?.total_plastic_kg || 0).toFixed(1)} kg`;
    if(impactCo2) impactCo2.textContent = `${(user.impact?.co2_saved_kg || 0).toFixed(1)} kg`;
    if(impactEvents) impactEvents.textContent = user.impact?.events_attended || 0;
};

const renderCheckinButtonState = () => {
    const streak = state.currentUser.checkInStreak || 0;
    
    const preEl = document.getElementById('dashboard-streak-text-pre');
    const postEl = document.getElementById('dashboard-streak-text-post');
    if(preEl) preEl.textContent = streak;
    if(postEl) postEl.textContent = streak;
    
    const btn = els.dailyCheckinBtn;
    if (!btn) return; 

    if (state.currentUser.isCheckedInToday) {
        btn.classList.add('checkin-completed'); 
        btn.classList.remove('from-yellow-400', 'to-orange-400', 'dark:from-yellow-500', 'dark:to-orange-500', 'bg-gradient-to-r');
        btn.onclick = null; 
    } else {
        btn.classList.remove('checkin-completed');
        btn.classList.add('from-yellow-400', 'to-orange-400', 'dark:from-yellow-500', 'dark:to-orange-500', 'bg-gradient-to-r');
        btn.onclick = openCheckinModal;
    }
};
// --- AQI LOGIC ---

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
        // 1. Fetch AQI Data
        const aqiRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`);
        const aqiData = await aqiRes.json();
        
        // 2. Fetch Location Name (Reverse Geocoding)
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
// --- HISTORY & PROFILE ---

export const loadHistoryData = async () => {
    try {
        const { data, error } = await supabase
            .from('points_ledger')
            .select('*')
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
    
    logUserActivity('view_profile', 'Viewed profile page');

    const l = getUserLevel(u.lifetime_points);
    
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const avatarEl = document.getElementById('profile-avatar');
    
    if(nameEl) nameEl.innerHTML = `${u.full_name} ${getTickImg(u.tick_type)}`;
    if(emailEl) emailEl.textContent = u.email;
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
    const emailPersonal = document.getElementById('profile-email-personal');
    
    if(studentId) studentId.textContent = u.student_id;
    if(course) course.textContent = u.course;
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
                logUserActivity('upload_profile_pic_start', 'Started uploading profile picture');
                const imageUrl = await uploadToCloudinary(file);
                const { error } = await supabase.from('users').update({ profile_img_url: imageUrl }).eq('id', state.currentUser.id);
                if (error) throw error;
                
                state.currentUser.profile_img_url = imageUrl;
                const sidebarAvatar = document.getElementById('user-avatar-sidebar');
                if(sidebarAvatar) sidebarAvatar.src = imageUrl;

                renderProfile();
                renderDashboardUI(); 
                alert('Profile picture updated!');
                logUserActivity('upload_profile_pic_success', 'Profile picture updated');

            } catch (err) {
                console.error('Profile Upload Failed:', err);
                alert('Failed to upload profile picture.');
                avatarEl.src = originalSrc; 
                logUserActivity('upload_profile_pic_error', err.message);
            } finally {
                avatarEl.style.opacity = '1';
                newProfileInput.value = ''; 
            }
        });
    }
};

// --- STREAK RESTORE & CHECK-IN LOGIC ---

export const openCheckinModal = () => {
    if (state.currentUser.isCheckedInToday) return;
    logUserActivity('ui_interaction', 'Opened check-in modal');
    
    // Calculate if streak is broken
    let isStreakBroken = false;
    if (state.currentUser.lastCheckInDate) {
        const lastDate = new Date(state.currentUser.lastCheckInDate);
        const today = new Date(); 
        
        lastDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // If > 1 day has passed since last check-in, streak is broken
        if (diffDays > 1) isStreakBroken = true;
    }

    const checkinModal = document.getElementById('checkin-modal');
    checkinModal.classList.add('open');
    checkinModal.classList.remove('invisible', 'opacity-0');
    
    const calendarContainer = document.getElementById('checkin-modal-calendar');
    const streakDisplay = document.getElementById('checkin-modal-streak');
    const btnContainer = document.getElementById('checkin-modal-button-container');

    // 1. IF STREAK BROKEN: Show Restore UI
    if (isStreakBroken && state.currentUser.checkInStreak > 0) {
        streakDisplay.innerHTML = `<span class="text-red-500">Streak Lost!</span>`;
        calendarContainer.innerHTML = `
            <div class="text-center w-full mb-2">
                <i data-lucide="flame-off" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-3"></i>
                <p class="text-gray-600 dark:text-gray-300 text-sm">You missed a day! Your ${state.currentUser.checkInStreak}-day streak is at risk.</p>
            </div>`;
        
        btnContainer.innerHTML = `
            <div class="flex flex-col gap-3 w-full">
                <button onclick="handleRestoreStreak()" class="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform">
                    <i data-lucide="zap" class="w-5 h-5 fill-current"></i>
                    <span>Restore Streak (-50 Pts)</span>
                </button>
                <button onclick="handleDailyCheckin()" class="w-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold py-3 px-4 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                    Start Over (0 Days)
                </button>
            </div>
        `;
    } 
    // 2. NORMAL CHECK-IN
    else {
        streakDisplay.textContent = `${state.currentUser.checkInStreak || 0} Days`;
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
        btnContainer.innerHTML = `
            <button onclick="handleDailyCheckin()" class="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-green-700 shadow-lg transition-transform active:scale-95">
                Check-in &amp; Earn ${state.checkInReward} Points
            </button>`;
    }
    
    if(window.lucide) window.lucide.createIcons();
};

export const handleRestoreStreak = async () => {
    const cost = 50;
    const userPoints = state.currentUser.current_points;

    if (userPoints < cost) {
        alert(`Insufficient EcoPoints! You need ${cost} pts to restore your streak.`);
        return;
    }

    const btn = document.querySelector('#checkin-modal-button-container button');
    if(btn) { btn.disabled = true; btn.innerHTML = 'Restoring...'; }

    try {
        const userId = state.currentUser.id;
        const currentStreak = state.currentUser.checkInStreak;
        const todayIST = getTodayIST();

        // 1. Deduct Points (Manual DB update or RPC)
        const { error: pointsError } = await supabase.rpc('deduct_points', { 
            user_id_input: userId, 
            points_to_deduct: cost 
        }).maybeSingle();

        if (pointsError && pointsError.code !== 'PGRST202') { 
             await supabase.from('users').update({ current_points: userPoints - cost }).eq('id', userId);
        }

        // 2. Log Deduction
        await supabase.from('points_ledger').insert({
            user_id: userId,
            source_type: 'streak_restore',
            points_delta: -cost,
            description: 'Restored Streak'
        });

        // 3. Insert Check-in (DB triggers might reset streak, so we must force override next)
        await supabase.from('daily_checkins').insert({ 
            user_id: userId, 
            points_awarded: state.checkInReward,
            checkin_date: todayIST 
        });

        // 4. FORCE FIX STREAK: Manually override the streak count back to (old + 1)
        const restoredStreakCount = currentStreak + 1;
        const { error: streakError } = await supabase
            .from('user_streaks')
            .update({ 
                current_streak: restoredStreakCount,
                last_checkin_date: todayIST 
            })
            .eq('user_id', userId);

        if (streakError) throw streakError;

        // 5. Success
        logUserActivity('streak_restored', `Restored streak to ${restoredStreakCount}`);
        closeCheckinModal();

        state.currentUser.checkInStreak = restoredStreakCount;
        state.currentUser.isCheckedInToday = true;
        state.currentUser.current_points -= cost; // Optimistic update
        
        renderCheckinButtonState();
        renderDashboardUI();
        await refreshUserData();
        
        // 6. NEW: Refresh Leaderboard Instantly
        await loadLeaderboardData();

        alert("Streak Restored! 🔥");

    } catch (err) {
        console.error("Restore Streak Error:", err);
        alert("Failed to restore streak.");
        if(btn) { btn.disabled = false; btn.innerHTML = 'Restore Streak (-50 Pts)'; }
    }
};

export const closeCheckinModal = () => {
    const checkinModal = document.getElementById('checkin-modal');
    checkinModal.classList.remove('open');
    checkinModal.classList.add('invisible', 'opacity-0');
};

export const handleDailyCheckin = async () => {
    const checkinButton = document.querySelector('#checkin-modal-button-container button');
    if(checkinButton) {
        checkinButton.disabled = true;
        checkinButton.textContent = 'Checking in...';
    }

    try {
        const todayIST = getTodayIST();
        // - Inserting to daily_checkins
        const { error } = await supabase.from('daily_checkins').insert({ 
            user_id: state.currentUser.id, 
            points_awarded: state.checkInReward,
            checkin_date: todayIST 
        });
        
        if (error) throw error;
        
        // Fetch new streak confirmed by DB
        const { data: newStreak } = await supabase.from('user_streaks').select('current_streak').eq('user_id', state.currentUser.id).single();
        const finalStreak = newStreak ? newStreak.current_streak : 1;
        
        logUserActivity('checkin_success', `Daily check-in completed.`);
        closeCheckinModal();

        state.currentUser.checkInStreak = finalStreak;
        state.currentUser.isCheckedInToday = true;
        state.currentUser.current_points += state.checkInReward; 
        
        renderCheckinButtonState();
        renderDashboardUI();
        await refreshUserData(); 

        // NEW: Refresh Leaderboard Instantly
        await loadLeaderboardData();

    } catch (err) {
        console.error('Check-in error:', err.message);
        logUserActivity('checkin_error', err.message);
        alert(`Failed to check in: ${err.message}`);
        
        if(checkinButton) {
            checkinButton.disabled = false;
            checkinButton.textContent = `Check-in & Earn ${state.checkInReward} Points`;
        }
    }
};

// Exports attached to window for inline HTML events
window.openCheckinModal = openCheckinModal;
window.closeCheckinModal = closeCheckinModal;
window.handleDailyCheckin = handleDailyCheckin;
window.handleRestoreStreak = handleRestoreStreak;

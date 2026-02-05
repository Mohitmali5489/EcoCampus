// ==========================================
// URJA 2026 - STUDENT PORTAL CONTROLLER (FINAL)
// ==========================================

(function() { // Wrapped in IIFE for safety

    // --- 1. CONFIGURATION & CREDENTIALS ---
    const SUPABASE_URL = 'https://sijmmlhltkksykhbuatn.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_9GjhwaWzz0McozvxVMINyQ_ZFU58z7F';
    const FIX_NUMBER = 5489; // Obfuscation Key for URL Auth
    
    // Initialize Clients
    if (!window.supabase) {
        console.error("CRITICAL: Supabase SDK not loaded in HTML.");
        return;
    }
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // --- STATE MANAGEMENT ---
    let currentUser = null;
    let myRegistrations = []; 
    let currentScheduleView = 'upcoming'; 
    let allSportsList = [];
    let selectedSportForReg = null;
    let currentLiveMatchId = null; // Track open modal

    // Default Fallback
    const DEFAULT_AVATAR = "https://t4.ftcdn.net/jpg/05/89/93/27/360_F_589932782_vQAEAZhHnq1QCGu5ikwrYaQD0Mmurm0N.jpg";

    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', async () => {
        if(window.lucide) lucide.createIcons();
        injectToastContainer();
        setupTabSystem();
        setupConfirmModal(); 
        
        // Start Authentication (Priority: URL ID)
        await checkAuth();
        
        // Setup Realtime Listener
        subscribeToLiveMatches();

        // Default Tab
        window.switchTab('dashboard');
    });

    // --- 2. AUTHENTICATION & PROFILE ---
    async function checkAuth() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get('id');

        if (urlId) {
            const studentId = parseInt(urlId) - FIX_NUMBER;
            const { data: user, error } = await supabaseClient
                .from('users')
                .select('*')
                .eq('student_id', studentId.toString())
                .single();

            if (!error && user) {
                initializeUserSession(user);
                return;
            }
        }

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            const { data: profile } = await supabaseClient
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profile) {
                initializeUserSession(profile);
                return;
            }
        }

        document.getElementById('loader').innerHTML = `<p class="text-red-600 font-bold text-center">Access Denied: No valid ID.</p>`;
    }

    async function initializeUserSession(user) {
        currentUser = user;
        updateProfileUI();
        await fetchMyRegistrations();
        
        // Hide Loader, Show App
        const loader = document.getElementById('loader');
        if(loader) loader.classList.add('hidden');
        const app = document.getElementById('app');
        if(app) app.classList.remove('hidden');
    }

    function updateProfileUI() {
        if (!currentUser) return;
        const avatarUrl = currentUser.avatar_url || DEFAULT_AVATAR;
        
        const headerImg = document.getElementById('header-avatar');
        if(headerImg) headerImg.src = avatarUrl;

        const nameEl = document.getElementById('profile-name');
        const detailsEl = document.getElementById('profile-details');
        const headName = document.getElementById('header-name');
        const headId = document.getElementById('header-id');

        const fullName = currentUser.name || "Unknown Student";

        if(nameEl) nameEl.innerText = fullName;
        if(detailsEl) detailsEl.innerText = `${currentUser.class_name || 'N/A'} • ${currentUser.student_id || 'N/A'}`;
        if(headName) headName.innerText = fullName;
        if(headId) headId.innerText = `ID: ${currentUser.student_id}`;
    }

    // --- CORE LOGIC: FETCH DATA ---
    async function fetchMyRegistrations() {
        const { data } = await supabaseClient.from('registrations').select('sport_id').eq('user_id', currentUser.id);
        if(data) {
            myRegistrations = data.map(r => r.sport_id);
        }
    }

    // --- 3. REALTIME SUBSCRIPTION ---
    function subscribeToLiveMatches() {
        supabaseClient
            .channel('public:matches')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, async (payload) => {
                
                // 1. Refresh Schedule List
                if (!document.getElementById('view-schedule').classList.contains('hidden')) {
                     window.loadSchedule();
                }

                // 2. If the updated match is currently open in the modal, refresh UI
                if (currentLiveMatchId && payload.new.id === currentLiveMatchId) {
                    await refreshAndRenderLiveModal(payload.new.id);
                }
            })
            .subscribe();
    }

    // Helper to re-fetch single match with joins
    async function refreshAndRenderLiveModal(matchId) {
        const { data: match, error } = await supabaseClient
            .from('matches')
            .select(`*, sports(name, is_performance, type)`)
            .eq('id', matchId)
            .single();

        if (!error && match) {
            updateLiveModalUI(match);
        }
    }

    // --- 4. NAVIGATION ---
    function setupTabSystem() {
        window.switchTab = function(tabId) {
            document.querySelectorAll('[id^="view-"]').forEach(el => {
                el.classList.add('hidden');
                el.classList.remove('animate-fade-in');
            });
            
            const targetView = document.getElementById('view-' + tabId);
            if(targetView) {
                targetView.classList.remove('hidden');
                void targetView.offsetWidth; 
                targetView.classList.add('animate-fade-in');
            }
            
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active', 'text-indigo-600');
                el.classList.add('text-slate-400');
            });
            
            const activeNav = document.getElementById('nav-' + tabId);
            if(activeNav) {
                activeNav.classList.remove('text-slate-400');
                activeNav.classList.add('active', 'text-indigo-600');
            }

            const fab = document.getElementById('btn-whatsapp-fab');
            if (fab) {
                if (tabId === 'dashboard') fab.classList.remove('hidden');
                else fab.classList.add('hidden');
            }

            if(tabId === 'dashboard') loadDashboard(); 
            if(tabId === 'register') window.toggleRegisterView('new');
            if(tabId === 'teams') window.toggleTeamView('marketplace');
            if(tabId === 'schedule') window.filterSchedule('upcoming');
        }
    }

    // --- 5. DASHBOARD ---
    async function loadDashboard() {
        // 1. Check Admin Role
        if (currentUser && currentUser.role === 'admin') {
            const adminCard = document.getElementById('admin-dashboard-card');
            if(adminCard) adminCard.classList.remove('hidden');
        }

        // 2. Check Volunteer Role (NEW)
        if (currentUser && currentUser.role === 'volunteer') {
            const volCard = document.getElementById('volunteer-dashboard-card');
            if(volCard) volCard.classList.remove('hidden');
        }

        loadLatestChampions();
    }

    window.openAdminPanel = function() {
        if(currentUser && currentUser.student_id) {
            window.location.href = `admin.html?id=${currentUser.student_id}`;
        } else {
            showToast("Error: User ID not found.", "error");
        }
    }

    // NEW: Open Volunteer Page with ID
    window.openVolunteerPanel = function() {
        if(currentUser && currentUser.student_id) {
            window.location.href = `volunteer.html?id=${currentUser.student_id}`;
        } else {
            showToast("Error: User ID not found.", "error");
        }
    }

    async function loadLatestChampions() {
        const container = document.getElementById('home-champions-list'); 
        if (!container) return;

        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';

        const { data: winners, error } = await supabaseClient
            .from('winners')
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !winners || winners.length === 0) {
            container.innerHTML = '<p class="text-sm text-slate-500 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">No results declared yet.</p>';
            return;
        }

        container.innerHTML = winners.map(w => `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
                <div class="flex justify-between items-center mb-5 pb-3 border-b border-slate-50">
                    <div class="flex items-center gap-3">
                        <h4 class="font-extrabold text-slate-700 uppercase text-sm tracking-wide">${w.sport_name}</h4>
                        <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-100 text-purple-700 uppercase tracking-wide border border-purple-200">${w.gender}</span>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide border border-green-200">Finished</span>
                </div>
                <div class="space-y-4">
                    <div class="flex items-center gap-4">
                        <div class="relative w-9 h-9 shrink-0 flex items-center justify-center">
                            <div class="absolute inset-0 bg-yellow-100 rounded-full border border-yellow-200"></div>
                            <i data-lucide="trophy" class="w-4 h-4 text-yellow-600 relative z-10"></i>
                            <div class="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold border border-white">1</div>
                        </div>
                        <span class="font-bold text-slate-800 text-sm">${w.gold || 'TBD'}</span>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="relative w-9 h-9 shrink-0 flex items-center justify-center">
                            <div class="absolute inset-0 bg-slate-100 rounded-full border border-slate-200"></div>
                            <i data-lucide="medal" class="w-4 h-4 text-slate-500 relative z-10"></i>
                            <div class="absolute -top-1 -right-1 w-4 h-4 bg-slate-400 rounded-full text-[9px] text-white flex items-center justify-center font-bold border border-white">2</div>
                        </div>
                        <span class="font-semibold text-slate-700 text-sm">${w.silver || '-'}</span>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="relative w-9 h-9 shrink-0 flex items-center justify-center">
                            <div class="absolute inset-0 bg-amber-100 rounded-full border border-amber-200"></div>
                            <i data-lucide="medal" class="w-4 h-4 text-amber-700 relative z-10"></i>
                            <div class="absolute -top-1 -right-1 w-4 h-4 bg-amber-600 rounded-full text-[9px] text-white flex items-center justify-center font-bold border border-white">3</div>
                        </div>
                        <span class="font-medium text-slate-600 text-sm">${w.bronze || '-'}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        if(window.lucide) lucide.createIcons();
    }

    // --- 6. SCHEDULE MODULE ---
    window.filterSchedule = function(view) {
        currentScheduleView = view;
        const btnUp = document.getElementById('btn-schedule-upcoming');
        const btnRes = document.getElementById('btn-schedule-results');
        
        const activeClass = "flex-1 py-2 rounded-lg text-xs font-semibold transition-all bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100";
        const inactiveClass = "flex-1 py-2 rounded-lg text-xs font-medium transition-all text-slate-500 hover:bg-slate-50";
        
        if(btnUp && btnRes) {
            if(view === 'upcoming') { btnUp.className = activeClass; btnRes.className = inactiveClass; } 
            else { btnUp.className = inactiveClass; btnRes.className = activeClass; }
        }
        window.loadSchedule();
    }

    window.loadSchedule = async function() {
        const container = document.getElementById('schedule-list');
        if(!container) return;
        
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';

        const searchText = document.getElementById('schedule-search')?.value?.toLowerCase() || '';
        const filterStatus = currentScheduleView === 'upcoming' ? ['Scheduled', 'Live'] : ['Completed'];

        const { data: matches, error } = await supabaseClient
            .from('matches')
            .select(`*, sports(name, icon, is_performance, category)`)
            .in('status', filterStatus)
            .order('match_time', { ascending: currentScheduleView === 'upcoming' });

        if (!matches || matches.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-lucide="calendar-clock" class="w-6 h-6 text-indigo-500"></i>
                    </div>
                    <h4 class="text-slate-900 font-medium text-sm">No Matches Found</h4>
                </div>`;
            if(window.lucide) lucide.createIcons();
            return;
        }

        const filtered = matches.filter(m => {
            const txt = (m.title + m.sports.name).toLowerCase();
            return txt.includes(searchText);
        });

        container.innerHTML = filtered.map(m => {
            const isLive = m.status === 'Live';
            const date = new Date(m.match_time);
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const dateStr = date.toLocaleDateString([], {day: 'numeric', month: 'short'});

            // Names Logic
            let title = m.title || 'League Match';
            
            // Winners Display
            let winnerText = "";
            if (m.status === 'Completed' && m.live_data?.winner) {
                winnerText = `<span class="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-1 rounded border border-green-100 mt-2 inline-block">🏆 Winner: ${m.live_data.winner}</span>`;
            }

            let badge = isLive 
                ? `<span class="px-2 py-0.5 rounded bg-red-100 text-red-600 text-[10px] font-bold animate-pulse border border-red-200">LIVE</span>` 
                : `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold border border-slate-200">${timeStr}</span>`;

            // Interaction Logic
            const isCricket = m.sports.name.toLowerCase().includes('cricket');
            const isPerf = m.sports.is_performance;
            const canOpen = isCricket || isPerf;

            const clickAction = canOpen ? `onclick="window.openLiveMatch('${m.id}')"` : `onclick="showToast('Winner: ${m.live_data?.winner || "Decided"}', 'info')"`;
            const cursor = canOpen ? "cursor-pointer active:scale-[0.98]" : "cursor-default";

            return `
            <div ${canOpen ? clickAction : ''} class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-3 relative overflow-hidden group ${cursor} transition-all">
                ${isLive ? '<div class="absolute top-0 left-0 w-1 h-full bg-red-500"></div>' : ''}
                
                <div class="flex justify-between items-start mb-3 pl-2">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded bg-indigo-50 flex items-center justify-center text-indigo-600">
                             <i data-lucide="${m.sports.icon || 'trophy'}" class="w-3.5 h-3.5"></i>
                        </div>
                        <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">${m.sports.name}</span>
                        ${m.participants?.category ? `<span class="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">${m.participants.category}</span>` : ''}
                    </div>
                    ${badge}
                </div>

                <div class="pl-2">
                    <h4 class="text-sm font-bold text-slate-900 mb-1 line-clamp-1">${title}</h4>
                    <p class="text-xs text-slate-500 flex items-center gap-1">
                        <i data-lucide="map-pin" class="w-3 h-3"></i> ${m.location || 'Ground'} • ${dateStr}
                    </p>
                    ${winnerText}
                </div>
                
                ${canOpen ? `
                <div class="absolute right-4 bottom-4 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i data-lucide="chevron-right" class="w-5 h-5"></i>
                </div>` : ''}
            </div>`;
        }).join('');
        
        if(window.lucide) lucide.createIcons();
    }

    // --- 7. LIVE MATCH MODAL LOGIC (UPDATED WITH MERGE) ---
    window.openLiveMatch = async function(matchId) {
        const { data: match, error } = await supabaseClient
            .from('matches')
            .select(`*, sports(name, is_performance, type)`)
            .eq('id', matchId)
            .single();

        if (error || !match) {
            showToast("Error loading match.", "error");
            return;
        }

        const isCricket = match.sports.name.toLowerCase().includes('cricket');
        const isPerf = match.sports.is_performance;

        if (!isCricket && !isPerf) {
            if (match.status === 'Completed' && match.live_data?.winner) {
                showToast(`🏆 Winner: ${match.live_data.winner}`, "success");
            } else {
                showToast("Live view available for Cricket & Performance events only.", "info");
            }
            return;
        }

        currentLiveMatchId = matchId;
        const modal = document.getElementById('modal-match-live');
        modal.classList.remove('hidden');

        document.getElementById('live-modal-sport').innerText = "Loading...";
        document.getElementById('live-ui-versus').classList.add('hidden');
        document.getElementById('live-ui-performance').classList.add('hidden');

        updateLiveModalUI(match);
    }

    window.updateLiveModalUI = async function(match) {
        if (!match || !match.sports) return; 

        document.getElementById('live-modal-sport').innerText = match.sports.name;

        if (match.sports.is_performance) {
            document.getElementById('live-ui-performance').classList.remove('hidden');
            document.getElementById('live-ui-versus').classList.add('hidden');
            renderPerformanceLeaderboard(match);
        } else {
            document.getElementById('live-ui-versus').classList.remove('hidden');
            document.getElementById('live-ui-performance').classList.add('hidden');
            await renderVersusScoreboard(match);
        }
    }

    async function renderVersusScoreboard(match) {
        const live = match.live_data || {};
        const parts = match.participants || {};

        // Score
        const t1 = live.t1 || { r: 0, w: 0, o: 0 };
        document.getElementById('live-score-s1').innerText = `${t1.r}/${t1.w}`;
        document.getElementById('live-over-s1').innerText = `(${t1.o} ov)`;
        
        const t2 = live.t2 || { r: 0, w: 0, o: 0 };
        document.getElementById('live-score-s2').innerText = `${t2.r}/${t2.w}`;
        document.getElementById('live-over-s2').innerText = `(${t2.o} ov)`;

        // Names
        let name1 = "Team A", name2 = "Team B";

        if (match.sport_type === 'Team' && parts.team1_id) {
            const { data: teams } = await supabaseClient
                .from('teams')
                .select('id, name')
                .in('id', [parts.team1_id, parts.team2_id]);
            
            if (teams) {
                const team1 = teams.find(t => t.id === parts.team1_id);
                const team2 = teams.find(t => t.id === parts.team2_id);
                if(team1) name1 = team1.name;
                if(team2) name2 = team2.name;
            }

            const list1 = document.getElementById('roster-list-p1');
            if (list1.innerHTML.includes('Loading')) {
                await fetchAndRenderRoster(parts.team1_id, 'roster-list-p1');
                await fetchAndRenderRoster(parts.team2_id, 'roster-list-p2');
            }

        } else {
            name1 = parts.player1_name || "Player 1";
            name2 = parts.player2_name || "Player 2";
            document.getElementById('roster-list-p1').innerHTML = `<p class="text-sm font-bold text-slate-800">${name1}</p>`;
            document.getElementById('roster-list-p2').innerHTML = `<p class="text-sm font-bold text-slate-800">${name2}</p>`;
        }

        document.getElementById('live-name-p1').innerText = name1;
        document.getElementById('live-name-p2').innerText = name2;
        document.getElementById('roster-header-p1').innerText = name1;
        document.getElementById('roster-header-p2').innerText = name2;
    }

    async function fetchAndRenderRoster(teamId, containerId) {
        if(!teamId) {
            document.getElementById(containerId).innerHTML = '<p class="text-[10px] text-slate-300">No squad.</p>';
            return;
        }

        const { data: members } = await supabaseClient
            .from('team_members')
            .select('users(name)')
            .eq('team_id', teamId)
            .eq('status', 'Accepted');

        const container = document.getElementById(containerId);
        if (!members || members.length === 0) {
            container.innerHTML = '<p class="text-[10px] text-slate-300">No members found.</p>';
        } else {
            container.innerHTML = members.map(m => `
                <div class="py-1 border-b border-slate-50 last:border-0">
                    <p class="text-xs font-semibold text-slate-700 truncate">${m.users?.name || 'Unknown'}</p>
                </div>
            `).join('');
        }
    }

    // --- UPDATED PERFORMANCE LOGIC (MERGE LISTS) ---
    function renderPerformanceLeaderboard(match) {
        const table = document.getElementById('live-perf-table');
        
        // 1. Get Lists
        const allParticipants = match.participants?.students || [];
        const results = match.live_data?.results || [];

        if (allParticipants.length === 0) {
            table.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-slate-400 text-xs">No participants registered.</td></tr>';
            return;
        }

        // 2. Merge Data
        const leaderboard = allParticipants.map(student => {
            const res = results.find(r => r.uid === student.id);
            const timeVal = res?.time ? parseFloat(res.time) : null;
            
            return {
                ...student, 
                hasResult: !!res,
                timeDisplay: res?.time || '-',
                // Use a large number for sorting if no time exists
                sortValue: (timeVal !== null && !isNaN(timeVal)) ? timeVal : 999999999 
            };
        });

        // 3. Sort (Scores First, Then Pending)
        leaderboard.sort((a, b) => a.sortValue - b.sortValue);

        // 4. Render
        table.innerHTML = leaderboard.map((p, index) => {
            let rankDisplay = `<span class="text-slate-300 font-mono text-sm">-</span>`; // Default for pending
            
            if (p.hasResult) {
                // If they have a score, they get a rank
                rankDisplay = `<span class="font-bold text-slate-400 text-xs">#${index + 1}</span>`;
                if (index === 0) rankDisplay = '🏆';
                if (index === 1) rankDisplay = '🥈';
                if (index === 2) rankDisplay = '🥉';
            }

            return `
            <tr class="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                <td class="py-3 pl-5 text-lg">${rankDisplay}</td>
                <td class="py-3">
                    <p class="text-sm font-bold text-slate-800 leading-tight">${p.name}</p>
                    <p class="text-[10px] text-slate-400 font-mono">${p.student_id || ''}</p>
                </td>
                <td class="py-3 pr-5 text-right font-bold ${p.hasResult ? 'text-indigo-600' : 'text-slate-300'} font-mono">
                    ${p.timeDisplay}
                </td>
            </tr>`;
        }).join('');
    }

    // --- 8. TEAM & REGISTRATION LOGIC ---
    window.toggleTeamView = function(view) {
        document.getElementById('team-marketplace').classList.add('hidden');
        document.getElementById('team-locker').classList.add('hidden');
        
        const btnMarket = document.getElementById('btn-team-market');
        const btnLocker = document.getElementById('btn-team-locker');

        const activeClass = "flex-1 py-2 rounded-lg text-xs font-semibold transition-all bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100";
        const inactiveClass = "flex-1 py-2 rounded-lg text-xs font-medium transition-all text-slate-500 hover:bg-slate-50";

        if(view === 'marketplace') {
            document.getElementById('team-marketplace').classList.remove('hidden');
            btnMarket.className = activeClass;
            btnLocker.className = inactiveClass;
            loadTeamSportsFilter().then(() => window.loadTeamMarketplace());
        } else {
            document.getElementById('team-locker').classList.remove('hidden');
            btnLocker.className = activeClass;
            btnMarket.className = inactiveClass;
            window.loadTeamLocker();
        }
    }

    async function loadTeamSportsFilter() {
        const select = document.getElementById('team-sport-filter');
        if (!select || select.children.length > 1) return;
        const { data: sports } = await supabaseClient.from('sports').select('id, name').eq('type', 'Team').eq('status', 'Open');
        if (sports) {
            select.innerHTML = `<option value="all">All</option>`;
            sports.forEach(s => select.innerHTML += `<option value="${s.id}">${s.name}</option>`);
        }
    }

    window.loadTeamMarketplace = async function() {
        const container = document.getElementById('marketplace-list');
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';
        const filterVal = document.getElementById('team-sport-filter').value;
        const searchText = document.getElementById('team-marketplace-search')?.value?.toLowerCase() || '';

        let query = supabaseClient.from('teams').select('*, sports (name, team_size), users!captain_id (name, gender)').eq('status', 'Open').order('created_at', { ascending: false });
        if(filterVal !== 'all') query = query.eq('sport_id', filterVal);
        const { data: teams, error } = await query;

        if (error || !teams || teams.length === 0) {
             container.innerHTML = '<div class="p-8 text-center"><p class="text-slate-500 text-sm">No open teams available.</p></div>';
             return;
        }

        const teamPromises = teams.map(async (t) => {
            const { count } = await supabaseClient.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', t.id).eq('status', 'Accepted');
            const max = t.sports?.team_size || 5; 
            return { ...t, seatsLeft: Math.max(0, max - (count || 0)) };
        });
        const teamsWithCounts = await Promise.all(teamPromises);
        const validTeams = teamsWithCounts.filter(t => {
            if (searchText && !t.name.toLowerCase().includes(searchText)) return false;
            if (t.users?.gender && currentUser.gender && t.users.gender !== currentUser.gender) return false;
            return true;
        });

        container.innerHTML = validTeams.map(t => {
            const isFull = t.seatsLeft <= 0;
            const btnClass = isFull ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-indigo-600 text-white shadow-sm";
            const action = isFull ? "" : `window.viewSquadAndJoin('${t.id}', '${t.sports.name.replace(/'/g, "\\'")}', ${t.seatsLeft})`;
            return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-3">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 font-bold text-xs">${t.name.substring(0,2).toUpperCase()}</div>
                        <div><h4 class="font-semibold text-slate-900 text-sm">${t.name}</h4><p class="text-xs text-slate-500">Capt: ${t.users?.name}</p></div>
                    </div>
                    <span class="text-[10px] font-semibold bg-slate-100 px-2 py-1 rounded text-slate-600 uppercase">${t.sports.name}</span>
                </div>
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                    <div class="flex items-center gap-1.5"><span class="text-lg font-bold ${isFull ? 'text-slate-400' : 'text-indigo-600'}">${t.seatsLeft}</span><span class="text-[10px] text-slate-400 uppercase font-bold">Seats Left</span></div>
                    <button onclick="${action}" class="px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${btnClass}" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : 'Join'}</button>
                </div>
            </div>`;
        }).join('');
    }

    window.viewSquadAndJoin = async function(teamId, sportName, seatsLeft) {
        if(seatsLeft <= 0) return showToast("❌ This team is full!", "error");
        const { data: sport } = await supabaseClient.from('sports').select('id').eq('name', sportName).single();
        if(!myRegistrations.includes(sport.id)) return showToast(`⚠️ You must Register for ${sportName} individually first!`, "error");

        const { data: existingTeam } = await supabaseClient.from('team_members').select('team_id, teams!inner(sport_id)').eq('user_id', currentUser.id).eq('teams.sport_id', sport.id);
        if(existingTeam && existingTeam.length > 0) return showToast(`❌ You are already in a team for ${sportName}.`, "error");

        const list = document.getElementById('view-squad-list');
        list.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Loading roster...</p>';
        document.getElementById('modal-view-squad').classList.remove('hidden');

        const { data: members } = await supabaseClient.from('team_members').select('users(name, class_name)').eq('team_id', teamId).eq('status', 'Accepted');
        
        list.innerHTML = (members || []).map(u => `
            <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div><span class="text-sm font-semibold text-slate-800 block">${u.users.name}</span><span class="text-[10px] text-slate-500 font-mono">${u.users.class_name || 'N/A'}</span></div>
                <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400"><i data-lucide="user" class="w-4 h-4"></i></div>
            </div>`).join('');
        
        if(window.lucide) lucide.createIcons();
        const joinBtn = document.getElementById('btn-confirm-join');
        const newBtn = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newBtn, joinBtn);
        newBtn.onclick = () => sendJoinRequest(teamId);
    }

    async function sendJoinRequest(teamId) {
        const btn = document.getElementById('btn-confirm-join');
        btn.disabled = true; btn.innerText = "Sending...";
        const { error } = await supabaseClient.from('team_members').insert({ team_id: teamId, user_id: currentUser.id, status: 'Pending' });
        if(error) { showToast(error.message, "error"); btn.disabled = false; btn.innerText = "Send Join Request"; }
        else { showToast("Request Sent!", "success"); window.closeModal('modal-view-squad'); btn.disabled = false; btn.innerText = "Send Join Request"; }
    }

    window.loadTeamLocker = async function() {
        const container = document.getElementById('locker-list');
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';
        const { data: memberships } = await supabaseClient.from('team_members').select(`id, status, teams (id, name, status, captain_id, sport_id, sports(name, team_size))`).eq('user_id', currentUser.id);

        if(!memberships || memberships.length === 0) {
            container.innerHTML = `<div class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200"><p class="text-slate-500 text-sm">You are not in any teams.</p></div>`;
            return;
        }

        const htmlItems = await Promise.all(memberships.map(async (m) => {
            const t = m.teams;
            if (!t) return ''; 
            const isCaptain = t.captain_id === currentUser.id;
            const { data: squad } = await supabaseClient.from('team_members').select('users(name, mobile)').eq('team_id', t.id).eq('status', 'Accepted');
            
            return `
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-4">
                <div class="flex justify-between items-start mb-4">
                    <div><h4 class="font-bold text-lg text-slate-900">${t.name}</h4><div class="flex items-center gap-2 mt-1"><span class="text-[10px] font-bold uppercase text-indigo-600 tracking-wide">${t.sports?.name}</span><span class="w-1 h-1 rounded-full bg-slate-300"></span><span class="text-[10px] font-bold uppercase text-slate-500">${t.status}</span></div></div>
                    ${isCaptain ? '<span class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold border border-indigo-200">CAPTAIN</span>' : ''}
                </div>
                <div class="mb-4 space-y-2">${(squad || []).map(s => `<div class="flex justify-between text-xs bg-slate-50 p-2 rounded"><span>${s.users.name}</span><span class="font-mono text-slate-400">${s.users.mobile}</span></div>`).join('')}</div>
                ${isCaptain ? `<button onclick="window.openManageTeamModal('${t.id}', '${t.name}', ${t.status === 'Locked'}, ${t.sports?.team_size})" class="w-full py-2 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">Manage Team</button>` : `<button onclick="window.leaveTeam('${m.id}', '${t.name}')" class="w-full py-2 border border-red-200 text-red-600 text-xs font-bold rounded-lg">Leave Team</button>`}
            </div>`;
        }));
        container.innerHTML = htmlItems.join('');
    }

    window.leaveTeam = function(memberId, teamName) {
        showConfirmDialog("Leave Team?", `Leave ${teamName}?`, async () => {
            await supabaseClient.from('team_members').delete().eq('id', memberId);
            window.loadTeamLocker(); window.closeModal('modal-confirm');
        });
    }

    // --- REGISTRATION ---
    window.toggleRegisterView = function(view) {
        document.getElementById('reg-section-new').classList.add('hidden');
        document.getElementById('reg-section-history').classList.add('hidden');
        const btnNew = document.getElementById('btn-reg-new');
        const btnHist = document.getElementById('btn-reg-history');
        const active = "flex-1 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100";
        const inactive = "flex-1 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50";

        if(view === 'new') {
            document.getElementById('reg-section-new').classList.remove('hidden');
            btnNew.className = active; btnHist.className = inactive;
            window.loadSportsDirectory();
        } else {
            document.getElementById('reg-section-history').classList.remove('hidden');
            btnHist.className = active; btnNew.className = inactive;
            window.loadRegistrationHistory('history-list');
        }
    }

    window.loadSportsDirectory = async function() {
        if(allSportsList.length > 0) { renderSportsList(allSportsList); return; }
        const { data: sports } = await supabaseClient.from('sports').select('*').eq('status', 'Open').order('name');
        allSportsList = sports || [];
        renderSportsList(allSportsList);
    }
    
    function renderSportsList(list) {
        const container = document.getElementById('sports-list');
        if(!list.length) { container.innerHTML = '<p class="col-span-2 text-center text-slate-500 py-8">No sports found.</p>'; return; }
        container.innerHTML = list.map(s => {
            const isReg = myRegistrations.includes(s.id);
            return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-40">
                <div><div class="flex justify-between items-start mb-3"><div class="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600"><i data-lucide="${s.icon || 'trophy'}" class="w-4 h-4"></i></div><span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">${s.type}</span></div><h4 class="font-bold text-sm text-slate-900 mb-1 line-clamp-2">${s.name}</h4></div>
                <button onclick="${isReg ? '' : `window.openRegistrationModal('${s.id}')`}" class="w-full py-2.5 rounded-lg text-xs font-bold ${isReg ? 'bg-green-100 text-green-700' : 'bg-slate-900 text-white'}" ${isReg ? 'disabled' : ''}>${isReg ? 'Registered' : 'Register Now'}</button>
            </div>`;
        }).join('');
        lucide.createIcons();
    }

    window.openRegistrationModal = async function(id) {
        const { data: sport } = await supabaseClient.from('sports').select('*').eq('id', id).single();
        if(!sport) return;
        selectedSportForReg = sport; 
        document.getElementById('reg-modal-sport-name').innerText = sport.name;
        document.getElementById('reg-modal-user-name').innerText = currentUser.name;
        document.getElementById('reg-modal-user-details').innerText = `${currentUser.class_name} • ${currentUser.student_id}`;
        document.getElementById('reg-desc').innerText = sport.description || 'No description.';
        document.getElementById('reg-rules').innerHTML = sport.rules ? sport.rules.split('\n').map(r => `<li>${r}</li>`).join('') : '<li>No specific rules.</li>';
        document.getElementById('reg-mobile').value = currentUser.mobile || ''; 
        document.getElementById('modal-register').classList.remove('hidden');
    }

    window.confirmRegistration = async function() {
        const btn = document.querySelector('#modal-register button[onclick="confirmRegistration()"]');
        btn.innerText = "Processing..."; btn.disabled = true;
        
        const mobile = document.getElementById('reg-mobile').value;
        if(!mobile) { showToast("Mobile required!", "error"); btn.disabled = false; return; }
        
        if (mobile !== currentUser.mobile) {
            await supabaseClient.from('users').update({ mobile: mobile }).eq('id', currentUser.id);
            currentUser.mobile = mobile;
        }

        const { error } = await supabaseClient.from('registrations').insert({ user_id: currentUser.id, sport_id: selectedSportForReg.id });
        if(error) { showToast(error.message, "error"); }
        else {
            myRegistrations.push(selectedSportForReg.id);
            showToast("Registered Successfully!", "success");
            window.closeModal('modal-register');
            renderSportsList(allSportsList);
        }
        btn.innerText = "Confirm & Register"; btn.disabled = false;
    }

    window.loadRegistrationHistory = async function(containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';
        const { data: regs } = await supabaseClient.from('registrations').select(`id, created_at, sports (id, name, icon, type)`).eq('user_id', currentUser.id).order('created_at', { ascending: false });

        if(!regs || !regs.length) { container.innerHTML = `<div class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200"><p class="text-slate-500 text-sm">No registrations yet.</p></div>`; return; }

        container.innerHTML = regs.map(r => `
            <div class="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-2.5">
                <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0"><i data-lucide="${r.sports.icon || 'trophy'}" class="w-5 h-5"></i></div>
                <div class="flex-1 min-w-0"><h4 class="font-bold text-sm text-slate-900 truncate">${r.sports.name}</h4><p class="text-xs text-slate-500 font-medium">${r.sports.type}</p></div>
                <button onclick="window.withdrawRegistration('${r.id}', '${r.sports.id}')" class="text-[10px] text-red-600 font-semibold border border-red-200 px-3 py-1.5 rounded-lg bg-red-50">Withdraw</button>
            </div>`).join('');
        lucide.createIcons();
    }

    window.withdrawRegistration = function(regId, sportId) {
        showConfirmDialog("Withdraw?", "Cancel registration?", async () => {
             // Logic simplified for brevity; same as original
             await supabaseClient.from('registrations').delete().eq('id', regId);
             myRegistrations = myRegistrations.filter(id => id != sportId);
             window.loadRegistrationHistory('history-list');
             window.closeModal('modal-confirm');
        });
    }
    
    // --- UTILS ---
    window.closeModal = id => {
        document.getElementById(id).classList.add('hidden');
        if(id === 'modal-match-live') currentLiveMatchId = null;
    }

    window.showToast = function(msg, type='info') {
        const t = document.getElementById('toast-container');
        document.getElementById('toast-msg').innerText = msg;
        t.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
        setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10'), 3000);
    }

    function setupConfirmModal() {
        let callback = null;
        window.showConfirmDialog = (title, msg, onConfirm) => {
            document.getElementById('confirm-title').innerText = title;
            document.getElementById('confirm-msg').innerText = msg;
            callback = onConfirm;
            document.getElementById('modal-confirm').classList.remove('hidden');
        };
        document.getElementById('btn-confirm-yes').onclick = () => { if(callback) callback(); };
        document.getElementById('btn-confirm-cancel').onclick = () => window.closeModal('modal-confirm');
    }

    function injectToastContainer() {
        if(!document.getElementById('toast-container')) {
            const div = document.createElement('div');
            div.id = 'toast-container';
            div.className = 'fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[70] transition-all duration-300 opacity-0 pointer-events-none translate-y-10 w-11/12 max-w-sm';
            div.innerHTML = `<div class="bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border border-slate-700"><div id="toast-icon"></div><p id="toast-msg" class="text-sm font-semibold"></p></div>`;
            document.body.appendChild(div);
        }
    }

})();

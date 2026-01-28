// ==========================================
// URJA 2026 - STUDENT PORTAL CONTROLLER
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

    // --- 3. NAVIGATION (UPDATED FOR FAB) ---
    function setupTabSystem() {
        window.switchTab = function(tabId) {
            // 1. Hide all Views
            document.querySelectorAll('[id^="view-"]').forEach(el => {
                el.classList.add('hidden');
                el.classList.remove('animate-fade-in');
            });
            
            // 2. Show Target View
            const targetView = document.getElementById('view-' + tabId);
            if(targetView) {
                targetView.classList.remove('hidden');
                void targetView.offsetWidth; // Trigger reflow
                targetView.classList.add('animate-fade-in');
            }
            
            // 3. Update Nav Styling
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active', 'text-indigo-600');
                el.classList.add('text-slate-400');
            });
            
            const activeNav = document.getElementById('nav-' + tabId);
            if(activeNav) {
                activeNav.classList.remove('text-slate-400');
                activeNav.classList.add('active', 'text-indigo-600');
            }

            // 4. WHATSAPP FAB LOGIC (Only show on Dashboard)
            const fab = document.getElementById('btn-whatsapp-fab');
            if (fab) {
                if (tabId === 'dashboard') {
                    fab.classList.remove('hidden');
                } else {
                    fab.classList.add('hidden');
                }
            }

            // 5. Load Tab Data
            if(tabId === 'dashboard') loadDashboard(); 
            if(tabId === 'register') window.toggleRegisterView('new');
            if(tabId === 'teams') window.toggleTeamView('marketplace');
            if(tabId === 'schedule') window.filterSchedule('upcoming');
        }
    }

    // --- 4. DASHBOARD ---
    async function loadDashboard() {
        // 1. Check Role and Show Admin Card if applicable
        if (currentUser && currentUser.role === 'admin') {
            const adminCard = document.getElementById('admin-dashboard-card');
            if(adminCard) adminCard.classList.remove('hidden');
        }

        // 2. Load Public Data
        loadLatestChampions();
    }

    window.openAdminPanel = function() {
        if(currentUser && currentUser.student_id) {
            // Pass student_id to admin panel for role verification
            window.location.href = `admin.html?id=${currentUser.student_id}`;
        } else {
            showToast("Error: User ID not found.", "error");
        }
    }

    // --- UPDATED: WINNERS CARD LOGIC ---
    async function loadLatestChampions() {
        const container = document.getElementById('home-champions-list'); 
        if (!container) return;

        // Loading State
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';

        // Fetch from 'winners' table
        const { data: winners, error } = await supabaseClient
            .from('winners')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Winners Error:", error);
            container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Failed to load winners.</p>';
            return;
        }

        if (!winners || winners.length === 0) {
            container.innerHTML = '<p class="text-sm text-slate-500 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">No results declared yet.</p>';
            return;
        }

        // Render Cards (Matching requested design)
        container.innerHTML = winners.map(w => `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
                
                <div class="flex justify-between items-center mb-5 pb-3 border-b border-slate-50">
                    <div class="flex items-center gap-3">
                        <h4 class="font-extrabold text-slate-700 uppercase text-sm tracking-wide">${w.sport_name}</h4>
                        <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-100 text-purple-700 uppercase tracking-wide border border-purple-200">
                            ${w.gender}
                        </span>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide border border-green-200">
                        Finished
                    </span>
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
        
        // Re-initialize icons
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
            if(view === 'upcoming') {
                btnUp.className = activeClass;
                btnRes.className = inactiveClass;
            } else {
                btnUp.className = inactiveClass;
                btnRes.className = activeClass;
            }
        }
        window.loadSchedule();
    }

    window.loadSchedule = async function() {
        const container = document.getElementById('schedule-list');
        if(!container) return;
        
        container.innerHTML = `
            <div class="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="calendar-clock" class="w-6 h-6 text-indigo-500"></i>
                </div>
                <h4 class="text-slate-900 font-medium text-sm">No Matches Scheduled</h4>
                <p class="text-slate-500 text-xs mt-1">Check back later for updates.</p>
            </div>`;
            
        if(window.lucide) lucide.createIcons();
    }

    // --- 7. TEAMS MODULE ---
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
        if (sports && sports.length > 0) {
            select.innerHTML = `<option value="all">All</option>`;
            sports.forEach(s => {
                select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            });
        }
    }

    window.loadTeamMarketplace = async function() {
        const container = document.getElementById('marketplace-list');
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';

        const filterVal = document.getElementById('team-sport-filter').value;
        const searchText = document.getElementById('team-marketplace-search')?.value?.toLowerCase() || '';

        // Query
        let query = supabaseClient
            .from('teams')
            .select('*, sports (name, team_size), users!captain_id (name, gender, class_name)')
            .eq('status', 'Open')
            .order('created_at', { ascending: false });

        if(filterVal !== 'all') query = query.eq('sport_id', filterVal);

        const { data: teams, error } = await query;

        if (error) {
            console.error("Team Market Error:", error);
            container.innerHTML = '<div class="p-6 bg-red-50 rounded-xl border border-red-200 text-center"><p class="text-red-600 text-sm">System Error. Please try again.</p></div>';
            return;
        }

        if (!teams || teams.length === 0) {
             container.innerHTML = '<div class="p-8 text-center"><p class="text-slate-500 text-sm">No open teams available right now.</p></div>';
             return;
        }

        const teamPromises = teams.map(async (t) => {
            const { count } = await supabaseClient.from('team_members')
                .select('*', { count: 'exact', head: true })
                .eq('team_id', t.id)
                .eq('status', 'Accepted');
            
            const max = t.sports?.team_size || 5; 
            return { ...t, seatsLeft: Math.max(0, max - (count || 0)) };
        });

        const teamsWithCounts = await Promise.all(teamPromises);

        const validTeams = teamsWithCounts.filter(t => {
            if (searchText && !t.name.toLowerCase().includes(searchText)) return false;
            if (t.users?.gender && currentUser.gender && t.users.gender !== currentUser.gender) return false;
            return true;
        });

        if (validTeams.length === 0) {
             container.innerHTML = '<div class="p-8 text-center"><p class="text-slate-500 text-sm">No matching teams found.</p></div>';
             return;
        }

        container.innerHTML = validTeams.map(t => {
            const isFull = t.seatsLeft <= 0;
            const btnText = isFull ? "Full" : "Join";
            
            // Professional button styles
            const btnClass = isFull 
                ? "px-4 py-2 bg-slate-100 text-slate-400 cursor-not-allowed text-xs font-semibold rounded-lg"
                : "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors";
            
            const safeSportName = t.sports.name.replace(/'/g, "\\'");
            const action = isFull ? "" : `window.viewSquadAndJoin('${t.id}', '${safeSportName}', ${t.seatsLeft})`;

            return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-3 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                             <span class="font-bold text-xs">${t.name.substring(0,2).toUpperCase()}</span>
                        </div>
                        <div>
                            <h4 class="font-semibold text-slate-900 text-sm leading-tight">${t.name}</h4>
                            <p class="text-xs text-slate-500 mt-0.5">Capt: ${t.users?.name || 'Unknown'}</p>
                        </div>
                    </div>
                    <span class="text-[10px] font-semibold bg-slate-100 px-2 py-1 rounded text-slate-600 uppercase tracking-wide">${t.sports.name}</span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                    <div class="flex items-center gap-1.5">
                        <span class="text-lg font-bold ${isFull ? 'text-slate-400' : 'text-indigo-600'}">${t.seatsLeft}</span>
                        <span class="text-[10px] text-slate-400 uppercase font-semibold">Seats Left</span>
                    </div>
                    <button onclick="${action}" class="${btnClass}" ${isFull ? 'disabled' : ''}>
                        ${btnText}
                    </button>
                </div>
            </div>
        `}).join('');
    }

    // --- VIEW SQUAD LOGIC ---
    window.viewSquadAndJoin = async function(teamId, sportName, seatsLeft) {
        if(seatsLeft <= 0) return showToast("❌ This team is full!", "error");

        const sportId = await getSportIdByName(sportName);
        
        if(!myRegistrations.includes(sportId)) {
            return showToast(`⚠️ You must Register for ${sportName} individually first!`, "error");
        }

        const { data: existingTeam } = await supabaseClient.from('team_members')
            .select('team_id, teams!inner(sport_id)')
            .eq('user_id', currentUser.id)
            .eq('teams.sport_id', sportId);
        
        if(existingTeam && existingTeam.length > 0) {
            return showToast(`❌ You are already in a team for ${sportName}.`, "error");
        }

        const list = document.getElementById('view-squad-list');
        list.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Loading roster...</p>';
        document.getElementById('modal-view-squad').classList.remove('hidden');

        // STEP 1: Get Member IDs (Status: Accepted)
        const { data: teamMembers, error: memberError } = await supabaseClient
            .from('team_members')
            .select('user_id')
            .eq('team_id', teamId)
            .eq('status', 'Accepted');

        if (memberError || !teamMembers) {
            console.error("Member Error:", memberError);
            list.innerHTML = '<p class="text-red-500 text-xs text-center">Error fetching list.</p>';
            return;
        }

        if (teamMembers.length === 0) {
            list.innerHTML = '<p class="text-slate-500 text-xs italic text-center py-2">No members yet. Be the first!</p>';
        } else {
            // STEP 2: Get Details for these IDs
            const userIds = teamMembers.map(m => m.user_id);
            const { data: users, error: userError } = await supabaseClient
                .from('users')
                .select('name, class_name')
                .in('id', userIds);

            if (userError || !users) {
                console.error("User Error:", userError);
                list.innerHTML = '<p class="text-red-500 text-xs text-center">Error loading profiles.</p>';
                return;
            }

            list.innerHTML = users.map(u => `
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div>
                        <span class="text-sm font-semibold text-slate-800 block">${u.name || 'Unknown'}</span>
                        <span class="text-[10px] text-slate-500 font-mono">${u.class_name || 'N/A'}</span>
                    </div>
                    <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400">
                        <i data-lucide="user" class="w-4 h-4"></i>
                    </div>
                </div>
            `).join('');
            
            if(window.lucide) lucide.createIcons();
        }

        // Attach event listener properly
        const joinBtn = document.getElementById('btn-confirm-join');
        // Clone node to strip old event listeners
        const newBtn = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newBtn, joinBtn);
        
        newBtn.onclick = () => sendJoinRequest(teamId);
    }

    async function sendJoinRequest(teamId) {
        const btn = document.getElementById('btn-confirm-join');
        const oldText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Sending...";

        const { error } = await supabaseClient.from('team_members').insert({ team_id: teamId, user_id: currentUser.id, status: 'Pending' });
        
        if(error) {
            showToast("Error: " + error.message, "error");
            btn.disabled = false;
            btn.innerText = oldText;
        } else {
            showToast("Request Sent to Captain!", "success");
            window.closeModal('modal-view-squad');
            btn.disabled = false;
            btn.innerText = oldText;
        }
    }

    window.loadTeamLocker = async function() {
        const container = document.getElementById('locker-list');
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';

        const { data: memberships, error } = await supabaseClient
            .from('team_members')
            .select(`
                id, status, 
                teams (id, name, status, captain_id, sport_id, sports(name, team_size))
            `)
            .eq('user_id', currentUser.id);

        if (error) {
            console.error("Locker Error:", error);
            container.innerHTML = '<div class="text-center p-6"><p class="text-red-500 text-sm">Error loading teams.</p></div>';
            return;
        }

        if(!memberships || memberships.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p class="text-slate-500 text-sm">You are not in any teams.</p>
                </div>`;
            return;
        }

        const htmlPromises = memberships.map(async (m) => {
            const t = m.teams;
            if (!t) return ''; 

            const isCaptain = t.captain_id === currentUser.id;
            const isLocked = t.status === 'Locked';
            
            const { data: squad } = await supabaseClient
                .from('team_members')
                .select('users(name, class_name, mobile)')
                .eq('team_id', t.id)
                .eq('status', 'Accepted');
                
            const squadHtml = (squad || []).map(s => `
                <div class="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg mb-2 border border-slate-100 w-full">
                    <div class="flex flex-col">
                        <span class="text-xs font-semibold text-slate-700">${s.users?.name}</span>
                        <span class="text-[10px] text-slate-500 font-medium">${s.users?.class_name || 'N/A'}</span>
                    </div>
                    <span class="text-[10px] font-mono text-slate-400">
                        ${s.users?.mobile || 'No #'}
                    </span>
                </div>
            `).join('');

            return `
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-4">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h4 class="font-bold text-lg text-slate-900">${t.name}</h4>
                        <div class="flex items-center gap-2 mt-1">
                             <span class="text-[10px] font-bold uppercase text-indigo-600 tracking-wide">${t.sports?.name}</span>
                             <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                             <span class="text-[10px] font-bold uppercase text-slate-500">${t.status}</span>
                        </div>
                    </div>
                    ${isCaptain ? '<span class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold border border-indigo-200">CAPTAIN</span>' : ''}
                </div>
                
                <div class="mb-4">
                    <p class="text-[10px] text-slate-400 uppercase font-bold mb-2 tracking-wide">Roster</p>
                    <div class="flex flex-col w-full">${squadHtml}</div>
                </div>
                
                <div class="flex gap-2 pt-2 border-t border-slate-100">
                    ${isCaptain ? 
                        `<button onclick="window.openManageTeamModal('${t.id}', '${t.name}', ${isLocked}, ${t.sports?.team_size})" class="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100 transition-colors">Manage Team</button>
                         ${!isLocked ? `<button onclick="window.promptDeleteTeam('${t.id}')" class="px-3 py-2 bg-red-50 text-red-600 rounded-lg border border-red-100 hover:bg-red-100"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}`
                    : 
                        !isLocked ? `<button onclick="window.leaveTeam('${m.id}', '${t.name}')" class="flex-1 py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors">Leave Team</button>` 
                        : `<div class="w-full py-2 bg-slate-50 text-center rounded-lg text-xs font-bold text-slate-400 flex items-center justify-center gap-2 border border-slate-100"><i data-lucide="lock" class="w-3 h-3"></i> Locked</div>`
                    }
                </div>
            </div>`;
        });

        const htmlItems = await Promise.all(htmlPromises);
        container.innerHTML = htmlItems.join('');
        lucide.createIcons();
    }

    window.leaveTeam = function(memberId, teamName) {
        showConfirmDialog("Leave Team?", `Are you sure you want to leave ${teamName}?`, async () => {
            const { error } = await supabaseClient.from('team_members').delete().eq('id', memberId);
            if(error) showToast("Error leaving team", "error");
            else {
                showToast("Left team successfully", "success");
                window.loadTeamLocker();
                window.closeModal('modal-confirm');
            }
        });
    }

    // STRICT WITHDRAWAL
    window.withdrawRegistration = async function(regId, sportId, sportType, sportName) {
        showConfirmDialog("Withdraw?", `Withdraw from ${sportName}?`, async () => {
            
            // 1. IF TEAM SPORT: Handle Team Membership First
            if (sportType && sportType.toLowerCase() === 'team') {
                const { data: membership } = await supabaseClient
                    .from('team_members')
                    .select('id, teams!inner(status, captain_id, name)')
                    .eq('user_id', currentUser.id)
                    .eq('teams.sport_id', sportId)
                    .maybeSingle();

                if (membership) {
                    if (membership.teams.status === 'Locked') {
                        window.closeModal('modal-confirm');
                        return showToast(`Cannot withdraw! Your team '${membership.teams.name}' is LOCKED.`, "error");
                    }
                    if (membership.teams.captain_id === currentUser.id) {
                        window.closeModal('modal-confirm');
                        return showToast(`⚠️ Captains cannot withdraw. Delete the team in 'Teams' tab first.`, "error");
                    }
                    await supabaseClient.from('team_members').delete().eq('id', membership.id);
                }
            }

            const { error } = await supabaseClient.from('registrations').delete().eq('id', regId);
            
            if (error) {
                showToast("Withdrawal Failed: " + error.message, "error");
            } else {
                showToast("Withdrawn Successfully", "success");
                myRegistrations = myRegistrations.filter(id => id != sportId);
                
                if(document.getElementById('history-list')) window.loadRegistrationHistory('history-list'); 
                if(document.getElementById('my-registrations-list')) window.loadRegistrationHistory('my-registrations-list');
                if(document.getElementById('sports-list') && document.getElementById('sports-list').children.length > 0) {
                    renderSportsList(allSportsList);
                }
                
                window.closeModal('modal-confirm');
            }
        });
    }

    // --- REGISTRATION LOGIC ---
    window.toggleRegisterView = function(view) {
        document.getElementById('reg-section-new').classList.add('hidden');
        document.getElementById('reg-section-history').classList.add('hidden');
        
        const btnNew = document.getElementById('btn-reg-new');
        const btnHist = document.getElementById('btn-reg-history');
        
        const activeClass = "flex-1 py-2 rounded-lg text-xs font-semibold transition-all bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100";
        const inactiveClass = "flex-1 py-2 rounded-lg text-xs font-medium transition-all text-slate-500 hover:bg-slate-50";

        if(view === 'new') {
            document.getElementById('reg-section-new').classList.remove('hidden');
            btnNew.className = activeClass;
            btnHist.className = inactiveClass;
            window.loadSportsDirectory();
        } else {
            document.getElementById('reg-section-history').classList.remove('hidden');
            btnHist.className = activeClass;
            btnNew.className = inactiveClass;
            window.loadRegistrationHistory('history-list');
        }
    }

   window.loadSportsDirectory = async function() {
        const container = document.getElementById('sports-list');
        if(container.children.length > 0 && allSportsList.length > 0) return;

        container.innerHTML = '<div class="col-span-2 flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';

        const { data: sports } = await supabaseClient
            .from('sports')
            .select('*')
            .eq('status', 'Open')
            .order('name');
            
        allSportsList = sports || [];
        renderSportsList(allSportsList);
    }
    
    function renderSportsList(list) {
        const container = document.getElementById('sports-list');
        
        if(!list || list.length === 0) {
            container.innerHTML = '<p class="col-span-2 text-center text-slate-500 py-8">No sports found.</p>';
            return;
        }

        container.innerHTML = list.map(s => {
            const isReg = myRegistrations.includes(s.id);
            // Cleaner, more professional cards
            const btnClass = isReg 
                ? "bg-green-100 text-green-700 border border-green-200 cursor-not-allowed" 
                : "bg-slate-900 text-white hover:opacity-90 shadow-md";
            
            return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-40 hover:shadow-md transition-all group">
                
                <div>
                    <div class="flex justify-between items-start mb-3">
                         <div class="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                            <i data-lucide="${s.icon || 'trophy'}" class="w-4 h-4"></i>
                        </div>
                        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">${s.type}</span>
                    </div>
                    <h4 class="font-bold text-sm leading-tight text-slate-900 mb-1 line-clamp-2">${s.name}</h4>
                </div>

                <button onclick="${isReg ? '' : `window.openRegistrationModal('${s.id}')`}" class="w-full py-2.5 rounded-lg text-xs font-bold transition-all ${btnClass}" ${isReg ? 'disabled' : ''}>
                    ${isReg ? '<i data-lucide="check" class="w-3 h-3 inline mr-1"></i> Registered' : 'Register Now'}
                </button>
            </div>`;
        }).join('');
        lucide.createIcons();
    }

    window.filterSports = function() {
        const query = document.getElementById('search-input').value.toLowerCase();
        const filtered = allSportsList.filter(s => s.name.toLowerCase().includes(query));
        renderSportsList(filtered);
    }

    window.loadRegistrationHistory = async function(containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '<div class="py-12 flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';

        const { data: regs } = await supabaseClient
            .from('registrations')
            .select(`id, created_at, status, sports (id, name, icon, type)`)
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if(!regs || regs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p class="text-slate-500 text-sm">You haven't registered for any events yet.</p>
                </div>`;
            return;
        }

        container.innerHTML = regs.map(r => {
            return `
            <div class="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-2.5">
                <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                    <i data-lucide="${r.sports.icon || 'trophy'}" class="w-5 h-5"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-sm text-slate-900 truncate">${r.sports.name}</h4>
                    <p class="text-xs text-slate-500 font-medium">${r.sports.type} • ${new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <button onclick="window.withdrawRegistration('${r.id}', '${r.sports.id}', '${r.sports.type}', '${r.sports.name}')" class="text-[10px] text-red-600 font-semibold border border-red-200 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
                    Withdraw
                </button>
            </div>
        `}).join('');
        lucide.createIcons();
    }

    window.openCreateTeamModal = async function() {
        const { data: sports } = await supabaseClient.from('sports').select('*').eq('type', 'Team').eq('status', 'Open');
        const registeredSports = sports.filter(s => myRegistrations.includes(s.id));
        
        if(registeredSports.length === 0) return showToast("Register for a Team Sport individually first!", "error");

        const select = document.getElementById('new-team-sport');
        select.innerHTML = registeredSports.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        
        document.getElementById('modal-create-team').classList.remove('hidden');
    }

    window.createTeam = async function() {
        const name = document.getElementById('new-team-name').value;
        const sportId = document.getElementById('new-team-sport').value;
        
        if(!name) return showToast("Enter Team Name", "error");
        
        if(!myRegistrations.includes(parseInt(sportId)) && !myRegistrations.includes(sportId)) {
            return showToast("⚠️ Security Check: Register for this sport first!", "error");
        }

        const { data: existing } = await supabaseClient.from('team_members')
            .select('team_id, teams!inner(sport_id)')
            .eq('user_id', currentUser.id)
            .eq('teams.sport_id', sportId);
            
        if(existing && existing.length > 0) return showToast("❌ You already have a team for this sport.", "error");

        const { data: team, error } = await supabaseClient.from('teams')
            .insert({ name: name, sport_id: sportId, captain_id: currentUser.id, status: 'Open' })
            .select()
            .single();

        if(error) {
            showToast(error.message, "error");
        } else {
            await supabaseClient.from('team_members').insert({ team_id: team.id, user_id: currentUser.id, status: 'Accepted' });
            showToast("Team Created!", "success");
            window.closeModal('modal-create-team');
            window.toggleTeamView('locker');
        }
    }

    // --- MANAGE TEAM (CAPTAIN) ---
    window.openManageTeamModal = async function(teamId, teamName, isLocked, teamSize) {
        document.getElementById('manage-team-title').innerText = "Manage: " + teamName;
        
        const { data: pending } = await supabaseClient.from('team_members').select('id, users(name, class_name)').eq('team_id', teamId).eq('status', 'Pending');
        const reqList = document.getElementById('manage-requests-list');
        reqList.innerHTML = (!pending || pending.length === 0) ? '<p class="text-xs text-slate-400 italic py-2">No pending requests.</p>' : pending.map(p => `
            <div class="flex justify-between items-center p-3 bg-amber-50 rounded-lg border border-amber-200 mb-2">
                <div>
                    <span class="text-xs font-bold text-slate-800 block">${p.users.name}</span>
                    <span class="text-[10px] text-slate-500 font-mono">${p.users.class_name || 'N/A'}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.handleRequest('${p.id}', 'Accepted', '${teamId}')" class="p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200"><i data-lucide="check" class="w-3.5 h-3.5"></i></button>
                    <button onclick="window.handleRequest('${p.id}', 'Rejected', '${teamId}')" class="p-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>`).join('');

        const { data: members } = await supabaseClient.from('team_members').select('id, user_id, users(name, class_name, mobile)').eq('team_id', teamId).eq('status', 'Accepted');
        const memList = document.getElementById('manage-members-list');
        memList.innerHTML = members.map(m => `
            <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg mb-2 border border-slate-100">
                <div>
                    <span class="text-xs font-bold text-slate-800 block ${m.user_id === currentUser.id ? 'text-indigo-600' : ''}">
                        ${m.users.name} ${m.user_id === currentUser.id ? '(You)' : ''}
                    </span>
                    <span class="text-[10px] text-slate-500 font-mono">${m.users.class_name || 'N/A'} • ${m.users.mobile || 'No #'}</span>
                </div>
                ${m.user_id !== currentUser.id && !isLocked ? `<button onclick="window.removeMember('${m.id}', '${teamId}')" class="text-red-500 hover:text-red-700"><i data-lucide="trash" class="w-3.5 h-3.5"></i></button>` : ''}
            </div>`).join('');

        const oldLock = document.getElementById('btn-lock-dynamic');
        if(oldLock) oldLock.remove();
        
        if (!isLocked) {
             const lockBtn = document.createElement('button');
             lockBtn.id = 'btn-lock-dynamic';
             lockBtn.className = "w-full py-3 mt-4 mb-2 bg-red-50 text-red-600 font-bold rounded-xl text-xs border border-red-200 flex items-center justify-center gap-2 hover:bg-red-100 transition-colors";
             lockBtn.innerHTML = '<i data-lucide="lock" class="w-3.5 h-3.5"></i> LOCK TEAM PERMANENTLY';
             lockBtn.onclick = () => window.promptLockTeam(teamId, teamSize);
             memList.parentElement.parentElement.insertBefore(lockBtn, memList.parentElement.nextElementSibling);
        }
        
        lucide.createIcons();
        document.getElementById('modal-manage-team').classList.remove('hidden');
    }

    window.handleRequest = async function(memberId, status, teamId) {
        if(status === 'Rejected') await supabaseClient.from('team_members').delete().eq('id', memberId);
        else await supabaseClient.from('team_members').update({ status: 'Accepted' }).eq('id', memberId);
        window.closeModal('modal-manage-team');
        window.loadTeamLocker();
    }

    window.promptLockTeam = async function(teamId, requiredSize) {
        const { count } = await supabaseClient.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'Accepted');
        
        const required = requiredSize || 2; 
        if(count < required) return showToast(`⚠️ Squad incomplete! Need ${required} players.`, "error");
        
        showConfirmDialog("Lock Team?", "⚠️ This is FINAL. No members can be added/removed.", async () => {
            await supabaseClient.from('teams').update({ status: 'Locked' }).eq('id', teamId);
            showToast("Team Locked!", "success");
            window.closeModal('modal-manage-team');
            window.closeModal('modal-confirm');
            window.loadTeamLocker();
        });
    }

    window.promptDeleteTeam = function(teamId) {
        showConfirmDialog("Delete Team?", "Are you sure? This cannot be undone.", async () => {
            await supabaseClient.from('team_members').delete().eq('team_id', teamId);
            await supabaseClient.from('teams').delete().eq('id', teamId);
            showToast("Team Deleted", "success");
            window.closeModal('modal-confirm');
            window.loadTeamLocker();
        });
    }

    window.removeMember = function(memberId, teamId) {
        showConfirmDialog("Remove Player?", "Are you sure?", async () => {
            await supabaseClient.from('team_members').delete().eq('id', memberId);
            window.closeModal('modal-confirm');
            window.loadTeamLocker();
        });
    }

    window.openRegistrationModal = async function(id) {
        const { data: sport } = await supabaseClient.from('sports').select('*').eq('id', id).single();
        if(!sport) return;

        selectedSportForReg = sport; 
        
        document.getElementById('reg-modal-sport-name').innerText = sport.name;
        
        document.getElementById('reg-modal-user-name').innerText = currentUser.name || "Unknown";
        document.getElementById('reg-modal-user-details').innerText = `${currentUser.class_name || 'N/A'} • ${currentUser.student_id || 'N/A'}`;
        
        document.getElementById('reg-desc').innerText = sport.description || 'No description available.';
        const rulesHtml = sport.rules ? sport.rules.split('\n').map(r => `<li>${r}</li>`).join('') : '<li>No specific rules mentioned.</li>';
        document.getElementById('reg-rules').innerHTML = rulesHtml;

        document.getElementById('reg-info-teamsize').innerText = sport.team_size || 'N/A';
        document.getElementById('reg-badge-gender').innerText = sport.gender_category || 'All';
        document.getElementById('reg-badge-type').innerText = sport.type || 'Event';
        
        document.getElementById('reg-mobile').value = currentUser.mobile || ''; 
        document.getElementById('modal-register').classList.remove('hidden');
    }

    window.confirmRegistration = async function() {
        const btn = document.querySelector('#modal-register button[onclick="confirmRegistration()"]');
        const originalText = btn ? btn.innerText : 'Register';
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Registering...";
        }

        const mobileInput = document.getElementById('reg-mobile').value;
        if(!mobileInput) {
            showToast("⚠️ Mobile number required!", "error");
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
            }
            return;
        }

        if (mobileInput !== currentUser.mobile) {
            await supabaseClient.from('users').update({ mobile: mobileInput }).eq('id', currentUser.id);
            currentUser.mobile = mobileInput;
        }

        const { error } = await supabaseClient.from('registrations').insert({
            user_id: currentUser.id,
            sport_id: selectedSportForReg.id
        });

        if(error) {
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
            }
            showToast("Error: " + error.message, "error");
        }
        else {
            if (!myRegistrations.includes(selectedSportForReg.id)) {
                myRegistrations.push(selectedSportForReg.id);
            }

            showToast("Registration Successful!", "success");
            window.closeModal('modal-register');
            
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
            }

            renderSportsList(allSportsList);
        }
    }

    async function getSportIdByName(name) {
        const { data } = await supabaseClient.from('sports').select('id').eq('name', name).single();
        return data?.id;
    }

    window.closeModal = id => document.getElementById(id).classList.add('hidden');

    window.showToast = function(msg, type='info') {
        const t = document.getElementById('toast-container');
        if (!t) return; 
        
        const msgEl = document.getElementById('toast-msg');
        
        if (!msgEl) {
             t.innerHTML = `
             <div id="toast-content" class="bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border border-slate-700">
                <div id="toast-icon"></div>
                <p id="toast-msg" class="text-sm font-semibold"></p>
             </div>`;
        } else {
             document.getElementById('toast-msg').innerText = msg;
             const icon = document.getElementById('toast-icon');
             if (icon) {
                if (type === 'error') {
                    icon.innerHTML = '<i data-lucide="alert-triangle" class="w-5 h-5 text-red-400"></i>';
                } else {
                    icon.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i>';
                }
            }
        }
        
        if (window.lucide) lucide.createIcons();
        t.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
        setTimeout(() => {
            t.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
        }, 3000);
    }

    let confirmCallback = null;
    function setupConfirmModal() {
        if (!document.getElementById('btn-confirm-yes')) return;
        document.getElementById('btn-confirm-yes').onclick = () => {
            if(confirmCallback) confirmCallback();
        };
        document.getElementById('btn-confirm-cancel').onclick = () => window.closeModal('modal-confirm');
    }

    function showConfirmDialog(title, msg, onConfirm) {
        if (!document.getElementById('modal-confirm')) return;
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-msg').innerText = msg;
        confirmCallback = onConfirm;
        document.getElementById('modal-confirm').classList.remove('hidden');
    }

    function injectToastContainer() {
        if(!document.getElementById('toast-container')) {
            const div = document.createElement('div');
            div.id = 'toast-container';
            div.className = 'fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[70] transition-all duration-300 opacity-0 pointer-events-none translate-y-10 w-11/12 max-w-sm';
            div.innerHTML = `
            <div id="toast-content" class="bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border border-slate-700">
                <div id="toast-icon"></div>
                <p id="toast-msg" class="text-sm font-semibold"></p>
            </div>`;
            document.body.appendChild(div);
        }
    }

})();

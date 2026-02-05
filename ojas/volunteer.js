// ==========================================
// OJAS 2026 - VOLUNTEER CONTROLLER (FINAL FIX)
// ==========================================

(function() { 

    // --- 1. CONFIGURATION ---
    const SUPABASE_URL = 'https://sijmmlhltkksykhbuatn.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_9GjhwaWzz0McozvxVMINyQ_ZFU58z7F'; 

    if(!window.supabase) return console.error("Supabase not loaded");
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Global State
    let currentVolunteer = null;
    let assignedSport = null;
    let liveMatches = [];
    let rawTeams = []; 
    let currentActiveMatchId = null; 

    // --- 2. INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', async () => {
        if(window.lucide) lucide.createIcons();
        await authenticateVolunteer();
    });

    // --- 3. AUTHENTICATION ---
    async function authenticateVolunteer() {
        const urlParams = new URLSearchParams(window.location.search);
        const studentId = urlParams.get('id');

        if (!studentId) return showAuthError("No ID found. Please scan your QR code again.");

        const { data: user, error } = await supabase
            .from('users')
            .select(`*, sports (id, name, type, is_performance)`)
            .eq('student_id', studentId)
            .single();

        if (error) return showAuthError("Access Denied: " + error.message);
        if (!user) return showAuthError("User not found.");
        if (user.role !== 'volunteer') return showAuthError("Access Denied: Not a Volunteer.");
        if (!user.sports) return showAuthError("No Sport Assigned.");

        currentVolunteer = user;
        assignedSport = user.sports;

        document.getElementById('vol-sport-name').innerText = assignedSport.name;
        document.getElementById('vol-initials').innerText = user.name.substring(0, 2).toUpperCase();
        
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        await Promise.all([loadTeams(), loadLiveMatches()]);
        subscribeToRealtime();
    }

    function showAuthError(msg) {
        const el = document.getElementById('auth-msg');
        if(el) {
            el.innerText = msg;
            el.classList.add('text-red-600', 'font-bold');
        }
        const spinner = document.querySelector('.animate-spin');
        if(spinner) spinner.classList.remove('animate-spin');
    }

    // --- 4. DATA LOADING ---
    async function loadTeams() {
        const { data } = await supabase.from('teams').select('id, name');
        if (data) rawTeams = data;
    }

    async function loadLiveMatches() {
        // FIX: Updated ID to match volunteer.html
        const container = document.getElementById('matches-list-container'); 
        
        if(liveMatches.length === 0 && container) {
            container.innerHTML = '<div class="text-center py-10"><span class="loading-spinner text-indigo-600">Loading Live Events...</span></div>';
        }

        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .eq('sport_id', assignedSport.id)
            .eq('status', 'Live')
            .order('created_at', { ascending: false });

        if (error) {
            showToast("Connection Error", "error");
            return;
        }

        liveMatches = data;

        if (currentActiveMatchId) {
            const activeMatch = liveMatches.find(m => m.id === currentActiveMatchId);
            if (activeMatch) renderScoreboard(activeMatch); 
            else {
                closeMatchView();
                showToast("Match ended or removed", "info");
                renderMatchList();
            }
        } else {
            renderMatchList();
        }
    }

    function subscribeToRealtime() {
        supabase
            .channel('volunteer-live-updates')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'matches', 
                filter: `sport_id=eq.${assignedSport.id}` 
            }, (payload) => {
                loadLiveMatches();
            })
            .subscribe();
    }

    function getParticipantName(match, type) { 
        const p = match.participants || {};
        if (p[`player${type}_name`]) return p[`player${type}_name`];
        if (p[`team${type}_name`]) return p[`team${type}_name`];
        
        const teamId = p[`team${type}_id`];
        if (teamId && rawTeams.length > 0) {
            const team = rawTeams.find(t => t.id === teamId);
            if (team) return team.name;
        }
        return type === '1' ? 'Team A' : 'Team B';
    }

    // --- 5. VIEW 1: MATCH LIST ---
    window.renderMatchList = function() {
        const container = document.getElementById('matches-list-container');
        if(!container) return;
        container.innerHTML = '';

        if (liveMatches.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 text-slate-400 opacity-60">
                    <i data-lucide="radio" class="w-12 h-12 mb-2"></i>
                    <p class="text-sm font-bold">No Live Events</p>
                    <p class="text-xs">Wait for Admin to start a match.</p>
                </div>`;
            if(window.lucide) lucide.createIcons();
            return;
        }

        liveMatches.forEach(match => {
            let p1 = getParticipantName(match, '1');
            let p2 = getParticipantName(match, '2');

            if (assignedSport.is_performance) {
                p1 = "Performance Event"; 
                p2 = `${match.participants?.students?.length || 0} Participants`;
            }

            const card = document.createElement('div');
            card.className = "bg-white rounded-xl shadow-sm border border-slate-200 p-4 active:scale-95 transition-transform cursor-pointer";
            card.onclick = () => openMatchView(match.id);

            card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${match.title}</span>
                    <span class="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span> LIVE
                    </span>
                </div>
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-bold text-slate-900 leading-tight">${p1}</h3>
                        ${assignedSport.is_performance ? '' : `<p class="text-xs text-slate-500 font-medium">vs ${p2}</p>`}
                    </div>
                    <button class="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
                        <i data-lucide="chevron-right" class="w-5 h-5"></i>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
        if(window.lucide) lucide.createIcons();
    }

    // --- 6. VIEW 2: SCORE CONSOLE ---
    window.openMatchView = function(matchId) {
        const match = liveMatches.find(m => m.id === matchId);
        if(!match) return;

        currentActiveMatchId = matchId;

        document.getElementById('view-match-list').classList.add('hidden');
        document.getElementById('view-score-control').classList.remove('hidden');
        document.getElementById('btn-back').classList.remove('hidden');

        document.getElementById('control-match-title').innerText = match.title;
        
        let versusText = "";
        const winnerSelect = document.getElementById('select-winner');
        winnerSelect.innerHTML = '<option value="">Select Winner...</option>';

        if (assignedSport.is_performance) {
            versusText = "Update Results";
            document.getElementById('end-match-section').classList.add('hidden'); 
        } else {
            document.getElementById('end-match-section').classList.remove('hidden');
            const n1 = getParticipantName(match, '1');
            const n2 = getParticipantName(match, '2');
            versusText = `${n1} vs ${n2}`;
            winnerSelect.innerHTML += `<option value="${n1}">${n1}</option>`;
            winnerSelect.innerHTML += `<option value="${n2}">${n2}</option>`;
            winnerSelect.innerHTML += `<option value="Draw">Draw</option>`;
        }
        document.getElementById('control-match-versus').innerText = versusText;

        renderScoreboard(match);
    }

    window.closeMatchView = function() {
        currentActiveMatchId = null;
        document.getElementById('view-score-control').classList.add('hidden');
        document.getElementById('view-match-list').classList.remove('hidden');
        document.getElementById('btn-back').classList.add('hidden');
        renderMatchList();
    }

    function renderScoreboard(match) {
        const container = document.getElementById('score-inputs-container');
        container.innerHTML = '';

        if (assignedSport.is_performance) {
            const students = match.participants?.students || [];
            const results = match.live_data?.results || [];

            const rows = students.map(student => {
                const existing = results.find(r => r.uid === student.id) || {};
                return `
                <div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                    <div class="flex-1 min-w-0 pr-3">
                        <p class="text-sm font-bold text-slate-900 truncate">${student.name}</p>
                        <p class="text-[10px] text-slate-400 font-mono">ID: ${student.student_id}</p>
                    </div>
                    <input type="text" 
                        class="w-24 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-2 text-right font-mono font-bold text-slate-800 outline-none"
                        placeholder="Time"
                        value="${existing.time || ''}"
                        onchange="window.updatePerformanceScore('${match.id}', '${student.id}', this.value)"
                    >
                </div>`;
            }).join('');
            container.innerHTML = `<div class="space-y-3">${rows}</div>`;
        } 
        else if (assignedSport.name.toLowerCase().includes('cricket')) {
            const d = match.live_data || {};
            const t1 = d.t1 || {r:0,w:0,o:0};
            const t2 = d.t2 || {r:0,w:0,o:0};
            const n1 = getParticipantName(match, '1');
            const n2 = getParticipantName(match, '2');

            const inputBlock = (teamKey, label, field, val) => `
                <div class="flex flex-col">
                    <label class="text-[9px] font-bold text-slate-400 uppercase mb-1">${label}</label>
                    <input type="number" 
                        class="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center font-bold text-lg outline-none focus:border-indigo-500 w-full" 
                        value="${val}" 
                        onchange="window.updateCricketScore('${match.id}', '${teamKey}', '${field}', this.value)">
                </div>
            `;

            container.innerHTML = `
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-6">
                <div>
                    <p class="text-xs font-bold text-indigo-900 uppercase mb-2 border-b border-slate-100 pb-2">${n1}</p>
                    <div class="grid grid-cols-3 gap-3">
                        ${inputBlock('t1', 'Runs', 'r', t1.r)} ${inputBlock('t1', 'Wkts', 'w', t1.w)} ${inputBlock('t1', 'Overs', 'o', t1.o)}
                    </div>
                </div>
                <div>
                    <p class="text-xs font-bold text-indigo-900 uppercase mb-2 border-b border-slate-100 pb-2">${n2}</p>
                    <div class="grid grid-cols-3 gap-3">
                        ${inputBlock('t2', 'Runs', 'r', t2.r)} ${inputBlock('t2', 'Wickets', 'w', t2.w)} ${inputBlock('t2', 'Overs', 'o', t2.o)}
                    </div>
                </div>
            </div>`;
        } 
        else {
            const s = match.live_data || {s1:0, s2:0};
            const n1 = getParticipantName(match, '1');
            const n2 = getParticipantName(match, '2');

            container.innerHTML = `
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div class="flex items-center justify-between gap-4">
                    <div class="flex-1 text-center">
                        <p class="text-[10px] font-bold text-slate-400 mb-2 truncate">${n1}</p>
                        <input type="number" class="w-full h-20 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-4xl font-extrabold text-slate-800 outline-none focus:border-indigo-500"
                            value="${s.s1 || 0}" onchange="window.updateStandardScore('${match.id}', 's1', this.value)">
                    </div>
                    <div class="text-slate-300 font-black text-xl italic">VS</div>
                    <div class="flex-1 text-center">
                        <p class="text-[10px] font-bold text-slate-400 mb-2 truncate">${n2}</p>
                        <input type="number" class="w-full h-20 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-4xl font-extrabold text-slate-800 outline-none focus:border-indigo-500"
                            value="${s.s2 || 0}" onchange="window.updateStandardScore('${match.id}', 's2', this.value)">
                    </div>
                </div>
            </div>`;
        }
    }

    // --- 7. ACTIONS ---
    window.updatePerformanceScore = async function(matchId, studentId, value) {
        showToast("Saving...", "info");
        const match = liveMatches.find(m => m.id === matchId);
        if(!match) return;
        let results = match.live_data?.results || [];
        const existingIndex = results.findIndex(r => r.uid === studentId);
        if (existingIndex > -1) results[existingIndex].time = value;
        else results.push({ uid: studentId, time: value, rank: 999 });
        const { error } = await supabase.from('matches').update({ live_data: { ...match.live_data, results: results } }).eq('id', matchId);
        if (error) showToast("Failed", "error"); else showToast("Saved", "success");
    }

    window.updateCricketScore = async function(matchId, teamKey, field, value) {
        showToast("Updating...", "info");
        const match = liveMatches.find(m => m.id === matchId);
        let liveData = match.live_data || {};
        if(!liveData[teamKey]) liveData[teamKey] = {};
        liveData[teamKey][field] = value;
        const { error } = await supabase.from('matches').update({ live_data: liveData }).eq('id', matchId);
        if(error) showToast("Failed", "error"); else showToast("Score Updated", "success");
    }

    window.updateStandardScore = async function(matchId, scoreKey, value) {
        showToast("Updating...", "info");
        const match = liveMatches.find(m => m.id === matchId);
        let liveData = match.live_data || {};
        liveData[scoreKey] = value;
        const { error } = await supabase.from('matches').update({ live_data: liveData }).eq('id', matchId);
        if(error) showToast("Failed", "error"); else showToast("Score Updated", "success");
    }

    window.endMatchVolunteer = async function() {
        if (!currentActiveMatchId) return;
        const winnerSelect = document.getElementById('select-winner');
        const winner = winnerSelect.value;
        if (!winner) return showToast("Please select a winner first", "error");
        if (!confirm(`Declare ${winner} as winner and end match?`)) return;

        showToast("Finalizing Match...", "info");
        const match = liveMatches.find(m => m.id === currentActiveMatchId);
        const finalLiveData = { ...match.live_data, winner: winner };
        const { error } = await supabase.from('matches').update({ status: 'Completed', live_data: finalLiveData }).eq('id', currentActiveMatchId);
        if (error) showToast("Error ending match", "error");
        else { showToast("Match Completed", "success"); closeMatchView(); }
    }

    function showToast(msg, type = 'success') {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        let bg = type === 'error' ? 'bg-red-600' : (type === 'info' ? 'bg-blue-600' : 'bg-green-600');
        let icon = type === 'error' ? 'alert-circle' : (type === 'info' ? 'loader-2' : 'check');
        let spin = type === 'info' ? 'animate-spin' : '';
        toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white text-sm font-bold ${bg} toast-enter-active`;
        toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4 ${spin}"></i> <span>${msg}</span>`;
        container.appendChild(toast);
        if(window.lucide) lucide.createIcons();
        requestAnimationFrame(() => toast.classList.remove('translate-y-full', 'opacity-0'));
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(100%)'; setTimeout(() => toast.remove(), 300); }, 2000);
    }

})();

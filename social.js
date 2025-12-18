import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, getPlaceholderImage, getTickImg, getUserInitials, logUserActivity } from './utils.js';

let currentLeaderboardTab = 'student';

// 1. STATIC DEPARTMENT COUNTS (Stored locally to prevent Supabase egress)
const DEPT_STATS_FIXED = {
    "BAF": { count: 303, avg: 11 },
    "BCOM": { count: 330, avg: 5 },
    "BMS": { count: 353, avg: 5 },
    "BFM": { count: 69, avg: 4 },
    "BSC": { count: 28, avg: 4 },
    "CS": { count: 201, avg: 2 },
    "BA": { count: 73, avg: 0 }
};

if (!state.deptCache) state.deptCache = {};

const getOptimizedImgUrl = (url) => {
    if (!url) return null;
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
        return url.replace('/upload/', '/upload/w_80,q_auto:low,f_auto/');
    }
    return url;
};

export const loadLeaderboardData = async () => {
    if (currentLeaderboardTab === 'student') {
        await loadStudentLeaderboard();
    } else {
        await renderDepartmentLeaderboard(); 
    }
};

// GLOBAL STUDENT LEADERBOARD
const loadStudentLeaderboard = async () => {
    if (state.leaderboardLoaded) {
        renderStudentLeaderboard();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select(`
                id, full_name, course, lifetime_points, profile_img_url, tick_type,
                user_streaks:user_streaks!user_streaks_user_id_fkey ( current_streak )
            `)
            .gt('lifetime_points', 0) 
            .order('lifetime_points', { ascending: false })
            .limit(50); 

        if (error) throw error;

        state.leaderboard = data.map(u => ({
            ...u,
            name: u.full_name,
            initials: getUserInitials(u.full_name),
            isCurrentUser: state.currentUser && u.id === state.currentUser.id,
            streak: (u.user_streaks && u.user_streaks.current_streak) 
                ? u.user_streaks.current_streak 
                : (Array.isArray(u.user_streaks) && u.user_streaks[0] ? u.user_streaks[0].current_streak : 0)
        }));

        state.leaderboardLoaded = true;
        renderStudentLeaderboard();

    } catch (err) { console.error('Student LB Error:', err); }
};

// DRILL DOWN: DEPARTMENT STUDENTS
export const loadDepartmentStudents = async (deptName) => {
    if (state.deptCache[deptName]) {
        renderDepartmentStudents(deptName);
        return;
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select(`
                id, full_name, profile_img_url, tick_type, course, lifetime_points,
                user_streaks:user_streaks!user_streaks_user_id_fkey ( current_streak )
            `)
            .ilike('course', `%${deptName}`) 
            .order('lifetime_points', { ascending: false }); // SORTED: High to Low

        if (error) throw error;

        state.deptCache[deptName] = data.map(u => ({
            name: u.full_name,
            img: u.profile_img_url,
            tick_type: u.tick_type,
            course: u.course,
            points: u.lifetime_points, // Added to local state
            initials: getUserInitials(u.full_name),
            streak: (u.user_streaks && u.user_streaks.current_streak) 
                ? (Array.isArray(u.user_streaks) ? u.user_streaks[0]?.current_streak : u.user_streaks.current_streak) 
                : 0
        }));

        renderDepartmentStudents(deptName);
    } catch (err) { console.error('Dept Students Error:', err); }
};

export const renderDepartmentLeaderboard = () => {
    const container = document.getElementById('eco-wars-page-list');
    if (!container) return;

    const entries = Object.entries(DEPT_STATS_FIXED)
        .sort((a, b) => b[1].avg - a[1].avg);

    container.innerHTML = entries.map(([name, data], index) => `
        <div class="glass-card p-4 rounded-2xl cursor-pointer active:scale-[0.98] transition-all mb-3 border border-gray-100 dark:border-gray-700" onclick="showDepartmentDetail('${name}')">
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <span class="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/40 flex items-center justify-center mr-4 text-sm font-bold text-green-700 dark:text-green-300">#${index + 1}</span>
                    <div>
                        <p class="font-bold text-gray-900 dark:text-gray-100">${name}</p>
                        <p class="text-xs text-gray-500">${data.count} Students</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-lg font-black text-green-600 dark:text-green-400">${data.avg}</p>
                    <p class="text-[10px] font-bold uppercase text-gray-400 tracking-tighter leading-none">Avg Score</p>
                </div>
            </div>
        </div>`).join('');
};

export const showDepartmentDetail = (deptName) => {
    const deptData = DEPT_STATS_FIXED[deptName];
    if (!deptData) return;

    els.departmentDetailPage.innerHTML = `
        <div class="max-w-3xl mx-auto h-full flex flex-col bg-white dark:bg-gray-900">
            <div class="sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-10 p-4 border-b border-gray-200 dark:border-gray-800">
                <div class="flex items-center mb-4">
                    <button onclick="showPage('leaderboard')" class="mr-3 p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                        <i data-lucide="arrow-left" class="w-5 h-5"></i>
                    </button>
                    <div>
                        <h2 class="text-xl font-extrabold text-gray-900 dark:text-gray-100">${deptName}</h2>
                        <p class="text-xs text-gray-500">Avg Score: <span class="text-green-600 font-bold">${deptData.avg}</span></p>
                    </div>
                </div>
                <div class="relative group">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <i data-lucide="search" class="h-4 w-4 text-gray-400 transition-colors"></i>
                    </div>
                    <input type="text" id="dept-student-search" placeholder="Search ${deptName}..." 
                        class="block w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        oninput="filterDepartmentStudents('${deptName}')">
                </div>
            </div>
            <div id="dept-students-list" class="p-4 space-y-3 pb-20 overflow-y-auto flex-grow">
                <p class="text-center text-gray-500 text-sm py-10 italic">Gathering Eco Warriors...</p>
            </div>
        </div>`;

    window.showPage('department-detail-page');
    if(window.lucide) window.lucide.createIcons();
    loadDepartmentStudents(deptName);
};

// UPDATED LIST UI: POINTS ON RIGHT, STREAK BELOW NAME
const renderFilteredList = (students) => {
    const container = document.getElementById('dept-students-list');
    if (!container) return;

    if (students.length === 0) {
        container.innerHTML = `<p class="text-center py-12 text-gray-400">No students found.</p>`;
        return;
    }

    container.innerHTML = students.map((s) => {
        const optimizedImg = getOptimizedImgUrl(s.img) || getPlaceholderImage('60x60', s.initials);
        return `
        <div class="glass-card p-3 rounded-2xl flex items-center gap-4 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
            <img src="${optimizedImg}" class="w-11 h-11 rounded-full object-cover border-2 border-white dark:border-gray-700" loading="lazy">
            <div class="flex-grow">
                <p class="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1">
                    ${s.name} ${getTickImg(s.tick_type)}
                </p>
                <div class="flex items-center gap-1 mt-0.5">
                    <i data-lucide="flame" class="w-3.5 h-3.5 text-orange-500 fill-orange-500"></i>
                    <span class="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-tighter">${s.streak} Day Streak</span>
                </div>
            </div>
            <div class="text-right">
                <span class="text-sm font-black text-green-600 dark:text-green-400">${s.points}</span>
                <span class="text-[10px] text-gray-400 block font-bold uppercase tracking-tighter leading-none">Pts</span>
            </div>
        </div>`;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
};

window.filterDepartmentStudents = (deptName) => {
    const query = document.getElementById('dept-student-search').value.toLowerCase();
    const students = state.deptCache[deptName] || [];
    const filtered = students.filter(s => s.name.toLowerCase().includes(query) || s.course.toLowerCase().includes(query));
    renderFilteredList(filtered);
};

export const renderDepartmentStudents = (deptName) => renderFilteredList(state.deptCache[deptName] || []);

export const showLeaderboardTab = (tab) => {
    currentLeaderboardTab = tab;
    const btnStudent = document.getElementById('leaderboard-tab-student');
    const btnDept = document.getElementById('leaderboard-tab-dept');
    const contentStudent = document.getElementById('leaderboard-content-student');
    const contentDept = document.getElementById('leaderboard-content-department');

    if (tab === 'department') {
        btnDept.classList.add('active'); btnStudent.classList.remove('active');
        contentDept.classList.remove('hidden'); contentStudent.classList.add('hidden');
        renderDepartmentLeaderboard(); 
    } else {
        btnStudent.classList.add('active'); btnDept.classList.remove('active');
        contentStudent.classList.remove('hidden'); contentDept.classList.add('hidden');
        loadStudentLeaderboard();
    }
};

export const renderStudentLeaderboard = () => {
    if (state.leaderboard.length === 0) {
        els.lbPodium.innerHTML = '';
        els.lbList.innerHTML = `<p class="text-center text-gray-500 py-10">No Eco Warriors yet.</p>`;
        return;
    }
    const sorted = [...state.leaderboard];
    const rank1 = sorted[0], rank2 = sorted[1], rank3 = sorted[2];
    const rest = sorted.slice(3);

    const renderChamp = (u, rank) => {
        if (!u) return '';
        const optimizedImg = getOptimizedImgUrl(u.profile_img_url) || getPlaceholderImage('100x100', u.initials);
        return `
            <div class="badge ${rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze'}">
                <img src="${optimizedImg}" class="w-full h-full object-cover" loading="lazy">
            </div>
            <div class="champ-name">${u.name} ${getTickImg(u.tick_type)}</div>
            <div class="champ-points">${u.lifetime_points} pts</div>
            <div class="rank">${rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}</div>
        `;
    }

    els.lbPodium.innerHTML = `<div class="podium"><div class="champ">${renderChamp(rank2, 2)}</div><div class="champ">${renderChamp(rank1, 1)}</div><div class="champ">${renderChamp(rank3, 3)}</div></div>`;
    els.lbList.innerHTML = rest.map((user, index) => {
        const optimizedImg = getOptimizedImgUrl(user.profile_img_url) || getPlaceholderImage('40x40', user.initials);
        return `
            <div class="item ${user.isCurrentUser ? 'is-me' : ''}">
                <div class="user">
                    <span class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mr-3 text-[10px] font-bold text-gray-400">#${index + 4}</span>
                    <div class="circle"><img src="${optimizedImg}" class="w-full h-full object-cover"></div>
                    <div class="user-info">
                        <strong>${user.name} ${user.isCurrentUser ? '(You)' : ''} ${getTickImg(user.tick_type)}</strong>
                        <span class="sub-class">${user.course}</span>
                    </div>
                </div>
                <div class="points-display">${user.lifetime_points} pts</div>
            </div>`;
    }).join('');
};

window.showLeaderboardTab = showLeaderboardTab;
window.showDepartmentDetail = showDepartmentDetail;
window.filterDepartmentStudents = filterDepartmentStudents;

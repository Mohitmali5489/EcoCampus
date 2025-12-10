import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, getPlaceholderImage, getTickImg, getUserInitials, logUserActivity } from './utils.js';

let currentLeaderboardTab = 'student';

// HELPER: Cloudinary Low Quality Thumbnail
// Injects transformation parameters into the URL to reduce data usage
const getOptimizedImgUrl = (url) => {
    if (!url) return null;
    // Check if it's a Cloudinary URL (standard format)
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
        // Resize to 80px width, low quality, auto format
        return url.replace('/upload/', '/upload/w_80,q_auto:low,f_auto/');
    }
    return url;
};

export const loadLeaderboardData = async () => {
    try {
        // 1. Fetch Users + Streak Data
        // We fetch ALL users here.
        const { data, error } = await supabase
            .from('users')
            .select(`
                id, full_name, course, lifetime_points, profile_img_url, tick_type,
                user_streaks:user_streaks!user_streaks_user_id_fkey ( current_streak )
            `)
            .order('lifetime_points', { ascending: false });

        if (error) throw error;

        // 2. Process Department Leaderboard (INCLUDES 0 POINTS USERS)
        // We process this FIRST on the raw 'data' so 0-point users count towards department stats/lists
        const deptMap = {};
        
        data.forEach(user => {
            // Course Name Cleaning Logic
            let cleanCourse = user.course ? user.course.trim().toUpperCase() : 'GENERAL';
            cleanCourse = cleanCourse.replace(/^(FY|SY|TY)[\s.]?/i, '');
            if (cleanCourse.length < 2) cleanCourse = user.course;

            if (!deptMap[cleanCourse]) {
                deptMap[cleanCourse] = { 
                    name: cleanCourse, 
                    totalPoints: 0, 
                    studentCount: 0, 
                    students: [] 
                };
            }

            deptMap[cleanCourse].totalPoints += (user.lifetime_points || 0);
            deptMap[cleanCourse].studentCount += 1;
            
            const streakVal = (user.user_streaks && user.user_streaks.current_streak) 
                ? user.user_streaks.current_streak 
                : (Array.isArray(user.user_streaks) && user.user_streaks[0] ? user.user_streaks[0].current_streak : 0);

            deptMap[cleanCourse].students.push({
                name: user.full_name,
                points: user.lifetime_points,
                img: user.profile_img_url, 
                tick_type: user.tick_type,
                initials: getUserInitials(user.full_name),
                streak: streakVal
            });
        });

        // Calculate Average & Sort
        state.departmentLeaderboard = Object.values(deptMap).map(dept => ({
            ...dept,
            averageScore: dept.studentCount > 0 ? Math.round(dept.totalPoints / dept.studentCount) : 0
        })).sort((a, b) => b.averageScore - a.averageScore);


        // 3. Process Student Leaderboard (EXCLUDES 0 POINTS USERS)
        // Filter out users with 0 points for the main "Eco Warriors" list
        const activeStudents = data.filter(u => u.lifetime_points > 0);

        state.leaderboard = activeStudents.map(u => ({
            ...u,
            name: u.full_name,
            initials: getUserInitials(u.full_name),
            isCurrentUser: u.id === state.currentUser.id,
            // Access streak safely
            streak: (u.user_streaks && u.user_streaks.current_streak) 
                ? u.user_streaks.current_streak 
                : (Array.isArray(u.user_streaks) && u.user_streaks[0] ? u.user_streaks[0].current_streak : 0)
        }));

        
        // Render if active
        if (document.getElementById('leaderboard').classList.contains('active')) {
            if (currentLeaderboardTab === 'student') renderStudentLeaderboard();
            else renderDepartmentLeaderboard();
        }
    } catch (err) { console.error('Leaderboard Data Error:', err); }
};

export const showLeaderboardTab = (tab) => {
    currentLeaderboardTab = tab;
    const btnStudent = document.getElementById('leaderboard-tab-student');
    const btnDept = document.getElementById('leaderboard-tab-dept');
    const contentStudent = document.getElementById('leaderboard-content-student');
    const contentDept = document.getElementById('leaderboard-content-department');

    // Log Interaction
    logUserActivity('switch_tab', `Switched leaderboard to ${tab}`);

    if (tab === 'department') {
        btnDept.classList.add('active'); btnStudent.classList.remove('active');
        contentDept.classList.remove('hidden'); contentStudent.classList.add('hidden');
        if(els.lbLeafLayer) els.lbLeafLayer.classList.add('hidden');
        renderDepartmentLeaderboard();
    } else {
        btnStudent.classList.add('active'); btnDept.classList.remove('active');
        contentStudent.classList.remove('hidden'); contentDept.classList.add('hidden');
        if(els.lbLeafLayer) els.lbLeafLayer.classList.remove('hidden');
        renderStudentLeaderboard();
    }
};

export const renderDepartmentLeaderboard = () => {
    const container = document.getElementById('eco-wars-page-list');
    container.innerHTML = '';
    if (state.departmentLeaderboard.length === 0) { 
        container.innerHTML = `<p class="text-sm text-center text-gray-500">Calculating...</p>`; 
        return; 
    }

    state.departmentLeaderboard.forEach((dept, index) => {
        container.innerHTML += `
            <div class="glass-card p-4 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors mb-3 border border-gray-100 dark:border-gray-700 active:scale-[0.98] transform duration-150" onclick="showDepartmentDetail('${dept.name}')">
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <span class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-900/60 dark:to-green-900/60 flex items-center justify-center mr-4 text-sm font-bold text-emerald-800 dark:text-emerald-100 shadow-sm">#${index + 1}</span>
                        <div>
                            <p class="font-bold text-lg text-gray-900 dark:text-gray-100">${dept.name}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${dept.studentCount} Students</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-extrabold text-green-600 dark:text-green-400">${dept.averageScore}</p>
                        <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Score</p>
                    </div>
                </div>
            </div>`;
    });
    if(window.lucide) window.lucide.createIcons();
};

export const showDepartmentDetail = (deptName) => {
    const deptData = state.departmentLeaderboard.find(d => d.name === deptName);
    if (!deptData) return;

    logUserActivity('view_department', `Viewed details for ${deptName}`);

    // Sort students by points (High to Low)
    // This list will include 0-point students because deptData was built from raw data
    const sortedStudents = deptData.students.sort((a, b) => b.points - a.points);

    const studentsHTML = sortedStudents.length === 0 
        ? `<p class="text-center text-gray-500 py-10">No active students in this department.</p>` 
        : sortedStudents.map((s, idx) => {
            // OPTIMIZATION: Use low quality image for list
            const optimizedImg = getOptimizedImgUrl(s.img) || getPlaceholderImage('60x60', s.initials);
            
            return `
            <div class="glass-card p-3 rounded-2xl flex items-center justify-between border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div class="flex items-center gap-4">
                    <div class="relative">
                        <img src="${optimizedImg}" class="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm" loading="lazy">
                        <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 border border-white dark:border-gray-600">
                            ${idx + 1}
                        </div>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1">
                            ${s.name} ${getTickImg(s.tick_type)}
                        </p>
                        <div class="flex items-center mt-0.5">
                            <i data-lucide="flame" class="w-3 h-3 text-orange-500 fill-orange-500 mr-1"></i>
                            <span class="text-xs font-semibold text-orange-600 dark:text-orange-400">${s.streak} Day Streak</span>
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-sm font-extrabold text-green-600 dark:text-green-400">${s.points}</span>
                    <span class="text-[10px] text-gray-400 block font-medium">PTS</span>
                </div>
            </div>
        `}).join('');

    els.departmentDetailPage.innerHTML = `
        <div class="max-w-3xl mx-auto h-full flex flex-col">
            <div class="sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-10 p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div class="flex items-center">
                    <button onclick="showPage('leaderboard')" class="mr-3 p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <i data-lucide="arrow-left" class="w-5 h-5 text-gray-700 dark:text-gray-200"></i>
                    </button>
                    <div>
                        <h2 class="text-xl font-extrabold text-gray-900 dark:text-gray-100">${deptName}</h2>
                        <p class="text-xs text-gray-500 font-medium">Avg Score: <span class="text-green-600 font-bold">${deptData.averageScore}</span></p>
                    </div>
                </div>
            </div>
            <div class="p-4 space-y-3 pb-20 overflow-y-auto">
                ${studentsHTML}
            </div>
        </div>`;

    window.showPage('department-detail-page');
    if(window.lucide) window.lucide.createIcons();
};

export const renderStudentLeaderboard = () => {
    // This list now only contains users with > 0 points
    if (state.leaderboard.length === 0) {
        els.lbPodium.innerHTML = '';
        els.lbList.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 py-10">No active Eco Warriors yet. Start earning points!</p>`;
        return;
    }
    
    // NO SLICING - Show everyone
    const sorted = [...state.leaderboard];
    const rank1 = sorted[0], rank2 = sorted[1], rank3 = sorted[2];
    const rest = sorted.slice(3);

    // Podium Renderer
    const renderChamp = (u, rank) => {
        if (!u) return '';
        // OPTIMIZATION: Use low quality image for podium too
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

    els.lbPodium.innerHTML = `
        <div class="podium">
            <div class="champ">${renderChamp(rank2, 2)}</div>
            <div class="champ">${renderChamp(rank1, 1)}</div>
            <div class="champ">${renderChamp(rank3, 3)}</div>
        </div>`;

    // Render THE REST (No Limit)
    els.lbList.innerHTML = '';
    
    rest.forEach((user, index) => {
        // OPTIMIZATION: Use low quality image for list
        const optimizedImg = getOptimizedImgUrl(user.profile_img_url) || getPlaceholderImage('40x40', user.initials);
        
        els.lbList.innerHTML += `
            <div class="item ${user.isCurrentUser ? 'is-me' : ''}">
                <div class="user">
                    <span class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mr-3 text-xs font-bold text-gray-600 dark:text-gray-300">#${index + 4}</span>
                    <div class="circle"><img src="${optimizedImg}" class="w-full h-full object-cover" loading="lazy"></div>
                    <div class="user-info">
                        <strong>${user.name} ${user.isCurrentUser ? '(You)' : ''} ${getTickImg(user.tick_type)}</strong>
                        <span class="sub-class">${user.course}</span>
                    </div>
                </div>
                <div class="points-display">${user.lifetime_points} pts</div>
            </div>`;
    });
};

window.showLeaderboardTab = showLeaderboardTab;
window.showDepartmentDetail = showDepartmentDetail;

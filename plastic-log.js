import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, formatDate, getPlaceholderImage, getTickImg, logUserActivity } from './utils.js';

export const loadPlasticLogData = async () => {
    const container = document.getElementById('plastic-log-content');
    
    try {
        const { data: history, error: historyError } = await supabase
            .from('points_ledger')
            // Optimization
            .select('description, points_delta, created_at') 
            .eq('user_id', state.currentUser.id)
            .eq('source_type', 'plastic')
            .order('created_at', { ascending: false });

        if (historyError) throw historyError;

        state.plasticHistory = history || [];

        const { data: impact, error: impactError } = await supabase
            .from('user_impact')
            // Optimization
            .select('total_plastic_kg') 
            .eq('user_id', state.currentUser.id)
            .maybeSingle();

        if (!impactError && impact) {
            // Merge carefully since we only fetched partial data
            state.currentUser.impact = { ...state.currentUser.impact, ...impact };
        }

        if (document.getElementById('plastic-log').classList.contains('active')) {
            renderPlasticLogPage();
        }

    } catch (err) {
        console.error('Plastic Log Error:', err);
        if (container) container.innerHTML = `<p class="text-center text-red-500">Failed to load plastic data.</p>`;
    }
};

export const renderPlasticLogPage = () => {
    const container = document.getElementById('plastic-log-content');
    if (!container) return;

    const user = state.currentUser;
    const totalPlastic = user.impact?.total_plastic_kg || 0;
    
    // Milestone Calculation (Every 5kg is a milestone)
    const nextMilestone = Math.ceil((totalPlastic + 0.1) / 5) * 5;
    const progressPercent = Math.min(100, (totalPlastic / nextMilestone) * 100);

    // QR Code Data: Student ID
    const qrData = user.student_id || 'UNKNOWN';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}&bgcolor=ffffff`;

    container.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6">
            
            <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-800 shadow-xl text-white p-6">
                <div class="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                <div class="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                
                <div class="relative z-10 flex flex-col md:flex-row items-center gap-6">
                    <div class="bg-white p-2 rounded-2xl shadow-lg">
                        <img src="${qrUrl}" class="w-32 h-32 md:w-40 md:h-40 rounded-xl mix-blend-multiply" alt="Student QR">
                    </div>
                    
                    <div class="text-center md:text-left flex-1">
                        <div class="inline-flex items-center px-2 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider mb-2">
                            <i data-lucide="scan-line" class="w-3 h-3 mr-1"></i> Official Recycling ID
                        </div>
                        <h2 class="text-2xl font-bold flex items-center justify-center md:justify-start gap-2">
                            ${user.full_name} ${getTickImg(user.tick_type)}
                        </h2>
                        <p class="text-emerald-100 font-medium mb-1">${user.course}</p>
                        <p class="text-3xl font-mono font-black tracking-widest opacity-90">${user.student_id}</p>
                    </div>
                </div>
                
                <div class="mt-6 pt-4 border-t border-white/10 flex justify-between items-end">
                    <div class="text-xs text-emerald-100/80">Show this QR at the collection center<br>to log your plastic waste.</div>
                    <img src="https://i.ibb.co/67MXS1wX/1763474740707.png" class="w-10 h-10 opacity-80 grayscale brightness-200">
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4">
                <div class="glass-card p-6 rounded-2xl flex flex-col items-center justify-center text-center">
                    <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3 text-green-600 dark:text-green-400">
                        <i data-lucide="weight" class="w-6 h-6"></i>
                    </div>
                    <span class="text-4xl font-black text-gray-900 dark:text-white mb-1">${totalPlastic.toFixed(2)}</span>
                    <span class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">KG Recycled</span>
                </div>
            </div>

            <div class="glass-card p-5 rounded-2xl">
                <div class="flex justify-between items-end mb-2">
                    <div>
                        <h3 class="font-bold text-gray-900 dark:text-white">Next Milestone</h3>
                        <p class="text-xs text-gray-500">Reach ${nextMilestone}kg to earn a bonus badge!</p>
                    </div>
                    <span class="text-sm font-bold text-green-600">${totalPlastic.toFixed(1)} / ${nextMilestone} kg</span>
                </div>
                <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div class="bg-gradient-to-r from-green-400 to-emerald-600 h-full rounded-full transition-all duration-500" style="width: ${progressPercent}%"></div>
                </div>
            </div>

            <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                    <i data-lucide="history" class="w-5 h-5 mr-2 text-gray-400"></i> Submission History
                </h3>
                <div class="space-y-3">
                    ${state.plasticHistory.length === 0 
                        ? `<div class="text-center py-8 text-gray-400 text-sm bg-gray-50 dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">No plastic submissions yet. <br>Visit the Green Club desk to start!</div>` 
                        : state.plasticHistory.map(item => `
                            <div class="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex justify-between items-center shadow-sm">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                        <i data-lucide="recycle" class="w-5 h-5 text-green-600 dark:text-green-400"></i>
                                    </div>
                                    <div>
                                        <p class="font-bold text-gray-900 dark:text-white text-sm">${item.description}</p>
                                        <p class="text-xs text-gray-500">${formatDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <span class="block font-black text-green-600 dark:text-green-400">+${item.points_delta}</span>
                                    <span class="text-[10px] font-bold text-gray-400 uppercase">Points</span>
                                </div>
                            </div>
                        `).join('')}
                </div>
            </div>

        </div>
    `;
    
    if(window.lucide) window.lucide.createIcons();
    logUserActivity('view_plastic_log', 'Viewed plastic recycling log');
};

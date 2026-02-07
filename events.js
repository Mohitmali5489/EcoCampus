import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, formatDate, getPlaceholderImage, getTickImg, logUserActivity, getOptimizedImageUrl, showToast } from './utils.js';
import { refreshUserData } from './app.js'; // Import refresh to update balance after payment

// --- EVENTS MODULEs ---

export const loadEventsData = async () => {
    try {
        // 1. Get current time in ISO format for filtering
        const now = new Date().toISOString();

        // 2. Fetch Events (Filter: start_at >= NOW)
        // Added: points_cost, max_seats for the new paid/limited logic
        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select('id, title, start_at, location, poster_url, points_reward, points_cost, max_seats, organizer, description')
            .gte('start_at', now) 
            .order('start_at', { ascending: true });

        if (eventsError) throw eventsError;

        // 3. Fetch My Attendance ONLY (Privacy & Egress optimization)
        const { data: myAttendance, error: attendanceError } = await supabase
            .from('event_attendance')
            .select('event_id, status')
            .eq('user_id', state.currentUser.id);

        if (attendanceError) throw attendanceError;

        // Create a map for fast lookup
        const attendanceMap = new Map();
        if (myAttendance) {
            myAttendance.forEach(a => attendanceMap.set(a.event_id, a.status));
        }

        // Map events to include the user's personal status
        state.events = events.map(e => {
            const status = attendanceMap.get(e.id);
            let myStatus = 'upcoming';
            
            if (status) {
                if (status === 'confirmed') myStatus = 'attended';
                else if (status === 'absent') myStatus = 'missed';
                else if (status === 'registered') myStatus = 'going';
            } 
            
            // Normalize cost/seats
            return { 
                ...e, 
                myStatus,
                points_cost: e.points_cost || 0,
                max_seats: e.max_seats || null
            };
        });
        
        // 4. UPDATE DASHBOARD UI WITH NEW DATA
        updateDashboardEvent();

        // 5. Render Events Page if currently active
        const eventsPage = document.getElementById('events');
        if (eventsPage && eventsPage.classList.contains('active')) {
            renderEventsPage();
        }

    } catch (err) {
        console.error('Load Events Error:', err);
    }
};

const renderEventsPage = () => {
    const list = document.getElementById('event-list');
    if (!list) return;

    if (!state.events || state.events.length === 0) {
        list.innerHTML = `<div class="text-center py-10 text-gray-500"><p>No upcoming events.</p></div>`;
        return;
    }

    list.innerHTML = state.events.map(event => {
        const isPast = new Date(event.start_at) < new Date();
        const optimizedPoster = getOptimizedImageUrl(event.poster_url);
        
        // --- LOGIC: Cost vs Reward UI ---
        const isPaid = event.points_cost > 0;
        const isLimited = event.max_seats !== null;
        
        // Badge Logic
        let badgeHtml = '';
        if (isPaid) {
            badgeHtml = `<div class="absolute top-3 right-3 bg-red-100/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-red-700 shadow-sm border border-red-200 flex items-center gap-1">
                <i data-lucide="zap" class="w-3 h-3 fill-current"></i> Pay ${event.points_cost}
            </div>`;
        } else if (event.points_reward > 0) {
            badgeHtml = `<div class="absolute top-3 right-3 bg-white/90 dark:bg-black/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-green-700 dark:text-green-400 shadow-sm border border-white/20">
                +${event.points_reward} Pts
            </div>`;
        }

        // Capacity Tag
        let capacityHtml = '';
        if (isLimited) {
            capacityHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 ml-2">
                <i data-lucide="users" class="w-3 h-3 mr-1"></i> Limited Seats
            </span>`;
        }

        // Button Logic
        let buttonHtml = '';
        if (event.myStatus === 'going' || event.myStatus === 'attended') {
             buttonHtml = `<button disabled class="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-bold flex items-center gap-2 w-full justify-center"><i data-lucide="check-circle" class="w-4 h-4"></i> Going</button>`;
        } else if (isPast) {
             buttonHtml = `<button disabled class="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-bold w-full">Ended</button>`;
        } else {
             // Differentiate Paid vs Free RSVP
             if (isPaid) {
                 const canAfford = state.currentUser.current_points >= event.points_cost;
                 if (canAfford) {
                     buttonHtml = `<button onclick="handleRSVP('${event.id}', ${event.points_cost})" class="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg text-sm font-bold hover:shadow-lg transition-all active:scale-95 w-full">Pay & RSVP</button>`;
                 } else {
                     buttonHtml = `<button disabled class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-lg text-sm font-bold w-full flex items-center justify-center gap-1"><i data-lucide="lock" class="w-3 h-3"></i> Need ${event.points_cost} Pts</button>`;
                 }
             } else {
                 buttonHtml = `<button onclick="handleRSVP('${event.id}', 0)" class="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-80 transition-opacity w-full">RSVP Now</button>`;
             }
        }

        return `
            <div class="glass-card overflow-hidden rounded-2xl group transition-all duration-300 hover:shadow-lg flex flex-col h-full">
                <div class="relative h-48 overflow-hidden flex-shrink-0">
                    <img src="${optimizedPoster || getPlaceholderImage('800x400', 'Event')}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
                    ${badgeHtml}
                </div>
                <div class="p-5 flex flex-col flex-grow">
                    <div class="mb-2">
                        <div class="flex items-center justify-between mb-1">
                            <p class="text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-wider">${formatDate(event.start_at)}</p>
                            ${capacityHtml}
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white leading-tight">${event.title}</h3>
                    </div>
                    <p class="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-2 flex-grow">${event.description || 'No description available.'}</p>
                    
                    <div class="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
                        <div class="flex items-center text-gray-500 dark:text-gray-400 text-xs mb-3">
                            <i data-lucide="map-pin" class="w-3.5 h-3.5 mr-1"></i>
                            ${event.location || 'Campus'}
                        </div>
                        <div class="w-full">
                           ${buttonHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if(window.lucide) window.lucide.createIcons();
};

export const handleRSVP = async (eventId, cost = 0) => {
    // Find event to check if it's limited
    const eventObj = state.events.find(e => e.id === eventId);
    const isLimited = eventObj && eventObj.max_seats !== null;
    
    // UI Feedback
    const btn = event.currentTarget;
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline-block"></i> Processing...';
    if(window.lucide) window.lucide.createIcons();

    try {
        // --- PATH 1: PAID OR LIMITED EVENT (Secure RPC) ---
        if (cost > 0 || isLimited) {
            
            // Call the secure Transaction Function (Flow A)
            const { data, error } = await supabase.rpc('rsvp_paid_event', {
                p_event_id: eventId,
                p_user_id: state.currentUser.id
            });

            if (error) throw error;

            if (!data.success) {
                // Handle logic errors (Sold out, Insufficient funds)
                throw new Error(data.error);
            }

            // Success!
            showToast(cost > 0 ? `Paid ${cost} Pts. RSVP Confirmed!` : 'Seat Reserved! RSVP Confirmed.', 'success');
            
            // If points were spent, refresh user balance immediately
            if (cost > 0) await refreshUserData();
        } 
        
        // --- PATH 2: LEGACY FREE EVENT (Direct Insert) ---
        else {
            // Standard Insert (Legacy Flow B compatibility)
            const { error } = await supabase.from('event_attendance').insert({
                event_id: eventId,
                user_id: state.currentUser.id,
                status: 'registered'
            });

            if (error) {
                if (error.code === '23505') { // Unique violation
                     showToast('You have already RSVPd!', 'warning');
                     return;
                } else {
                     throw error;
                }
            }
            showToast('RSVP Confirmed! See you there.', 'success');
        }

        // --- COMMON SUCCESS ACTIONS ---
        logUserActivity('rsvp_event', `RSVP for event ${eventId}`, { cost });
        
        // Optimistic Update
        if(eventObj) eventObj.myStatus = 'going';
        renderEventsPage();

    } catch (err) {
        console.error('RSVP Error:', err);
        // User-friendly error mapping
        let msg = 'Failed to RSVP. Try again.';
        if (err.message.includes('Insufficient')) msg = 'Not enough EcoPoints!';
        if (err.message.includes('sold out')) msg = 'Event is Sold Out!';
        
        showToast(msg, 'error');
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

export const openParticipantsModal = (eventId) => {
    // Note: Detailed participant lists are disabled for bandwidth optimization.
    console.log("Participant list view restricted for performance.");
    showToast("Community view coming soon!", "warning");
};

export const closeParticipantsModal = () => {
    const modal = document.getElementById('participants-modal');
    const content = document.getElementById('participants-modal-content');
    if (!modal || !content) return;

    content.classList.remove('translate-y-0');
    content.classList.add('translate-y-full');

    setTimeout(() => {
        modal.classList.add('invisible', 'opacity-0');
    }, 300);
};

// NEW: Helper to update the dashboard card
const updateDashboardEvent = () => {
    const card = document.getElementById('dashboard-event-card');
    if (!card) return;
    
    // Logic to find the NEXT event that hasn't started yet
    const now = new Date();
    // Events are already sorted by start_at ascending in loadEventsData
    const upcoming = state.events.find(e => new Date(e.start_at) > now);

    if (!upcoming) {
        card.classList.add('hidden');
    } else {
        card.classList.remove('hidden');
        
        const titleEl = document.getElementById('dashboard-event-title');
        const descEl = document.getElementById('dashboard-event-desc');
        
        if(titleEl) titleEl.textContent = upcoming.title;
        if(descEl) descEl.textContent = upcoming.description || `Join us at ${upcoming.location || 'campus'}!`;
        
        state.featuredEvent = upcoming; 
    }
};

// Export to window for HTML access
window.handleRSVP = handleRSVP;
window.openParticipantsModal = openParticipantsModal;
window.closeParticipantsModal = closeParticipantsModal;
window.renderEventsPageWrapper = renderEventsPage;

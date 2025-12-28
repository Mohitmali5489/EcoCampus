import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, formatDate, getPlaceholderImage, getTickImg, logUserActivity, getOptimizedImageUrl, showToast } from './utils.js';

// --- EVENTS MODULE ---

export const loadEventsData = async () => {
    try {
        // 1. Get current time in ISO format for filtering
        const now = new Date().toISOString();

        // 2. Fetch Events (Filter: start_at >= NOW)
        // We filter out past events directly from the DB to save bandwidth
        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select('id, title, start_at, location, poster_url, points_reward, organizer, description')
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
            
            return { ...e, myStatus };
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
        // Even with DB filter, logic to handle "just ended" states is good to keep
        const isPast = new Date(event.start_at) < new Date();
        const optimizedPoster = getOptimizedImageUrl(event.poster_url);
        
        let buttonHtml = '';
        if (event.myStatus === 'going' || event.myStatus === 'attended') {
             buttonHtml = `<button disabled class="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-bold flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4"></i> Going</button>`;
        } else if (isPast) {
             buttonHtml = `<button disabled class="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-bold">Ended</button>`;
        } else {
             buttonHtml = `<button onclick="handleRSVP('${event.id}')" class="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-80 transition-opacity">RSVP Now</button>`;
        }

        return `
            <div class="glass-card overflow-hidden rounded-2xl group transition-all duration-300 hover:shadow-lg">
                <div class="relative h-48 overflow-hidden">
                    <img src="${optimizedPoster || getPlaceholderImage('800x400', 'Event')}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
                    <div class="absolute top-3 right-3 bg-white/90 dark:bg-black/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-gray-800 dark:text-white shadow-sm border border-white/20">
                        ${event.points_reward} Pts
                    </div>
                </div>
                <div class="p-5">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-wider mb-1">${formatDate(event.start_at)}</p>
                            <h3 class="text-xl font-bold text-gray-900 dark:text-white leading-tight">${event.title}</h3>
                        </div>
                    </div>
                    <p class="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-2">${event.description || 'No description available.'}</p>
                    
                    <div class="flex items-center justify-between mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
                        <div class="flex items-center text-gray-500 dark:text-gray-400 text-xs">
                            <i data-lucide="map-pin" class="w-3.5 h-3.5 mr-1"></i>
                            ${event.location || 'Campus'}
                        </div>
                        <div class="flex gap-2">
                           ${buttonHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if(window.lucide) window.lucide.createIcons();
};

export const handleRSVP = async (eventId) => {
    const btn = event.currentTarget;
    const originalText = btn.innerText;
    
    btn.disabled = true;
    btn.innerText = '...';

    try {
        const { error } = await supabase.from('event_attendance').insert({
            event_id: eventId,
            user_id: state.currentUser.id,
            status: 'registered' // Correct status for going
        });

        if (error) {
            if (error.code === '23505') { // Unique violation
                 showToast('You have already RSVPd!', 'warning');
            } else {
                 throw error;
            }
        } else {
            showToast('RSVP Confirmed! See you there.', 'success');
            logUserActivity('rsvp_event', `RSVP for event ${eventId}`);
            
            // Optimistic Update
            const evt = state.events.find(e => e.id === eventId);
            if(evt) evt.myStatus = 'going';
            renderEventsPage();
        }

    } catch (err) {
        console.error('RSVP Error:', err);
        showToast('Failed to RSVP. Try again.', 'error');
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

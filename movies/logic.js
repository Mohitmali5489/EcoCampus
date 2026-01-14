import { supabase } from '../supabase-client.js';

/* =====================================================
   MOBILE TOAST (LOCAL – NO DEPENDENCY)
===================================================== */
function showToast(message, type = 'success') {
    const old = document.querySelector('.toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/* =====================================================
   THEME SYNC LOGIC (NEW)
===================================================== */
function applyTheme() {
    const savedTheme = localStorage.getItem('eco-theme');
    const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

/* =====================================================
   DOM REFERENCES
===================================================== */
const els = {
    points: document.getElementById('headerPoints'),
    movieContainer: document.getElementById('movieContainer'),
    ticketContainer: document.getElementById('ticketContainer')
};

/* =====================================================
   INIT
===================================================== */
async function init() {
    // 1. Apply Theme Immediately
    applyTheme();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        showToast('Please login to continue', 'error');
        return;
    }

    // Fetch PUBLIC profile ID (critical for RLS)
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, current_points')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (profileError || !profile) {
        showToast('User profile not found', 'error');
        return;
    }

    // Header points
    if (els.points) {
        els.points.textContent = profile.current_points ?? 0;
    }

    loadMovies();
    loadTickets(profile.id);
}

/* =====================================================
   LOAD MOVIES (NOW SHOWING)
===================================================== */
async function loadMovies() {
    const now = new Date().toISOString();

    const { data: screenings, error } = await supabase
        .from('screenings')
        .select(`
            id,
            show_time,
            venue,
            price_bronze,
            movies (
                title,
                genre,
                language,
                poster_url
            )
        `)
        .gte('show_time', now)
        .order('show_time', { ascending: true });

    if (error) {
        console.error('Movie Load Error:', error);
        els.movieContainer.innerHTML =
            `<p style="grid-column:1/-1;text-align:center;color:#94a3b8;">Failed to load movies</p>`;
        return;
    }

    if (!screenings || screenings.length === 0) {
        els.movieContainer.innerHTML =
            `<p style="grid-column:1/-1;text-align:center;color:#94a3b8;">No upcoming shows</p>`;
        return;
    }

    els.movieContainer.innerHTML = screenings.map(s => `
        <div class="movie-card" onclick="window.location.href='booking.html?id=${s.id}'">
            <img 
                src="${s.movies?.poster_url || 'https://placehold.co/200x300'}" 
                class="poster"
                loading="lazy"
            >
            <div class="movie-info">
                <div class="movie-title">${s.movies?.title || 'Movie'}</div>
                <div class="movie-meta">
                    ${new Date(s.show_time).toLocaleDateString()} • 
                    ${new Date(s.show_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div class="movie-meta">${s.venue}</div>
                <button class="btn-book">
                    Book from ${s.price_bronze} Pts
                </button>
            </div>
        </div>
    `).join('');
}

/* =====================================================
   LOAD USER TICKETS
===================================================== */
async function loadTickets(publicUserId) {
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
            id,
            seat_number,
            status,
            created_at,
            screenings (
                show_time,
                venue,
                movies (
                    title,
                    poster_url
                )
            )
        `)
        .eq('user_id', publicUserId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Ticket Load Error:', error);
        showToast('Unable to load tickets', 'error');
        return;
    }

    if (!bookings || bookings.length === 0) {
        els.ticketContainer.innerHTML =
            `<p style="text-align:center;color:#94a3b8;padding:40px;">No bookings found</p>`;
        return;
    }

    els.ticketContainer.innerHTML = bookings.map(b => `
        <div class="ticket-card" onclick="window.location.href='ticket.html?id=${b.id}'">
            <div style="display:flex;gap:12px;padding:12px;">
                <img 
                    src="${b.screenings?.movies?.poster_url || 'https://placehold.co/60'}" 
                    style="width:60px;height:60px;border-radius:8px;object-fit:cover;"
                    loading="lazy"
                >
                <div style="flex:1;">
                    <div style="font-weight:700;">
                        ${b.screenings?.movies?.title || 'Movie'}
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
                        Seat ${b.seat_number} • 
                        ${new Date(b.screenings.show_time).toLocaleDateString()}
                    </div>
                    <div style="margin-top:6px;">
                        <span style="
                            background:#ecfdf5;
                            color:#15803d;
                            font-size:10px;
                            padding:4px 8px;
                            border-radius:4px;
                            font-weight:700;
                        ">
                            ${(b.status || 'BOOKED').toUpperCase()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

/* =====================================================
   START
===================================================== */
init();

import { supabase } from '../supabase-client.js';
import { CLOUDINARY_API_URL, CLOUDINARY_UPLOAD_PRESET } from '../state.js';

// 1. Toast Notification
export const showToast = (message, type = 'success') => {
    const existingToast = document.getElementById('v-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'v-toast';
    
    // Colors
    const bgClass = type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-500' : 'bg-emerald-600';
    
    // Icons
    let iconSvg = '';
    if (type === 'error') iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    else if (type === 'warning') iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    else iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

    toast.className = `fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-3 px-6 py-3.5 rounded-2xl text-white shadow-2xl animate-slideUp ${bgClass} transition-all duration-300 min-w-[280px] justify-center`;
    
    toast.innerHTML = `
        <div class="w-5 h-5">${iconSvg}</div>
        <span class="text-sm font-bold tracking-tight">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// 2. Cloudinary Upload
export const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    try {
        const res = await fetch(CLOUDINARY_API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.secure_url;
    } catch (err) { 
        console.error("Upload Error:", err); 
        throw err; 
    }
};

// 3. Placeholder Image
export const getPlaceholderImage = (size = '400x300', text = 'EcoCampus') => {
    return `https://placehold.co/${size}/EBFBEE/166534?text=${text}&font=inter`;
};

// 4. Activity Logger
export const logUserActivity = async (actionType, description, userId, metadata = {}) => {
    try {
        if (!userId) return;
        supabase.from('user_activity_log').insert({
            user_id: userId,
            action_type: actionType,
            description: description,
            metadata: metadata
        }).then(({ error }) => {
            if (error) console.warn("Log failed:", error.message);
        });
    } catch (err) { }
};

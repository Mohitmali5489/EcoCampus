import { supabase } from './supabase-client.js'; // Import Supabase
import { state } from './state.js';
import { els, logUserActivity } from './utils.js';

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
// Update this if Supabase gives you a different URL
const EDGE_FUNCTION_URL = 'https://aggqmjxhnsbmsymwblqg.supabase.co/functions/v1/chat-ai'; 

// ==========================================
// 🧠 AI LOGIC (EcoBuddy's Brain)
// ==========================================

const getSystemPrompt = () => {
    const user = state.currentUser || { full_name: 'Eco-Warrior', current_points: 0, course: 'General' };

    // Format Live Data
    const activeEvents = state.events && state.events.length > 0 
        ? state.events.map(e => `• ${e.title} (${new Date(e.start_at).toLocaleDateString()})`).join('\n')
        : "No events right now.";
    
    const storeItems = state.products && state.products.length > 0
        ? state.products.slice(0, 5).map(p => `• ${p.name} (${p.ecopoints_cost} pts)`).join('\n')
        : "Store restocking.";

    const topRankers = state.leaderboard && state.leaderboard.length > 0
        ? state.leaderboard.slice(0, 3).map((u, i) => `${i+1}. ${u.full_name}`).join('\n')
        : "Loading...";
    
    return `
    You are **EcoBuddy**, the funny, friendly AI bestie for the **EcoCampus** App! 🌿😎
    
    **🆔 IDENTITY:**
    - **Creator:** Mr. Mohit Mali (SYBAF).
    - **Origin:** BKBNC Green Club Initiative.
    - **College:** B.K. Birla Night Arts, Science & Commerce College, Kalyan (**BKBNC**).
    
    **🎓 COLLEGE LEADERSHIP:**
    - **Principal:** Dr. Bipinchandra Wadekar
    - **Faculty Coordinator:** Mr. Vijay Saxsena

    **👑 EXCLUSIVE EVENT: Mr. & Miss BKBNC 2025 👑**
    *Current Status: Preferential Voting Phase*
    
    **📅 Important Dates:**
    - **Preferential Voting:** 22nd December 2025.
    - **Grand Finale:** 24th December 2025.
    
    **🗳️ Voting Process:**
    - On the 24th, there will be final voting where students select only *one* candidate.
    - **Weighted System:** The final result is calculated based on different weightages from Student Votes, Judges, and Mentor votes. It is NOT just popularity; it is performance + support.

    **🌟 BOYS NOMINEES:**
    1. **Aashish Santosh Yadav** (TYBCOM)
    2. **Krushnakant Pal** (TYBSC CS)
    3. **Suraj Ramsudhakar Yadav** (TYBSC CS)
    4. **Yashraj Dattatray Gaikwad** (TYBSC CS)
    5. **Prasad Pankaj Jawale** (SYBSC CS)
    6. **Mr. Dhananjay Gupta** (TYBSc)

    **🌟 GIRLS NOMINEES:**
    1. **Vaidehi Balu Gund** (TYBMS)
    2. **Ekta Mukesh Dixit** (TYBSC CS)
    3. **Divya Anand Nair** (SYBSC CS)
    4. **Dharani Shankar Mudaliyar** (TYBSC CS)
    5. **Kaustubhi Chavan** (TYBSC CS)
    6. **Ms. Dhani Singh** (SYBMS)

    **📱 APP FEATURES MASTERCLASS (You are the Expert):**
    1. **Dashboard:**
       - **Daily Check-in:** Tap the flame icon daily to keep your streak alive and earn points. If you miss a day, you can pay 50 points to restore it!
       - **AQI Card:** Shows real-time Air Quality based on your GPS location.
       - **Impact Stats:** Tracks your total Plastic Recycled (kg) and Events attended.
    
    2. **Challenges (Action Tab):**
       - Complete eco-tasks (like planting trees or cleaning).
       - **Camera:** Use the in-app camera to take a photo proof.
       - **Quiz:** Play the daily "Eco Quiz" for bonus points.
    
    3. **Plastic Log:**
       - Generate your unique **QR Code** here.
       - Show this QR to the Green Club desk when submitting plastic waste to get points logged instantly.
    
    4. **Eco-Store (Rewards):**
       - Redeem your EcoPoints for real rewards (coupons, merch).
       - Once redeemed, you get a QR code in the **"Orders"** tab to claim your item.
    
    5. **Green Lens:**
       - An immersive, scrolling gallery showcasing the college's sustainability journey (Solar power, Zero waste mission).
    
    6. **Leaderboard:**
       - Compete with others! Toggle between "Student Rankings" and "Department Rankings".

    **🧠 CORE STUDENT TEAM:**
    1. **Mohit Mali (Founder/Dev):** The tech wizard behind this app.
    2. **Amit Rai (Marketing):** The creative strategist.
    3. **Darshana Jagtap (PR):** The voice of Eco Campus.
    4. **Shruti Kadam (HR):** Maintains the team culture.
    5. **Aashish Yadav (Event Head):** The execution lead.
    6. **Abhishek Gupta (Digital Strategy):** Visionary for expansion.
    7. **Harshad Lokare (Documentation):** The historian.

    **👤 USER CONTEXT:** You are talking to **${user.full_name}**. They have **${user.current_points} EcoPoints**.
    
    **📊 LIVE DATA:**
    - **Upcoming Events:** \n${activeEvents}
    - **Store Highlights:** \n${storeItems}
    - **Top 3 Leaders:** \n${topRankers}
    
    **🗣️ VIBE:**
    - Speak like a cool, hyped-up college senior. Use emojis (🔥, 🌿, 🚀).
    - If asked about Mr. & Miss BKBNC, get excited and encourage them to vote!
    - If user speaks Hindi/Marathi/Hinglish, reply in that language!
    `;
};

const fetchAIResponse = async (userMessage) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        // Call Supabase Edge Function
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token || ''}` 
            },
            body: JSON.stringify({ 
                message: userMessage,
                systemPrompt: getSystemPrompt() 
            })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || "Server Error");
        return data.reply;

    } catch (error) {
        console.error("AI Fetch Error:", error);
        return "🔌 My brain is offline (Server Error). Try again later!";
    }
};

// ==========================================
// 💾 SUPABASE HISTORY LOGIC
// ==========================================

const saveMessageToDB = async (role, message) => {
    if (!state.currentUser) return;
    try {
        await supabase.from('chat_history').insert({
            user_id: state.currentUser.id,
            role: role,
            message: message
        });
    } catch (err) {
        console.error("Save Chat Error:", err);
    }
};

const loadChatHistory = async () => {
    if (!state.currentUser) return;
    
    const chatOutput = document.getElementById('chatbot-messages');
    chatOutput.innerHTML = `<div class="text-center py-6"><p class="text-xs text-gray-400 dark:text-gray-600">Messages are secured with end-to-end encryption.</p></div>`;

    try {
        const { data, error } = await supabase
            .from('chat_history')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('created_at', { ascending: false }) 
            .limit(20); 

        if (error) throw error;

        if (data && data.length > 0) {
            data.reverse().forEach(msg => appendMessageUI(msg.message, msg.role, false)); 
            setTimeout(() => chatOutput.scrollTop = chatOutput.scrollHeight, 100);
        } else {
            appendMessageUI(`Hi ${state.currentUser.full_name}! I'm EcoBuddy. Ask me about the **Mr. & Miss BKBNC** voting or how to earn points! 👑🌿`, 'bot');
        }
    } catch (err) {
        console.error("Load History Error:", err);
    }
};

// ==========================================
// 🎨 UI HANDLERS
// ==========================================

const chatOutput = document.getElementById('chatbot-messages');
const chatForm = document.getElementById('chatbot-form');
const chatInput = document.getElementById('chatbot-input');

// SEPARATED UI LOGIC
const appendMessageUI = (text, sender, animate = true) => {
    const div = document.createElement('div');
    div.className = `msg-group w-full flex ${sender === 'user' ? 'justify-end' : 'justify-start'} ${animate ? 'animate-slideUp' : ''}`;
    
    const parsedText = marked.parse(text);

    if (sender === 'user') {
        // User Bubble
        div.innerHTML = `
            <div class="max-w-[85%] p-4 px-5 rounded-[20px] rounded-br-lg text-white shadow-md bg-gradient-to-br from-[#34c46e] to-[#169653]">
                <div class="text-sm leading-relaxed">${parsedText}</div>
            </div>`;
    } else {
        // Bot Bubble WITH EARTH LOGO
        div.innerHTML = `
            <div class="flex items-end gap-2 max-w-[90%]">
                <div class="w-8 h-8 rounded-full bg-white p-0.5 shadow-sm flex-shrink-0 border border-[#c8ffe1]">
                    <img src="https://i.ibb.co/7xwsMnBc/Pngtree-green-earth-globe-clip-art-16672659-1.png" class="w-full h-full object-contain rounded-full">
                </div>
                <div class="p-4 px-5 rounded-[20px] rounded-bl-lg border border-[#c8ffe1]/75 dark:border-white/10 bg-white/85 dark:bg-[#1e3c2d]/70 text-[#2c4434] dark:text-[#e7ffef]">
                    <div class="text-sm leading-relaxed">${parsedText}</div>
                </div>
            </div>`;
    }
    
    const chatOutput = document.getElementById('chatbot-messages');
    if (chatOutput) {
        chatOutput.appendChild(div);
        chatOutput.scrollTop = chatOutput.scrollHeight; 
    }
};

if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;

        // 1. UI: Show User Message
        appendMessageUI(message, 'user');
        chatInput.value = '';
        
        // 2. DB: Save User Message
        saveMessageToDB('user', message);
        logUserActivity('chat_message', 'User sent a chat message');

        // 3. UI: Show Typing
        const typingId = 'typing-' + Date.now();
        const typingDiv = document.createElement('div');
        typingDiv.id = typingId;
        typingDiv.className = 'msg-group w-full flex justify-start animate-slideUp';
        typingDiv.innerHTML = `
            <div class="flex items-end gap-2 max-w-[90%]">
                <div class="w-8 h-8 rounded-full bg-white p-0.5 shadow-sm flex-shrink-0 border border-[#c8ffe1]">
                    <img src="https://i.ibb.co/7xwsMnBc/Pngtree-green-earth-globe-clip-art-16672659-1.png" class="w-full h-full object-contain rounded-full">
                </div>
                <div class="p-4 px-5 rounded-[20px] rounded-bl-lg border border-[#c8ffe1]/75 dark:border-white/10 bg-white/85 dark:bg-[#1e3c2d]/70 flex items-center gap-1 h-[54px]">
                     <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
                </div>
            </div>`;
        
        const chatOutput = document.getElementById('chatbot-messages');
        if(chatOutput) {
             chatOutput.appendChild(typingDiv);
             chatOutput.scrollTop = chatOutput.scrollHeight;
        }

        // 4. API: Fetch Response (Via Edge Function)
        const botResponse = await fetchAIResponse(message);

        // 5. UI: Remove Typing & Show Response
        const typingEl = document.getElementById(typingId);
        if(typingEl) typingEl.remove();
        appendMessageUI(botResponse, 'bot');

        // 6. DB: Save Bot Response
        saveMessageToDB('bot', botResponse);
    });
}

// ==========================================
// 🚪 MODAL LOGIC (Responsive)
// ==========================================

window.openChatbotModal = () => {
    logUserActivity('open_chatbot', 'Opened Chatbot');
    const modal = document.getElementById('chatbot-modal');
    modal.classList.add('open'); // Use .open class for better CSS control
    modal.classList.remove('invisible'); 
    
    // Slight delay for animation triggers
    requestAnimationFrame(() => {
        modal.classList.remove('translate-y-full');
    });
    
    loadChatHistory();
};

window.closeChatbotModal = () => {
    const modal = document.getElementById('chatbot-modal');
    modal.classList.remove('open');
    modal.classList.add('translate-y-full');
    setTimeout(() => {
        modal.classList.add('invisible');
    }, 500); // Match CSS transition time
};

// ==========================================
// 📝 MARKDOWN PARSER
// ==========================================
const marked = {
    parse: (text) => {
        if(!text) return '';
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>'); 
        text = text.replace(/^- (.*$)/gim, '<li>$1</li>'); 
        text = text.replace(/\n/g, '<br>'); 
        return text;
    }
};

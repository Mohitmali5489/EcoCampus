import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, getIconForChallenge, uploadToCloudinary, getTodayIST, logUserActivity, showToast } from './utils.js';
import { refreshUserData } from './app.js';

// 1. Load Challenges & Feedback State
export const loadChallengesData = async () => {
    try {
        const { data: challenges, error: challengeError } = await supabase
            .from('challenges')
            .select('id, title, description, points_reward, type, frequency')
            .eq('is_active', true);
            
        if (challengeError) throw challengeError;

        const todayIST = getTodayIST();

        const { data: submissions, error: subError } = await supabase
            .from('challenge_submissions')
            .select('challenge_id, status, created_at')
            .eq('user_id', state.currentUser.id)
            .gte('created_at', todayIST);
            
        if (subError) throw subError;

        const { data: feedbackData } = await supabase
            .from('user_feedback')
            .select('id')
            .eq('user_id', state.currentUser.id)
            .maybeSingle();

        state.userHasGivenFeedback = !!feedbackData;

        state.dailyChallenges = challenges.map(c => {
            const challengeSubs = submissions.filter(s => s.challenge_id === c.id);
            let sub = null;

            if (c.frequency === 'daily') {
                sub = challengeSubs.find(s => {
                    const subDate = new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                    return subDate === todayIST;
                });
            } else {
                sub = challengeSubs[0];
            }

            let status = 'active', buttonText = 'Start', isDisabled = false;
            
            if (sub) {
                if (sub.status === 'approved' || sub.status === 'verified') { 
                    status = 'completed'; 
                    buttonText = c.frequency === 'daily' ? 'Done' : 'Completed'; 
                    isDisabled = true; 
                } 
                else if (sub.status === 'pending') { 
                    status = 'pending'; 
                    buttonText = 'In Review'; 
                    isDisabled = true; 
                } 
                else if (sub.status === 'rejected') { 
                    status = 'active'; 
                    buttonText = 'Retry'; 
                }
            } else {
                if (c.type === 'Upload' || c.type === 'selfie') buttonText = 'Take Photo';
            }
            
            return { ...c, icon: getIconForChallenge(c.type), status, buttonText, isDisabled };
        });

        await checkQuizStatus();

        if (document.getElementById('challenges').classList.contains('active')) renderChallengesPage();
    } catch (err) { 
        console.error('Challenges Load Error:', err); 
        showToast("Failed to load actions.", "error");
    }
};

// 2. Check Quiz Status
const checkQuizStatus = async () => {
    const quizSection = document.getElementById('daily-quiz-section');
    const btn = document.getElementById('btn-quiz-play');
    if (!quizSection || !btn) return;

    if (state.quizStatusLoaded) {
        if (!state.quizAvailable) quizSection.classList.add('hidden');
        else {
            quizSection.classList.remove('hidden');
            updateQuizButtonUI(btn, state.quizAttempted);
        }
        return;
    }

    try {
        const today = getTodayIST();
        const { data: quiz } = await supabase.from('daily_quizzes').select('id').eq('available_date', today).limit(1).maybeSingle();

        if (!quiz) {
            state.quizAvailable = false;
            quizSection.classList.add('hidden');
            return;
        }

        state.quizAvailable = true;
        state.currentQuizId = quiz.id;
        const { data: submission } = await supabase.from('quiz_submissions').select('id').eq('quiz_id', quiz.id).eq('user_id', state.currentUser.id).maybeSingle();

        state.quizAttempted = !!submission;
        state.quizStatusLoaded = true;
        quizSection.classList.remove('hidden');
        updateQuizButtonUI(btn, state.quizAttempted);
    } catch (err) {}
};

const updateQuizButtonUI = (btn, isAttempted) => {
    if (isAttempted) {
        btn.textContent = "Attempted";
        btn.disabled = true;
        btn.className = "px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 text-xs font-bold cursor-default";
    } else {
        btn.textContent = "Play Now";
        btn.disabled = false;
        btn.onclick = openEcoQuizModal;
        btn.className = "px-4 py-2 rounded-full bg-brand-600 text-white text-xs font-bold shadow-md shadow-brand-500/30 hover:bg-brand-500 transition-colors";
    }
};

// 3. Render Page
export const renderChallengesPage = () => {
    const container = els.challengesList;
    if (!container) return;
    container.innerHTML = '';
    
    checkQuizStatus();

    // FEEDBACK SECTION
    if (!state.userHasGivenFeedback) {
        const fbDiv = document.createElement('div');
        fbDiv.className = "col-span-full glass-card p-5 rounded-3xl mb-6 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 border-emerald-100 dark:border-emerald-800 shadow-sm";
        fbDiv.innerHTML = `
            <div class="flex items-center gap-3 mb-1">
                <div class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <i data-lucide="heart" class="w-4 h-4 fill-current"></i>
                </div>
                <h3 class="font-bold text-gray-900 dark:text-white">Rate your experience</h3>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4 ml-11">Help us make EcoCampus better for everyone.</p>
            
            <div class="flex justify-center gap-3 mb-5" id="star-rating-container">
                ${[1,2,3,4,5].map(num => `
                    <button onclick="setStarRating(${num})" class="star-btn text-gray-300 dark:text-gray-600 transition-all active:scale-90" data-star="${num}">
                        <i data-lucide="star" class="w-9 h-9 pointer-events-none"></i>
                    </button>
                `).join('')}
            </div>
            
            <textarea id="feedback-comment" placeholder="Write a Feedback and  suggestions (Optional)" 
                class="w-full p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none mb-4 transition-all" rows="2"></textarea>
            
            <button onclick="submitUserFeedback()" id="submit-fb-btn" 
                class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all">
                Submit Feedback
            </button>
        `;
        container.appendChild(fbDiv);
    }

    // CHALLENGES LIST
    if (state.dailyChallenges.length === 0) {
        container.innerHTML += `<p class="col-span-full text-sm text-center text-gray-500 py-10">No active photo challenges.</p>`;
    } else {
        container.className = "grid grid-cols-1 md:grid-cols-2 gap-4";
        state.dailyChallenges.forEach(c => {
            let buttonHTML = c.isDisabled 
                ? `<button disabled class="text-xs font-semibold px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed">${c.buttonText}</button>`
                : `<button onclick="startCamera('${c.id}')" data-challenge-id="${c.id}" class="text-xs font-semibold px-4 py-2 rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors shadow-sm active:scale-95"><i data-lucide="camera" class="w-3 h-3 mr-1 inline-block"></i>${c.buttonText}</button>`;

            container.innerHTML += `
                <div class="glass-card p-4 rounded-2xl flex items-start h-full">
                    <div class="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/40 flex items-center justify-center mr-3 flex-shrink-0">
                        <i data-lucide="${c.icon}" class="w-5 h-5 text-green-600 dark:text-green-300"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-gray-900 dark:text-gray-100 truncate text-sm">${c.title}</h3>
                        <p class="text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-bold uppercase tracking-wider">${c.frequency === 'daily' ? '🔄 Daily' : '⭐ One-time'}</p>
                        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">${c.description}</p>
                        <div class="flex items-center justify-between mt-3">
                            <span class="text-xs font-bold text-green-700 dark:text-green-300">+${c.points_reward} pts</span>
                            ${buttonHTML}
                        </div>
                    </div>
                </div>`;
        });
    }
    if(window.lucide) window.lucide.createIcons();
};

// 4. Feedback Logic (FIXED FOR SVG HANDLING)
let selectedRating = 0;
window.setStarRating = (num) => {
    selectedRating = num;
    const starButtons = document.querySelectorAll('.star-btn');
    
    starButtons.forEach(btn => {
        const starNum = parseInt(btn.dataset.star);
        // Find either the <i> tag or the generated <svg> tag
        const icon = btn.querySelector('i') || btn.querySelector('svg');
        
        if (starNum <= num) {
            btn.classList.add('text-yellow-400');
            btn.classList.remove('text-gray-300', 'text-gray-600');
            if(icon) {
                icon.style.fill = "currentColor";
                icon.style.stroke = "currentColor";
            }
        } else {
            btn.classList.remove('text-yellow-400');
            btn.classList.add('text-gray-300', 'text-gray-600');
            if(icon) {
                icon.style.fill = "none";
                // Restore original stroke color
                icon.style.stroke = ""; 
            }
        }
    });
};

window.submitUserFeedback = async () => {
    if (selectedRating === 0) {
        showToast("Please select a star rating.", "warning");
        return;
    }

    const comment = document.getElementById('feedback-comment').value.trim();
    const btn = document.getElementById('submit-fb-btn');
    btn.disabled = true;
    btn.innerText = "Sending...";

    try {
        const { error } = await supabase.from('user_feedback').insert({
            user_id: state.currentUser.id,
            rating: selectedRating,
            comment: comment
        });

        if (error) throw error;

        showToast("Thanks for your feedback! 💚", "success");
        state.userHasGivenFeedback = true;
        renderChallengesPage();
    } catch (err) {
        console.error("Feedback error:", err);
        showToast("Error submitting feedback.", "error");
        btn.disabled = false;
        btn.innerText = "Submit Feedback";
    }
};

// 5. Camera & Photo Logic
let currentCameraStream = null;
let currentChallengeIdForCamera = null;
let currentFacingMode = 'environment';

export const startCamera = async (challengeId, facingMode = 'environment') => {
    logUserActivity('start_camera', `Opened camera for challenge`, { challengeId });
    currentChallengeIdForCamera = challengeId;
    currentFacingMode = facingMode;
    
    const modal = document.getElementById('camera-modal');
    if(!modal) return;
    
    const video = document.getElementById('camera-feed');
    modal.classList.remove('hidden');
    modal.classList.add('open');
    
    if (currentCameraStream) currentCameraStream.getTracks().forEach(track => track.stop());

    try {
        currentCameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: currentFacingMode } 
        });
        video.srcObject = currentCameraStream;
        video.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'none';
    } catch (err) { 
        console.error(err);
        showToast("Camera access denied.", "error"); 
        closeCameraModal(); 
    }
};

export const switchCamera = () => {
    const newMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    startCamera(currentChallengeIdForCamera, newMode);
};

export const closeCameraModal = () => {
    const modal = document.getElementById('camera-modal');
    if (currentCameraStream) currentCameraStream.getTracks().forEach(track => track.stop());
    const video = document.getElementById('camera-feed');
    if(video) video.srcObject = null;
    if(modal) {
        modal.classList.remove('open');
        modal.classList.add('hidden');
    }
};

export const capturePhoto = async () => {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas');
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    
    if (currentFacingMode === 'user') {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
    }
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    closeCameraModal();
    
    canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "proof.jpg", { type: "image/jpeg" });
        
        const btn = document.querySelector(`button[data-challenge-id="${currentChallengeIdForCamera}"]`);
        if(btn) { btn.innerText = 'Uploading...'; btn.disabled = true; }
        
        try {
            showToast('Uploading proof...', 'warning');
            const imageUrl = await uploadToCloudinary(file);
            const { error } = await supabase.from('challenge_submissions').insert({ 
                challenge_id: currentChallengeIdForCamera, 
                user_id: state.currentUser.id, 
                submission_url: imageUrl, 
                status: 'pending' 
            });
            if (error) throw error;
            
            showToast('Submitted successfully!', 'success');
            loadChallengesData(); 
        } catch (err) { 
            console.error(err);
            showToast('Upload failed.', 'error'); 
            if(btn) { btn.innerText = 'Retry'; btn.disabled = false; }
        }
    }, 'image/jpeg', 0.8);
};

// 6. Quiz Logic
export const openEcoQuizModal = async () => {
    logUserActivity('open_quiz', 'Opened daily quiz');

    const modal = document.getElementById('eco-quiz-modal');
    const loading = document.getElementById('eco-quiz-loading');
    const body = document.getElementById('eco-quiz-body');
    const played = document.getElementById('eco-quiz-already-played');
    
    modal.classList.remove('invisible', 'opacity-0');
    modal.classList.add('open');
    loading.classList.remove('hidden');
    body.classList.add('hidden');
    played.classList.add('hidden');

    try {
        const today = getTodayIST();
        const { data: quiz } = await supabase.from('daily_quizzes').select('*').eq('available_date', today).limit(1).maybeSingle();

        if (!quiz) {
            showToast("No quiz for today!", "warning");
            closeEcoQuizModal();
            return;
        }

        state.currentQuizId = quiz.id;

        if (state.quizAttempted) {
            loading.classList.add('hidden');
            played.classList.remove('hidden');
            return;
        }

        loading.classList.add('hidden');
        body.classList.remove('hidden');
        document.getElementById('eco-quiz-question').textContent = quiz.question;
        const optsDiv = document.getElementById('eco-quiz-options');
        optsDiv.innerHTML = '';
        
        const options = Array.isArray(quiz.options) ? quiz.options : JSON.parse(quiz.options);
        
        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = "quiz-option w-full text-left p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:border-indigo-400 transition-all active:scale-[0.98]";
            btn.textContent = opt;
            btn.onclick = () => submitQuizAnswer(idx, quiz.correct_option_index, quiz.points_reward);
            optsDiv.appendChild(btn);
        });
        
    } catch (err) {
        console.error(err);
        showToast("Quiz load error.", "error");
        closeEcoQuizModal();
    }
};

const submitQuizAnswer = async (selectedIndex, correctIndex, points) => {
    if (state.quizAttempted) return;
    state.quizAttempted = true;

    const isCorrect = selectedIndex === correctIndex;
    const feedback = document.getElementById('eco-quiz-feedback');
    const opts = document.querySelectorAll('.quiz-option');
    
    opts.forEach(b => b.disabled = true);
    opts[selectedIndex].classList.add(isCorrect ? 'bg-green-100' : 'bg-red-100', isCorrect ? 'border-green-500' : 'border-red-500');
    if (!isCorrect) opts[correctIndex].classList.add('bg-green-100', 'border-green-500');

    feedback.classList.remove('hidden');
    feedback.textContent = isCorrect ? `Correct! +${points} Points` : "Wrong Answer!";
    feedback.className = `p-4 rounded-xl text-center font-bold mb-4 ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;

    await supabase.from('quiz_submissions').insert({
        quiz_id: state.currentQuizId,
        user_id: state.currentUser.id,
        is_correct: isCorrect
    });

    if (isCorrect) {
        await supabase.from('points_ledger').insert({
            user_id: state.currentUser.id,
            source_type: 'quiz',
            source_id: state.currentQuizId,
            points_delta: points,
            description: 'Daily Quiz Win'
        });
        showToast(`Correct! +${points} pts`, 'success');
    } else {
        showToast("Incorrect answer.", "warning");
    }

    setTimeout(() => {
        closeEcoQuizModal();
        refreshUserData();
        loadChallengesData();
    }, 2000);
};

export const closeEcoQuizModal = () => {
    const modal = document.getElementById('eco-quiz-modal');
    if(modal) {
        modal.classList.remove('open');
        modal.classList.add('invisible', 'opacity-0');
        setTimeout(() => {
             const fb = document.getElementById('eco-quiz-feedback');
             if(fb) fb.classList.add('hidden');
        }, 300);
    }
};

window.renderChallengesPageWrapper = renderChallengesPage;
window.startCamera = startCamera;
window.closeCameraModal = closeCameraModal;
window.capturePhoto = capturePhoto;
window.switchCamera = switchCamera;
window.openEcoQuizModal = openEcoQuizModal;
window.closeEcoQuizModal = closeEcoQuizModal;
window.submitUserFeedback = submitUserFeedback;
window.setStarRating = setStarRating;

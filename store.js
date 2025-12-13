import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { els, getPlaceholderImage, formatDate, getUserLevel, logUserActivity, isLowDataMode } from './utils.js';
import { refreshUserData } from './app.js';

const getProduct = (productId) => state.products.find(p => p.id === productId);
const getStore = (storeId) => state.stores.find(s => s.id === storeId);

// 1. Load Data & Extract Stores (Once per session)
export const loadStoreAndProductData = async () => {
    // Flag Check
    if (state.storeLoaded) {
        if (document.getElementById('rewards').classList.contains('active')) renderRewards();
        return;
    }

    try {
        // Optimization: Strict Columns, Removed Metadata, Limit 50
        const { data, error } = await supabase
            .from('products')
            .select(`
                id, name, description, original_price, discounted_price, ecopoints_cost, store_id,
                stores ( id, name, logo_url ), 
                product_images ( image_url, sort_order ),
                product_features ( feature, sort_order ),
                product_specifications ( spec_key, spec_value, sort_order )
            `)
            .eq('is_active', true)
            .limit(50); // Hard Limit

        if (error) throw error;

        state.products = data.map(p => ({
            ...p, 
            images: p.product_images?.sort((a,b) => a.sort_order - b.sort_order).map(img => img.image_url) || [],
            highlights: p.product_features?.sort((a,b) => a.sort_order - b.sort_order).map(f => f.feature) || [],
            specs: p.product_specifications?.sort((a,b) => a.sort_order - b.sort_order) || [],
            storeName: p.stores?.name || 'Unknown Store', 
            storeLogo: p.stores?.logo_url, 
            popularity: Math.floor(Math.random() * 50) 
        }));

        const storeMap = new Map();
        state.products.forEach(p => {
            if (p.stores && !storeMap.has(p.stores.id)) {
                storeMap.set(p.stores.id, {
                    id: p.stores.id,
                    name: p.stores.name,
                    logo_url: p.stores.logo_url,
                    itemCount: 0
                });
            }
            if(p.stores) {
                storeMap.get(p.stores.id).itemCount++;
            }
        });
        state.stores = Array.from(storeMap.values());
        state.storeLoaded = true;

        if (document.getElementById('rewards').classList.contains('active')) renderRewards();
    } catch (err) { console.error('Product Load Error:', err); }
};

// 2. Render Rewards
export const renderRewards = () => {
    const container = els.productGrid;
    container.innerHTML = '';
    
    container.className = "flex flex-col gap-8 pb-10";

    const searchTerm = els.storeSearch.value.toLowerCase();
    els.storeSearchClear.classList.toggle('hidden', !searchTerm);

    let matchingStores = state.stores;
    if (searchTerm.length > 0) {
        matchingStores = state.stores.filter(s => s.name.toLowerCase().includes(searchTerm));
    }

    let products = [...state.products];
    if(searchTerm.length > 0) {
        products = products.filter(p => p.name.toLowerCase().includes(searchTerm) || p.storeName.toLowerCase().includes(searchTerm));
    }

    const criteria = els.sortBy.value;
    products.sort((a, b) => {
        switch (criteria) {
            case 'points-lh': return a.ecopoints_cost - b.ecopoints_cost;
            case 'points-hl': return b.ecopoints_cost - a.ecopoints_cost;
            case 'price-lh': return a.discounted_price - b.discounted_price;
            case 'price-hl': return b.discounted_price - a.discounted_price;
            default: return b.popularity - a.popularity;
        }
    });

    if (matchingStores.length > 0) {
        const storesSection = document.createElement('div');
        storesSection.className = "w-full";
        storesSection.innerHTML = `
            <div class="flex items-center justify-between mb-4 px-1">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i data-lucide="store" class="w-5 h-5 text-brand-500"></i> Browse Stores
                </h3>
            </div>
            <div class="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x px-1">
                ${matchingStores.map(s => `
                    <div onclick="openStorePage('${s.id}')" class="flex-shrink-0 w-40 snap-start bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-95 group">
                        <div class="w-16 h-16 mx-auto bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3 border border-gray-100 dark:border-gray-600 group-hover:border-brand-200 transition-colors overflow-hidden">
                            <img src="${s.logo_url || getPlaceholderImage('64x64')}" class="w-full h-full object-cover">
                        </div>
                        <div class="text-center">
                            <h4 class="font-bold text-sm text-gray-900 dark:text-white truncate mb-1">${s.name}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">${s.itemCount} Items</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(storesSection);
    }

    if (products.length > 0) {
        const productsSection = document.createElement('div');
        productsSection.className = "w-full";
        
        const productsHTML = products.map(p => {
            const imageUrl = (p.images && p.images[0]) ? p.images[0] : getPlaceholderImage('300x225');
            return `
                <div class="w-full flex-shrink-0 glass-card border border-gray-200/60 dark:border-gray-700/80 rounded-2xl overflow-hidden flex flex-col cursor-pointer active:scale-95 transition-transform hover:shadow-md bg-white dark:bg-gray-800" onclick="showProductDetailPage('${p.id}')">
                    <div class="relative">
                        <img src="${imageUrl}" class="w-full h-36 object-cover bg-gray-100 dark:bg-gray-700" onerror="this.src='${getPlaceholderImage('300x225')}'" loading="lazy">
                        <div class="absolute top-2 right-2 bg-white/90 dark:bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1">
                            <i data-lucide="leaf" class="w-3 h-3 text-green-500 fill-current"></i>
                            <span class="text-xs font-bold text-green-700 dark:text-green-400">${p.ecopoints_cost}</span>
                        </div>
                    </div>
                    <div class="p-3 flex flex-col flex-grow">
                        <div class="flex items-center mb-1">
                            <img src="${p.storeLogo || getPlaceholderImage('20x20')}" class="w-4 h-4 rounded-full mr-1.5 border dark:border-gray-600 object-cover">
                            <p class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">${p.storeName}</p>
                        </div>
                        <p class="font-bold text-gray-800 dark:text-gray-100 text-sm leading-tight mb-2 line-clamp-2">${p.name}</p>
                        <div class="mt-auto flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
                            <span class="text-xs text-gray-400 dark:text-gray-500 line-through">₹${p.original_price}</span>
                            <span class="text-sm font-black text-gray-900 dark:text-white">₹${p.discounted_price}</span>
                        </div>
                    </div>
                </div>`;
        }).join('');

        productsSection.innerHTML = `
            <div class="flex items-center justify-between mb-4 px-1">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i data-lucide="gift" class="w-5 h-5 text-purple-500"></i> All Rewards
                </h3>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                ${productsHTML}
            </div>
        `;
        container.appendChild(productsSection);
    }

    if (products.length === 0 && matchingStores.length === 0) { 
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 opacity-60">
                <i data-lucide="search-x" class="w-12 h-12 text-gray-300 mb-3"></i>
                <p class="text-sm font-medium text-gray-500">No matches found.</p>
            </div>`; 
    }

    if(window.lucide) window.lucide.createIcons();
};

// 3. Store Page
export const openStorePage = (storeId) => {
    const store = getStore(storeId);
    if (!store) return;
    
    logUserActivity('view_store', `Visited store: ${store.name}`, { storeId });

    const storeProducts = state.products.filter(p => p.store_id === storeId);
    
    const storeDetailEl = document.getElementById('store-detail-page');
    storeDetailEl.innerHTML = `
        <div class="relative w-full h-full bg-gray-50 dark:bg-gray-900 overflow-y-auto pb-24">
            <div class="bg-white dark:bg-gray-950 p-6 pb-8 border-b border-gray-200 dark:border-gray-800 shadow-sm relative sticky top-0 z-20">
                <button onclick="showPage('rewards')" class="absolute top-4 left-4 p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    <i data-lucide="arrow-left" class="w-5 h-5"></i>
                </button>
                
                <div class="flex flex-col items-center text-center mt-4">
                    <img src="${store.logo_url || getPlaceholderImage('80x80')}" class="w-20 h-20 rounded-full border-4 border-white dark:border-gray-800 shadow-md mb-3 object-cover">
                    <h1 class="text-2xl font-black text-gray-900 dark:text-white">${store.name}</h1>
                    <div class="flex items-center gap-4 mt-2">
                        <span class="text-xs font-bold px-3 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Verified Store</span>
                        <span class="text-xs font-medium text-gray-500 dark:text-gray-400">${store.itemCount} Products</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-2xl font-black text-gray-900 dark:text-white">${storeProducts.length}</p>
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Total Items</p>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-2xl font-black text-orange-500">4.8</p>
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Rating</p>
                </div>
            </div>

            <div class="px-6 pb-6">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">All Products</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    ${storeProducts.map(p => {
                        const img = (p.images && p.images[0]) ? p.images[0] : getPlaceholderImage();
                        return `
                        <div class="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm active:scale-95 transition-transform cursor-pointer hover:shadow-md" onclick="showProductDetailPage('${p.id}')">
                            <img src="${img}" class="w-full h-32 object-cover" loading="lazy">
                            <div class="p-3">
                                <p class="font-bold text-gray-900 dark:text-white text-xs line-clamp-1 mb-1">${p.name}</p>
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-bold text-gray-500 line-through">₹${p.original_price}</span>
                                    <div class="flex items-center text-green-600 dark:text-green-400 font-bold text-xs">
                                        <i data-lucide="leaf" class="w-3 h-3 mr-1 fill-current"></i>
                                        <span>${p.ecopoints_cost}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
    window.showPage('store-detail-page');
    if(window.lucide) window.lucide.createIcons();
}

// 4. Product Detail
export const showProductDetailPage = (productId) => {
    const product = getProduct(productId);
    if (!product) return;

    logUserActivity('view_product', `Viewed product: ${product.name}`, { productId, storeId: product.store_id });

    const imageUrl = (product.images && product.images.length > 0) ? product.images[0] : getPlaceholderImage();
    const canAfford = state.currentUser.current_points >= product.ecopoints_cost;
    const highlights = product.highlights.length > 0 ? product.highlights : ['Handwritten-style love letter', 'Burnt-edge design', 'Personalized message', 'Ideal for gifts'];
    const specs = product.specs.length > 0 ? product.specs : [{ spec_key: 'FINISH', spec_value: 'Matte handcrafted' }, { spec_key: 'PRODUCT_TYPE', spec_value: 'Vintage Letter' }];

    els.productDetailPage.innerHTML = `
        <div class="relative w-full h-full bg-white dark:bg-gray-950 overflow-y-auto no-scrollbar pb-28">
            <div class="relative w-full h-[60vh] md:h-[50vh] flex-shrink-0">
                <img src="${imageUrl}" class="w-full h-full object-cover" onerror="this.src='${getPlaceholderImage()}'">
                <button onclick="showPage('rewards')" class="absolute top-6 left-6 p-2 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50 transition-all z-20">
                    <i data-lucide="arrow-left" class="w-6 h-6"></i>
                </button>
                <div class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white dark:from-gray-950 to-transparent"></div>
            </div>
            <div class="relative px-6 -mt-10 z-10 bg-white dark:bg-gray-950 rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] dark:shadow-none min-h-[50vh] max-w-4xl mx-auto">
                <div class="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-6 mt-3 opacity-50"></div>
                <div class="mb-6">
                    <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3 leading-tight">${product.name}</h1>
                    <div onclick="openStorePage('${product.store_id}')" class="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 cursor-pointer active:scale-95 transition-transform">
                         <img src="${product.storeLogo || getPlaceholderImage('20x20')}" class="w-5 h-5 rounded-full">
                         <span class="text-xs font-bold text-gray-700 dark:text-gray-300">Sold by ${product.storeName}</span>
                         <i data-lucide="chevron-right" class="w-3 h-3 text-gray-400"></i>
                    </div>
                    <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-2">Description</h3>
                    <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                        ${product.description || 'A beautifully handcrafted item designed to express heartfelt emotions in a timeless way.'}
                    </p>
                </div>
                <div class="mb-8">
                    <h3 class="text-base font-bold text-gray-900 dark:text-white mb-3">Highlights</h3>
                    <div class="space-y-3">
                        ${highlights.map(h => `
                            <div class="flex items-start p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                                <div class="flex-shrink-0 mt-0.5"><div class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center"><i data-lucide="check" class="w-3 h-3 text-emerald-600 dark:text-emerald-300"></i></div></div>
                                <span class="ml-3 text-sm font-medium text-gray-700 dark:text-gray-200 leading-snug">${h}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="mb-8">
                    <h3 class="text-base font-bold text-gray-900 dark:text-white mb-3">Specifications</h3>
                    <div class="grid grid-cols-2 gap-3">
                        ${specs.map(s => `
                            <div class="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">${s.spec_key}</p>
                                <p class="text-sm font-bold text-gray-900 dark:text-white line-clamp-1">${s.spec_value}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="mb-4 p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                    <div class="flex items-center gap-2 mb-2"><i data-lucide="qr-code" class="w-5 h-5 text-indigo-600 dark:text-indigo-400"></i><h3 class="text-sm font-bold text-indigo-900 dark:text-indigo-100">How to Redeem</h3></div>
                    <p class="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">Purchase this item using points. A QR code will be generated which you must show at the <strong>${product.storeName}</strong> counter to claim your item.</p>
                </div>
            </div>
            <div class="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 z-50 max-w-4xl mx-auto flex items-center justify-between pb-6 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] dark:shadow-none">
                <div>
                    <p class="text-xs text-gray-400 line-through font-medium mb-0.5">₹${product.original_price}</p>
                    <div class="flex items-center gap-1.5">
                        <span class="text-3xl font-black text-gray-900 dark:text-white">₹${product.discounted_price}</span>
                        <span class="text-gray-400 text-sm font-medium">+</span>
                        <div class="flex items-center text-[#00d685] font-bold text-xl"><i data-lucide="leaf" class="w-5 h-5 mr-1 fill-current"></i><span>${product.ecopoints_cost}</span></div>
                    </div>
                </div>
                <button onclick="openPurchaseModal('${product.id}')" ${canAfford ? '' : 'disabled'} class="bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-black dark:hover:bg-gray-200 font-bold py-3.5 px-6 rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"><span>${canAfford ? 'Redeem Now' : 'Low Points'}</span><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
            </div>
        </div>
    `;
    window.showPage('product-detail-page');
    if(window.lucide) window.lucide.createIcons();
};

// 5. Purchase Modal Logic
export const openPurchaseModal = (productId) => {
    const product = getProduct(productId);
    if (!product) return;
    const imageUrl = (product.images && product.images.length > 0) ? product.images[0] : getPlaceholderImage('100x100');
    els.purchaseModal.innerHTML = `
        <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Confirm Redemption</h3><button onclick="closePurchaseModal()" class="text-gray-400"><i data-lucide="x" class="w-6 h-6"></i></button></div><div class="flex items-center mb-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl"><img src="${imageUrl}" class="w-16 h-16 object-cover rounded-lg mr-4"><div><h4 class="text-lg font-bold text-gray-800 dark:text-gray-100 line-clamp-1">${product.name}</h4><div class="flex items-center font-bold text-gray-800 dark:text-gray-100 text-sm"><span class="text-green-700 dark:text-green-400">₹${product.discounted_price}</span><span class="mx-1 text-gray-400">+</span><i data-lucide="leaf" class="w-3 h-3 text-green-500 mr-1"></i><span class="text-green-700 dark:text-green-400">${product.ecopoints_cost}</span></div></div></div><p class="text-xs text-gray-500 dark:text-gray-400 mb-4 text-center">By confirming, ${product.ecopoints_cost} EcoPoints will be deducted from your balance.</p><button id="confirm-purchase-btn" onclick="confirmPurchase('${product.id}')" class="w-full btn-eco-gradient text-white font-bold py-3.5 px-4 rounded-xl mb-3 shadow-lg">Confirm & Pay ₹${product.discounted_price}</button>`;
    els.purchaseModalOverlay.classList.remove('hidden');
    setTimeout(() => els.purchaseModal.classList.remove('translate-y-full'), 10);
    if(window.lucide) window.lucide.createIcons();
};

export const closePurchaseModal = () => {
    els.purchaseModal.classList.add('translate-y-full');
    setTimeout(() => els.purchaseModalOverlay.classList.add('hidden'), 300);
};

export const confirmPurchase = async (productId) => {
    try {
        const product = getProduct(productId);
        if (!product || state.currentUser.current_points < product.ecopoints_cost) { alert("You do not have enough points."); return; }
        const confirmBtn = document.getElementById('confirm-purchase-btn');
        confirmBtn.disabled = true; confirmBtn.textContent = 'Processing...';
        
        // 1. Insert Order
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert({ 
                user_id: state.currentUser.id, 
                store_id: product.store_id, 
                status: 'pending', 
                total_points: product.ecopoints_cost, 
                total_price: product.discounted_price, 
                requires_approval: false 
            })
            .select('id, created_at, status')
            .single();
            
        if (orderError) throw orderError;
        
        // 2. Insert Item
        const { error: itemError } = await supabase.from('order_items').insert({ order_id: orderData.id, product_id: product.id, quantity: 1, price_each: product.discounted_price, points_each: product.ecopoints_cost });
        if (itemError) throw itemError;
        
        // 3. Confirm Order
        const { error: confirmError } = await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderData.id);
        if (confirmError) throw confirmError;
        
        // 4. Update Local State (No Refetch)
        state.currentUser.current_points -= product.ecopoints_cost;
        
        const newReward = {
            userRewardId: orderData.id,
            purchaseDate: formatDate(orderData.created_at),
            redeemedAt: null,
            status: 'confirmed', // We set it to confirmed above
            productName: product.name,
            storeName: product.storeName,
            productImage: (product.images && product.images.length > 0) ? product.images[0] : getPlaceholderImage()
        };
        
        state.userRewards = [newReward, ...state.userRewards];
        
        closePurchaseModal();
        
        // Refresh Header Points
        const header = document.getElementById('user-points-header');
        if(header) {
            header.textContent = state.currentUser.current_points;
            header.classList.add('points-pulse');
            setTimeout(() => header.classList.remove('points-pulse'), 500);
        }
        
        window.showPage('my-rewards');
    } catch (err) { console.error('Purchase Failed:', err); alert(`Purchase failed: ${err.message}`); }
};

// 6. My Rewards
export const loadUserRewardsData = async () => {
    // Flag Check
    if (state.userRewardsLoaded) {
        if (document.getElementById('my-rewards').classList.contains('active')) renderMyRewardsPage();
        return;
    }

    try {
        // Optimization: Strict Columns, Limit 50
        const { data, error } = await supabase
            .from('orders')
            .select(`
                id, created_at, updated_at, status,
                order_items ( products ( id, name, product_images ( image_url ), stores ( name ) ) )
            `)
            .eq('user_id', state.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(50); // Hard Limit

        if (error) return;

        state.userRewards = data.map(order => {
            const item = order.order_items[0]; if (!item) return null;
            return { 
                userRewardId: order.id, 
                purchaseDate: formatDate(order.created_at), 
                redeemedAt: order.updated_at ? formatDate(order.updated_at) : null,
                status: order.status, 
                productName: item.products.name, 
                storeName: item.products.stores.name, 
                productImage: (item.products.product_images[0] && item.products.product_images[0].image_url) || getPlaceholderImage() 
            };
        }).filter(Boolean);

        state.userRewardsLoaded = true;

        if (document.getElementById('my-rewards').classList.contains('active')) renderMyRewardsPage();
    } catch (err) { console.error('User Rewards Load Error:', err); }
};

export const renderMyRewardsPage = () => {
    els.allRewardsList.innerHTML = '';
    els.allRewardsList.className = "space-y-4 max-w-3xl mx-auto md:grid md:grid-cols-2 md:space-y-0 md:gap-4";

    if (state.userRewards.length === 0) { 
        els.allRewardsList.className = "flex flex-col items-center justify-center py-12 opacity-60 w-full";
        els.allRewardsList.innerHTML = `<div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4"><i data-lucide="shopping-bag" class="w-8 h-8 text-gray-400"></i></div><p class="text-sm font-medium text-gray-500 dark:text-gray-400">No orders yet.</p><button onclick="showPage('rewards')" class="mt-4 text-brand-600 font-bold text-sm hover:underline">Visit Store</button>`; 
        if(window.lucide) window.lucide.createIcons();
        return; 
    }

    state.userRewards.forEach(ur => {
        let statusBadge = '';
        let actionButton = '';
        
        if (ur.status === 'redeemed') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 uppercase tracking-wide">Redeemed</span>`;
            actionButton = `
                <div class="w-full bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 mt-3 text-center border border-gray-100 dark:border-gray-700">
                    <p class="text-xs text-gray-500 dark:text-gray-400 font-bold flex items-center justify-center gap-1">
                        <i data-lucide="check-circle" class="w-3 h-3 text-green-500"></i>
                        Redeemed on ${ur.redeemedAt || 'Date unknown'}
                    </p>
                </div>`;
        } else if (ur.status === 'confirmed') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 uppercase tracking-wide">Ready</span>`;
            actionButton = `<button onclick="openRewardQrModal('${ur.userRewardId}')" class="flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 rounded-xl shadow-lg shadow-gray-200 dark:shadow-none active:scale-95 transition-all w-full mt-3 group"><i data-lucide="qr-code" class="w-4 h-4 group-hover:scale-110 transition-transform"></i><span class="text-xs font-bold">Show QR Code</span></button>`;
        } else {
            const color = ur.status === 'pending' ? 'yellow' : 'red';
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-${color}-100 text-${color}-700 dark:bg-${color}-900/40 dark:text-${color}-400 uppercase tracking-wide">${ur.status}</span>`;
            actionButton = `<button disabled class="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 px-4 py-2.5 rounded-xl w-full mt-3 cursor-not-allowed"><span class="text-xs font-bold">Processing...</span></button>`;
        }

        els.allRewardsList.innerHTML += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group h-full flex flex-col justify-between">
                <div class="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/20 dark:to-gray-700/0 rounded-full z-0"></div>
                <div class="relative z-10 flex gap-4">
                    <div class="flex-shrink-0"><img src="${ur.productImage}" class="w-20 h-20 rounded-2xl object-cover border border-gray-100 dark:border-gray-700 shadow-sm" onerror="this.src='${getPlaceholderImage()}'"></div>
                    <div class="flex-grow min-w-0">
                        <div class="flex justify-between items-start mb-1"><p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate pr-2">${ur.storeName}</p>${statusBadge}</div>
                        <h3 class="text-sm font-black text-gray-900 dark:text-white leading-tight mb-1 line-clamp-2">${ur.productName}</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${ur.purchaseDate}</p>
                    </div>
                </div>
                <div class="relative mt-4 mb-1"><div class="absolute left-0 right-0 top-1/2 border-t border-dashed border-gray-300 dark:border-gray-600"></div><div class="absolute -left-6 top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-50 dark:bg-gray-900 rounded-full"></div><div class="absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-50 dark:bg-gray-900 rounded-full"></div></div>
                <div class="pt-1 relative z-10">${actionButton}</div>
            </div>`;
    });
    if(window.lucide) window.lucide.createIcons();
};

export const openRewardQrModal = (userRewardId) => {
    const ur = state.userRewards.find(r => r.userRewardId === userRewardId);
    if (!ur) return;
    const qrValue = `ecocampus-order:${userRewardId}-user:${state.currentUser.id}`;
    els.qrModal.innerHTML = `<div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Reward QR</h3><button onclick="closeQrModal()" class="text-gray-400"><i data-lucide="x" class="w-6 h-6"></i></button></div><p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Show this QR at <strong>${ur.storeName}</strong> to redeem <strong>${ur.productName}</strong>.</p><div class="flex justify-center mb-4"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrValue)}" class="rounded-lg border"></div><button onclick="closeQrModal()" class="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg">Close</button>`;
    els.qrModalOverlay.classList.remove('hidden');
    setTimeout(() => els.qrModal.classList.remove('translate-y-full'), 10);
    if(window.lucide) window.lucide.createIcons();
};

export const closeQrModal = () => {
    els.qrModal.classList.add('translate-y-full');
    setTimeout(() => els.qrModalOverlay.classList.add('hidden'), 300);
};

// 7. EcoPoints & Global Setup
export const renderEcoPointsPage = () => {
    const u = state.currentUser;
    if (!u) return;
    const balanceEl = document.getElementById('ecopoints-balance');
    if(balanceEl) balanceEl.textContent = u.current_points;
    const currentLvl = getUserLevel(u.lifetime_points);
    const lvlTitle = document.getElementById('ecopoints-level-title');
    const lvlNum = document.getElementById('ecopoints-level-number');
    const lvlProg = document.getElementById('ecopoints-level-progress');
    const lvlNext = document.getElementById('ecopoints-level-next');
    if (lvlTitle) {
        lvlTitle.textContent = currentLvl.title;
        lvlNum.textContent = currentLvl.level;
        lvlProg.style.width = `${currentLvl.progress}%`;
        lvlNext.textContent = currentLvl.progressText;
    }
    const levelsContainer = document.getElementById('all-levels-list');
    if (levelsContainer) {
        levelsContainer.innerHTML = state.levels.map((l, i) => {
            const isLocked = u.lifetime_points < l.minPoints;
            let colorClass = isLocked ? 'text-gray-400 dark:text-gray-600' : 'text-green-600 dark:text-green-400';
            let borderClass = isLocked ? 'border-gray-200 dark:border-gray-700' : 'border-green-500';
            let opacityClass = isLocked ? 'opacity-50' : 'opacity-100';
            const isLast = i === state.levels.length - 1;
            return `
            <div class="flex gap-4 relative ${opacityClass}">
                ${!isLast ? `<div class="absolute left-[11px] top-8 bottom-[-16px] w-0.5 bg-gray-200 dark:bg-gray-700"></div>` : ''}
                <div class="flex-shrink-0"><div class="w-6 h-6 rounded-full border-2 ${borderClass} bg-white dark:bg-gray-800 flex items-center justify-center text-xs font-bold ${colorClass} z-10 relative">${l.level}</div></div>
                <div class="pb-6"><h4 class="font-bold text-sm ${isLocked ? 'text-gray-500' : 'text-green-700 dark:text-green-300'}">${l.title}</h4><p class="text-xs font-semibold text-gray-400 mb-1">${l.minPoints} - ${l.nextMin === Infinity ? '∞' : l.nextMin} Pts</p><p class="text-xs text-gray-500 dark:text-gray-400 leading-snug">${l.desc}</p></div>
            </div>`;
        }).join('');
    }
    
    let earnCard = document.getElementById('how-to-earn-card');
    if (!earnCard) {
        const recentActivityCard = document.getElementById('ecopoints-recent-activity')?.closest('.glass-card');
        if (recentActivityCard && recentActivityCard.parentNode) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = `
                <div id="how-to-earn-card" class="glass-card p-6 rounded-2xl mb-6">
                    <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">How to Earn Points</h3>
                    <div class="space-y-4">
                        <div class="flex items-start gap-3"><i data-lucide="recycle" class="w-5 h-5 text-green-500 mt-0.5"></i><p class="text-sm text-gray-600 dark:text-gray-300">Submit plastic at collection points.</p></div>
                        <div class="flex items-start gap-3"><i data-lucide="calendar-heart" class="w-5 h-5 text-purple-500 mt-0.5"></i><p class="text-sm text-gray-600 dark:text-gray-300">Attend Green Club events and workshops.</p></div>
                        <div class="flex items-start gap-3"><i data-lucide="medal" class="w-5 h-5 text-yellow-500 mt-0.5"></i><p class="text-sm text-gray-600 dark:text-gray-300">Complete special "Eco-Challenges".</p></div>
                    </div>
                </div>`;
            recentActivityCard.parentNode.insertBefore(tempDiv.firstElementChild, recentActivityCard);
        }
    }

    const historyContainer = document.getElementById('ecopoints-recent-activity');
    if (historyContainer) {
        const recentHistory = state.history.slice(0, 5); 
        if (recentHistory.length === 0) {
            historyContainer.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">No recent activity.</p>`;
        } else {
            historyContainer.innerHTML = recentHistory.map(h => `
                <div class="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 last:border-0 pb-2 last:pb-0">
                    <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center"><i data-lucide="${h.icon}" class="w-4 h-4 text-gray-600 dark:text-gray-300"></i></div><div><p class="text-sm font-bold text-gray-800 dark:text-gray-200 line-clamp-1">${h.description}</p><p class="text-[10px] text-gray-400">${h.date}</p></div></div><span class="text-sm font-bold ${h.points >= 0 ? 'text-green-600' : 'text-red-500'}">${h.points > 0 ? '+' : ''}${h.points}</span>
                </div>`).join('');
            if (!document.getElementById('view-all-history-btn')) {
                historyContainer.innerHTML += `<div class="mt-3 text-right"><button id="view-all-history-btn" onclick="showPage('history')" class="text-xs font-bold text-green-600 hover:text-green-700">View All</button></div>`;
            }
        }
    }
    if(window.lucide) window.lucide.createIcons();
};

window.renderRewardsWrapper = renderRewards;
window.showProductDetailPage = showProductDetailPage;
window.openPurchaseModal = openPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.confirmPurchase = confirmPurchase;
window.renderMyRewardsPageWrapper = renderMyRewardsPage;
window.openRewardQrModal = openRewardQrModal;
window.closeQrModal = closeQrModal;
window.renderEcoPointsPageWrapper = renderEcoPointsPage;
window.openStorePage = openStorePage;

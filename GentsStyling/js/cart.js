/**
 * ==========================================
 * Gents Styling - Cart & Order Module
 * ==========================================
 * Handles all cart state management, persistence via localStorage,
 * order processing, and UI badge updates.
 */

const CART_KEY = 'gents_styling_cart_v1';
const ORDERS_KEY = 'gents_styling_orders_v1';

/* --------------------------------------------------
   Cart State Helpers
   -------------------------------------------------- */

function getCart() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Filter out invalid / corrupted entries
        return parsed.filter(item => item && item.id && typeof item.quantity === 'number' && item.quantity > 0);
    } catch (e) {
        console.error('[Cart] Parsing error:', e);
        return [];
    }
}

function saveCart(cart) {
    if (!Array.isArray(cart)) return;
    const cleaned = cart.filter(item => item && item.quantity > 0);
    localStorage.setItem(CART_KEY, JSON.stringify(cleaned));
    updateCartBadges();
}

function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateCartBadges();
}

function generateCartId(name, size) {
    // Simple deterministic ID based on name + size
    const str = (name || '').trim().toLowerCase() + '|' + (size || 'M');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return 'cart_' + Math.abs(hash).toString(36);
}

/* --------------------------------------------------
   Cart Operations
   -------------------------------------------------- */

/**
 * Add a product to the cart.
 * @param {Object} product - { name, price, image, quantity=1, size='M', maxStock=99 }
 * @returns {boolean} success
 */
function addToCart(product) {
    if (!product || !product.name || isNaN(parseFloat(product.price))) {
        console.warn('[Cart] Invalid product data', product);
        return false;
    }

    const size = (product.size || 'M').toString().toUpperCase();
    const id = generateCartId(product.name, size);
    const price = parseFloat(product.price);
    const maxStock = parseInt(product.maxStock) || 99;
    const qty = parseInt(product.quantity) || 1;

    if (qty <= 0) {
        showToast('Quantity must be at least 1', 'error');
        return false;
    }
    if (qty > maxStock) {
        showToast(`Only ${maxStock} item(s) available in stock.`, 'error');
        return false;
    }

    const cart = getCart();
    const existing = cart.find(item => item.id === id);

    if (existing) {
        const potentialQty = existing.quantity + qty;
        if (potentialQty > maxStock) {
            const canAdd = maxStock - existing.quantity;
            if (canAdd <= 0) {
                showToast('Maximum stock reached for this item.', 'error');
                return false;
            }
            existing.quantity = maxStock;
            showToast(`Only ${maxStock} allowed. Quantity set to max.`, 'info');
        } else {
            existing.quantity = potentialQty;
            showToast(`${product.name} (${size}) quantity updated in cart`, 'success');
        }
    } else {
        cart.push({
            id,
            name: product.name,
            price,
            image: product.image || './men fashion.jpg',
            quantity: qty,
            size,
            maxStock,
            addedAt: Date.now()
        });
        showToast(`${product.name} (${size}) added to cart`, 'success');
    }

    saveCart(cart);
    return true;
}

/**
 * Remove an item from the cart by ID.
 */
function removeFromCart(id) {
    const cart = getCart().filter(item => item.id !== id);
    saveCart(cart);
    renderCartItemsIfOnPage();
}

/**
 * Update quantity of a cart item.
 * @param {string} id
 * @param {number} newQty
 */
function updateQuantity(id, newQty) {
    const qty = parseInt(newQty);
    if (isNaN(qty)) return;

    const cart = getCart();
    const item = cart.find(i => i.id === id);
    if (!item) return;

    if (qty <= 0) {
        removeFromCart(id);
        return;
    }

    if (qty > item.maxStock) {
        showToast(`Only ${item.maxStock} in stock.`, 'error');
        item.quantity = item.maxStock;
    } else {
        item.quantity = qty;
    }

    saveCart(cart);
    renderCartItemsIfOnPage();
}

/* --------------------------------------------------
   Cart Calculations
   -------------------------------------------------- */

function getCartItems() {
    return getCart();
}

function getCartCount() {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function getCartSubtotal() {
    return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function getEstimatedShipping() {
    const subtotal = getCartSubtotal();
    return subtotal >= 200 ? 0 : 15; // Free shipping over $200
}

function getEstimatedTax() {
    // 8% tax rate
    return parseFloat((getCartSubtotal() * 0.08).toFixed(2));
}

function getCartTotal() {
    return parseFloat((getCartSubtotal() + getEstimatedShipping() + getEstimatedTax()).toFixed(2));
}

/* --------------------------------------------------
   UI Helpers
   -------------------------------------------------- */

/**
 * Update all cart badge elements on the current page.
 */
function updateCartBadges() {
    const count = getCartCount();
    document.querySelectorAll('.cart-badge').forEach(el => {
        el.textContent = count;
        el.style.display = count > 0 ? 'flex' : 'none';
        // Pulse animation when cart changes
        el.classList.remove('animate-ping');
        void el.offsetWidth; // reflow
        el.classList.add('animate-ping');
        setTimeout(() => el.classList.remove('animate-ping'), 400);
    });
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(message, type = 'success') {
    let toast = document.getElementById('cart-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast';
        toast.className = 'fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 flex items-center gap-3 z-50 font-medium';
        document.body.appendChild(toast);
    }

    const colors = {
        success: 'bg-gray-900 dark:bg-white text-white dark:text-black',
        error: 'bg-red-600 text-white',
        info: 'bg-blue-600 text-white'
    };
    const icons = {
        success: 'check_circle',
        error: 'error',
        info: 'info'
    };

    toast.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 flex items-center gap-3 z-50 font-medium ${colors[type] || colors.success}`;
    toast.innerHTML = `<span class="material-icons">${icons[type]}</span> <span>${message}</span>`;

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-20', 'opacity-0');
    });

    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

/* --------------------------------------------------
   Order Persistence (Mock Backend)
   -------------------------------------------------- */

function generateOrderId() {
    return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

function getOrders() {
    try {
        const raw = localStorage.getItem(ORDERS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveOrder(order) {
    const orders = getOrders();
    orders.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

/* --------------------------------------------------
   Rendering Hook for cart.html
   -------------------------------------------------- */

function renderCartItemsIfOnPage() {
    if (typeof window.renderCartPage === 'function') {
        window.renderCartPage();
    }
    if (typeof window.renderCheckoutSummary === 'function') {
        window.renderCheckoutSummary();
    }
}

/* --------------------------------------------------
   Initialization
   -------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
    updateCartBadges();
});

// Expose globally for inline onclick handlers
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.clearCart = clearCart;
window.getCart = getCart;
window.getCartCount = getCartCount;
window.getCartSubtotal = getCartSubtotal;
window.getCartTotal = getCartTotal;
window.getEstimatedShipping = getEstimatedShipping;
window.getEstimatedTax = getEstimatedTax;
window.showToast = showToast;
window.saveOrder = saveOrder;
window.getOrders = getOrders;
window.generateOrderId = generateOrderId;

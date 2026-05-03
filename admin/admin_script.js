// === CONFIGURATION ===
const API_URL = "https://script.google.com/macros/s/AKfycbwDjMUFBjVBfoJ_C7nLMtU0A7R55W-3S8hDQGcq3klgKKKom6wAS0uyNHqi5DSs5Mo/exec"; // Yahan par apna exact Web App URL daalein.
const ARABIC_PHRASES = ["سُبْحَانَ اللَّهِ", "الْحَمْدُ لِلَّهِ", "اللَّهُ أَكْبَرُ", "لَا إِلَٰهَ إِلَّا اللَّهُ", "مَا شَاءَ اللَّهُ", "بَارَكَ اللَّهُ فِيكَ"];

// Global state variables
let confirmCallback = null;
window.ebooksData = [];
window.usersData = [];
window.paymentsData = [];
let apiLocks = {};

// === ON LOAD INITIALIZATION ===
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');

    if (isAdminLoggedIn()) {
        if (loginView) loginView.classList.add('hidden');
        if (appView) appView.classList.remove('hidden');
    } else {
        // If not logged in and not on a page with a login view, redirect to index.
        if (!loginView) {
            window.location.href = 'index.html';
        } else {
            showLogin();
        }
    }
});

// === AUTHENTICATION & SESSION ===
function isAdminLoggedIn() {
    return localStorage.getItem("admin_logged_in") === "true";
}

async function handleAdminLogin() {
    const loginBtn = document.getElementById('login-btn');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    loginBtn.disabled = true;

    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    // Call API in background mode (last parameter is true)
    const res = await apiCall(`adminLogin&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`, "GET", null, true);
    
    if (res && res.success) {
        localStorage.setItem("admin_logged_in", "true");
        showToast("Login Successful!");
        window.location.reload();
    } else {
        showToast(res ? res.message || "Invalid credentials!" : "Invalid credentials!", "error");
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

function logout() {
    closeProfileDrawer(); 
    showConfirm("Logout", "Are you sure you want to log out?", () => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
}

function showLogin() {
    const loginView = document.getElementById("login-view");
    const appView = document.getElementById("app-view");
    if(loginView) loginView.classList.remove('hidden');
    if(appView) appView.classList.add('hidden');
}

// === UI & THEME UTILITIES ===
function initTheme() {
    const savedTheme = localStorage.getItem('admin_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = document.getElementById("theme-toggle-icon");
    if(icon) icon.className = savedTheme === "light" ? "fas fa-sun" : "fas fa-moon";
}
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("admin_theme", newTheme);
    initTheme();
}
function showLoader() { document.getElementById("loader")?.classList.remove("hidden"); }
function hideLoader() { document.getElementById("loader")?.classList.add("hidden"); }

function showToast(msg, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    let icon = '';
    if (type === "success") icon = '<span style="font-size:1.1rem; color:var(--success)">✓</span>';
    else if (type === "error") icon = '<span style="font-size:1.1rem; color:var(--danger)">✕</span>';
    else if (type === "info") icon = '<i class="fas fa-sync-alt spin-icon" style="font-size:1rem; color:var(--accent2)"></i>';
    toast.innerHTML = `${icon} <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { 
        toast.style.transform = "translateX(110%)"; toast.style.opacity = "0"; 
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
}

// === MODALS & DRAWERS (PROFILE SIDEBAR) ===
function showConfirm(title, message, onConfirm) {
    const confirmOverlay = document.getElementById("confirm-overlay");
    if (!confirmOverlay) return;
    confirmOverlay.querySelector("#confirm-title").innerText = title;
    confirmOverlay.querySelector("#confirm-msg").innerText = message;
    confirmOverlay.classList.remove("hidden");
    confirmCallback = onConfirm;
}
function closeConfirm() {
    document.getElementById("confirm-overlay")?.classList.add("hidden");
    confirmCallback = null;
}
document.getElementById("confirm-yes-btn")?.addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
});

function openProfileDrawer() {
    document.getElementById("drawer-overlay")?.classList.add("active");
    document.getElementById("profile-drawer")?.classList.add("active");
    document.body.style.overflow = 'hidden';
}
function closeProfileDrawer() {
    document.getElementById("drawer-overlay")?.classList.remove("active");
    document.getElementById("profile-drawer")?.classList.remove("active");
    document.body.style.overflow = '';
}

function openChangePassword() {
    closeProfileDrawer();
    document.getElementById('change-password-modal')?.classList.remove('hidden');
}
function closeChangePasswordModal() {
    document.getElementById('change-password-modal')?.classList.add('hidden');
    document.getElementById('changePasswordForm')?.reset();
}

// Naya aur Sahi Code:
function handleChangePassword() {
    const newPassword = document.getElementById('new_admin_password').value;
    if (newPassword && newPassword.length >= 6) {
        closeChangePasswordModal();
        showToast("Changing password...", "info");
        
        // Fake failure wala setTimeout hata diya hai
        
        // Aasal API call ko uncomment kar diya hai
        apiCall("changeAdminPassword", "POST", { newPassword: newPassword }, true).then(res => {
            if(res && res.success) { 
                showToast("Password Changed Successfully!", "success"); 
            } else { 
                showToast("Failed to change password.", "error"); 
            }
        });
        
    } else {
        showToast("Password must be at least 6 characters.", "error");
    }
}


// === CORE API & DATA FETCHING LOGIC (SWR) ===
async function apiCall(action, method = "GET", body = null, isBackground = false) {
    try {
        if (!isBackground) showLoader();
        const url = `${API_URL}?action=${action}`;
        const options = { method };
        if (method === "POST" && body) options.body = JSON.stringify(body);
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (!isBackground) hideLoader();
        return data;
    } catch (error) {
        if (!isBackground) hideLoader();
        if (!isBackground) showToast("Network Error or API failure.", "error");
        console.error("API Call failed:", error);
        return null;
    }
}

function fetchSWR(action, cacheKey, onDataChange, force = false, showBlockingLoader = true) {
    return new Promise(async (resolve) => {
        const now = new Date().getTime();
        const cachedDataStr = localStorage.getItem(cacheKey + "_data");
        const cachedTime = localStorage.getItem(cacheKey + "_time");
        let hasCache = false;

        if (cachedDataStr) {
            hasCache = true;
            try { onDataChange(JSON.parse(cachedDataStr)); } catch (e) { hasCache = false; }
        }

        if (cachedTime && (now - parseInt(cachedTime) < 30000) && !force) {
            if(hasCache && showBlockingLoader) hideLoader();
            resolve();
            return;
        }
        
        if (!hasCache && showBlockingLoader) showLoader(); 

        if (apiLocks[cacheKey]) { resolve(); return; }
        apiLocks[cacheKey] = true;

        const freshData = await apiCall(action, "GET", null, true);
        if (freshData) {
            const freshDataStr = JSON.stringify(freshData);
            if (cachedDataStr !== freshDataStr) {
                localStorage.setItem(cacheKey + "_data", freshDataStr);
                localStorage.setItem(cacheKey + "_time", now.toString());
                onDataChange(freshData);
            }
        } else if (!hasCache) {
             onDataChange(null);
        }
        if (!hasCache && showBlockingLoader) hideLoader();
        delete apiLocks[cacheKey];
        resolve();
    });
}

// === SPECIFIC DATA FETCHERS ===
function fetchEbooks(force = false) { return fetchSWR("getEbooks", "admin_cache_ebooks", (data) => { window.ebooksData = data; if (typeof renderEbooks === "function") renderEbooks(data); }, force, false); }
function fetchUsers(force = false) { return fetchSWR("getUsers", "admin_cache_users", (data) => { window.usersData = data; if (typeof renderUsers === "function") renderUsers(data); }, force, false); }
function fetchPayments(force = false) { return fetchSWR("getPayments", "admin_cache_payments", (data) => { window.paymentsData = data; if (typeof renderPayments === "function") renderPayments(data); }, force, false); }
function forceFetchEbooks() { fetchEbooks(true).then(() => showToast("Ebooks synced!", "success")); }
function forceFetchUsers() { fetchUsers(true).then(() => showToast("Users synced!", "success")); }
function forceFetchPayments() { fetchPayments(true).then(() => showToast("Payments synced!", "success")); }

// === FORM HANDLING ===
function togglePriceFields() {
    const isFreeCheckbox = document.getElementById("eb_isfree");
    if (!isFreeCheckbox) return;
    const isFree = isFreeCheckbox.checked;
    const priceDiv = document.getElementById("price-fields");
    if(priceDiv){
        priceDiv.style.display = isFree ? "none" : "block";
        document.getElementById("eb_price").required = !isFree;
    }
}

function handleEbookSubmit() {
    const isFree = document.getElementById("eb_isfree").checked;
    const payload = {
        title: document.getElementById("eb_title").value,
        description: document.getElementById("eb_desc").value,
        pdf_link: document.getElementById("eb_pdf").value,
        thumbnail: document.getElementById("eb_thumb").value,
        is_free: isFree,
        price: isFree ? 0 : parseFloat(document.getElementById("eb_price").value || 0),
        discount_price: isFree ? 0 : parseFloat(document.getElementById("eb_discount").value || 0)
    };
    const id = document.getElementById("ebook_id").value;
    const action = id ? `updateEbook&id=${id}` : "addEbook";

    showToast(id ? "Updating Ebook..." : "Adding Ebook...", "info");
    
    apiCall(action, "POST", payload, true).then(res => {
        if (res && res.success) {
            showToast(id ? "Ebook Updated!" : "Ebook Added!", "success");
            sessionStorage.removeItem('edit_ebook_id');
            localStorage.removeItem("admin_cache_ebooks_time"); // Invalidate cache
            window.location.href = 'books.html';
        } else { 
            showToast("Operation failed on server.", "error"); 
        }
    });
}

// Naya aur Sahi Code:
function handlePaymentStatus(paymentId, status) {
    showConfirm(`Update Payment`, `Are you sure you want to mark this transaction as ${status.toUpperCase()}?`, () => {
        showToast(`Marking as ${status}...`, "info");
        
        // API call ko uncomment kar dein aur response ko handle karein
        apiCall("updatePaymentStatus", "POST", { payment_id: paymentId, status: status }, true).then(res => {
            if (res && res.success) {
                showToast(`Payment marked as ${status}!`, "success");
                
                // Server se success aane ke baad UI update karein
                const payment = window.paymentsData.find(p => String(p.id) === String(paymentId));
                if (payment) {
                    payment.status = status;
                    renderPayments(window.paymentsData);
                }
            } else {
                showToast("Update failed on server.", "error");
            }
        });
    });
}
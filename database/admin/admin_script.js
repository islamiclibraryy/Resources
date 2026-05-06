import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc, addDoc, getCountFromServer, query, orderBy } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🛑 1. FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyBhYLRH_0p7f4oRIZTDVf8bOb1bdRKPNe8",
    authDomain: "islamic-library-3b1d4.firebaseapp.com",
    projectId: "islamic-library-3b1d4",
    storageBucket: "islamic-library-3b1d4.firebasestorage.app",
    messagingSenderId: "139007174646",
    appId: "1:139007174646:web:0139e6d5c6bf38c7e409d7"
  };

const AUTHORIZED_ADMIN_EMAIL = "admin@islamiclibrary.com"; 

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global Variables
window.ebooksData = [];
window.usersData = [];
window.paymentsData = [];
let confirmCallback = null;

// ==========================================
// 🔥 INSTANT CACHE & ROUTING (SMART SWR)
// ==========================================
const isAdminLocally = localStorage.getItem("islamic_admin_auth") === "true";
const appView = document.getElementById('app-view');
const loginView = document.getElementById('login-view');

if (isAdminLocally && appView) {
    appView.classList.remove('hidden');
    if (loginView) loginView.classList.add('hidden');
    
    // URL check karke turant cache load karo, agar cache nahi hai toh Skeleton dikhao
    const path = window.location.pathname;
    if (path.includes('/books/')) {
        const cache = localStorage.getItem("admin_cache_ebooks");
        if (cache && typeof window.renderEbooks === "function") window.renderEbooks(JSON.parse(cache));
        else if (typeof window.renderEbooksSkeletons === "function") window.renderEbooksSkeletons();
    } else if (path.includes('/users/')) {
        const cache = localStorage.getItem("admin_cache_users");
        if (cache && typeof window.renderUsers === "function") window.renderUsers(JSON.parse(cache));
        else if (typeof window.renderUsersSkeletons === "function") window.renderUsersSkeletons();
    } else if (path.includes('/payments/')) {
        const cache = localStorage.getItem("admin_cache_payments");
        if (cache && typeof window.renderPayments === "function") window.renderPayments(JSON.parse(cache));
        else if (typeof window.renderPaymentsSkeletons === "function") window.renderPaymentsSkeletons();
    } else {
        const cache = localStorage.getItem("admin_stats_cache");
        if (cache) {
            try {
                const stats = JSON.parse(cache);
                updateStatUI('stats-ebooks-count', stats.ebooks);
                updateStatUI('stats-users-count', stats.users);
                updateStatUI('stats-purchases-count', stats.payments);
            } catch(e) {}
        }
    }
} else if (!isAdminLocally && loginView) {
    loginView.classList.remove('hidden');
    if (appView) appView.classList.add('hidden');
}

// ==========================================
// 🛡️ AUTHENTICATION & SECURITY
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user && user.email === AUTHORIZED_ADMIN_EMAIL) {
        localStorage.setItem("islamic_admin_auth", "true");
        if (loginView) loginView.classList.add('hidden');
        if (appView) appView.classList.remove('hidden');
        
        // Background mein fresh data fetch karo
        const path = window.location.pathname;
        if (path.endsWith('/admin/') || path.endsWith('/index.html') && !path.includes('/books/') && !path.includes('/users/') && !path.includes('/payments/') && !path.includes('/new-ebook/')) {
            fetchDashboardStatsBackground();
        } else if (path.includes('/books/')) {
            window.loadBooks();
        } else if (path.includes('/users/')) {
            window.loadUsers();
        } else if (path.includes('/payments/')) {
            window.loadPayments();
        }
    } else {
        localStorage.removeItem("islamic_admin_auth");
        if (loginView) {
            loginView.classList.remove('hidden');
            if (appView) appView.classList.add('hidden');
        } else {
            const isSubPage = window.location.pathname.includes('/books/') || window.location.pathname.includes('/users/') || window.location.pathname.includes('/payments/') || window.location.pathname.includes('/new-ebook/');
            if (isSubPage) window.location.href = '../';
        }
    }
});

// ==========================================
// 📊 DASHBOARD STATS LOGIC
// ==========================================
async function fetchDashboardStatsBackground() {
    try {
        const ebookCount = await getCountFromServer(collection(db, "ebooks"));
        const userCount = await getCountFromServer(collection(db, "users"));
        const payCount = await getCountFromServer(collection(db, "payments"));
        
        const freshStats = { ebooks: ebookCount.data().count, users: userCount.data().count, payments: payCount.data().count };
        const cachedStr = localStorage.getItem("admin_stats_cache");
        
        // Agar change hua hai tabhi UI update karo
        if (cachedStr !== JSON.stringify(freshStats)) {
            localStorage.setItem("admin_stats_cache", JSON.stringify(freshStats));
            updateStatUI('stats-ebooks-count', freshStats.ebooks);
            updateStatUI('stats-users-count', freshStats.users);
            updateStatUI('stats-purchases-count', freshStats.payments);
        } else {
            // Skeleton hatane ke liye (Agar direct aaya ho toh)
            updateStatUI('stats-ebooks-count', freshStats.ebooks);
            updateStatUI('stats-users-count', freshStats.users);
            updateStatUI('stats-purchases-count', freshStats.payments);
        }
    } catch (e) { console.error(e); }
}

function updateStatUI(id, val) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('skeleton'); el.innerText = val; }
}

// ==========================================
// 📚 BOOKS MANAGEMENT LOGIC
// ==========================================
window.loadBooks = async function() {
    const cacheKey = "admin_cache_ebooks";
    const cachedStr = localStorage.getItem(cacheKey);
    try {
        const snapshot = await getDocs(collection(db, "ebooks"));
        const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Data Compare Karo - Agar alag hai tabhi Refresh Karo
        if (cachedStr !== JSON.stringify(freshData)) {
            window.ebooksData = freshData;
            localStorage.setItem(cacheKey, JSON.stringify(freshData));
            if (typeof window.renderEbooks === "function") window.renderEbooks(freshData);
        }
    } catch (e) { console.error(e); }
};

window.forceFetchEbooks = async function() {
    const btn = document.getElementById('refresh-ebooks-btn');
    if(btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    
    await window.loadBooks();
    
    if(btn) btn.innerHTML = `<i class="fas fa-sync-alt"></i>`;
    window.showToast("Ebooks Verified & Refreshed!", "success");
};

window.deleteEbook = function(id) {
    window.showConfirm("Delete Ebook", "Are you sure you want to permanently delete this ebook?", async () => {
        window.showToast("Deleting ebook...", "info");
        const card = document.querySelector(`[onclick="window.deleteEbook('${id}')"]`)?.closest('.card');
        try {
            await deleteDoc(doc(db, "ebooks", id));
            window.showToast("Ebook deleted!", "success");
            if (card) { card.style.opacity = '0'; setTimeout(() => card.remove(), 300); }
            window.ebooksData = window.ebooksData.filter(eb => eb.id !== id);
            localStorage.setItem("admin_cache_ebooks", JSON.stringify(window.ebooksData));
        } catch (e) { window.showToast("Delete failed on server.", "error"); }
    });
};

window.handleEbookSubmit = async () => {
    const submitBtn = document.getElementById('submit-ebook-btn');
    if (!submitBtn) return;
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

    const ebookId = document.getElementById("ebook_id").value;
    const isFree = document.getElementById("eb_isfree").checked;

    const payload = {
        title: document.getElementById("eb_title").value,
        description: document.getElementById("eb_desc").value,
        pdf_link: document.getElementById("eb_pdf").value,
        thumbnail: document.getElementById("eb_thumb").value,
        price: isFree ? 0 : Number(document.getElementById("eb_price").value),
        discount_price: isFree ? 0 : Number(document.getElementById("eb_discount").value),
        is_free: isFree,
        language: document.getElementById("eb_language").value,
        createdAt: new Date().toISOString()
    };

    try {
        if (ebookId) { 
            await updateDoc(doc(db, "ebooks", ebookId), payload); 
            window.showToast("Ebook Updated!"); 
        } else { 
            await addDoc(collection(db, "ebooks"), payload); 
            window.showToast("Ebook Added!"); 
        }
        localStorage.removeItem("admin_cache_ebooks");
        setTimeout(() => { sessionStorage.removeItem('edit_ebook_id'); window.location.href = '../books/'; }, 1000);
    } catch (e) {
        window.showToast("Error saving data", "error");
        submitBtn.disabled = false; submitBtn.innerHTML = originalText;
    }
};

// ==========================================
// 👥 USERS MANAGEMENT LOGIC
// ==========================================
window.loadUsers = async function() {
    const cacheKey = "admin_cache_users";
    const cachedStr = localStorage.getItem(cacheKey);
    try {
        const snapshot = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
        const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (cachedStr !== JSON.stringify(freshData)) {
            window.usersData = freshData;
            localStorage.setItem(cacheKey, JSON.stringify(freshData));
            if (typeof window.renderUsers === "function") window.renderUsers(freshData);
        }
    } catch (e) { console.error(e); }
};

window.forceFetchUsers = async function() {
    const btn = document.getElementById('refresh-users-btn');
    if(btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    
    await window.loadUsers();
    
    if(btn) btn.innerHTML = `<i class="fas fa-sync-alt"></i>`;
    window.showToast("Users Verified & Refreshed!", "success");
};

window.handleUserUpdate = async function() {
    const btn = document.getElementById("update-user-btn");
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Updating...`;
    
    const userId = document.getElementById('edit_user_id').value;
    const newName = document.getElementById('edit_user_name').value;
    try {
        await updateDoc(doc(db, "users", userId), { name: newName });
        window.showToast("User updated!", "success");
        if(typeof window.closeEditUserModal === "function") window.closeEditUserModal();
        localStorage.removeItem("admin_cache_users");
        window.loadUsers();
    } catch (e) { window.showToast("Update failed.", "error"); } 
    finally { btn.disabled = false; btn.innerHTML = orig; }
};

// ==========================================
// 💳 PAYMENTS MANAGEMENT LOGIC
// ==========================================
window.loadPayments = async function() {
    const cacheKey = "admin_cache_payments";
    const cachedStr = localStorage.getItem(cacheKey);
    try {
        const snapshot = await getDocs(query(collection(db, "payments"), orderBy("createdAt", "desc")));
        const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (cachedStr !== JSON.stringify(freshData)) {
            window.paymentsData = freshData;
            localStorage.setItem(cacheKey, JSON.stringify(freshData));
            if (typeof window.renderPayments === "function") window.renderPayments(freshData);
        }
    } catch (e) { console.error(e); }
};

window.forceFetchPayments = async function() {
    const btn = document.getElementById('refresh-payments-btn');
    if(btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    
    await window.loadPayments();
    
    if(btn) btn.innerHTML = `<i class="fas fa-sync-alt"></i>`;
    window.showToast("Payments Verified & Refreshed!", "success");
};

window.handlePaymentStatus = async function(paymentId, status) {
    window.showConfirm("Update Payment", `Mark this transaction as ${status.toUpperCase()}?`, async () => {
        try {
            await updateDoc(doc(db, "payments", paymentId), { status: status });
            window.showToast(`Payment marked as ${status}!`);
            localStorage.removeItem("admin_cache_payments");
            window.loadPayments();
        } catch (e) { window.showToast("Update failed", "error"); }
    });
};

// ==========================================
// 🛠️ UI UTILITIES & ACTIONS
// ==========================================
window.handleAdminLogin = async () => {
    const btn = document.getElementById('login-btn');
    const origText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    btn.disabled = true;
    
    const email = document.getElementById("admin_email").value.trim();
    const pass = document.getElementById("admin_password").value;
    
    if (email !== AUTHORIZED_ADMIN_EMAIL) { 
        window.showToast("Invalid Admin Access!", "error"); 
        btn.innerHTML = origText; btn.disabled = false; return; 
    }
    try { 
        await signInWithEmailAndPassword(auth, email, pass); 
        window.showToast("Login Successful!"); 
    } catch (e) { 
        window.showToast("Wrong Credentials!", "error"); 
        btn.innerHTML = origText; btn.disabled = false; 
    }
};

window.logout = () => {
    window.closeProfileDrawer();
    window.showConfirm("Logout", "Are you sure you want to log out?", () => {
        signOut(auth).then(() => {
            localStorage.removeItem("islamic_admin_auth");
            localStorage.removeItem("admin_stats_cache");
            window.location.href = './';
        });
    });
};

window.showToast = (msg, type = "success") => {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span style="color:var(--${type === "success" ? 'success' : 'danger'})">${type === 'success' ? '✓' : '✕'}</span> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.transform = "translateX(110%)"; toast.style.opacity = "0"; setTimeout(() => toast.remove(), 400); }, 3000);
};

window.showConfirm = (title, message, onConfirm) => {
    const overlay = document.getElementById("confirm-overlay");
    if (!overlay) return;
    overlay.querySelector("#confirm-title").innerText = title;
    overlay.querySelector("#confirm-msg").innerText = message;
    overlay.classList.remove("hidden");
    confirmCallback = onConfirm;
};

window.closeConfirm = () => document.getElementById("confirm-overlay")?.classList.add("hidden");
document.getElementById("confirm-yes-btn")?.addEventListener("click", () => { if (confirmCallback) confirmCallback(); window.closeConfirm(); });

window.openProfileDrawer = () => { document.getElementById("drawer-overlay")?.classList.add("active"); document.getElementById("profile-drawer")?.classList.add("active"); };
window.closeProfileDrawer = () => { document.getElementById("drawer-overlay")?.classList.remove("active"); document.getElementById("profile-drawer")?.classList.remove("active"); };

window.openChangePassword = () => { window.closeProfileDrawer(); document.getElementById('change-password-modal')?.classList.remove('hidden'); };
window.closeChangePasswordModal = () => { document.getElementById('change-password-modal')?.classList.add('hidden'); };

window.handleChangePassword = async () => {
    const newPass = document.getElementById('new_admin_password').value;
    if (newPass && newPass.length >= 6) {
        try { 
            await updatePassword(auth.currentUser, newPass); 
            window.showToast("Password Updated!"); 
            window.closeChangePasswordModal(); 
        } catch (e) { window.showToast("Error: Re-login required.", "error"); }
    }
};

window.toggleTheme = () => {
    const newTheme = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem('admin_theme', newTheme);
};

window.initTheme = () => {
    const saved = localStorage.getItem('admin_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
};

window.initTheme();

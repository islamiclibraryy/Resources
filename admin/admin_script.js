import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, doc, updateDoc, deleteDoc, addDoc, getCountFromServer, query, where, orderBy, increment, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🛑 1. FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyBhYLRH_0p7f4oRIZTDVf8bOb1bdRKPNe8",
    authDomain: "islamic-library-3b1d4.firebaseapp.com",
    projectId: "islamic-library-3b1d4",
    storageBucket: "islamic-library-3b1d4.firebasestorage.app",
    messagingSenderId: "139007174646",
    appId: "1:139007174646:web:0139e6d5c6bf38c7e409d7"
  };


// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// 🔥 MODERN CACHE SETUP (ADMIN PANEL)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});


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
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const { doc, getDoc, getFirestore } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
            const dbInstance = getFirestore();
            const adminDoc = await getDoc(doc(dbInstance, "users", user.uid));
            
            if (adminDoc.exists() && adminDoc.data().role === 'admin') {
                localStorage.setItem("islamic_admin_auth", "true");
                
                // Safe Email Saving
                if (user.email) {
                    localStorage.setItem("islamic_admin_email", user.email);
                }

                // Safe Name Saving
                const databaseName = adminDoc.data().name || "Admin";
                localStorage.setItem("islamic_admin_name", databaseName);
                
                if (loginView) loginView.classList.add('hidden');
                if (appView) appView.classList.remove('hidden');
                
                const path = window.location.pathname;
                if (path.includes('/books/')) window.loadBooks();
                else if (path.includes('/users/')) window.loadUsers();
                else if (path.includes('/payments/')) window.loadPayments();
                else fetchDashboardStatsBackground();
            } else {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js");
                await signOut(auth);
            }
        } catch (e) {
            console.error("Auth Error:", e);
        }
    } else {
        // Safai abhiyaan: Sab kuch remove karo
        localStorage.removeItem("islamic_admin_auth");
        localStorage.removeItem("islamic_admin_name");
        localStorage.removeItem("islamic_admin_email"); 
        
        if (loginView) {
            loginView.classList.remove('hidden');
            if (appView) appView.classList.add('hidden');
        } else {
            window.location.href = '/admin/';
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
        
        if (cachedStr !== JSON.stringify(freshStats)) {
            localStorage.setItem("admin_stats_cache", JSON.stringify(freshStats));
            updateStatUI('stats-ebooks-count', freshStats.ebooks);
            updateStatUI('stats-users-count', freshStats.users);
            updateStatUI('stats-purchases-count', freshStats.payments);
        } else {
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
    
    // 🔥 BUG FIX: Fetch hone se pehle ensure karo ki skeleton chal raha hai agar cache nahi hai
    if (!cachedStr && typeof window.renderEbooksSkeletons === "function") {
        window.renderEbooksSkeletons();
    }

    try {
        const snapshot = await getDocs(collection(db, "ebooks"));
        const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

// 🔥 YEH NAYI LINE ADD KARNI HAI 🔥
        freshData.sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));
        
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

// =========================================================
// 🔥 THE CASCADING SHIFT LOGIC (DELETE) 🔥
// =========================================================
window.deleteEbook = function(id) {
    window.showConfirm("Delete Ebook", "Are you sure you want to permanently delete this ebook?", async () => {
        window.showToast("Deleting & Re-arranging...", "info");
        const card = document.querySelector(`[onclick="window.deleteEbook('${id}')"]`)?.closest('.card');
        
        try {
            const { getFirestore, doc, getDoc, getDocs, query, collection, where, updateDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
            const db = getFirestore();

            // 1. Pata lagao jo delete ho rahi hai uska number kya tha?
            const docToDelete = await getDoc(doc(db, "ebooks", id));
            let deletedOrder = 0;
            if (docToDelete.exists()) {
                deletedOrder = Number(docToDelete.data().sort_order);
            }

            // 2. Asli delete maaro (Public Collection se)
            await deleteDoc(doc(db, "ebooks", id));
            
            // 🔥 NAYA UPDATE: Secure Vault se bhi delete maaro (Chahe bhara ho, khali ho, ya na ho)
            // Note: Agar document exist nahi karta, toh Firebase is command ka 0 token charge karta hai!
            try { 
                await deleteDoc(doc(db, "secure_links", id)); 
            } catch (e) { 
                console.log("Vault cleanup skipped/error:", e); 
            }

            // Search Index Update
            if (window.updateSearchIndex) await window.updateSearchIndex(id, null, 'delete');

            // 3. 🔥 SHIFT LOGIC: Jo kitabein iske baad aati hain, sabka number -1 kar do
            if (deletedOrder > 0) {
                const qShift = query(collection(db, "ebooks"), where("sort_order", ">", deletedOrder));
                const shiftSnap = await getDocs(qShift);
                
                for (const shiftDoc of shiftSnap.docs) {
                    const newOrder = Number(shiftDoc.data().sort_order) - 1;
                    // Database me update
                    await updateDoc(doc(db, "ebooks", shiftDoc.id), { sort_order: newOrder });
                    // Search Index me update
                    if (window.updateSearchIndex) {
                        await window.updateSearchIndex(shiftDoc.id, { ...shiftDoc.data(), sort_order: newOrder }, true);
                    }
                }
            }

            window.showToast("Ebook Deleted & List Re-arranged!", "success");
            if (card) { card.style.opacity = '0'; setTimeout(() => card.remove(), 300); }
            
            // Local Cache saaf karo
            window.ebooksData = window.ebooksData.filter(eb => eb.id !== id);
            localStorage.setItem("admin_cache_ebooks", JSON.stringify(window.ebooksData));

        } catch (e) { 
            console.error("Delete error:", e);
            window.showToast("Delete failed on server.", "error"); 
        }
    });
};

// =========================================================================
// 🔒 HYBRID SECURITY: FREE BOOKS PUBLIC, PAID BOOKS IN SECURE VAULT 🔒
// =========================================================================
window.handleEbookSubmit = async () => {
    const submitBtn = document.getElementById('submit-ebook-btn');
    if (!submitBtn) return;
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving & Securing...`;

    const ebookId = document.getElementById("ebook_id").value;
    const isFree = document.getElementById("eb_isfree").checked;
    const rawPdfUrl = document.getElementById("eb_pdf").value.trim(); 

    try {
        const { getFirestore, collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, setDoc, deleteField } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
        const db = getFirestore();

        // 1. Position Swap Logic
        let currentOrder;
        if (ebookId) {
            const currentDoc = await getDoc(doc(db, "ebooks", ebookId));
            currentOrder = currentDoc.exists() ? Number(currentDoc.data().sort_order) : 999;
        } else {
            const qMax = query(collection(db, "ebooks"), orderBy("sort_order", "desc"), limit(1));
            const maxSnap = await getDocs(qMax);
            currentOrder = maxSnap.empty ? 1 : Number(maxSnap.docs[0].data().sort_order) + 1;
        }

        const requestedInput = document.getElementById("eb_sort_order").value;
        const requestedOrder = requestedInput ? Number(requestedInput) : currentOrder;

        if (requestedOrder !== currentOrder) {
            const qConflict = query(collection(db, "ebooks"), where("sort_order", "==", requestedOrder));
            const conflictSnap = await getDocs(qConflict);
            if (!conflictSnap.empty) {
                const conflictingBook = conflictSnap.docs[0];
                if (conflictingBook.id !== ebookId) {
                    await updateDoc(doc(db, "ebooks", conflictingBook.id), { sort_order: currentOrder });
                    if (window.updateSearchIndex) {
                        const conflictData = conflictingBook.data();
                        delete conflictData.pdf_link; 
                        await window.updateSearchIndex(conflictingBook.id, { ...conflictData, sort_order: currentOrder }, true);
                    }
                }
            }
        }

        // 2. 🔥 PUBLIC PAYLOAD (Naya Safe Logic) 🔥
        const publicPayload = {
            title: document.getElementById("eb_title").value,
            description: document.getElementById("eb_desc").value,
            thumbnail: document.getElementById("eb_thumb").value,
            price: isFree ? 0 : Number(document.getElementById("eb_price").value),
            discount_price: isFree ? 0 : Number(document.getElementById("eb_discount").value),
            is_free: isFree,
            language: document.getElementById("eb_language").value,
            category: document.getElementById("eb_category").value,
            sort_order: requestedOrder,
            createdAt: new Date().toISOString()
        };

        // Agar FREE book hai, toh public document mein link jayegi
        if (isFree) {
            if (rawPdfUrl !== "") publicPayload.pdf_link = rawPdfUrl; 
        }

        // 3. Database Save aur Secure Locker System
        if (ebookId) { 
            // 🛠️ EDIT MODE
            const updatePayload = { ...publicPayload };
            
            // Sabse Bada Fix: Agar Paid Book ban rahi hai, toh public link uda do
            if (!isFree) {
                updatePayload.pdf_link = deleteField(); 
            }
            
            await updateDoc(doc(db, "ebooks", ebookId), updatePayload); 
            
            // 🔥 SECURE VAULT LOGIC FOR EDIT
            if (!isFree) {
                if (rawPdfUrl !== "") {
                    await setDoc(doc(db, "secure_links", ebookId), { pdf_link: rawPdfUrl }, { merge: true });
                }
            } else {
                try { await updateDoc(doc(db, "secure_links", ebookId), { pdf_link: deleteField() }); } catch(e){}
            }

            // Search Index Update 
            const indexPayload = { ...publicPayload };
            if (!isFree) delete indexPayload.pdf_link; // 🔥 THE FIX: Sirf paid book se link udao
            if (window.updateSearchIndex) await window.updateSearchIndex(ebookId, indexPayload, true);
            
            window.showToast("Ebook Updated & Secured!"); 

        } else { 
            // 🛠️ ADD MODE (Nayi book) - CUSTOM ID LOGIC 🔥
            const rawTitle = document.getElementById("eb_title").value.trim();
            
            // Title se special characters hata kar pehle 2 words nikalna
            const titleWords = rawTitle.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/);
            const prefix = titleWords.slice(0, 2).join("_").toUpperCase();
            
            // 5 letter ka ek chhota random code banana
            const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase(); 
            
            // Custom ID Tayyar (e.g., DEMO_BOOK_A1B2C)
            const customDocId = prefix ? `${prefix}_${randomCode}` : `BOOK_${randomCode}`;

            // 🔥 addDoc ki jagah setDoc use karke custom ID par save kar rahe hain
            await setDoc(doc(db, "ebooks", customDocId), publicPayload); 
            
            // Nayi Paid book banayi hai, toh seedha tijori mein lock karo
            if (!isFree && rawPdfUrl !== "") {
                await setDoc(doc(db, "secure_links", customDocId), { pdf_link: rawPdfUrl });
            }

            const indexPayload = { ...publicPayload };
            if (!isFree) delete indexPayload.pdf_link; // 🔥 THE FIX: Sirf paid book se link udao
            if (window.updateSearchIndex) await window.updateSearchIndex(customDocId, indexPayload, false);
            
            window.showToast("Ebook Added & Secured!"); 
        }

        localStorage.removeItem("admin_cache_ebooks");
        setTimeout(() => { sessionStorage.removeItem('edit_ebook_id'); window.location.href = '/admin/books/'; }, 1500);

    } catch (e) {
        // 🔥 YEH WALA MAIN CATCH MISSING THA JO AB WAPAS AA GAYA HAI 🔥
        console.error("Critical Setup Error:", e);
        window.showToast("Error securing data", "error");
        submitBtn.disabled = false; submitBtn.innerHTML = originalText;
    }
};

// =========================================================================
// 🔥 BULLETPROOF FIX: DIRECT ARRAY OVERWRITE WITH SORT_ORDER 🔥
// =========================================================================
window.updateSearchIndex = async function(bookId, bookData, action = 'add') {
    try {
        const { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
        const dbInstance = getFirestore();

        let mode = action;
        if (action === true) mode = 'edit';
        if (action === false) mode = 'add';

        let miniBookData = null;
        if (mode !== 'delete' && bookData) {
            miniBookData = {
                id: String(bookId),
                title: bookData.title || "",
                description: bookData.description || "",
                category: bookData.category || "",
                language: bookData.language || "",
                thumbnail: bookData.thumbnail || "",
                is_free: bookData.is_free,
                price: bookData.price || "",
                discount_price: bookData.discount_price || "",
                sort_order: bookData.sort_order !== undefined ? Number(bookData.sort_order) : 999 
            };
            
            // 🔥 NAYA FIX: Agar payload mein pdf_link (sirf Free book me) aayi hai, toh array me store karo
            if (bookData.pdf_link) {
                miniBookData.pdf_link = bookData.pdf_link;
            }
        }

        const metaSnap = await getDoc(doc(dbInstance, "settings", "search_metadata"));
        const maxChunk = metaSnap.exists() ? (metaSnap.data().current_chunk || 1) : 1;

        let bookFoundAndEdited = false;

        // 🛠️ CASE 1: DELETE OR EDIT (Direct Replace - No Race Conditions)
        if (mode === 'delete' || mode === 'edit') {
            for (let i = 1; i <= maxChunk; i++) {
                const chunkRef = doc(dbInstance, "search_indexes", `chunk_${i}`);
                const chunkSnap = await getDoc(chunkRef);
                
                if (chunkSnap.exists()) {
                    let booksList = chunkSnap.data().books_list || [];
                    const bookIndex = booksList.findIndex(b => String(b.id) === String(bookId));
                    
                    if (bookIndex > -1) {
                        if (mode === 'delete') {
                            // Agar delete karna hai toh simply mita do
                            booksList.splice(bookIndex, 1);
                            await updateDoc(chunkRef, { books_list: booksList });
                            console.log(`🗑️ Removed from chunk_${i}`);
                            return; 
                        } else if (mode === 'edit') {
                            // 🔥 FIX: Agar Edit hai toh seedha uski jagah naya data (with sort_order) rakh do
                            booksList[bookIndex] = miniBookData;
                            await updateDoc(chunkRef, { books_list: booksList });
                            console.log(`✅ Updated directly in chunk_${i} with sort_order!`);
                            bookFoundAndEdited = true;
                            return; // Kaam ho gaya, yahi se ruk jao
                        }
                    }
                }
            }
        }

        // 🛠️ CASE 2: NAYI BOOK ADD KARNA (Ya purani book agar kisi chunk me na mili ho)
        if (mode === 'add' || (mode === 'edit' && !bookFoundAndEdited)) {
            let currentChunk = maxChunk;
            const chunkRef = doc(dbInstance, "search_indexes", `chunk_${currentChunk}`);
            const chunkSnap = await getDoc(chunkRef);

            let needNewChunk = false;
            if (chunkSnap.exists()) {
                const booksList = chunkSnap.data().books_list || [];
                const temporaryList = [...booksList, miniBookData];
                const currentByteSize = new Blob([JSON.stringify(temporaryList)]).size;
                
                if (currentByteSize >= 614400) { 
                    needNewChunk = true;
                }
            }

            if (needNewChunk) {
                currentChunk += 1;
                const metaRef = doc(dbInstance, "settings", "search_metadata");
                await setDoc(metaRef, { current_chunk: currentChunk }, { merge: true });
            }

            const finalChunkRef = doc(dbInstance, "search_indexes", `chunk_${currentChunk}`);
            await setDoc(finalChunkRef, {
                books_list: arrayUnion(miniBookData)
            }, { merge: true });

            console.log(`✅ Added safely to chunk_${currentChunk} with sort_order!`);
        }
    } catch (error) {
        console.error("Search Index Critical Error:", error);
    }
};

// ==========================================
// 👥 USERS MANAGEMENT LOGIC
// ==========================================
window.loadUsers = async function() {
    const cacheKey = "admin_cache_users";
    const cachedStr = localStorage.getItem(cacheKey);
    
    // 🔥 BUG FIX: Ensure user skeleton loads if cache is empty
    if (!cachedStr && typeof window.renderUsersSkeletons === "function") {
        window.renderUsersSkeletons();
    }

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
    
    // 🔥 BUG FIX: Ensure payments skeleton loads if cache is empty
    if (!cachedStr && typeof window.renderPaymentsSkeletons === "function") {
        window.renderPaymentsSkeletons();
    }

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
    
    try { 
        // 1. Pehle Firebase se login check karo
        const userCredential = await signInWithEmailAndPassword(auth, email, pass); 
        const user = userCredential.user;

        // 2. Success bolne se PEHLE check karo ki ye Admin hai ya nahi
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
        const adminDoc = await getDoc(doc(db, "users", user.uid));

        if (adminDoc.exists() && adminDoc.data().role === 'admin') {
            // Asli admin mil gaya! Naam save karo aur Success dikhao
            localStorage.setItem("islamic_admin_name", adminDoc.data().name || "Admin");
            window.showToast("Login Successful!"); 
        } else {
            // Agar normal user yahan aa gaya, toh bina popup ke turant signout karo
            await signOut(auth);
            throw new Error("Wrong Credentials or Not an Admin!");
        }
    } catch (e) { 
        window.showToast("Wrong Credentials or Not an Admin!", "error"); 
        btn.innerHTML = origText; 
        btn.disabled = false; 
    }
};



window.logout = () => {
    window.closeProfileDrawer();
    window.showConfirm("Logout", "Are you sure you want to log out?", () => {
        signOut(auth).then(() => {
            localStorage.removeItem("islamic_admin_auth");
            localStorage.removeItem("admin_stats_cache");
            window.location.href = '/admin/';
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

window.openProfileDrawer = function() {
    const overlay = document.getElementById("drawer-overlay");
    const drawer = document.getElementById("profile-drawer");
    
    if(overlay) overlay.classList.add("active");
    if(drawer) drawer.classList.add("active");
    document.body.style.overflow = 'hidden';

    // Local storage se data uthao
    let adminName = localStorage.getItem("islamic_admin_name");
    let adminEmail = localStorage.getItem("islamic_admin_email");
    
    const nameEl = document.getElementById("profile-name");
    const emailEl = document.getElementById("profile-email");
    
    // Agar data nahi milta toh "Administration" dikhao
    if(nameEl) nameEl.innerText = adminName ? adminName : "Admin";
    if(emailEl) emailEl.innerText = adminEmail ? adminEmail : "Administration"; 
};



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

        // ✅ 1. Initialize Theme Immediately (Page load hote hi bina jhatke ke theme set karne ke liye)
        window.initTheme = () => {
            // Yahan humne key same kar di hai: 'islamic_theme'
            const saved = localStorage.getItem('islamic_theme') || 'dark';
            if (saved === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        };
        // Turant call kar do
        window.initTheme();

        // ✅ 2. Universal Smart Theme Toggle
        window.toggleTheme = function() {
            const body = document.documentElement;
            const isLight = body.getAttribute('data-theme') === 'light';
            const themeIcons = document.querySelectorAll('.fa-moon, .fa-sun'); // Saare icons target karne ke liye

            if (isLight) {
                // Switch to Dark Mode
                body.removeAttribute('data-theme');
                localStorage.setItem('islamic_theme', 'dark');
                
                // Icon ko wapas Moon banao
                themeIcons.forEach(icon => {
                    icon.classList.remove('fa-sun');
                    icon.classList.add('fa-moon');
                });
            } else {
                // Switch to Light Mode
                body.setAttribute('data-theme', 'light');
                localStorage.setItem('islamic_theme', 'light');
                
                // Icon ko Sun banao
                themeIcons.forEach(icon => {
                    icon.classList.remove('fa-moon');
                    icon.classList.add('fa-sun');
                });
            }
        };

        // ✅ 3. Page Load par Icon Sync (Kyunki HTML thodi der me load hota hai)
        document.addEventListener("DOMContentLoaded", () => {
            const savedTheme = localStorage.getItem('islamic_theme') || 'dark';
            const themeIcons = document.querySelectorAll('.fa-moon, .fa-sun');
            
            if (savedTheme === 'light') {
                themeIcons.forEach(icon => {
                    icon.classList.remove('fa-moon');
                    icon.classList.add('fa-sun');
                });
            } else {
                themeIcons.forEach(icon => {
                    icon.classList.remove('fa-sun');
                    icon.classList.add('fa-moon');
                });
            }
        });

// ==========================================
// 🔥 USERS PAGE LOGIC (EDIT, DELETE, RESET)
// ==========================================

// 1. Edit User Logic (Sirf Naam Update hoga)
window.handleUserUpdate = async () => {
    const id = document.getElementById("edit_user_id").value;
    const newName = document.getElementById("edit_user_name").value.trim();
    const btn = document.getElementById("update-user-btn");

    if (!id || !newName) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "users", id), { name: newName });
        
        // Cache update karo taaki turant UI me dikhe
        const userIndex = window.usersData.findIndex(u => u.id === id);
        if (userIndex > -1) {
            window.usersData[userIndex].name = newName;
            window.renderUsers(window.usersData);
        }
        
        window.showToast("User Name Updated!", "success");
        window.closeEditUserModal();
    } catch (error) {
        console.error("Edit User Error:", error);
        window.showToast("Update Failed", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// 2. Delete User Logic (Firestore se delete aur Stats me -1)
window.initiateUserDelete = function(id) {
    window.showConfirm("Delete User Data", "Are you sure? This deletes user data from the database. Note: You must also delete their account from Firebase Auth Console manually.", async () => {
        try {
            window.showToast("Deleting user...", "info");
            
            // Database se user document udao
            await deleteDoc(doc(db, "users", id));

            window.showToast("User Deleted Successfully!", "success");
            
            // UI aur Cache se hatao
            window.usersData = window.usersData.filter(u => u.id !== id);
            window.renderUsers(window.usersData);
            window.closeConfirm();

        } catch (error) {
            console.error("Delete User Error:", error);
            window.showToast("Failed to delete user", "error");
        }
    });
};

// ==========================================
// 🔥 SECONDARY APP FOR PASSWORD RESET
// ==========================================
// 🔥 Use the same config as the main app
const adminFirebaseConfig = firebaseConfig;

let secondaryAuth;
try {
    // Check if app already exists to avoid errors on refresh
    const secondaryApp = initializeApp(adminFirebaseConfig, "SecondaryAppForAdmin");
    secondaryAuth = getAuth(secondaryApp);
} catch (e) {
    console.log("Secondary app already initialized or error", e);
}


// 3. Reset Password & Email Logic
window.executeAccountReset = async () => {
    const oldUid = document.getElementById("reset_old_uid").value.trim();
    const newIdInput = document.getElementById("reset_new_id").value.trim();
    const newPass = document.getElementById("reset_new_pass").value.trim();
    const btn = document.getElementById("reset-submit-btn");

    // Strictly mandatory fields
    if (!oldUid || !newPass) {
        window.showToast("Old UID and New Password are strictly required!", "error");
        return;
    }

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btn.disabled = true;
        
        // Find old user in Firestore
        const oldUserSnap = await getDoc(doc(db, "users", oldUid));
        if (!oldUserSnap.exists()) {
            window.showToast("Old UID not found in database!", "error");
            btn.innerHTML = 'Reset Data';
            btn.disabled = false;
            return;
        }

        const userData = oldUserSnap.data();

        // If New ID is empty, keep the old one from database
        const finalId = newIdInput || userData.displayId || userData.email || userData.mobile;

        // Pattern for mobile users: add the @islamiclibrary.com domain
        let finalEmail = finalId;
        if (!finalId.includes("@")) {
            finalEmail = finalId + "@islamiclibrary.com"; 
        }

        // 1. Create new Firebase Auth Account
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, newPass);
        const newUid = userCred.user.uid;

        // 2. Migrate User Document in Firestore
        userData.uid = newUid; 
        userData.displayId = finalId; 
        
        await setDoc(doc(db, "users", newUid), userData);
        await deleteDoc(doc(db, "users", oldUid)); 

        // 3. Migrate Payments to New UID
        const q = query(collection(db, "payments"), where("user_id", "==", oldUid));
        const querySnapshot = await getDocs(q);
        
        const updatePromises = [];
        querySnapshot.forEach((paymentDoc) => {
            updatePromises.push(updateDoc(doc(db, "payments", paymentDoc.id), { user_id: newUid }));
        });
        await Promise.all(updatePromises);

        window.showToast("Account migrated successfully!", "success");
        window.closeResetModal();
        
        // Refresh the users list in UI
        if(window.forceFetchUsers) window.forceFetchUsers();

    } catch (error) {
        console.error("Migration Error:", error);
        if (error.code === 'auth/email-already-in-use') {
            window.showToast("ID already registered, or old account not deleted from Console.", "error");
        } else {
            window.showToast("Error: " + error.message, "error");
        }
    } finally {
        btn.innerHTML = 'Reset Data';
        btn.disabled = false;
    }
};

// 🔥 DELETE PAYMENT LOGIC (Firestore + Metadata Update)
window.initiatePaymentDelete = function(id) {
    window.showConfirm("Delete Payment Record", "Are you sure? This will permanently remove this payment record from the database.", async () => {
        try {
            window.showToast("Deleting payment...", "info");
            
            // 1. Delete payment document from Firestore
            await deleteDoc(doc(db, "payments", id));

            window.showToast("Payment record deleted successfully!", "success");
            
            // 3. UI Update: Remove from current list
            if (window.paymentsData) {
                window.paymentsData = window.paymentsData.filter(p => p.id !== id);
                window.renderPayments(window.paymentsData);
            }
            
            window.closeConfirm();

        } catch (error) {
            console.error("Delete Error:", error);
            window.showToast("Failed to delete payment record", "error");
        }
    });
};
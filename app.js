// =============================================
//   SMARTLIB - app.js v4.0
//   Firebase Auth + Firestore + Google Auth
//   Email Verification + Enhanced Registration
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ===== FIREBASE INIT =====
const firebaseConfig = {
  apiKey: "AIzaSyCUqOXSjvORXsgRrr3GyiXjZMCUe5BZIjA",
  authDomain: "smartlib-e21c6.firebaseapp.com",
  projectId: "smartlib-e21c6",
  storageBucket: "smartlib-e21c6.firebasestorage.app",
  messagingSenderId: "95363303125",
  appId: "1:95363303125:web:f6cae3efc676bc2fba845c",
  measurementId: "G-BGGHM3X54H"
};
const firebaseApp = initializeApp(firebaseConfig);
getAnalytics(firebaseApp);
const auth     = getAuth(firebaseApp);
const db       = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

// ===== STATE =====
let currentUser     = null;
let currentUserData = null;
let selectedRole    = null;
let borrowingBookId = null;
let returningBookId = null;
let currentTheme    = localStorage.getItem("smartlib-theme") || "light";
let unsubBooks      = null;
let unsubRequests   = null;
let onlineInterval  = null;
let pendingVerifyEmail = null;
let pendingVerifyRole  = null;

// ===== HELPERS =====
function nowStr() {
  return new Date().toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function validateGmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@gmail\.com$/.test(email);
}

function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.innerHTML = msg;
  t.className = "toast show" + (type === "error" ? " error" : type === "warning" ? " warning" : "");
  setTimeout(() => t.classList.remove("show"), 3800);
}

// ===== PASSWORD STRENGTH =====
function checkPasswordStrength(pw) {
  let score = 0;
  const checks = {
    length:    pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    number:    /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw)
  };
  score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
}

window.updatePasswordStrength = function (inputId, barId, msgId) {
  const pw  = document.getElementById(inputId).value;
  const bar = document.getElementById(barId);
  const msg = document.getElementById(msgId);
  if (!pw) { bar.style.width = "0%"; bar.className = "pw-strength-bar"; msg.textContent = ""; return; }
  const { score, checks } = checkPasswordStrength(pw);
  const labels   = ["", "Weak", "Fair", "Good", "Strong"];
  const classes  = ["", "strength-weak", "strength-fair", "strength-good", "strength-strong"];
  const widths   = ["0%", "25%", "50%", "75%", "100%"];
  bar.style.width = widths[score];
  bar.className   = "pw-strength-bar " + (classes[score] || "");
  let hints = [];
  if (!checks.length)    hints.push("min. 8 chars");
  if (!checks.uppercase) hints.push("uppercase letter");
  if (!checks.number)    hints.push("number");
  msg.textContent = score < 4 ? `Add: ${hints.join(", ")}` : "✅ Strong password";
  msg.style.color = score >= 3 ? "var(--green)" : "var(--orange)";
};

// ===== THEME =====
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("smartlib-theme", theme);
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  const light = document.getElementById("themeLight");
  const dark  = document.getElementById("themeDark");
  if (light) light.classList.toggle("active", theme === "light");
  if (dark)  dark.classList.toggle("active",  theme === "dark");
}
window.toggleTheme = function () { applyTheme(currentTheme === "light" ? "dark" : "light"); };
window.setTheme    = function (t) { applyTheme(t); };
applyTheme(currentTheme);

// ===== PASSWORD TOGGLE =====
window.togglePw = function (inputId, el) {
  const input = document.getElementById(inputId);
  if (input.type === "password") { input.type = "text";     el.textContent = "🙈"; }
  else                           { input.type = "password"; el.textContent = "👁️"; }
};

// ===== ROLE SELECTION =====
window.selectRole = function (role) {
  selectedRole = role;
  document.getElementById("roleSelector").style.display = "none";
  _showLogin();
};
window.backToRole = function () {
  document.getElementById("loginForm").style.display    = "none";
  document.getElementById("registerForm").style.display = "none";
  document.getElementById("verifyPanel").style.display  = "none";
  document.getElementById("roleSelector").style.display = "block";
  selectedRole = null;
};

// ===== AUTH FORMS =====
function _showLogin() {
  document.getElementById("roleSelector").style.display  = "none";
  document.getElementById("loginForm").style.display     = "block";
  document.getElementById("registerForm").style.display  = "none";
  document.getElementById("verifyPanel").style.display   = "none";
  document.getElementById("loginError").textContent      = "";
  _setPill("loginRolePill");
}
window.showLogin = function () { _showLogin(); };

window.showRegister = function () {
  document.getElementById("loginForm").style.display    = "none";
  document.getElementById("registerForm").style.display = "block";
  document.getElementById("verifyPanel").style.display  = "none";
  document.getElementById("regError").textContent       = "";
  _setPill("regRolePill");
};

function _setPill(id) {
  const pill = document.getElementById(id);
  if (!pill) return;
  pill.textContent = selectedRole === "admin" ? "🏛️ Library Admin" : "🎓 Student";
  pill.className   = "role-pill " + (selectedRole === "admin" ? "pill-admin" : "pill-student");
}

// ===== GOOGLE SIGN-IN =====
window.loginWithGoogle = async function () {
  const errEl = document.getElementById("loginError");
  try {
    const result  = await signInWithPopup(auth, provider);
    const uid     = result.user.uid;
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) {
      // New Google user — auto-fill register form
      await signOut(auth);
      window.showRegister();
      document.getElementById("regName").value  = result.user.displayName || "";
      document.getElementById("regEmail").value = result.user.email || "";
      document.getElementById("regEmail").readOnly = true;
      document.getElementById("googleUidHidden").value = uid;
      showToast("👋 Complete your profile to finish signing up!", "");
      return;
    }
    if (userDoc.data().role !== selectedRole) {
      await signOut(auth);
      errEl.textContent = "Wrong role selected for this account.";
      return;
    }
    // onAuthStateChanged handles the rest
  } catch (e) {
    errEl.textContent = "Google sign-in failed. Please try again.";
  }
};

window.registerWithGoogle = async function () {
  const errEl = document.getElementById("regError");
  try {
    const result  = await signInWithPopup(auth, provider);
    const uid     = result.user.uid;
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      if (userDoc.data().role !== selectedRole) {
        await signOut(auth);
        errEl.textContent = "This Google account is already registered under a different role.";
        return;
      }
      // Already registered, just sign in
      return;
    }
    document.getElementById("regName").value  = result.user.displayName || "";
    document.getElementById("regEmail").value = result.user.email || "";
    document.getElementById("regEmail").readOnly = true;
    document.getElementById("googleUidHidden").value = uid;
    showToast("👋 Complete your profile below to finish signing up!");
    await signOut(auth);
  } catch (e) {
    errEl.textContent = "Google sign-in failed.";
  }
};

// ===== LOGIN =====
window.login = async function () {
  const email    = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value.trim();
  const errEl    = document.getElementById("loginError");

  if (!email || !password)   { errEl.textContent = "Please fill in all fields."; return; }
  if (!validateGmail(email)) { errEl.textContent = "Please use a valid @gmail.com address."; return; }

  try {
    const cred    = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, "users", cred.user.uid));
    if (!userDoc.exists()) {
      await signOut(auth);
      errEl.textContent = "Account not found. Please register.";
      return;
    }
    if (userDoc.data().role !== selectedRole) {
      await signOut(auth);
      errEl.textContent = "Wrong role selected for this account.";
      return;
    }
    // onAuthStateChanged fires and calls _showApp()
  } catch (e) {
    errEl.textContent = "Invalid email or password.";
  }
};

// ===== REGISTER =====
window.register = async function () {
  const name     = document.getElementById("regName").value.trim();
  const email    = document.getElementById("regEmail").value.trim().toLowerCase();
  const password = document.getElementById("regPassword").value.trim();
  const address  = document.getElementById("regAddress").value.trim();
  const contact  = document.getElementById("regContact").value.trim();
  const errEl    = document.getElementById("regError");
  const googleUid = document.getElementById("googleUidHidden").value.trim();

  if (!name || !email || !address || !contact) {
    errEl.textContent = "Please fill in all required fields."; return;
  }
  if (!validateGmail(email)) {
    errEl.textContent = "Please use a valid @gmail.com address."; return;
  }

  // Skip password checks for Google sign-up
  if (!googleUid) {
    if (!password) { errEl.textContent = "Please enter a password."; return; }
    if (password.length < 8) { errEl.textContent = "Password must be at least 8 characters."; return; }
    const { score, checks } = checkPasswordStrength(password);
    if (!checks.uppercase) { errEl.textContent = "⚠️ Password must contain at least one uppercase letter."; return; }
    if (!checks.number)    { errEl.textContent = "⚠️ Password must contain at least one number."; return; }
    if (score < 3)         { errEl.textContent = "⚠️ Password is too weak. Add uppercase, numbers, or special chars."; return; }
  }

  const userData = {
    name, email, role: selectedRole,
    address, contact,
    createdAt: serverTimestamp(),
    online: false, lastSeen: null
  };

  try {
    if (googleUid) {
      // Google sign-up: user already created in Firebase Auth, just save Firestore doc
      await setDoc(doc(db, "users", googleUid), userData);
      showToast("✅ Account created! Please log in with Google.", "");
      document.getElementById("regEmail").readOnly = false;
      document.getElementById("googleUidHidden").value = "";
      _showLogin();
    } else {
      // Email/password sign-up — send email verification
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      await setDoc(doc(db, "users", cred.user.uid), userData);
      pendingVerifyEmail = email;
      pendingVerifyRole  = selectedRole;
      await signOut(auth);
      _showVerifyPanel(email);
      showToast("📧 Verification email sent to " + email + "!", "");
    }
  } catch (e) {
    errEl.textContent = e.code === "auth/email-already-in-use"
      ? "This email is already registered."
      : e.message;
  }
};

// ===== EMAIL VERIFICATION PANEL =====
function _showVerifyPanel(email) {
  document.getElementById("loginForm").style.display    = "none";
  document.getElementById("registerForm").style.display = "none";
  document.getElementById("roleSelector").style.display = "none";
  document.getElementById("verifyPanel").style.display  = "block";
  document.getElementById("verifyEmailDisplay").textContent = email || pendingVerifyEmail || "";
}

window.resendVerification = async function () {
  // Ask user to log in briefly to send verification
  const email = pendingVerifyEmail;
  const pw    = prompt("Enter your password to resend verification email:");
  if (!pw) return;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pw);
    await sendEmailVerification(cred.user);
    await signOut(auth);
    showToast("📧 Verification email resent!", "");
  } catch (e) {
    showToast("Failed to resend. Check your password.", "error");
  }
};

window.goBackToLogin = function () {
  pendingVerifyEmail = null;
  _showLogin();
};

// ===== LOGOUT =====
window.logout = async function () {
  if (unsubBooks)    { unsubBooks();    unsubBooks    = null; }
  if (unsubRequests) { unsubRequests(); unsubRequests = null; }
  if (onlineInterval) { clearInterval(onlineInterval); onlineInterval = null; }

  // Mark offline
  if (currentUser) {
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { online: false, lastSeen: serverTimestamp() });
    } catch (_) {}
  }

  await signOut(auth);
  currentUser = currentUserData = selectedRole = null;

  document.getElementById("mainApp").style.display    = "none";
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("loginEmail").value    = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginForm").style.display    = "none";
  document.getElementById("registerForm").style.display = "none";
  document.getElementById("verifyPanel").style.display  = "none";
  document.getElementById("roleSelector").style.display = "block";
};

// ===== AUTH STATE OBSERVER =====
onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
    if (!userDoc.exists()) { await signOut(auth); return; }

    currentUser     = firebaseUser;
    currentUserData = { uid: firebaseUser.uid, ...userDoc.data() };
    selectedRole    = currentUserData.role;

    // Mark online
    await updateDoc(doc(db, "users", firebaseUser.uid), { online: true, lastSeen: serverTimestamp() });
    // Keep-alive heartbeat
    if (onlineInterval) clearInterval(onlineInterval);
    onlineInterval = setInterval(async () => {
      if (currentUser) {
        try {
          await updateDoc(doc(db, "users", currentUser.uid), { online: true, lastSeen: serverTimestamp() });
        } catch (_) {}
      }
    }, 30000);

    _showApp();
  } else {
    document.getElementById("mainApp").style.display    = "none";
    document.getElementById("authScreen").style.display = "flex";
  }
});

// ===== SHOW APP =====
function _showApp() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("mainApp").style.display    = "flex";

  const initials = currentUserData.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  document.getElementById("sidebarAvatar").textContent = initials;
  document.getElementById("sidebarName").textContent   = currentUserData.name;
  document.getElementById("sidebarRole").textContent   = currentUserData.role === "admin" ? "🏛️ Library Admin" : "🎓 Student";
  document.getElementById("topbarAvatar").textContent  = initials;

  if (currentUserData.role === "admin") {
    document.getElementById("adminNav").style.display   = "flex";
    document.getElementById("studentNav").style.display = "none";
    _showPage("dashboard");
  } else {
    document.getElementById("studentNav").style.display = "flex";
    document.getElementById("adminNav").style.display   = "none";
    _showPage("books");
  }
}

// ===== NAVIGATION =====
function _showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const pageEl = document.getElementById("page-" + page);
  if (!pageEl) return;
  pageEl.classList.add("active");

  const navEl = document.getElementById("nav-" + page);
  if (navEl) navEl.classList.add("active");

  document.getElementById("searchBoxWrap").style.display = page === "books" ? "flex" : "none";

  const titles = {
    dashboard:   ["Dashboard",      "Overview of library activity"],
    books:       ["Book List",      "Browse all available books"],
    requests:    ["Requests",       "Manage borrow and return requests"],
    borrowed:    ["Borrowed Books", "Track currently borrowed books"],
    addbook:     ["Add New Book",   "Add a book to the library"],
    users:       ["Users",          "Manage student accounts & status"],
    history:     ["My History",     "Your borrowing activity"],
    settings:    ["Settings",       "Account preferences and options"],
    notifications: ["Notifications", "Messages from the library admin"],
  };
  const [title, sub] = titles[page] || ["", ""];
  document.getElementById("pageTitle").textContent    = title;
  document.getElementById("pageSubtitle").textContent = sub;

  if (page === "dashboard")     renderDashboard();
  if (page === "books")         startBooksListener();
  if (page === "requests")      startRequestsListener();
  if (page === "borrowed")      renderBorrowedTable();
  if (page === "users")         renderUsersPage();
  if (page === "history")       renderHistory();
  if (page === "settings")      renderSettings();
  if (page === "notifications") renderNotifications();

  _updateRequestBadge();
  _updateNotifBadge();
}
window.showPage = _showPage;

// ===== REQUEST BADGE =====
async function _updateRequestBadge() {
  const badge = document.getElementById("requestBadge");
  if (!badge) return;
  const snap  = await getDocs(query(collection(db, "requests"), where("status", "==", "pending")));
  badge.textContent   = snap.size;
  badge.style.display = snap.size > 0 ? "inline-flex" : "none";
}

// ===== NOTIFICATION BADGE =====
async function _updateNotifBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge || !currentUserData || currentUserData.role === "admin") return;
  const snap = await getDocs(query(
    collection(db, "notifications"),
    where("toUid", "==", currentUserData.uid),
    where("read", "==", false)
  ));
  badge.textContent   = snap.size;
  badge.style.display = snap.size > 0 ? "inline-flex" : "none";
}

// ===== REALTIME: BOOKS =====
function startBooksListener() {
  if (unsubBooks) unsubBooks();
  unsubBooks = onSnapshot(collection(db, "books"), snap => {
    const books = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _populateGenreFilter(books);
    renderBooks(books);
    if (document.getElementById("page-borrowed")?.classList.contains("active"))  renderBorrowedTable(books);
    if (document.getElementById("page-dashboard")?.classList.contains("active")) renderDashboard();
  });
}

// ===== REALTIME: REQUESTS =====
function startRequestsListener() {
  if (unsubRequests) unsubRequests();
  unsubRequests = onSnapshot(collection(db, "requests"), () => {
    renderRequests();
    _updateRequestBadge();
  });
}

// ===== DASHBOARD =====
async function renderDashboard() {
  const [booksSnap, usersSnap, pendingSnap, retSnap] = await Promise.all([
    getDocs(collection(db, "books")),
    getDocs(query(collection(db, "users"), where("role", "==", "student"))),
    getDocs(query(collection(db, "requests"), where("status", "==", "pending"))),
    getDocs(query(collection(db, "historyLog"), where("status", "==", "returned")))
  ]);

  const books   = booksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const pending = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const onlineStudents = usersSnap.docs.filter(d => d.data().online).length;

  document.getElementById("dashTotal").textContent    = books.length;
  document.getElementById("dashAvail").textContent    = books.filter(b => b.available).length;
  document.getElementById("dashBorrowed").textContent = books.filter(b => !b.available).length;
  document.getElementById("dashStudents").textContent = usersSnap.size;
  document.getElementById("dashOnline").textContent   = onlineStudents;
  document.getElementById("dashPending").textContent  = pendingSnap.size;

  const borrowPending = pending.filter(r => r.type === "borrow");
  const reqList = document.getElementById("dashRequestList");
  reqList.innerHTML = borrowPending.length === 0
    ? `<div class="dash-empty">No pending borrow requests</div>`
    : borrowPending.slice(0, 5).map(r => `
        <div class="dash-item">
          <div>
            <div class="dash-item-title">${r.bookTitle}</div>
            <div class="dash-item-sub">by ${r.studentName} · ${r.requestedAt}</div>
          </div>
          <span class="badge-pending">Pending</span>
        </div>`).join("");

  const returns = retSnap.docs.map(d => d.data())
    .sort((a, b) => (b.returnedAt || "").localeCompare(a.returnedAt || ""))
    .slice(0, 5);
  const retList = document.getElementById("dashReturnList");
  retList.innerHTML = returns.length === 0
    ? `<div class="dash-empty">No recent returns</div>`
    : returns.map(r => `
        <div class="dash-item">
          <div>
            <div class="dash-item-title">${r.bookTitle}</div>
            <div class="dash-item-sub">by ${r.studentName} · ${r.returnedAt}</div>
          </div>
          <span class="badge-returned">Returned</span>
        </div>`).join("");
}

// ===== GENRE FILTER =====
function _populateGenreFilter(books) {
  const select  = document.getElementById("genreFilter");
  const current = select.value;
  const genres  = [...new Set(books.map(b => b.genre))].sort();
  select.innerHTML = `<option value="">All Genres</option>` +
    genres.map(g => `<option value="${g}" ${g === current ? "selected" : ""}>${g}</option>`).join("");
}

window.applyFilter = async function () {
  const genre  = document.getElementById("genreFilter").value;
  const status = document.getElementById("statusFilter").value;
  const snap   = await getDocs(collection(db, "books"));
  let books    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (genre)              books = books.filter(b => b.genre === genre);
  if (status === "available") books = books.filter(b => b.available);
  if (status === "borrowed")  books = books.filter(b => !b.available);
  renderBooks(books);
};

// ===== RENDER BOOKS =====
async function renderBooks(books) {
  const grid = document.getElementById("bookGrid");
  grid.innerHTML = "";

  document.getElementById("totalBooks").textContent     = books.length;
  document.getElementById("availableBooks").textContent = books.filter(b => b.available).length;
  document.getElementById("borrowedCount").textContent  = books.filter(b => !b.available).length;

  if (books.length === 0) {
    grid.innerHTML = `<div class="empty-msg" style="grid-column:1/-1">No books found.</div>`;
    return;
  }

  const isAdmin = currentUserData?.role === "admin";
  let myRequests = [];
  if (!isAdmin && currentUserData) {
    const snap = await getDocs(query(
      collection(db, "requests"),
      where("studentEmail", "==", currentUserData.email),
      where("status", "==", "pending")
    ));
    myRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  books.forEach(book => {
    const card        = document.createElement("div");
    card.className    = "book-card";
    const statusClass = book.available ? "status-available" : "status-borrowed";
    const statusText  = book.available ? "✅ Available"     : "📤 Borrowed";

    const hasPendingBorrow      = !isAdmin && myRequests.some(r => r.type === "borrow" && r.bookId === book.id);
    const hasPendingReturn      = !isAdmin && myRequests.some(r => r.type === "return" && r.bookId === book.id);
    const studentCurrentlyHolds = !isAdmin && !book.available && book.borrowedByEmail === currentUserData?.email;

    let actionBtn = "";
    if (isAdmin) {
      actionBtn = `<button class="btn-delete" onclick="deleteBook('${book.id}')">🗑️ Delete</button>`;
    } else if (book.available) {
      actionBtn = hasPendingBorrow
        ? `<button class="btn-borrow btn-pending" disabled>⏳ Requested</button>`
        : `<button class="btn-borrow" onclick="openBorrowModal('${book.id}')">📤 Request Borrow</button>`;
    } else if (studentCurrentlyHolds) {
      actionBtn = hasPendingReturn
        ? `<button class="btn-return-card btn-pending" disabled>⏳ Return Sent</button>`
        : `<button class="btn-return-card" onclick="openReturnModal('${book.id}')">📥 Request Return</button>`;
    } else {
      actionBtn = `<button class="btn-borrow" disabled>Unavailable</button>`;
    }

    card.innerHTML = `
      <div class="book-card-header">
        <div class="book-title-wrap">
          <div class="book-title">${book.title}</div>
          <div class="book-author">by ${book.author}</div>
        </div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
      <div class="book-meta">
        <span class="book-genre">${book.genre}</span>
        <span class="book-year">${book.year}</span>
      </div>
      ${book.desc ? `<div class="book-desc">${book.desc}</div>` : ""}
      ${!book.available && book.borrowedBy ? `<div class="book-borrower">📌 Held by <b>${book.borrowedBy}</b></div>` : ""}
      <div class="book-card-actions">${actionBtn}</div>`;
    grid.appendChild(card);
  });
}

// ===== BORROWED TABLE =====
async function renderBorrowedTable(booksOverride) {
  const tbody = document.getElementById("borrowedTableBody");
  const msg   = document.getElementById("noBorrowedMsg");
  let books   = booksOverride;
  if (!books) {
    const snap = await getDocs(collection(db, "books"));
    books = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const borrowed = books.filter(b => !b.available);
  tbody.innerHTML = "";
  if (borrowed.length === 0) { msg.style.display = "block"; return; }
  msg.style.display = "none";
  borrowed.forEach(book => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${book.title}</b></td>
      <td>${book.author}</td>
      <td>${book.borrowedBy || "—"}</td>
      <td>${book.borrowedByEmail || "—"}</td>
      <td>${book.borrowedAt || "—"}</td>
      <td><span class="badge-active">Active</span></td>`;
    tbody.appendChild(tr);
  });
}

// ===== REQUESTS =====
async function renderRequests() {
  const snap     = await getDocs(collection(db, "requests"));
  const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  _renderBorrowRequests(requests.filter(r => r.type === "borrow" && r.status === "pending"));
  _renderReturnRequests(requests.filter(r => r.type === "return" && r.status === "pending"));
}

function _renderBorrowRequests(pending) {
  const list = document.getElementById("borrowRequestsList");
  const msg  = document.getElementById("noBorrowReqs");
  if (pending.length === 0) { list.innerHTML = ""; msg.style.display = "block"; return; }
  msg.style.display = "none";
  list.innerHTML = pending.map(r => `
    <div class="request-card">
      <div class="request-info">
        <div class="request-book">📖 ${r.bookTitle}</div>
        <div class="request-student">👤 ${r.studentName} (${r.studentEmail})</div>
        <div class="request-time">🕐 Requested: ${r.requestedAt}</div>
      </div>
      <div class="request-actions">
        <button class="btn-approve" onclick="approveBorrow('${r.id}')">✅ Approve</button>
        <button class="btn-reject"  onclick="rejectRequest('${r.id}')">❌ Reject</button>
      </div>
    </div>`).join("");
}

function _renderReturnRequests(pending) {
  const list = document.getElementById("returnRequestsList");
  const msg  = document.getElementById("noReturnReqs");
  if (pending.length === 0) { list.innerHTML = ""; msg.style.display = "block"; return; }
  msg.style.display = "none";
  list.innerHTML = pending.map(r => `
    <div class="request-card">
      <div class="request-info">
        <div class="request-book">📖 ${r.bookTitle}</div>
        <div class="request-student">👤 ${r.studentName} (${r.studentEmail})</div>
        <div class="request-time">🕐 Requested: ${r.requestedAt}</div>
      </div>
      <div class="request-actions">
        <button class="btn-approve" onclick="approveReturn('${r.id}')">✅ Confirm Return</button>
        <button class="btn-reject"  onclick="rejectRequest('${r.id}')">❌ Reject</button>
      </div>
    </div>`).join("");
}

window.approveBorrow = async function (reqId) {
  const reqRef = doc(db, "requests", reqId);
  const reqDoc = await getDoc(reqRef);
  if (!reqDoc.exists()) return;
  const req = reqDoc.data();

  const bookRef = doc(db, "books", req.bookId);
  const bookDoc = await getDoc(bookRef);
  if (!bookDoc.exists() || !bookDoc.data().available) {
    showToast("❌ Book is no longer available.", "error");
    await updateDoc(reqRef, { status: "rejected" });
    renderRequests();
    return;
  }
  const now = nowStr();
  await updateDoc(bookRef, {
    available: false, borrowedBy: req.studentName,
    borrowedByEmail: req.studentEmail, borrowedAt: now
  });
  await addDoc(collection(db, "historyLog"), {
    bookId: req.bookId, bookTitle: req.bookTitle,
    bookAuthor: bookDoc.data().author, genre: bookDoc.data().genre,
    studentName: req.studentName, studentEmail: req.studentEmail,
    borrowedAt: now, returnedAt: null, status: "active"
  });
  await updateDoc(reqRef, { status: "approved" });

  // Send notification to student
  const studentSnap = await getDocs(query(collection(db, "users"), where("email", "==", req.studentEmail)));
  if (!studentSnap.empty) {
    const stuUid = studentSnap.docs[0].id;
    await addDoc(collection(db, "notifications"), {
      toUid: stuUid, toEmail: req.studentEmail, toName: req.studentName,
      title: "📗 Borrow Approved!",
      message: `Your request to borrow "${req.bookTitle}" has been approved. Please remember to return it on time.`,
      type: "borrow_approved", read: false, sentAt: nowStr(),
      sentByName: currentUserData.name
    });
  }

  showToast(`✅ Borrow approved for "${req.bookTitle}".`);
  renderRequests();
};

window.approveReturn = async function (reqId) {
  const reqRef = doc(db, "requests", reqId);
  const reqDoc = await getDoc(reqRef);
  if (!reqDoc.exists()) return;
  const req = reqDoc.data();
  const now = nowStr();

  const logSnap = await getDocs(query(
    collection(db, "historyLog"),
    where("bookId", "==", req.bookId),
    where("studentEmail", "==", req.studentEmail),
    where("status", "==", "active")
  ));
  for (const logDoc of logSnap.docs) {
    await updateDoc(doc(db, "historyLog", logDoc.id), { returnedAt: now, status: "returned" });
  }
  await updateDoc(doc(db, "books", req.bookId), {
    available: true, borrowedBy: null, borrowedByEmail: null, borrowedAt: null
  });
  await updateDoc(reqRef, { status: "returned" });

  // Notify student
  const studentSnap = await getDocs(query(collection(db, "users"), where("email", "==", req.studentEmail)));
  if (!studentSnap.empty) {
    const stuUid = studentSnap.docs[0].id;
    await addDoc(collection(db, "notifications"), {
      toUid: stuUid, toEmail: req.studentEmail, toName: req.studentName,
      title: "📘 Return Confirmed",
      message: `Your return of "${req.bookTitle}" has been confirmed. Thank you!`,
      type: "return_confirmed", read: false, sentAt: nowStr(),
      sentByName: currentUserData.name
    });
  }

  showToast(`✅ Return confirmed for "${req.bookTitle}".`);
  renderRequests();
};

window.rejectRequest = async function (reqId) {
  await updateDoc(doc(db, "requests", reqId), { status: "rejected" });
  showToast("Request rejected.", "error");
  renderRequests();
};

// ===== USERS PAGE (ADMIN) =====
async function renderUsersPage() {
  const container = document.getElementById("usersContainer");
  container.innerHTML = `<div class="loading-msg">Loading students...</div>`;
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
  const students = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

  if (students.length === 0) {
    container.innerHTML = `<div class="empty-msg">No student accounts found.</div>`;
    return;
  }

  // For each student, get their borrowed count
  const booksSnap = await getDocs(collection(db, "books"));
  const books     = booksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  container.innerHTML = "";
  for (const stu of students) {
    const borrowedBooks = books.filter(b => !b.available && b.borrowedByEmail === stu.email);
    const histSnap      = await getDocs(query(
      collection(db, "historyLog"), where("studentEmail", "==", stu.email)
    ));
    const totalBorrowed = histSnap.size;
    const onlineClass   = stu.online ? "status-dot-online" : "status-dot-offline";
    const onlineLabel   = stu.online ? "🟢 Online" : "⚫ Offline";
    const lastSeen      = stu.lastSeen?.toDate?.()
      ? stu.lastSeen.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";

    const borrowedList = borrowedBooks.length > 0
      ? borrowedBooks.map(b => `<span class="user-book-tag">📖 ${b.title} <span class="book-since">(since ${b.borrowedAt})</span></span>`).join("")
      : `<span class="no-books-tag">No books currently held</span>`;

    const card = document.createElement("div");
    card.className = "user-card";
    card.innerHTML = `
      <div class="user-card-header">
        <div class="user-card-avatar">${stu.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2)}</div>
        <div class="user-card-info">
          <div class="user-card-name">${stu.name}</div>
          <div class="user-card-email">${stu.email}</div>
          <div class="user-card-meta">
            <span class="${onlineClass}">${onlineLabel}</span>
            <span class="user-card-sep">·</span>
            <span>Last seen: ${stu.online ? "Now" : lastSeen}</span>
          </div>
        </div>
        <div class="user-card-actions">
          <button class="btn-notify-user" onclick="openNotifyModal('${stu.uid}', '${stu.name}', '${stu.email}')">🔔 Notify</button>
        </div>
      </div>
      <div class="user-card-details">
        <div class="user-detail-row"><span class="detail-label">📍 Address</span><span>${stu.address || "—"}</span></div>
        <div class="user-detail-row"><span class="detail-label">📞 Contact</span><span>${stu.contact || "—"}</span></div>
        <div class="user-detail-row"><span class="detail-label">📅 Joined</span><span>${stu.createdAt?.toDate?.() ? stu.createdAt.toDate().toLocaleDateString("en-US", {year:"numeric",month:"short",day:"numeric"}) : "—"}</span></div>
        <div class="user-detail-row"><span class="detail-label">📚 Total Borrowed</span><span>${totalBorrowed} books</span></div>
      </div>
      <div class="user-books-section">
        <div class="user-books-label">Currently Holding:</div>
        <div class="user-books-list">${borrowedList}</div>
      </div>`;
    container.appendChild(card);
  }
}

// ===== NOTIFY MODAL =====
window.openNotifyModal = function (uid, name, email) {
  document.getElementById("notifyTargetUid").value   = uid;
  document.getElementById("notifyTargetName").value  = name;
  document.getElementById("notifyTargetEmail").value = email;
  document.getElementById("notifyRecipientLabel").textContent = `To: ${name} (${email})`;
  document.getElementById("notifyTitle").value   = "";
  document.getElementById("notifyMessage").value = "";
  document.getElementById("notifyModal").style.display = "flex";
};
window.closeNotifyModal = function () {
  document.getElementById("notifyModal").style.display = "none";
};

// Quick-fill notification templates
window.fillNotifyTemplate = function (type) {
  const titleEl = document.getElementById("notifyTitle");
  const msgEl   = document.getElementById("notifyMessage");
  if (type === "overdue") {
    titleEl.value = "⚠️ Overdue Book Reminder";
    msgEl.value   = "This is a reminder that you have a book that is overdue for return. Please return it to the library as soon as possible to avoid penalties.";
  } else if (type === "return") {
    titleEl.value = "📥 Please Return Your Book";
    msgEl.value   = "The book you borrowed is due for return. Kindly bring it back to the library at your earliest convenience. Thank you!";
  } else if (type === "welcome") {
    titleEl.value = "👋 Welcome to SMARTLIB!";
    msgEl.value   = "Welcome to the SMARTLIB library system! Feel free to browse our collection and request books. Remember to return them on time. Happy reading!";
  }
};

window.sendNotification = async function () {
  const uid   = document.getElementById("notifyTargetUid").value;
  const name  = document.getElementById("notifyTargetName").value;
  const email = document.getElementById("notifyTargetEmail").value;
  const title = document.getElementById("notifyTitle").value.trim();
  const msg   = document.getElementById("notifyMessage").value.trim();
  if (!title || !msg) { showToast("Please fill in both title and message.", "error"); return; }

  await addDoc(collection(db, "notifications"), {
    toUid: uid, toEmail: email, toName: name,
    title, message: msg,
    type: "admin_message", read: false, sentAt: nowStr(),
    sentByName: currentUserData.name
  });
  window.closeNotifyModal();
  showToast(`🔔 Notification sent to ${name}!`);
};

// ===== NOTIFICATIONS PAGE (STUDENT) =====
async function renderNotifications() {
  const list   = document.getElementById("notifList");
  const empty  = document.getElementById("noNotifMsg");
  list.innerHTML = "";

  const snap = await getDocs(query(
    collection(db, "notifications"),
    where("toUid", "==", currentUserData.uid)
  ));
  const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""));

  if (notifs.length === 0) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  // Mark all as read
  for (const n of notifs.filter(n => !n.read)) {
    await updateDoc(doc(db, "notifications", n.id), { read: true });
  }
  _updateNotifBadge();

  notifs.forEach(n => {
    const card = document.createElement("div");
    card.className = "notif-card" + (n.read ? "" : " notif-unread");
    card.innerHTML = `
      <div class="notif-icon">${n.type === "borrow_approved" ? "📗" : n.type === "return_confirmed" ? "📘" : "🔔"}</div>
      <div class="notif-body">
        <div class="notif-title">${n.title}</div>
        <div class="notif-msg">${n.message}</div>
        <div class="notif-meta">From: ${n.sentByName || "Library Admin"} · ${n.sentAt}</div>
      </div>`;
    list.appendChild(card);
  });
}

// ===== BORROW MODAL =====
window.openBorrowModal = async function (bookId) {
  const bookDoc = await getDoc(doc(db, "books", bookId));
  if (!bookDoc.exists() || !bookDoc.data().available) return;
  borrowingBookId = bookId;
  document.getElementById("modalBookTitle").textContent = bookDoc.data().title;
  document.getElementById("modalUserName").textContent  = currentUserData.name;
  document.getElementById("borrowModal").style.display  = "flex";
};
window.closeBorrowModal = function () {
  document.getElementById("borrowModal").style.display = "none";
  borrowingBookId = null;
};
window.confirmBorrowRequest = async function () {
  if (!borrowingBookId) return;
  const bookDoc = await getDoc(doc(db, "books", borrowingBookId));
  if (!bookDoc.exists()) return;
  const book = bookDoc.data();
  await addDoc(collection(db, "requests"), {
    type: "borrow", bookId: borrowingBookId, bookTitle: book.title,
    studentName: currentUserData.name, studentEmail: currentUserData.email,
    requestedAt: nowStr(), status: "pending"
  });
  window.closeBorrowModal();
  showToast("📬 Borrow request sent! Awaiting admin approval.");
};

// ===== RETURN MODAL =====
window.openReturnModal = async function (bookId) {
  const bookDoc = await getDoc(doc(db, "books", bookId));
  if (!bookDoc.exists()) return;
  returningBookId = bookId;
  document.getElementById("returnModalBookTitle").textContent = bookDoc.data().title;
  document.getElementById("returnModal").style.display = "flex";
};
window.closeReturnModal = function () {
  document.getElementById("returnModal").style.display = "none";
  returningBookId = null;
};
window.confirmReturnRequest = async function () {
  if (!returningBookId) return;
  const bookDoc = await getDoc(doc(db, "books", returningBookId));
  if (!bookDoc.exists()) return;
  const book = bookDoc.data();
  await addDoc(collection(db, "requests"), {
    type: "return", bookId: returningBookId, bookTitle: book.title,
    studentName: currentUserData.name, studentEmail: currentUserData.email,
    requestedAt: nowStr(), status: "pending"
  });
  window.closeReturnModal();
  showToast("📬 Return request sent! Awaiting admin confirmation.");
};

// ===== ADD BOOK =====
window.addBook = async function () {
  const title  = document.getElementById("newTitle").value.trim();
  const author = document.getElementById("newAuthor").value.trim();
  const genre  = document.getElementById("newGenre").value.trim();
  const year   = parseInt(document.getElementById("newYear").value.trim());
  const desc   = document.getElementById("newDesc").value.trim();
  const msg    = document.getElementById("addBookMsg");

  if (!title || !author || !genre || !year) {
    msg.style.color = "var(--red)";
    msg.textContent = "⚠️ Please fill in all required fields.";
    return;
  }
  await addDoc(collection(db, "books"), {
    title, author, genre, year, desc,
    available: true, borrowedBy: null, borrowedByEmail: null, borrowedAt: null
  });
  msg.style.color = "var(--green)";
  msg.textContent = `✅ "${title}" has been added successfully!`;
  ["newTitle","newAuthor","newGenre","newYear","newDesc"].forEach(id => {
    document.getElementById(id).value = "";
  });
  setTimeout(() => msg.textContent = "", 3000);
};

// ===== DELETE BOOK =====
window.deleteBook = async function (bookId) {
  const bookDoc = await getDoc(doc(db, "books", bookId));
  if (!bookDoc.exists()) return;
  const title = bookDoc.data().title;
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, "books", bookId));
  showToast(`🗑️ "${title}" deleted.`, "error");
};

// ===== HISTORY =====
async function renderHistory() {
  const tbody = document.getElementById("historyTableBody");
  const msg   = document.getElementById("noHistoryMsg");
  const snap  = await getDocs(query(
    collection(db, "historyLog"),
    where("studentEmail", "==", currentUserData.email)
  ));
  const myLog    = snap.docs.map(d => d.data());
  const total    = myLog.length;
  const returned = myLog.filter(h => h.status === "returned").length;
  const active   = myLog.filter(h => h.status === "active").length;

  document.getElementById("histTotal").textContent    = total;
  document.getElementById("histReturned").textContent = returned;
  document.getElementById("histActive").textContent   = active;

  tbody.innerHTML = "";
  if (total === 0) { msg.style.display = "block"; return; }
  msg.style.display = "none";

  myLog.slice().reverse().forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${h.bookTitle}</b></td>
      <td>${h.bookAuthor}</td>
      <td>${h.genre}</td>
      <td>${h.borrowedAt}</td>
      <td>${h.returnedAt || "—"}</td>
      <td>${h.status === "active"
        ? `<span class="badge-active">Active</span>`
        : `<span class="badge-returned">Returned</span>`}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== SETTINGS =====
function renderSettings() {
  const initials = currentUserData.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  document.getElementById("settingsAvatar").textContent = initials;
  document.getElementById("settingsName").textContent   = currentUserData.name;
  document.getElementById("settingsEmail").textContent  = currentUserData.email;
  if (document.getElementById("settingsAddress"))
    document.getElementById("settingsAddress").textContent = currentUserData.address || "—";
  if (document.getElementById("settingsContact"))
    document.getElementById("settingsContact").textContent = currentUserData.contact || "—";
  const badge = document.getElementById("settingsRoleBadge");
  badge.textContent = currentUserData.role === "admin" ? "🏛️ Library Admin" : "🎓 Student";
  badge.className   = "settings-role-badge " + (currentUserData.role === "admin" ? "pill-admin" : "pill-student");
  applyTheme(currentTheme);
}

// ===== TABS =====
window.switchTab = function (tabId, btn) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + tabId).classList.add("active");
  btn.classList.add("active");
};

// ===== FUZZY SEARCH =====
function _fuzzyMatch(str, q) {
  str = str.toLowerCase(); q = q.toLowerCase();
  let si = 0, qi = 0;
  while (si < str.length && qi < q.length) { if (str[si] === q[qi]) qi++; si++; }
  return qi === q.length;
}

window.fuzzySearch = async function () {
  const q        = document.getElementById("searchInput").value.trim();
  const dropdown = document.getElementById("searchDropdown");
  const snap     = await getDocs(collection(db, "books"));
  const allBooks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (!q) { dropdown.classList.remove("open"); renderBooks(allBooks); return; }

  const results = allBooks.filter(b =>
    _fuzzyMatch(b.title, q) || _fuzzyMatch(b.author, q) || _fuzzyMatch(b.genre, q)
  );
  renderBooks(results);
  dropdown.innerHTML = "";

  if (results.length === 0) {
    dropdown.innerHTML = `<div class="search-result-item"><div class="result-title" style="color:var(--gray)">No results found</div></div>`;
    dropdown.classList.add("open");
    return;
  }
  results.slice(0, 5).forEach(book => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.innerHTML = `
      <div>
        <div class="result-title">${book.title}</div>
        <div class="result-author">${book.author} · ${book.genre}</div>
      </div>
      <span class="status-badge ${book.available ? "status-available" : "status-borrowed"}" style="font-size:10px;">
        ${book.available ? "Available" : "Borrowed"}
      </span>`;
    item.onclick = () => {
      document.getElementById("searchInput").value = book.title;
      renderBooks([book]);
      dropdown.classList.remove("open");
    };
    dropdown.appendChild(item);
  });
  dropdown.classList.add("open");
};

// ===== SEED SAMPLE DATA =====
window.seedSampleData = async function () {
  const books = [
    { title: "The Great Gatsby",                      author: "F. Scott Fitzgerald", genre: "Classic Fiction", year: 1925, desc: "A story of wealth, class, love and idealism in the Jazz Age." },
    { title: "To Kill a Mockingbird",                 author: "Harper Lee",          genre: "Drama",           year: 1960, desc: "A powerful story of racial injustice and loss of innocence." },
    { title: "1984",                                  author: "George Orwell",       genre: "Dystopian",       year: 1949, desc: "A chilling vision of a totalitarian future society." },
    { title: "Harry Potter and the Sorcerer's Stone", author: "J.K. Rowling",        genre: "Fantasy",         year: 1997, desc: "The beginning of the magical journey of the boy who lived." },
    { title: "The Alchemist",                         author: "Paulo Coelho",        genre: "Adventure",       year: 1988, desc: "A philosophical novel about following one's dreams." },
    { title: "Sapiens",                               author: "Yuval Noah Harari",   genre: "Non-Fiction",     year: 2011, desc: "A brief history of humankind from Stone Age to present." },
    { title: "Atomic Habits",                         author: "James Clear",         genre: "Self-Help",       year: 2018, desc: "A guide to building good habits and breaking bad ones." },
    { title: "The Hobbit",                            author: "J.R.R. Tolkien",      genre: "Fantasy",         year: 1937, desc: "A fantasy novel about the quest of Bilbo Baggins." },
  ];
  for (const b of books) {
    await addDoc(collection(db, "books"), {
      ...b, available: true, borrowedBy: null, borrowedByEmail: null, borrowedAt: null
    });
  }
  console.log("✅ Sample books seeded!");
};

// ===== CLOSE DROPDOWNS / MODAL BACKDROPS =====
document.addEventListener("click", e => {
  const searchBox = document.querySelector(".search-box");
  if (searchBox && !searchBox.contains(e.target)) {
    document.getElementById("searchDropdown").classList.remove("open");
  }
});
document.getElementById("borrowModal").addEventListener("click", function (e) {
  if (e.target === this) window.closeBorrowModal();
});
document.getElementById("returnModal").addEventListener("click", function (e) {
  if (e.target === this) window.closeReturnModal();
});
document.getElementById("notifyModal").addEventListener("click", function (e) {
  if (e.target === this) window.closeNotifyModal();
});

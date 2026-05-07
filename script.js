/* =============================================
   PRODUCT MANAGER — script.js
   Firebase Auth + per-user Firestore + Recycle Bin
   ============================================= */
'use strict';

import { db, auth } from './firebase.js';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ─── State ─── */
let products        = [];
let deletedProducts = [];
let editingId       = null;
let pendingDeleteId = null;
let currentImageData = null;
let activeView      = 'products';
let unsubProducts   = null;
let unsubRecycle    = null;

/* ─── DOM — Shell ─── */
const authScreen    = document.getElementById('authScreen');
const appWrapper    = document.getElementById('appWrapper');

/* ─── DOM — Auth ─── */
const tabSignIn     = document.getElementById('tabSignIn');
const tabSignUp     = document.getElementById('tabSignUp');
const signInForm    = document.getElementById('signInForm');
const signUpForm    = document.getElementById('signUpForm');
const signInError   = document.getElementById('signInError');
const signUpError   = document.getElementById('signUpError');
const signInBtn     = document.getElementById('signInBtn');
const signUpBtn     = document.getElementById('signUpBtn');
const signOutBtn    = document.getElementById('signOutBtn');

/* ─── DOM — Sidebar ─── */
const sidebar         = document.getElementById('sidebar');
const sidebarOverlay  = document.getElementById('sidebarOverlay');
const sidebarToggle   = document.getElementById('sidebarToggle');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
const navProducts     = document.getElementById('navProducts');
const navRecycle      = document.getElementById('navRecycle');
const recycleBadge    = document.getElementById('recycleBadge');
const userEmailEl     = document.getElementById('userEmail');
const userAvatarEl    = document.getElementById('userAvatar');

/* ─── DOM — App ─── */
const grid          = document.getElementById('productsGrid');
const recycleGrid   = document.getElementById('recycleGrid');
const productCount  = document.getElementById('productCount');
const searchInput   = document.getElementById('searchInput');
const addProductBtn = document.getElementById('addProductBtn');
const emptyBinBtn   = document.getElementById('emptyBinBtn');
const viewProducts  = document.getElementById('viewProducts');
const viewRecycle   = document.getElementById('viewRecycle');

/* ─── DOM — Modal ─── */
const modalOverlay  = document.getElementById('modalOverlay');
const modalTitle    = document.getElementById('modalTitle');
const modalForm     = document.getElementById('productForm');
const titleInput    = document.getElementById('productTitle');
const descInput     = document.getElementById('productDesc');
const fileInput     = document.getElementById('imageFile');
const uploadZone    = document.getElementById('uploadZone');
const previewWrap   = document.getElementById('imagePreviewWrap');
const previewImg    = document.getElementById('imagePreview');
const submitBtn     = document.getElementById('submitBtn');

/* ─── DOM — Confirm ─── */
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmYes     = document.getElementById('confirmYes');
const confirmNo      = document.getElementById('confirmNo');

/* ─── DOM — Toast ─── */
const toastContainer = document.getElementById('toastContainer');

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function showToast(message, type = 'success', duration = 3000) {
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ═══════════════════════════════════════════
   AUTH — Tab switching
═══════════════════════════════════════════ */
function switchTab(tab) {
  const isSignIn = tab === 'signIn';
  tabSignIn.classList.toggle('active', isSignIn);
  tabSignUp.classList.toggle('active', !isSignIn);
  signInForm.classList.toggle('hidden', !isSignIn);
  signUpForm.classList.toggle('hidden', isSignIn);
}
tabSignIn.addEventListener('click', () => switchTab('signIn'));
tabSignUp.addEventListener('click', () => switchTab('signUp'));

/* ─── Password toggle ─── */
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const show  = input.type === 'password';
    input.type  = show ? 'text' : 'password';
    btn.innerHTML = show
      ? '<i class="fas fa-eye-slash"></i>'
      : '<i class="fas fa-eye"></i>';
  });
});

/* ─── Sign In ─── */
signInForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  signInError.textContent = '';
  const email    = document.getElementById('siEmail').value.trim();
  const password = document.getElementById('siPassword').value;
  if (!email || !password) { signInError.textContent = 'Please fill in all fields.'; return; }
  setAuthLoading(signInBtn, true, '<i class="fas fa-spinner fa-spin"></i> Signing in…');
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    signInError.textContent = friendlyAuthError(err.code);
    setAuthLoading(signInBtn, false, '<i class="fas fa-sign-in-alt"></i> Sign In');
  }
});

/* ─── Sign Up ─── */
signUpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  signUpError.textContent = '';
  const email    = document.getElementById('suEmail').value.trim();
  const password = document.getElementById('suPassword').value;
  const confirm  = document.getElementById('suConfirm').value;
  if (!email || !password || !confirm) { signUpError.textContent = 'Please fill in all fields.'; return; }
  if (password !== confirm)            { signUpError.textContent = 'Passwords do not match.'; return; }
  if (password.length < 6)             { signUpError.textContent = 'Password must be at least 6 characters.'; return; }
  setAuthLoading(signUpBtn, true, '<i class="fas fa-spinner fa-spin"></i> Creating account…');
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    signUpError.textContent = friendlyAuthError(err.code);
    setAuthLoading(signUpBtn, false, '<i class="fas fa-user-plus"></i> Create Account');
  }
});

/* ─── Sign Out ─── */
signOutBtn.addEventListener('click', async () => {
  await signOut(auth);
  showToast('Signed out successfully.', 'info');
});

function setAuthLoading(btn, loading, html) {
  btn.disabled   = loading;
  btn.innerHTML  = html;
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':      'No account found with this email.',
    'auth/wrong-password':      'Incorrect password.',
    'auth/invalid-email':       'Please enter a valid email address.',
    'auth/email-already-in-use':'An account with this email already exists.',
    'auth/weak-password':       'Password must be at least 6 characters.',
    'auth/too-many-requests':   'Too many attempts. Please try again later.',
    'auth/invalid-credential':  'Invalid email or password.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

/* ═══════════════════════════════════════════
   AUTH STATE — Show App / Auth Screen
═══════════════════════════════════════════ */
onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
  } else {
    teardownListeners();
    showAuthScreen();
  }
});

function showApp(user) {
  authScreen.classList.add('hidden');
  appWrapper.classList.remove('hidden');
  userAvatarEl.textContent = (user.email || 'U').charAt(0).toUpperCase();
  userEmailEl.textContent  = user.email;
  startListeners(user.uid);
}

function showAuthScreen() {
  appWrapper.classList.add('hidden');
  authScreen.classList.remove('hidden');
  signInForm.reset();
  signUpForm.reset();
  signInError.textContent = '';
  signUpError.textContent = '';
  setAuthLoading(signInBtn, false, '<i class="fas fa-sign-in-alt"></i> Sign In');
  setAuthLoading(signUpBtn, false, '<i class="fas fa-user-plus"></i> Create Account');
  products = [];
  deletedProducts = [];
}

function teardownListeners() {
  if (unsubProducts) { unsubProducts(); unsubProducts = null; }
}

/* ═══════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════ */
const openSidebar  = () => { sidebar.classList.add('open'); sidebarOverlay.classList.add('active'); document.body.style.overflow = 'hidden'; };
const closeSidebar = () => { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); document.body.style.overflow = ''; };

sidebarToggle.addEventListener('click',   openSidebar);
sidebarCloseBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click',  closeSidebar);

/* ═══════════════════════════════════════════
   VIEW SWITCHING
═══════════════════════════════════════════ */
function showView(view) {
  activeView = view;
  closeSidebar();
  const isProducts = view === 'products';
  viewProducts.classList.toggle('hidden', !isProducts);
  viewRecycle.classList.toggle('hidden', isProducts);
  navProducts.classList.toggle('active',  isProducts);
  navRecycle.classList.toggle('active',  !isProducts);
  addProductBtn.style.display = isProducts ? '' : 'none';
  if (isProducts) {
    updateCount();
    renderGrid(getFilteredList());
  } else {
    renderRecycleBin();
  }
}

navProducts.addEventListener('click', () => showView('products'));
navRecycle.addEventListener('click',  () => showView('recycle'));

/* ═══════════════════════════════════════════
   FIRESTORE — per-user subcollection
═══════════════════════════════════════════ */
function userCol(uid) {
  return collection(db, 'users', uid, 'products');
}

function startListeners(uid) {
  const col = userCol(uid);

  showLoadingState(grid);
  
  // Use a single query ordered by createdAt to avoid requiring composite indexes.
  // We will filter active vs deleted products on the client.
  const qAll = query(col, orderBy('createdAt', 'desc'));
  
  unsubProducts = onSnapshot(qAll, (snap) => {
    const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // 1. Active products
    products = allDocs.filter(p => p.deleted !== true);
    
    // 2. Deleted products (within last 30 days)
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    deletedProducts = allDocs.filter(p => {
      if (p.deleted !== true) return false;
      const ms = p.deletedAt?.toDate ? p.deletedAt.toDate().getTime() : 0;
      return ms > cutoff;
    });

    // Sort deleted products by deletedAt desc
    deletedProducts.sort((a, b) => {
      const msA = a.deletedAt?.toDate ? a.deletedAt.toDate().getTime() : 0;
      const msB = b.deletedAt?.toDate ? b.deletedAt.toDate().getTime() : 0;
      return msB - msA;
    });

    updateCount();
    updateRecycleBadge();
    
    if (activeView === 'products') {
      renderGrid(getFilteredList());
    } else {
      renderRecycleBin();
    }
  }, (err) => {
    console.error('Firestore listener error:', err);
    showToast('Could not load products. Check console for details.', 'error');
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-exclamation-triangle"></i></div><h3>Error loading products</h3><p>Could not connect to Firestore or missing index/permissions. Check browser console.</p></div>';
  });
}

/* ═══════════════════════════════════════════
   LOADING STATE
═══════════════════════════════════════════ */
function showLoadingState(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Connecting to Firestore…</p>
    </div>`;
}

/* ═══════════════════════════════════════════
   RENDER — Active Products
═══════════════════════════════════════════ */
function renderGrid(list = products) {
  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-box-open"></i></div>
        <h3>No products yet. Add one!</h3>
        <p>Click the <strong>+ Add New Product</strong> button to get started.</p>
        <button class="btn btn-primary" onclick="openAddModal()">
          <i class="fas fa-plus"></i> Add New Product
        </button>
      </div>`;
    return;
  }
  list.forEach(p => grid.appendChild(buildCard(p)));
}

function buildCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.dataset.id = product.id;

  const ts  = product.createdAt?.toDate ? product.createdAt.toDate() : new Date(product.createdAt || Date.now());
  const date = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const img  = product.image || generatePlaceholder(product.title);

  card.innerHTML = `
    <div class="card-image-wrap">
      <img src="${img}" alt="${escHtml(product.title)}" loading="lazy"
           onerror="this.src='${generatePlaceholder(product.title)}'">
      <button class="btn-edit" title="Edit" onclick="openEditModal('${product.id}')">
        <i class="fas fa-pen"></i>
      </button>
    </div>
    <div class="card-body">
      <div class="card-title">${escHtml(product.title)}</div>
      <div class="card-description">${escHtml(product.description)}</div>
    </div>
    <div class="card-footer">
      <span class="card-date"><i class="far fa-calendar"></i>${date}</span>
      <button class="btn-delete" title="Delete" onclick="requestDelete('${product.id}')">
        <i class="fas fa-trash-alt"></i> Delete
      </button>
    </div>`;
  return card;
}

/* ═══════════════════════════════════════════
   RENDER — Recycle Bin
═══════════════════════════════════════════ */
function renderRecycleBin() {
  recycleGrid.innerHTML = '';
  emptyBinBtn.style.display = deletedProducts.length ? '' : 'none';

  if (deletedProducts.length === 0) {
    recycleGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-check-circle"></i></div>
        <h3>Recycle bin is empty</h3>
        <p>Deleted products will appear here for 30 days.</p>
      </div>`;
    return;
  }
  deletedProducts.forEach(p => recycleGrid.appendChild(buildRecycleCard(p)));
}

function buildRecycleCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card recycle-card';
  card.dataset.id = product.id;

  const deletedMs  = product.deletedAt?.toDate ? product.deletedAt.toDate().getTime() : Date.now();
  const expiresMs  = deletedMs + 30 * 24 * 60 * 60 * 1000;
  const daysLeft   = Math.max(0, Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000)));
  const img        = product.image || generatePlaceholder(product.title);

  card.innerHTML = `
    <div class="card-image-wrap recycle-image-wrap">
      <img src="${img}" alt="${escHtml(product.title)}" loading="lazy"
           onerror="this.src='${generatePlaceholder(product.title)}'">
      <div class="recycle-overlay"></div>
      <span class="expiry-badge">
        <i class="fas fa-clock"></i> ${daysLeft}d left
      </span>
    </div>
    <div class="card-body">
      <div class="card-title">${escHtml(product.title)}</div>
      <div class="card-description">${escHtml(product.description)}</div>
    </div>
    <div class="card-footer recycle-footer">
      <button class="btn-restore" title="Restore" onclick="restoreProduct('${product.id}')">
        <i class="fas fa-trash-restore"></i> Restore
      </button>
      <button class="btn-perm-delete" title="Permanently delete" onclick="permanentDelete('${product.id}')">
        <i class="fas fa-times"></i> Delete Forever
      </button>
    </div>`;
  return card;
}

/* ═══════════════════════════════════════════
   CRUD — Add / Edit (Firestore)
═══════════════════════════════════════════ */
async function handleSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;
  const uid   = auth.currentUser?.uid;
  if (!uid) return;
  const title       = titleInput.value.trim();
  const description = descInput.value.trim();
  const image       = currentImageData || null;

  submitBtn.disabled = true;
  try {
    if (editingId) {
      await updateDoc(doc(db, 'users', uid, 'products', editingId), { title, description, image });
      closeModal();
      showToast('Product updated!', 'info');
    } else {
      await addDoc(userCol(uid), { title, description, image, deleted: false, createdAt: serverTimestamp() });
      closeModal();
      showToast('Product added!', 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to save. Check your connection.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

/* ─── Soft Delete → Recycle Bin ─── */
async function confirmDelete() {
  if (!pendingDeleteId) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const id = pendingDeleteId;
  closeConfirm();
  try {
    await updateDoc(doc(db, 'users', uid, 'products', id), {
      deleted: true,
      deletedAt: serverTimestamp()
    });
    showToast('Moved to Recycle Bin.', 'info');
  } catch (err) {
    console.error(err);
    showToast('Could not delete. Try again.', 'error');
  }
}

/* ─── Restore from Bin ─── */
async function restoreProduct(id) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'users', uid, 'products', id), { deleted: false, deletedAt: null });
    showToast('Product restored!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Could not restore.', 'error');
  }
}

/* ─── Permanent Delete ─── */
async function permanentDelete(id) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'products', id));
    showToast('Permanently deleted.', 'error');
  } catch (err) {
    console.error(err);
    showToast('Could not delete permanently.', 'error');
  }
}

/* ─── Empty Bin ─── */
emptyBinBtn.addEventListener('click', async () => {
  if (!deletedProducts.length) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await Promise.all(deletedProducts.map(p => deleteDoc(doc(db, 'users', uid, 'products', p.id))));
    showToast('Recycle bin emptied.', 'error');
  } catch (err) {
    console.error(err);
    showToast('Could not empty bin.', 'error');
  }
});

/* ═══════════════════════════════════════════
   CONFIRM DIALOG
═══════════════════════════════════════════ */
function requestDelete(id) {
  pendingDeleteId = id;
  confirmOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeConfirm() {
  pendingDeleteId = null;
  confirmOverlay.classList.remove('active');
  document.body.style.overflow = '';
}
confirmYes.addEventListener('click', confirmDelete);
confirmNo.addEventListener('click',  closeConfirm);
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) closeConfirm(); });

/* ═══════════════════════════════════════════
   MODAL
═══════════════════════════════════════════ */
function openAddModal() {
  editingId = null; currentImageData = null;
  modalTitle.textContent = 'Add New Product';
  submitBtn.innerHTML    = '<i class="fas fa-plus"></i> Add Product';
  resetForm(); openModal();
}

function openEditModal(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  editingId = id; currentImageData = product.image || null;
  modalTitle.textContent = 'Edit Product';
  submitBtn.innerHTML    = '<i class="fas fa-save"></i> Update Product';
  titleInput.value = product.title;
  descInput.value  = product.description;
  product.image ? showPreview(product.image) : hidePreview();
  clearErrors(); openModal();
}

function openModal()  { modalOverlay.classList.add('active');    document.body.style.overflow = 'hidden'; setTimeout(() => titleInput.focus(), 300); }
function closeModal() { modalOverlay.classList.remove('active'); document.body.style.overflow = ''; }
function resetForm()  { modalForm.reset(); currentImageData = null; hidePreview(); clearErrors(); }

addProductBtn.addEventListener('click', openAddModal);
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
modalForm.addEventListener('submit', handleSubmit);

/* ─── Form validation ─── */
function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.form-input,.form-textarea,.upload-zone').forEach(el => el.classList.remove('input-error'));
}
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}
function validateForm() {
  clearErrors(); let valid = true;
  if (!titleInput.value.trim()) { showError('titleError', '⚠ Product title is required.'); titleInput.focus(); valid = false; }
  if (!descInput.value.trim())  { showError('descError',  '⚠ Description is required.');  if (valid) descInput.focus(); valid = false; }
  return valid;
}

/* ═══════════════════════════════════════════
   IMAGE HANDLING
═══════════════════════════════════════════ */
function handleFileSelect(file) {
  if (!file?.type.startsWith('image/')) { showToast('Please select a valid image.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => { currentImageData = e.target.result; showPreview(currentImageData); };
  reader.readAsDataURL(file);
}
function showPreview(src) { previewImg.src = src; previewWrap.style.display = 'block'; uploadZone.style.display = 'none'; }
function hidePreview()    { previewImg.src = ''; previewWrap.style.display = 'none'; uploadZone.style.display = 'block'; fileInput.value = ''; }

fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFileSelect(fileInput.files[0]); });
uploadZone.addEventListener('dragover',  (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]); });
document.getElementById('previewRemove').addEventListener('click', (e) => { e.stopPropagation(); currentImageData = null; hidePreview(); });

/* ═══════════════════════════════════════════
   SEARCH + COUNT + BADGE
═══════════════════════════════════════════ */
function getFilteredList() {
  const q = searchInput.value.trim().toLowerCase();
  return q ? products.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) : products;
}
function updateCount() {
  productCount.textContent = `${products.length} ${products.length === 1 ? 'Product' : 'Products'}`;
}
function updateRecycleBadge() {
  recycleBadge.textContent = deletedProducts.length;
  recycleBadge.classList.toggle('hidden', deletedProducts.length === 0);
}
searchInput.addEventListener('input', () => renderGrid(getFilteredList()));

/* ═══════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (confirmOverlay.classList.contains('active')) closeConfirm();
    else if (modalOverlay.classList.contains('active')) closeModal();
    else closeSidebar();
  }
});

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function generatePlaceholder(title = 'P') {
  const colors = ['#7c6af7','#a78bfa','#6ee7b7','#fbbf24','#f472b6','#60a5fa'];
  const color  = colors[(title.charCodeAt(0) || 65) % colors.length];
  const letter = title.charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220">
    <rect width="400" height="220" fill="#f0f0f8"/>
    <rect width="400" height="220" fill="${color}" opacity="0.10"/>
    <circle cx="200" cy="110" r="48" fill="${color}" opacity="0.18"/>
    <text x="200" y="128" font-family="Inter,sans-serif" font-size="52" font-weight="700"
      fill="${color}" text-anchor="middle" opacity="0.85">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

/* ═══════════════════════════════════════════
   GLOBAL REFS (used in inline onclick attrs)
═══════════════════════════════════════════ */
window.openAddModal   = openAddModal;
window.openEditModal  = openEditModal;
window.requestDelete  = requestDelete;
window.restoreProduct = restoreProduct;
window.permanentDelete = permanentDelete;

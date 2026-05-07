/* =============================================
   PRODUCT MANAGER UI — script.js
   Firestore-powered (real-time sync)
   ============================================= */

'use strict';

import { db } from './firebase.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ──────────────────────────────────────────────
   State
────────────────────────────────────────────── */
let products    = [];          // live cache from Firestore
let editingId   = null;        // null = add mode, string = edit mode (Firestore doc ID)
let pendingDeleteId = null;    // for confirm dialog
let currentImageData = null;   // base64 data-URL

/* ──────────────────────────────────────────────
   DOM References
────────────────────────────────────────────── */
const grid            = document.getElementById('productsGrid');
const productCount    = document.getElementById('productCount');
const searchInput     = document.getElementById('searchInput');

// Modal
const modalOverlay    = document.getElementById('modalOverlay');
const modalTitle      = document.getElementById('modalTitle');
const modalForm       = document.getElementById('productForm');
const titleInput      = document.getElementById('productTitle');
const descInput       = document.getElementById('productDesc');
const fileInput       = document.getElementById('imageFile');
const uploadZone      = document.getElementById('uploadZone');
const previewWrap     = document.getElementById('imagePreviewWrap');
const previewImg      = document.getElementById('imagePreview');
const submitBtn       = document.getElementById('submitBtn');

// Confirm dialog
const confirmOverlay  = document.getElementById('confirmOverlay');
const confirmYes      = document.getElementById('confirmYes');
const confirmNo       = document.getElementById('confirmNo');

// Toast
const toastContainer  = document.getElementById('toastContainer');

/* ──────────────────────────────────────────────
   Toast Notifications
────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   Loading State
────────────────────────────────────────────── */
function showLoadingState() {
  grid.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Connecting to Firestore…</p>
    </div>`;
}

/* ──────────────────────────────────────────────
   Render Grid
────────────────────────────────────────────── */
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

  list.forEach(product => {
    const card = buildCard(product);
    grid.appendChild(card);
  });
}

/* ──────────────────────────────────────────────
   Build Card Element
────────────────────────────────────────────── */
function buildCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.dataset.id = product.id;

  // createdAt may be a Firestore Timestamp or an ISO string
  let dateStr = '';
  if (product.createdAt) {
    const ts = product.createdAt.toDate ? product.createdAt.toDate() : new Date(product.createdAt);
    dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const imgSrc = product.image || generatePlaceholder(product.title);

  card.innerHTML = `
    <div class="card-image-wrap">
      <img src="${imgSrc}" alt="${escHtml(product.title)}" loading="lazy"
           onerror="this.src='${generatePlaceholder(product.title)}'">
      <button class="btn-edit" title="Edit product" onclick="openEditModal('${product.id}')">
        <i class="fas fa-pen"></i>
      </button>
    </div>
    <div class="card-body">
      <div class="card-title">${escHtml(product.title)}</div>
      <div class="card-description">${escHtml(product.description)}</div>
    </div>
    <div class="card-footer">
      <span class="card-date"><i class="far fa-calendar"></i>${dateStr}</span>
      <button class="btn-delete" title="Delete product" onclick="requestDelete('${product.id}')">
        <i class="fas fa-trash-alt"></i> Delete
      </button>
    </div>`;

  return card;
}

/* ──────────────────────────────────────────────
   Placeholder SVG (no image uploaded)
────────────────────────────────────────────── */
function generatePlaceholder(title) {
  const colors = ['#7c6af7', '#a78bfa', '#6ee7b7', '#fbbf24', '#f472b6', '#60a5fa'];
  const hue = (title.charCodeAt(0) || 65) % colors.length;
  const color = colors[hue];
  const letter = (title || 'P').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220">
    <rect width="400" height="220" fill="#f0f0f8"/>
    <rect x="0" y="0" width="400" height="220" fill="${color}" opacity="0.10"/>
    <circle cx="200" cy="110" r="48" fill="${color}" opacity="0.18"/>
    <text x="200" y="128" font-family="Inter,sans-serif" font-size="52" font-weight="700"
      fill="${color}" text-anchor="middle" opacity="0.85">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ──────────────────────────────────────────────
   HTML Escape
────────────────────────────────────────────── */
function escHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ──────────────────────────────────────────────
   Update Badge Count
────────────────────────────────────────────── */
function updateCount() {
  productCount.textContent = `${products.length} ${products.length === 1 ? 'Product' : 'Products'}`;
}

/* ──────────────────────────────────────────────
   Modal — Open / Close
────────────────────────────────────────────── */
function openAddModal() {
  editingId = null;
  currentImageData = null;
  modalTitle.textContent = 'Add New Product';
  submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add Product';
  resetForm();
  openModal();
}

function openEditModal(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  editingId = id;
  currentImageData = product.image || null;
  modalTitle.textContent = 'Edit Product';
  submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Product';

  titleInput.value = product.title;
  descInput.value  = product.description;

  if (product.image) {
    showPreview(product.image);
  } else {
    hidePreview();
  }

  clearErrors();
  openModal();
}

function openModal() {
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => titleInput.focus(), 300);
}

function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

/* ──────────────────────────────────────────────
   Form Reset & Validation
────────────────────────────────────────────── */
function resetForm() {
  modalForm.reset();
  currentImageData = null;
  hidePreview();
  clearErrors();
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.form-input, .form-textarea, .upload-zone')
    .forEach(el => el.classList.remove('input-error'));
}

function showError(fieldId, message) {
  const err = document.getElementById(fieldId);
  if (err) {
    err.textContent = message;
    err.classList.add('show');
  }
}

function validateForm() {
  clearErrors();
  let valid = true;

  if (!titleInput.value.trim()) {
    showError('titleError', '⚠ Product title is required.');
    titleInput.focus();
    valid = false;
  }

  if (!descInput.value.trim()) {
    if (valid) descInput.focus();
    showError('descError', '⚠ Description is required.');
    valid = false;
  }

  return valid;
}

/* ──────────────────────────────────────────────
   Image Handling
────────────────────────────────────────────── */
function handleFileSelect(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageData = e.target.result;   // base64
    showPreview(currentImageData);
  };
  reader.readAsDataURL(file);
}

function showPreview(src) {
  previewImg.src = src;
  previewWrap.style.display = 'block';
  uploadZone.style.display = 'none';
}

function hidePreview() {
  previewImg.src = '';
  previewWrap.style.display = 'none';
  uploadZone.style.display = 'block';
  fileInput.value = '';
}

/* ──────────────────────────────────────────────
   Firestore CRUD
────────────────────────────────────────────── */
const productsCol = collection(db, 'products');

async function handleSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const title       = titleInput.value.trim();
  const description = descInput.value.trim();
  const image       = currentImageData || null;

  // Disable submit button to prevent double-click
  submitBtn.disabled = true;

  try {
    if (editingId) {
      // ── Edit Mode ──
      await updateDoc(doc(db, 'products', editingId), { title, description, image });
      closeModal();
      showToast('Product updated successfully!', 'info');
    } else {
      // ── Add Mode ──
      await addDoc(productsCol, {
        title,
        description,
        image,
        createdAt: serverTimestamp()
      });
      closeModal();
      showToast('Product added successfully!', 'success');
    }
  } catch (err) {
    console.error('Firestore write error:', err);
    showToast('Failed to save. Check your connection.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

/* ──────────────────────────────────────────────
   Delete with Confirm Dialog
────────────────────────────────────────────── */
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

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const idToDelete = pendingDeleteId;
  closeConfirm();
  try {
    await deleteDoc(doc(db, 'products', idToDelete));
    showToast('Product deleted.', 'error');
  } catch (err) {
    console.error('Firestore delete error:', err);
    showToast('Failed to delete. Check your connection.', 'error');
  }
}

/* ──────────────────────────────────────────────
   Search / Filter
────────────────────────────────────────────── */
function getFilteredList() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return products;
  return products.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q)
  );
}

/* ──────────────────────────────────────────────
   Event Listeners
────────────────────────────────────────────── */

// Open modal
document.getElementById('addProductBtn').addEventListener('click', openAddModal);

// Close modal (X button)
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);

// Cancel button
document.getElementById('cancelBtn').addEventListener('click', closeModal);

// Click outside modal to close
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Form submit
modalForm.addEventListener('submit', handleSubmit);

// File input
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

// Drag & drop on upload zone
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

// Remove preview
document.getElementById('previewRemove').addEventListener('click', (e) => {
  e.stopPropagation();
  currentImageData = null;
  hidePreview();
});

// Confirm dialog buttons
confirmYes.addEventListener('click', confirmDelete);
confirmNo.addEventListener('click', closeConfirm);
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirm();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (confirmOverlay.classList.contains('active')) closeConfirm();
    else if (modalOverlay.classList.contains('active')) closeModal();
  }
});

// Search
searchInput.addEventListener('input', () => renderGrid(getFilteredList()));

// Expose helpers for inline onclick attributes in rendered cards
window.openAddModal  = openAddModal;
window.openEditModal = openEditModal;
window.requestDelete = requestDelete;

/* ──────────────────────────────────────────────
   Initialise — Real-time Firestore listener
────────────────────────────────────────────── */
(function init() {
  showLoadingState();

  const q = query(productsCol, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snapshot) => {
    products = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    updateCount();
    renderGrid(getFilteredList());
  }, (err) => {
    console.error('Firestore listener error:', err);
    showToast('Could not connect to Firestore. Check console.', 'error');
    renderGrid([]);
  });
})();

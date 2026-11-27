
"use strict";

/* E-BORROW - GitHub Pages / Local Storage */

const ADMIN_PIN = "0902";
const INVENTORY_KEY = "eborrow_inventory_v1";
const BORROWINGS_KEY = "eborrow_borrowings_v1";

const $ = id => document.getElementById(id);

let inventory = loadData(INVENTORY_KEY, []);
let borrowings = loadData(BORROWINGS_KEY, []);
let isAdmin = false;
let editingId = null;
let selectedImage = "";
let selectedQrEquipmentId = null;
let scanner = null;
let toastTimer = null;

function loadData(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveData() {
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
    localStorage.setItem(BORROWINGS_KEY, JSON.stringify(borrowings));
    return true;
  } catch (error) {
    console.error("Storage error:", error);
    toast("Hindi ma-save ang data. Maaaring puno na ang browser storage.");
    return false;
  }
}

function id() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function toast(message) {
  const el = $("toast");
  if (!el) return alert(message);
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

function scrollTo(id) {
  $(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function available(item) {
  return Number(item.availableQuantity || 0);
}

function unavailable(item) {
  return Number(item.unavailableQuantity || 0);
}

function total(item) {
  return Number(item.totalQuantity || 0);
}

function borrowedQty(itemId) {
  return borrowings
    .filter(b => b.equipmentId === itemId && b.status === "Borrowed")
    .reduce((sum, b) => sum + Number(b.quantity || 0), 0);
}

function itemStatus(item) {
  if (available(item) <= 0) return "Unavailable";
  if (borrowedQty(item.id) > 0) return "Borrowed";
  return "Available";
}

/* ---------------- STARTUP ---------------- */

document.addEventListener("DOMContentLoaded", init);

function init() {
  $("appContent").classList.remove("hidden");
  $("appContent").hidden = false;

  bindEvents();
  setDates();
  updateAdminUI();
  renderAll();
}

/* ---------------- ADMIN ---------------- */

function loginAdmin() {
  const pin = prompt("Enter Admin PIN:");

  if (pin === null) return;

  if (pin !== ADMIN_PIN) {
    toast("Incorrect Admin PIN.");
    return;
  }

  isAdmin = true;
  updateAdminUI();
  renderInventory();
  toast("Admin mode enabled.");
}

function logoutAdmin() {
  isAdmin = false;
  closeEquipmentForm();
  updateAdminUI();
  renderInventory();
  toast("Admin mode disabled.");
}

function updateAdminUI() {
  $("adminStatus").textContent = isAdmin ? "Admin Mode" : "Borrower Mode";
  $("adminToggleButton").textContent = isAdmin ? "Admin Logout" : "Admin Login";

  document.querySelectorAll(".admin-only").forEach(el => {
    el.hidden = !isAdmin;
  });
}

function requireAdmin() {
  if (isAdmin) return true;
  toast("Admin login is required for this action.");
  return false;
}

/* ---------------- EVENTS ---------------- */

function bindEvents() {
  $("adminToggleButton").addEventListener("click", () => {
    isAdmin ? logoutAdmin() : loginAdmin();
  });

  document.querySelectorAll('nav a[href^="#"], .logo[href^="#"]').forEach(link => {
    link.addEventListener("click", event => {
      const target = link.getAttribute("href").slice(1);
      if ($(target)) {
        event.preventDefault();
        scrollTo(target);
      }
    });
  });

  $("addEquipmentTop").addEventListener("click", openAddForm);
  $("addEquipmentButton").addEventListener("click", openAddForm);
  $("quickAdd").addEventListener("click", openAddForm);
  $("cancelForm").addEventListener("click", closeEquipmentForm);
  $("inventoryForm").addEventListener("submit", saveEquipment);
  $("itemImage").addEventListener("change", handleImage);

  $("quickBorrow").addEventListener("click", () => {
    scrollTo("borrow");
    $("borrowerName").focus();
  });

  $("quickScan").addEventListener("click", () => {
    scrollTo("qrSection");
    startScanner();
  });

  $("borrowForm").addEventListener("submit", saveBorrow);
  $("activeBorrowingsBody").addEventListener("click", event => {
    const button = event.target.closest("[data-return]");
    if (button) openReturn(button.dataset.return);
  });

  $("confirmReturn").addEventListener("click", processReturn);
  $("cancelReturn").addEventListener("click", closeReturn);

  $("searchInput").addEventListener("input", renderInventory);
  $("filterCategory").addEventListener("change", renderInventory);
  $("filterStatus").addEventListener("change", renderInventory);

  $("historySearch").addEventListener("input", renderHistory);
  $("historyStatus").addEventListener("change", renderHistory);
  $("exportHistory").addEventListener("click", exportCSV);

  $("startScanner").addEventListener("click", startScanner);
  $("stopScanner").addEventListener("click", stopScanner);
  $("makeQr").addEventListener("click", makeSelectedQR);

  $("inventoryList").addEventListener("click", handleInventoryButtons);

  $("notificationList").addEventListener("click", event => {
    const button = event.target.closest("[data-alert-return]");
    if (button) openReturn(button.dataset.alertReturn);
  });
}

function setDates() {
  $("borrowDate").value = today();

  const due = new Date();
  due.setDate(due.getDate() + 7);
  due.setMinutes(due.getMinutes() - due.getTimezoneOffset());
  $("dueDate").value = due.toISOString().slice(0, 10);
}

/* ---------------- EQUIPMENT FORM ---------------- */

function openAddForm() {
  if (!requireAdmin()) return;

  editingId = null;
  selectedImage = "";
  $("inventoryForm").reset();

  $("formTitle").textContent = "Add New Equipment";
  $("saveButton").textContent = "Save Equipment";
  $("itemQuantity").value = 1;

  showPreview("");
  $("addItem").classList.remove("hidden");
  $("addItem").hidden = false;
  scrollTo("addItem");
}

function closeEquipmentForm() {
  $("addItem").classList.add("hidden");
  $("addItem").hidden = true;
  $("inventoryForm").reset();
  editingId = null;
  selectedImage = "";
  showPreview("");
}

function showPreview(src) {
  const image = $("imagePreview");
  const placeholder = $("uploadPlaceholder");

  if (src) {
    image.src = src;
    image.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

function handleImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    toast("Use JPG, PNG, or WEBP image.");
    event.target.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    toast("Image must be 5MB or smaller.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

      selectedImage = canvas.toDataURL("image/jpeg", 0.68);
      showPreview(selectedImage);
    };

    img.onerror = () => toast("Unable to read the selected image.");
    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}

function saveEquipment(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const name = $("itemName").value.trim();
  const category = $("itemCategory").value;
  const quantity = Number($("itemQuantity").value);
  const condition = $("itemCondition").value;
  const description = $("itemDescription").value.trim();

  if (!name || !category || !Number.isInteger(quantity) || quantity < 1) {
    toast("Please complete the required equipment details.");
    return;
  }

  if (editingId) {
    const item = inventory.find(x => x.id === editingId);
    if (!item) return;

    const active = borrowedQty(item.id);
    const damaged = unavailable(item);

    if (quantity < active + damaged) {
      toast("Quantity cannot be lower than borrowed and damaged units.");
      return;
    }

    item.name = name;
    item.category = category;
    item.totalQuantity = quantity;
    item.availableQuantity = quantity - active - damaged;
    item.condition = condition;
    item.description = description;
    if (selectedImage) item.image = selectedImage;

    toast("Equipment updated.");
  } else {
    inventory.push({
      id: id(),
      name,
      category,
      totalQuantity: quantity,
      availableQuantity: quantity,
      unavailableQuantity: 0,
      condition,
      description,
      image: selectedImage,
      createdAt: new Date().toISOString()
    });

    toast("Equipment added successfully.");
  }

  if (saveData()) {
    closeEquipmentForm();
    renderAll();
  }
}

/* ---------------- INVENTORY ---------------- */

function renderInventory() {
  const list = $("inventoryList");
  const search = $("searchInput").value.toLowerCase().trim();
  const category = $("filterCategory").value;
  const status = $("filterStatus").value;

  const rows = inventory.filter(item => {
    const text = `${item.name} ${item.category} ${item.description || ""}`.toLowerCase();
    return text.includes(search) &&
      (category === "All" || item.category === category) &&
      (status === "All" || itemStatus(item) === status);
  });

  $("emptyMessage").classList.toggle("hidden", rows.length > 0);

  list.innerHTML = rows.map(item => `
    <article class="inventory-card">
      ${item.image
        ? `<img class="item-image" src="${item.image}" alt="${safe(item.name)}">`
        : `<div class="no-image">📦</div>`}
      <div class="item-content">
        <h3>${safe(item.name)}</h3>
        <p>${safe(item.category)}</p>
        <p>Available: <strong>${available(item)}</strong> / ${total(item)}</p>
        <p>Condition: ${safe(item.condition)}</p>
        <p>${safe(item.description || "No description")}</p>
        <span class="status">${itemStatus(item)}</span>
        <div class="item-actions">
          <button type="button" data-action="qr" data-id="${item.id}">QR Code</button>
          ${isAdmin ? `
            <button type="button" data-action="edit" data-id="${item.id}">Edit</button>
            <button type="button" data-action="delete" data-id="${item.id}">Delete</button>
          ` : ""}
        </div>
      </div>
    </article>
  `).join("");

  renderBorrowOptions();
}

function handleInventoryButtons(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const item = inventory.find(x => x.id === button.dataset.id);
  if (!item) return;

  const action = button.dataset.action;

  if (action === "qr") {
    selectedQrEquipmentId = item.id;
    $("makeQr").disabled = false;
    $("scanResult").textContent = `Selected equipment: ${item.name}`;
    makeSelectedQR();
    scrollTo("qrSection");
  }

  if (action === "edit") {
    if (!requireAdmin()) return;

    editingId = item.id;
    selectedImage = item.image || "";

    $("itemName").value = item.name;
    $("itemCategory").value = item.category;
    $("itemQuantity").value = item.totalQuantity;
    $("itemCondition").value = item.condition;
    $("itemDescription").value = item.description || "";

    $("formTitle").textContent = "Edit Equipment";
    $("saveButton").textContent = "Update Equipment";

    showPreview(selectedImage);
    $("addItem").classList.remove("hidden");
    $("addItem").hidden = false;
    scrollTo("addItem");
  }

  if (action === "delete") {
    if (!requireAdmin()) return;

    if (borrowedQty(item.id) > 0) {
      toast("Cannot delete equipment with active borrowings.");
      return;
    }

    if (!confirm(`Delete ${item.name}?`)) return;

    inventory = inventory.filter(x => x.id !== item.id);
    saveData();
    renderAll();
    toast("Equipment deleted.");
  }
}

/* ---------------- BORROW ---------------- */

function renderBorrowOptions() {
  const select = $("borrowEquipment");
  const oldValue = select.value;

  select.innerHTML = `<option value="">Select available equipment</option>` +
    inventory.filter(item => available(item) > 0).map(item =>
      `<option value="${item.id}">${safe(item.name)} (${available(item)} available)</option>`
    ).join("");

  if (inventory.some(x => x.id === oldValue && available(x) > 0)) {
    select.value = oldValue;
  }
}

function saveBorrow(event) {
  event.preventDefault();

  const name = $("borrowerName").value.trim();
  const borrowerId = $("borrowerId").value.trim();
  const contact = $("borrowerContact").value.trim();
  const equipmentId = $("borrowEquipment").value;
  const quantity = Number($("borrowQuantity").value);
  const borrowDate = $("borrowDate").value;
  const dueDate = $("dueDate").value;

  if (!name || !borrowerId || !equipmentId) {
    toast("Please complete borrower details.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    toast("Enter a valid quantity.");
    return;
  }

  if (!borrowDate || !dueDate || dueDate < borrowDate) {
    toast("Please check the borrowing and due dates.");
    return;
  }

  const item = inventory.find(x => x.id === equipmentId);

  if (!item || quantity > available(item)) {
    toast("Not enough available equipment.");
    return;
  }

  item.availableQuantity -= quantity;

  borrowings.unshift({
    id: id(),
    equipmentId: item.id,
    equipmentName: item.name,
    borrowerName: name,
    borrowerId,
    borrowerContact: contact,
    quantity,
    borrowDate,
    dueDate,
    status: "Borrowed",
    returnedAt: "",
    returnCondition: "",
    returnNotes: "",
    createdAt: new Date().toISOString()
  });

  if (saveData()) {
    $("borrowForm").reset();
    $("borrowQuantity").value = 1;
    setDates();
    renderAll();
    toast("Borrow transaction saved.");
  }
}

/* ---------------- RETURN ---------------- */

function openReturn(borrowId) {
  const record = borrowings.find(b => b.id === borrowId);
  if (!record || record.status !== "Borrowed") return;

  $("returnBorrowId").value = borrowId;
  $("returnSummary").textContent =
    `${record.borrowerName} — ${record.equipmentName} — ${record.quantity} unit(s)`;

  $("returnCondition").value = "Good";
  $("returnNotes").value = "";
  $("returnDialog").showModal();
}

function closeReturn() {
  if ($("returnDialog").open) $("returnDialog").close();
}

function processReturn() {
  const record = borrowings.find(b => b.id === $("returnBorrowId").value);
  if (!record || record.status !== "Borrowed") {
    toast("Borrowing record not found.");
    return;
  }

  const item = inventory.find(x => x.id === record.equipmentId);
  const condition = $("returnCondition").value;

  record.status = "Returned";
  record.returnedAt = today();
  record.returnCondition = condition;
  record.returnNotes = $("returnNotes").value.trim();

  if (item) {
    if (condition === "Damaged" || condition === "Needs Repair") {
      item.unavailableQuantity = unavailable(item) + record.quantity;
    } else {
      item.availableQuantity = available(item) + record.quantity;
    }
  }

  saveData();
  closeReturn();
  renderAll();
  toast("Equipment return recorded.");
}

/* ---------------- HISTORY ---------------- */

function renderActiveBorrowings() {
  const active = borrowings.filter(b => b.status === "Borrowed");

  $("activeBorrowingsBody").innerHTML = active.length
    ? active.map(b => `
      <tr>
        <td>
          <strong>${safe(b.borrowerName)}</strong><br>
          ${safe(b.equipmentName)}<br>
          <small>${safe(b.borrowerId)}</small>
        </td>
        <td>${formatDate(b.dueDate)}</td>
        <td>${b.quantity}</td>
        <td><button type="button" data-return="${b.id}">Return</button></td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="muted">No active borrowings.</td></tr>`;
}

function renderHistory() {
  const search = $("historySearch").value.toLowerCase().trim();
  const status = $("historyStatus").value;

  const rows = borrowings.filter(b => {
    const text = `${b.borrowerName} ${b.borrowerId} ${b.equipmentName}`.toLowerCase();
    return text.includes(search) && (status === "All" || b.status === status);
  });

  $("historyBody").innerHTML = rows.length
    ? rows.map(b => `
      <tr>
        <td>${safe(b.borrowerName)}<br><small>${safe(b.borrowerId)}</small></td>
        <td>${safe(b.equipmentName)}</td>
        <td>${b.quantity}</td>
        <td>${formatDate(b.borrowDate)}</td>
        <td>${formatDate(b.dueDate)}</td>
        <td>${formatDate(b.returnedAt)}</td>
        <td>${b.status === "Borrowed" ? "Active" : "Returned"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="muted">No transactions yet.</td></tr>`;
}

/* ---------------- NOTIFICATIONS ---------------- */

function renderNotifications() {
  const active = borrowings.filter(b => b.status === "Borrowed");
  const overdue = active.filter(b => b.dueDate < today());
  const dueToday = active.filter(b => b.dueDate === today());

  $("overdueCount").textContent = overdue.length;
  $("dueTodayCount").textContent = dueToday.length;

  const alerts = [
    ...overdue.map(b => ({ ...b, alert: "OVERDUE" })),
    ...dueToday.map(b => ({ ...b, alert: "DUE TODAY" }))
  ];

  $("notificationBadge").textContent = alerts.length;
  $("notificationBadge").classList.toggle("hidden", alerts.length === 0);

  $("notificationList").innerHTML = alerts.length
    ? alerts.map(b => `
      <div class="notification">
        <div>
          <strong>${b.alert}: ${safe(b.equipmentName)}</strong>
          <p>${safe(b.borrowerName)} — Due ${formatDate(b.dueDate)}</p>
        </div>
        <button type="button" data-alert-return="${b.id}">Process return</button>
      </div>
    `).join("")
    : `<p class="muted">No overdue or due-today transactions.</p>`;
}

/* ---------------- DASHBOARD ---------------- */

function renderDashboard() {
  const totalTypes = inventory.length;
  const totalUnits = inventory.reduce((sum, item) => sum + total(item), 0);
  const availableUnits = inventory.reduce((sum, item) => sum + available(item), 0);
  const unavailableUnits = inventory.reduce((sum, item) => sum + unavailable(item), 0);
  const borrowedUnits = Math.max(0, totalUnits - availableUnits - unavailableUnits);

  $("totalItems").textContent = totalTypes;
  $("totalQuantity").textContent = totalUnits;
  $("availableItems").textContent = availableUnits;
  $("borrowedItems").textContent = borrowedUnits;

  const max = Math.max(totalUnits, 1);
  const data = [
    ["Available", availableUnits],
    ["Borrowed", borrowedUnits],
    ["Unavailable", unavailableUnits]
  ];

  $("analyticsBars").innerHTML = data.map(([label, value]) => `
    <div class="bar-row">
      <span>${label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.min(100, value / max * 100)}%"></div>
      </div>
      <strong>${value}</strong>
    </div>
  `).join("");
}

/* ---------------- QR CODE ---------------- */

function makeSelectedQR() {
  const item = inventory.find(x => x.id === selectedQrEquipmentId);

  if (!item) {
    toast("Select an equipment first.");
    return;
  }

  if (!window.QRCode) {
    toast("QR Code library did not load. Check your internet connection.");
    return;
  }

  $("makeQr").disabled = false;
  $("qrOutput").innerHTML = "";

  new QRCode($("qrOutput"), {
    text: `EBORROW:${item.id}`,
    width: 160,
    height: 160
  });

  $("scanResult").textContent =
    `${item.name} — ${available(item)} unit(s) available`;
}

async function startScanner() {
  if (!window.Html5Qrcode) {
    toast("QR scanner library did not load.");
    return;
  }

  if (!window.isSecureContext) {
    toast("Camera requires HTTPS. Open your GitHub Pages HTTPS website.");
    return;
  }

  try {
    if (!scanner) scanner = new Html5Qrcode("qr-reader");

    $("startScanner").disabled = true;

    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async decodedText => {
        await stopScanner();

        const equipmentId = decodedText.startsWith("EBORROW:")
          ? decodedText.slice("EBORROW:".length)
          : decodedText;

        const item = inventory.find(x => x.id === equipmentId);

        if (!item) {
          $("scanResult").textContent = "No matching equipment found.";
          toast("No matching equipment found.");
          return;
        }

        selectedQrEquipmentId = item.id;
        makeSelectedQR();
        toast("Equipment QR successfully scanned.");
      },
      () => {}
    );

    $("stopScanner").disabled = false;
    toast("Scanner started. Point the camera at an equipment QR code.");
  } catch (error) {
    console.error("Scanner error:", error);
    $("startScanner").disabled = false;
    $("stopScanner").disabled = true;
    toast("Camera unavailable. Allow camera permission in your browser.");
  }
}

async function stopScanner() {
  if (scanner && scanner.isScanning) {
    try {
      await scanner.stop();
    } catch (error) {
      console.warn(error);
    }
  }

  $("startScanner").disabled = false;
  $("stopScanner").disabled = true;
}

/* ---------------- CSV EXPORT ---------------- */

function exportCSV() {
  const headings = [
    "Borrower", "Borrower ID", "Contact", "Equipment",
    "Quantity", "Borrow Date", "Due Date", "Returned",
    "Status", "Return Condition", "Return Notes"
  ];

  const rows = borrowings.map(b => [
    b.borrowerName, b.borrowerId, b.borrowerContact,
    b.equipmentName, b.quantity, b.borrowDate, b.dueDate,
    b.returnedAt, b.status, b.returnCondition, b.returnNotes
  ]);

  const csv = [headings, ...rows].map(row =>
    row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `eborrow-history-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------------- RENDER ---------------- */

function renderAll() {
  renderInventory();
  renderActiveBorrowings();
  renderHistory();
  renderNotifications();
  renderDashboard();
  updateAdminUI();
}

window.addEventListener("beforeunload", () => {
  if (scanner?.isScanning) scanner.stop().catch(() => {});
});

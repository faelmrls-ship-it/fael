
/* =========================================================
   E-BORROW SYSTEM
   Local Storage version — No Firebase / No borrower login
   Admin PIN: 0902
========================================================= */

const ADMIN_PIN = "0902";

const STORAGE = {
  inventory: "eborrow_inventory_v1",
  borrowings: "eborrow_borrowings_v1"
};

let inventory = loadData(STORAGE.inventory, []);
let borrowings = loadData(STORAGE.borrowings, []);
let editingId = null;
let selectedImage = "";
let selectedQrEquipmentId = null;
let isAdmin = false;
let qrScanner = null;
let toastTimer = null;

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function loadData(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (error) {
    console.error("Storage error:", error);
    return fallback;
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE.inventory, JSON.stringify(inventory));
    localStorage.setItem(STORAGE.borrowings, JSON.stringify(borrowings));
    return true;
  } catch (error) {
    console.error(error);
    showToast("Hindi ma-save ang data. Maaaring puno na ang browser storage.", "error");
    return false;
  }
}

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function todayString() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000)
    .toISOString().slice(0, 10);
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function getActiveBorrowings(itemId) {
  return borrowings.filter(b =>
    b.equipmentId === itemId && b.status === "Borrowed"
  );
}

function getBorrowedQuantity(itemId) {
  return getActiveBorrowings(itemId)
    .reduce((sum, b) => sum + Number(b.quantity || 0), 0);
}

function getUnavailableQuantity(item) {
  return Number(item.unavailableQuantity || 0);
}

function getAvailableQuantity(item) {
  return Number(item.availableQuantity || 0);
}

function getTotalQuantity(item) {
  return Number(item.totalQuantity || 0);
}

function getItemStatus(item) {
  if (getAvailableQuantity(item) <= 0) return "Unavailable";
  if (getAvailableQuantity(item) <= 2) return "Low Stock";
  return "Available";
}

// ---------------------------------------------------------
// STARTUP / ADMIN
// ---------------------------------------------------------


function setupApplication() {
  const authPanel = document.getElementById("authPanel");
  if (authPanel) authPanel.remove();

  const appContent = document.getElementById("appContent");

  if (appContent) {
    appContent.hidden = false;
    appContent.classList.remove("hidden");
    appContent.style.display = "block";
  }

  setupAdminButton();
  setupEventListeners();
  setDefaultDates();
  renderAll();

  // Ipakita ang Dashboard sa unang pagbukas
  showSection("dashboard");
}


function setupAdminButton() {
  const accountArea = document.querySelector(".account-area");
  if (!accountArea) return;

  accountArea.innerHTML = `
    <span id="adminStatus" style="margin-right:10px;">Borrower Mode</span>
    <button type="button" id="adminToggleButton" class="btn btn-primary">
      Admin Login
    </button>
  `;

  document.getElementById("adminToggleButton")
    .addEventListener("click", toggleAdmin);
}

function toggleAdmin() {
  if (isAdmin) {
    isAdmin = false;
    showToast("Admin mode logged out.");
    updateAdminInterface();
    renderAll();
    return;
  }

  const enteredPin = prompt("Ilagay ang Admin PIN:");

  if (enteredPin === null) return;

  if (enteredPin === ADMIN_PIN) {
    isAdmin = true;
    showToast("Admin mode activated.");
    updateAdminInterface();
    renderAll();
  } else {
    showToast("Maling Admin PIN.", "error");
  }
}

function updateAdminInterface() {
  const button = document.getElementById("adminToggleButton");
  const status = document.getElementById("adminStatus");

  if (button) {
    button.textContent = isAdmin ? "Admin Logout" : "Admin Login";
  }

  if (status) {
    status.textContent = isAdmin ? "Admin Mode" : "Borrower Mode";
  }

  document.querySelectorAll(
    "#addEquipmentTop, #addEquipmentButton, #quickAdd"
  ).forEach(button => {
    button.style.display = isAdmin ? "" : "none";
  });

  const addItem = document.getElementById("addItem");
  if (addItem && !isAdmin) addItem.hidden = true;
}

function requireAdmin() {
  if (isAdmin) return true;
  showToast("Admin access lang ang puwedeng gumawa nito.", "error");
  return false;
}

// ---------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------

function setupEventListeners() {
  const on = (id, event, callback) => {
    const element = document.getElementById(id);
    if (element) element.addEventListener(event, callback);
  };

  on("addEquipmentTop", "click", openAddForm);
  on("addEquipmentButton", "click", openAddForm);
  on("quickAdd", "click", openAddForm);

  on("inventoryForm", "submit", saveEquipment);
  on("cancelForm", "click", closeEquipmentForm);

  on("itemImage", "change", handleImageUpload);

  on("borrowForm", "submit", borrowEquipment);
  on("returnForm", "submit", confirmReturn);

  on("cancelReturn", "click", closeReturnDialog);

  on("inventorySearch", "input", renderInventory);
  on("searchInput", "input", renderInventory);
  on("categoryFilter", "change", renderInventory);
  on("statusFilter", "change", renderInventory);

  on("historySearch", "input", renderHistory);
  on("historyStatus", "change", renderHistory);
  on("exportHistory", "click", exportHistory);

  on("makeQr", "click", generateQRCode);
  on("startScanner", "click", startScanner);
  on("stopScanner", "click", stopScanner);

  document.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
      showSection(button.dataset.section);
    });
  });
}

function setDefaultDates() {
  const borrowDate = document.getElementById("borrowDate");
  if (borrowDate) borrowDate.value = todayString();

  const dueDate = document.getElementById("dueDate");
  if (dueDate) {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    const offset = date.getTimezoneOffset();
    dueDate.value = new Date(date.getTime() - offset * 60000)
      .toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------

function showSection(sectionName) {
  document.querySelectorAll(".section, .page-section").forEach(section => {
    section.hidden = true;
    section.classList.remove("active");
  });

  const target = document.getElementById(sectionName);
  if (target) {
    target.hidden = false;
    target.classList.add("active");
  }

  document.querySelectorAll("[data-section]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionName
    );
  });

  renderAll();
}

// ---------------------------------------------------------
// EQUIPMENT FORM
// ---------------------------------------------------------

function openAddForm() {
  if (!requireAdmin()) return;

  editingId = null;
  selectedImage = "";

  const form = document.getElementById("inventoryForm");
  if (form) form.reset();

  const title = document.getElementById("formTitle");
  if (title) title.textContent = "Add Equipment";

  const preview = document.getElementById("imagePreview");
  if (preview) preview.innerHTML = "";

  const addItem = document.getElementById("addItem");
  if (addItem) addItem.hidden = false;

  const quantity = document.getElementById("itemQuantity");
  if (quantity) quantity.value = 1;

  showSection("inventory");
}

function closeEquipmentForm() {
  const addItem = document.getElementById("addItem");
  if (addItem) addItem.hidden = true;

  editingId = null;
  selectedImage = "";
}

function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Pumili ng image file.", "error");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const maxSize = 900;
      const scale = Math.min(
        1,
        maxSize / Math.max(image.width, image.height)
      );

      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      selectedImage = canvas.toDataURL("image/jpeg", 0.72);

      const preview = document.getElementById("imagePreview");
      if (preview) {
        preview.innerHTML = `
          <img src="${selectedImage}"
               alt="Equipment preview"
               style="max-width:150px;max-height:150px;object-fit:contain;">
        `;
      }
    };

    image.src = reader.result;
  };

  reader.readAsDataURL(file);
}

function saveEquipment(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const name = document.getElementById("itemName")?.value.trim();
  const category = document.getElementById("itemCategory")?.value;
  const quantity = Number(document.getElementById("itemQuantity")?.value);
  const condition = document.getElementById("itemCondition")?.value;
  const description = document.getElementById("itemDescription")?.value.trim();

  if (!name || !category || !Number.isInteger(quantity) || quantity < 1) {
    showToast("Pakisuri ang pangalan, category, at quantity.", "error");
    return;
  }

  if (editingId) {
    const item = inventory.find(x => x.id === editingId);
    if (!item) return;

    const borrowed = getBorrowedQuantity(item.id);
    const unavailable = getUnavailableQuantity(item);

    if (quantity < borrowed + unavailable) {
      showToast(
        "Hindi puwedeng mas mababa sa kasalukuyang borrowed at damaged quantity.",
        "error"
      );
      return;
    }

    item.name = name;
    item.category = category;
    item.totalQuantity = quantity;
    item.availableQuantity = quantity - borrowed - unavailable;
    item.condition = condition;
    item.description = description;
    if (selectedImage) item.image = selectedImage;

    showToast("Na-update ang equipment.");
  } else {
    inventory.push({
      id: makeId(),
      name,
      category,
      totalQuantity: quantity,
      availableQuantity: quantity,
      unavailableQuantity: 0,
      condition: condition || "Good",
      description,
      image: selectedImage,
      createdAt: new Date().toISOString()
    });

    showToast("Nadagdag ang equipment.");
  }

  saveData();
  closeEquipmentForm();
  renderAll();
}

// ---------------------------------------------------------
// INVENTORY
// ---------------------------------------------------------

function renderInventory() {
  const list = document.getElementById("inventoryList");
  if (!list) return;

  const search =
    document.getElementById("inventorySearch")?.value.toLowerCase() ||
    document.getElementById("searchInput")?.value.toLowerCase() || "";

  const category = document.getElementById("categoryFilter")?.value || "";
  const status = document.getElementById("statusFilter")?.value || "";

  const filtered = inventory.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(search) ||
      (item.category || "").toLowerCase().includes(search) ||
      (item.description || "").toLowerCase().includes(search);

    const matchesCategory = !category || item.category === category;
    const matchesStatus = !status || getItemStatus(item) === status;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const empty = document.getElementById("emptyMessage");
  if (empty) empty.hidden = filtered.length > 0;

  list.innerHTML = filtered.map(item => {
    const itemStatus = getItemStatus(item);
    const image = item.image
      ? `<img src="${item.image}" alt="${escapeHTML(item.name)}"
              style="width:100%;height:150px;object-fit:cover;">`
      : `<div class="equipment-placeholder">No Image</div>`;

    return `
      <div class="inventory-card">
        ${image}
        <div class="inventory-card-content">
          <h3>${escapeHTML(item.name)}</h3>
          <p>${escapeHTML(item.category || "Uncategorized")}</p>
          <p>Condition: ${escapeHTML(item.condition || "Good")}</p>
          <p>Available: <strong>${getAvailableQuantity(item)}</strong>
             / ${getTotalQuantity(item)}</p>
          <span class="status-badge">${itemStatus}</span>
          <p>${escapeHTML(item.description || "")}</p>

          <button type="button" onclick="showEquipmentQR('${item.id}')">
            View QR
          </button>

          ${isAdmin ? `
            <button type="button" onclick="editEquipment('${item.id}')">
              Edit
            </button>
            <button type="button" onclick="deleteEquipment('${item.id}')">
              Delete
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");

  renderBorrowSelect();
}

function editEquipment(id) {
  if (!requireAdmin()) return;

  const item = inventory.find(x => x.id === id);
  if (!item) return;

  editingId = id;
  selectedImage = "";

  document.getElementById("itemName").value = item.name;
  document.getElementById("itemCategory").value = item.category;
  document.getElementById("itemQuantity").value = item.totalQuantity;
  document.getElementById("itemCondition").value = item.condition || "Good";
  document.getElementById("itemDescription").value = item.description || "";

  const title = document.getElementById("formTitle");
  if (title) title.textContent = "Edit Equipment";

  const preview = document.getElementById("imagePreview");
  if (preview) {
    preview.innerHTML = item.image
      ? `<img src="${item.image}" style="max-width:150px;max-height:150px;">`
      : "";
  }

  const addItem = document.getElementById("addItem");
  if (addItem) addItem.hidden = false;

  showSection("inventory");
}

function deleteEquipment(id) {
  if (!requireAdmin()) return;

  const item = inventory.find(x => x.id === id);
  if (!item) return;

  if (getActiveBorrowings(id).length > 0) {
    showToast("Hindi puwedeng burahin: may active borrowing pa.", "error");
    return;
  }

  if (!confirm(`Sigurado ka bang burahin ang ${item.name}?`)) return;

  inventory = inventory.filter(x => x.id !== id);

  saveData();
  renderAll();
  showToast("Nabura ang equipment.");
}

// ---------------------------------------------------------
// BORROW
// ---------------------------------------------------------

function renderBorrowSelect() {
  const select = document.getElementById("borrowEquipment");
  if (!select) return;

  const previous = select.value;

  select.innerHTML = `
    <option value="">Select equipment</option>
    ${inventory.map(item => `
      <option value="${item.id}"
        ${getAvailableQuantity(item) <= 0 ? "disabled" : ""}>
        ${escapeHTML(item.name)} (${getAvailableQuantity(item)} available)
      </option>
    `).join("")}
  `;

  if (inventory.some(x => x.id === previous &&
      getAvailableQuantity(x) > 0)) {
    select.value = previous;
  }
}

function borrowEquipment(event) {
  event.preventDefault();

  const borrowerName = document.getElementById("borrowerName")?.value.trim();
  const borrowerId = document.getElementById("borrowerId")?.value.trim();
  const borrowerContact = document.getElementById("borrowerContact")?.value.trim();
  const equipmentId = document.getElementById("borrowEquipment")?.value;
  const quantity = Number(document.getElementById("borrowQuantity")?.value);
  const borrowDate = document.getElementById("borrowDate")?.value;
  const dueDate = document.getElementById("dueDate")?.value;

  if (!borrowerName || !borrowerId || !equipmentId) {
    showToast("Kumpletuhin ang borrower information.", "error");
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    showToast("Invalid na quantity.", "error");
    return;
  }

  if (!borrowDate || !dueDate || dueDate < borrowDate) {
    showToast("Pakisuri ang borrow date at due date.", "error");
    return;
  }

  const item = inventory.find(x => x.id === equipmentId);
  if (!item) {
    showToast("Hindi makita ang equipment.", "error");
    return;
  }

  if (quantity > getAvailableQuantity(item)) {
    showToast("Hindi sapat ang available quantity.", "error");
    return;
  }

  item.availableQuantity -= quantity;

  borrowings.unshift({
    id: makeId(),
    equipmentId: item.id,
    equipmentName: item.name,
    borrowerName,
    borrowerId,
    borrowerContact,
    quantity,
    borrowDate,
    dueDate,
    status: "Borrowed",
    createdAt: new Date().toISOString(),
    returnedAt: null,
    returnCondition: "",
    returnNotes: ""
  });

  saveData();

  document.getElementById("borrowForm")?.reset();
  setDefaultDates();

  renderAll();
  showToast("Matagumpay ang equipment borrowing.");
}

// ---------------------------------------------------------
// ACTIVE BORROWINGS / RETURN
// ---------------------------------------------------------

function renderActiveBorrowings() {
  const body = document.getElementById("activeBorrowingsBody");
  if (!body) return;

  const active = borrowings.filter(b => b.status === "Borrowed");

  if (!active.length) {
    body.innerHTML = `
      <tr><td colspan="8">Walang active borrowing.</td></tr>
    `;
    return;
  }

  body.innerHTML = active.map(b => `
    <tr>
      <td>${escapeHTML(b.borrowerName)}</td>
      <td>${escapeHTML(b.borrowerId)}</td>
      <td>${escapeHTML(b.equipmentName)}</td>
      <td>${b.quantity}</td>
      <td>${formatDate(b.borrowDate)}</td>
      <td>${formatDate(b.dueDate)}</td>
      <td>${getBorrowStatus(b)}</td>
      <td>
        <button type="button" onclick="openReturnDialog('${b.id}')">
          Return
        </button>
      </td>
    </tr>
  `).join("");
}

function getBorrowStatus(borrowing) {
  if (borrowing.status === "Returned") return "Returned";

  const today = todayString();

  if (borrowing.dueDate < today) return "Overdue";
  if (borrowing.dueDate === today) return "Due Today";

  return "Borrowed";
}

function openReturnDialog(id) {
  const borrowing = borrowings.find(b => b.id === id);
  if (!borrowing || borrowing.status !== "Borrowed") return;

  const dialog = document.getElementById("returnDialog");
  const summary = document.getElementById("returnSummary");
  const borrowId = document.getElementById("returnBorrowId");

  if (summary) {
    summary.textContent =
      `${borrowing.equipmentName} — ${borrowing.borrowerName} (${borrowing.quantity})`;
  }

  if (borrowId) borrowId.value = id;

  if (dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.hidden = false;
    }
  }
}

function closeReturnDialog() {
  const dialog = document.getElementById("returnDialog");
  if (!dialog) return;

  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.hidden = true;
  }
}

function confirmReturn(event) {
  event.preventDefault();

  const id = document.getElementById("returnBorrowId")?.value;
  const condition = document.getElementById("returnCondition")?.value;
  const notes = document.getElementById("returnNotes")?.value.trim();

  const borrowing = borrowings.find(b => b.id === id);
  if (!borrowing || borrowing.status !== "Borrowed") {
    showToast("Hindi makita ang active borrowing.", "error");
    return;
  }

  const item = inventory.find(x => x.id === borrowing.equipmentId);

  borrowing.status = "Returned";
  borrowing.returnedAt = new Date().toISOString();
  borrowing.returnCondition = condition || "Good";
  borrowing.returnNotes = notes || "";

  if (item) {
    if (
      condition &&
      ["Damaged", "Needs Repair", "Unusable"].includes(condition)
    ) {
      item.unavailableQuantity =
        getUnavailableQuantity(item) + borrowing.quantity;
    } else {
      item.availableQuantity =
        getAvailableQuantity(item) + borrowing.quantity;
    }
  }

  saveData();

  document.getElementById("returnForm")?.reset();
  closeReturnDialog();

  renderAll();
  showToast("Matagumpay na naitala ang return.");
}

// ---------------------------------------------------------
// HISTORY
// ---------------------------------------------------------

function renderHistory() {
  const body = document.getElementById("historyBody");
  if (!body) return;

  const search =
    document.getElementById("historySearch")?.value.toLowerCase() || "";

  const status =
    document.getElementById("historyStatus")?.value || "";

  const filtered = borrowings.filter(b => {
    const matchesSearch =
      (b.borrowerName || "").toLowerCase().includes(search) ||
      (b.borrowerId || "").toLowerCase().includes(search) ||
      (b.equipmentName || "").toLowerCase().includes(search);

    const matchesStatus = !status || b.status === status;

    return matchesSearch && matchesStatus;
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="8">Walang history record.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map(b => `
    <tr>
      <td>${escapeHTML(b.borrowerName)}</td>
      <td>${escapeHTML(b.borrowerId)}</td>
      <td>${escapeHTML(b.equipmentName)}</td>
      <td>${b.quantity}</td>
      <td>${formatDate(b.borrowDate)}</td>
      <td>${formatDate(b.dueDate)}</td>
      <td>${b.status}</td>
      <td>${formatDate(b.returnedAt)}</td>
    </tr>
  `).join("");
}

function exportHistory() {
  const rows = [
    [
      "Borrower",
      "Borrower ID",
      "Contact",
      "Equipment",
      "Quantity",
      "Borrow Date",
      "Due Date",
      "Status",
      "Return Date",
      "Return Condition",
      "Notes"
    ],
    ...borrowings.map(b => [
      b.borrowerName,
      b.borrowerId,
      b.borrowerContact,
      b.equipmentName,
      b.quantity,
      b.borrowDate,
      b.dueDate,
      b.status,
      b.returnedAt || "",
      b.returnCondition || "",
      b.returnNotes || ""
    ])
  ];

  const csv = rows.map(row =>
    row.map(value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(",")
  ).join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "eborrow-history.csv";
  link.click();

  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------

function renderNotifications() {
  const list = document.getElementById("notificationList");
  const badge = document.getElementById("notificationBadge");

  const active = borrowings.filter(b => b.status === "Borrowed");

  const overdue = active.filter(b => b.dueDate < todayString());
  const dueToday = active.filter(b => b.dueDate === todayString());

  const total = overdue.length + dueToday.length;

  if (badge) {
    badge.textContent = total;
    badge.style.display = total ? "" : "none";
  }

  const overdueCount = document.getElementById("overdueCount");
  const dueTodayCount = document.getElementById("dueTodayCount");

  if (overdueCount) overdueCount.textContent = overdue.length;
  if (dueTodayCount) dueTodayCount.textContent = dueToday.length;

  if (list) {
    const notifications = [
      ...overdue.map(b => ({
        message: `${b.borrowerName} — ${b.equipmentName} is overdue.`,
        type: "Overdue"
      })),
      ...dueToday.map(b => ({
        message: `${b.borrowerName} — ${b.equipmentName} is due today.`,
        type: "Due Today"
      }))
    ];

    list.innerHTML = notifications.length
      ? notifications.map(n => `
          <div class="notification-item">
            <strong>${n.type}</strong>
            <p>${escapeHTML(n.message)}</p>
          </div>
        `).join("")
      : "<p>Walang bagong notification.</p>";
  }
}

// ---------------------------------------------------------
// DASHBOARD / ANALYTICS
// ---------------------------------------------------------

function renderAnalytics() {
  const totalItems = inventory.reduce(
    (sum, item) => sum + getTotalQuantity(item), 0
  );

  const available = inventory.reduce(
    (sum, item) => sum + getAvailableQuantity(item), 0
  );

  const borrowed = borrowings
    .filter(b => b.status === "Borrowed")
    .reduce((sum, b) => sum + Number(b.quantity || 0), 0);

  const totalEquipment = document.getElementById("totalEquipment");
  const availableEquipment = document.getElementById("availableEquipment");
  const borrowedEquipment = document.getElementById("borrowedEquipment");
  const totalBorrowings = document.getElementById("totalBorrowings");

  if (totalEquipment) totalEquipment.textContent = totalItems;
  if (availableEquipment) availableEquipment.textContent = available;
  if (borrowedEquipment) borrowedEquipment.textContent = borrowed;
  if (totalBorrowings) totalBorrowings.textContent = borrowings.length;
}

// ---------------------------------------------------------
// QR CODE GENERATOR / SCANNER
// ---------------------------------------------------------

function generateQRCode() {
  const id = document.getElementById("makeQr")?.dataset?.equipmentId ||
    document.getElementById("qrEquipment")?.value ||
    selectedQrEquipmentId;

  const item = inventory.find(x => x.id === id);

  if (!item) {
    showToast("Pumili muna ng equipment para gumawa ng QR code.", "error");
    return;
  }

  const output = document.getElementById("qrOutput");
  if (!output) return;

  output.innerHTML = "";

  if (typeof QRCode === "undefined") {
    showToast("Hindi ma-load ang QR Code library.", "error");
    return;
  }

  new QRCode(output, {
    text: item.id,
    width: 180,
    height: 180
  });

  showToast("QR code generated.");
}

function showEquipmentQR(id) {
  selectedQrEquipmentId = id;

  const item = inventory.find(x => x.id === id);
  if (!item) return;

  const section = document.getElementById("qrSection");
  if (section) section.hidden = false;

  const output = document.getElementById("qrOutput");
  if (output) output.innerHTML = "";

  if (typeof QRCode !== "undefined" && output) {
    new QRCode(output, {
      text: item.id,
      width: 180,
      height: 180
    });
  }

  const result = document.getElementById("scanResult");
  if (result) result.textContent = `${item.name} — ${item.id}`;

  showSection("qrSection");
}

async function startScanner() {
  if (typeof Html5Qrcode === "undefined") {
    showToast("Hindi ma-load ang QR scanner library.", "error");
    return;
  }

  try {
    if (!qrScanner) {
      qrScanner = new Html5Qrcode("qr-reader");
    }

    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      decodedText => {
        const item = inventory.find(x => x.id === decodedText);
        const result = document.getElementById("scanResult");

        if (result) {
          result.textContent = item
            ? `Equipment found: ${item.name} — Available: ${getAvailableQuantity(item)}`
            : `QR scanned, but equipment was not found: ${decodedText}`;
        }

        if (item) selectedQrEquipmentId = item.id;
      },
      () => {}
    );

    showToast("QR scanner started.");
  } catch (error) {
    console.error(error);
    showToast("Hindi masimulan ang camera. Payagan ang camera access.", "error");
  }
}

async function stopScanner() {
  if (!qrScanner) return;

  try {
    if (qrScanner.isScanning) {
      await qrScanner.stop();
    }
    showToast("QR scanner stopped.");
  } catch (error) {
    console.error(error);
  }
}

// ---------------------------------------------------------
// RENDER ALL
// ---------------------------------------------------------

function renderAll() {
  renderInventory();
  renderBorrowSelect();
  renderActiveBorrowings();
  renderHistory();
  renderNotifications();
  renderAnalytics();
  updateAdminInterface();
}

// ---------------------------------------------------------
// GLOBAL FUNCTIONS FOR HTML BUTTONS
// ---------------------------------------------------------

window.editEquipment = editEquipment;
window.deleteEquipment = deleteEquipment;
window.openReturnDialog = openReturnDialog;
window.showEquipmentQR = showEquipmentQR;

// ---------------------------------------------------------
// INITIALIZE
// ---------------------------------------------------------

document.addEventListener("DOMContentLoaded", setupApplication);


if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupApplication, {
    once: true
  });
} else {
  setupApplication();
}

window.addEventListener("beforeunload", () => {
  if (qrScanner && qrScanner.isScanning) {
    qrScanner.stop().catch(() => {});
  }
});

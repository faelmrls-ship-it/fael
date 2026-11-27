
// ==========================================
// E-BORROW - GITHUB PAGES / LOCAL STORAGE
// No Firebase and no borrower login
// ==========================================

const ADMIN_PIN = "0902";
const INVENTORY_KEY = "eborrow_inventory_v1";
const BORROWINGS_KEY = "eborrow_borrowings_v1";

const $ = id => document.getElementById(id);

let inventory = [];
let borrowings = [];
let isAdmin = false;
let editingId = null;
let selectedImage = "";
let selectedQrEquipmentId = null;
let qrScanner = null;
let toastTimer = null;

// ---------- BASIC HELPERS ----------

function makeId() {
  return window.crypto?.randomUUID
    ? crypto.randomUUID()
    : "EB-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function dateLabel(value) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function notify(message) {
  const toast = $("toast");
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function requireAdmin() {
  if (isAdmin) return true;
  notify("Admin access lang ang puwedeng gumawa nito. Mag-login muna bilang admin.");
  return false;
}

// ---------- DATA STORAGE ----------

function normalizeEquipment(item) {
  const total = Math.max(1, Number(item.totalQuantity ?? item.quantity ?? 1));
  const unavailable = Math.max(0, Number(item.unavailableQuantity ?? 0));
  const available = Math.max(
    0,
    Math.min(total - unavailable, Number(item.availableQuantity ?? total))
  );

  return {
    id: String(item.id || makeId()),
    name: String(item.name || item.itemName || "Unnamed Equipment"),
    category: String(item.category || "Other"),
    totalQuantity: total,
    availableQuantity: available,
    unavailableQuantity: unavailable,
    condition: String(item.condition || "Good"),
    description: String(item.description || ""),
    image: String(item.image || ""),
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function loadArray(key, legacyKey) {
  try {
    const current = localStorage.getItem(key);
    if (current) {
      const parsed = JSON.parse(current);
      return Array.isArray(parsed) ? parsed : [];
    }

    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        return Array.isArray(parsed) ? parsed : [];
      }
    }
  } catch (error) {
    console.error("Load error:", error);
  }
  return [];
}

function loadData() {
  inventory = loadArray(INVENTORY_KEY, "eb_inventory").map(normalizeEquipment);
  borrowings = loadArray(BORROWINGS_KEY, "eb_borrowings");

  // Normalize borrowing records from older versions.
  borrowings = borrowings.map(b => ({
    id: String(b.id || makeId()),
    borrowerName: String(b.borrowerName || ""),
    borrowerId: String(b.borrowerId || ""),
    borrowerContact: String(b.borrowerContact || ""),
    equipmentId: String(b.equipmentId || ""),
    equipmentName: String(b.equipmentName || ""),
    quantity: Math.max(1, Number(b.quantity || 1)),
    borrowDate: b.borrowDate || todayISO(),
    dueDate: b.dueDate || todayISO(),
    returnedAt: b.returnedAt || "",
    status: b.status === "Returned" ? "Returned" : "Borrowed",
    returnCondition: b.returnCondition || "",
    returnNotes: b.returnNotes || ""
  }));

  // Save migrated data in the new storage keys.
  saveData();
}

function saveData() {
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
    localStorage.setItem(BORROWINGS_KEY, JSON.stringify(borrowings));
    return true;
  } catch (error) {
    console.error("Local Storage save error:", error);
    notify("Hindi ma-save ang data. Bawasan ang laki ng larawan o storage ng browser.");
    return false;
  }
}

// ---------- ADMIN MODE ----------

function updateAdminUI() {
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", !isAdmin);
  });

  $("adminStatus").textContent = isAdmin ? "Administrator Mode" : "Borrower Access";
  $("adminToggleButton").textContent = isAdmin ? "Admin Logout" : "Admin Login";
  $("adminToggleButton").classList.toggle("danger-btn", isAdmin);
}

function toggleAdmin() {
  if (isAdmin) {
    isAdmin = false;
    closeEquipmentForm();
    updateAdminUI();
    renderInventory();
    notify("Admin mode ended.");
    return;
  }

  const pin = prompt("Enter Admin PIN:");
  if (pin === null) return;

  if (pin === ADMIN_PIN) {
    isAdmin = true;
    updateAdminUI();
    renderInventory();
    notify("Admin access granted.");
  } else {
    notify("Incorrect Admin PIN.");
  }
}

// ---------- EQUIPMENT FORM ----------

function showImagePreview(data) {
  const img = $("imagePreview");
  const placeholder = $("uploadPlaceholder");

  if (data) {
    img.src = data;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    img.removeAttribute("src");
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

function resetEquipmentForm() {
  $("inventoryForm").reset();
  editingId = null;
  selectedImage = "";
  showImagePreview("");
  $("formTitle").textContent = "Add New Equipment";
  $("saveButton").textContent = "Save Equipment";
}

function openAddForm() {
  if (!requireAdmin()) return;
  resetEquipmentForm();
  $("addItem").classList.remove("hidden");
  $("addItem").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEquipmentForm() {
  resetEquipmentForm();
  $("addItem").classList.add("hidden");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error("Invalid image file."));
      image.onload = () => {
        const maxSize = 800;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.65));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

async function handleImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(file.type)) {
    notify("JPG, PNG, o WEBP image lang ang puwede.");
    event.target.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    notify("Maximum image size is 5MB.");
    event.target.value = "";
    return;
  }

  try {
    selectedImage = await compressImage(file);
    showImagePreview(selectedImage);
  } catch (error) {
    console.error(error);
    notify(error.message || "Hindi ma-process ang image.");
  }
}

function saveEquipment(event) {
  event.preventDefault();

  if (!requireAdmin()) return;

  const name = $("itemName").value.trim();
  const category = $("itemCategory").value;
  const totalQuantity = Number($("itemQuantity").value);
  const condition = $("itemCondition").value;
  const description = $("itemDescription").value.trim();

  if (!name || !category || !Number.isInteger(totalQuantity) || totalQuantity < 1) {
    notify("Pakilagyan ng valid na equipment name, category, at quantity.");
    return;
  }

  if (editingId) {
    const old = inventory.find(item => item.id === editingId);
    if (!old) {
      notify("Hindi na makita ang equipment na ine-edit.");
      return;
    }

    const borrowed = borrowings
      .filter(b => b.equipmentId === editingId && b.status === "Borrowed")
      .reduce((sum, b) => sum + Number(b.quantity || 0), 0);

    const unavailable = Number(old.unavailableQuantity || 0);

    if (totalQuantity < borrowed + unavailable) {
      notify(`Hindi puwedeng mas mababa sa ${borrowed + unavailable}. May borrowed o unavailable units pa.`);
      return;
    }

    old.name = name;
    old.category = category;
    old.totalQuantity = totalQuantity;
    old.availableQuantity = totalQuantity - borrowed - unavailable;
    old.condition = condition;
    old.description = description;
    old.image = selectedImage || old.image || "";
    old.updatedAt = new Date().toISOString();

    if (!saveData()) return;
    notify("Equipment updated successfully.");
  } else {
    const newItem = {
      id: makeId(),
      name,
      category,
      totalQuantity,
      availableQuantity: totalQuantity,
      unavailableQuantity: 0,
      condition,
      description,
      image: selectedImage,
      createdAt: new Date().toISOString()
    };

    inventory.unshift(newItem);

    if (!saveData()) {
      inventory.shift();
      return;
    }

    notify("Equipment added successfully!");
  }

  closeEquipmentForm();
  renderAll();
}

// ---------- INVENTORY ----------

function borrowedQuantity(itemId) {
  return borrowings
    .filter(b => b.equipmentId === itemId && b.status === "Borrowed")
    .reduce((sum, b) => sum + Number(b.quantity || 0), 0);
}

function statusFor(item) {
  if (["Damaged", "Needs Repair"].includes(item.condition)) return "Unavailable";
  if (Number(item.availableQuantity) <= 0) return "Borrowed";
  if (borrowedQuantity(item.id) > 0) return "Borrowed";
  return "Available";
}

function renderInventory() {
  const search = $("searchInput").value.toLowerCase().trim();
  const category = $("filterCategory").value;
  const filterStatus = $("filterStatus").value;

  const filtered = inventory.filter(item => {
    const text = `${item.name} ${item.category} ${item.description}`.toLowerCase();
    return text.includes(search) &&
      (category === "All" || item.category === category) &&
      (filterStatus === "All" || statusFor(item) === filterStatus);
  });

  $("emptyMessage").classList.toggle("hidden", filtered.length > 0);

  $("inventoryList").innerHTML = filtered.map(item => {
    const status = statusFor(item);
    const image = item.image
      ? `<img class="item-image" src="${item.image}" alt="${escapeHTML(item.name)}">`
      : `<div class="no-image">📦</div>`;

    const adminButtons = isAdmin ? `
      <button class="edit-btn" data-action="edit" data-id="${escapeHTML(item.id)}">Edit</button>
      <button class="delete-btn danger-btn" data-action="delete" data-id="${escapeHTML(item.id)}">Delete</button>
    ` : "";

    return `
      <article class="inventory-card">
        ${image}
        <div class="item-content">
          <h3>${escapeHTML(item.name)}</h3>
          <p>${escapeHTML(item.category)}</p>
          <p>Available: <strong>${item.availableQuantity}</strong> / ${item.totalQuantity}</p>
          <p>Condition: ${escapeHTML(item.condition)}</p>
          <p>${escapeHTML(item.description || "No description")}</p>
          <span class="status ${status === "Borrowed" ? "borrowed" : status === "Unavailable" ? "unavailable" : ""}">${status}</span>
          <div class="item-actions">
            <button class="secondary-btn" data-action="qr" data-id="${escapeHTML(item.id)}">QR Code</button>
            ${adminButtons}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function handleInventoryClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = inventory.find(x => x.id === button.dataset.id);
  if (!item) return;

  const action = button.dataset.action;

  if (action === "edit") {
    if (!requireAdmin()) return;

    editingId = item.id;
    selectedImage = item.image || "";

    $("itemName").value = item.name;
    $("itemCategory").value = item.category;
    $("itemQuantity").value = item.totalQuantity;
    $("itemCondition").value = item.condition;
    $("itemDescription").value = item.description || "";

    showImagePreview(selectedImage);
    $("formTitle").textContent = "Edit Equipment";
    $("saveButton").textContent = "Update Equipment";
    $("addItem").classList.remove("hidden");
    $("addItem").scrollIntoView({ behavior: "smooth" });
  }

  if (action === "delete") {
    if (!requireAdmin()) return;

    const active = borrowings.some(b => b.equipmentId === item.id && b.status === "Borrowed");
    if (active) {
      notify("Hindi puwedeng burahin: may active borrowing pa ang equipment.");
      return;
    }

    if (confirm(`Delete "${item.name}"? Hindi na ito maibabalik.`)) {
      const previous = inventory;
      inventory = inventory.filter(x => x.id !== item.id);

      if (!saveData()) {
        inventory = previous;
        return;
      }

      renderAll();
      notify("Equipment deleted.");
    }
  }

  if (action === "qr") {
    selectedQrEquipmentId = item.id;
    showEquipmentQr(item);
    $("qrSection").scrollIntoView({ behavior: "smooth" });
  }
}

// ---------- BORROWING ----------

function renderBorrowSelect() {
  const available = inventory.filter(item =>
    Number(item.availableQuantity) > 0 &&
    !["Damaged", "Needs Repair"].includes(item.condition)
  );

  $("borrowEquipment").innerHTML =
    `<option value="">Select available equipment</option>` +
    available.map(item =>
      `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} (${item.availableQuantity} available)</option>`
    ).join("");
}

function saveBorrow(event) {
  event.preventDefault();

  const equipmentId = $("borrowEquipment").value;
  const quantity = Number($("borrowQuantity").value);
  const borrowDate = $("borrowDate").value;
  const dueDate = $("dueDate").value;
  const borrowerName = $("borrowerName").value.trim();
  const borrowerId = $("borrowerId").value.trim();

  if (!borrowerName || !borrowerId || !equipmentId) {
    notify("Pakikumpleto ang borrower details at equipment.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    notify("Invalid borrowing quantity.");
    return;
  }

  if (!borrowDate || !dueDate || dueDate < borrowDate) {
    notify("Pakisuri ang borrow date at expected return date.");
    return;
  }

  const item = inventory.find(x => x.id === equipmentId);
  if (!item) {
    notify("Hindi makita ang napiling equipment.");
    return;
  }

  if (["Damaged", "Needs Repair"].includes(item.condition)) {
    notify("Hindi puwedeng hiramin ang equipment na ito.");
    return;
  }

  if (quantity > Number(item.availableQuantity)) {
    notify("Kulang ang available quantity.");
    return;
  }

  const borrowing = {
    id: makeId(),
    borrowerName,
    borrowerId,
    borrowerContact: $("borrowerContact").value.trim(),
    equipmentId,
    equipmentName: item.name,
    quantity,
    borrowDate,
    dueDate,
    returnedAt: "",
    status: "Borrowed",
    returnCondition: "",
    returnNotes: "",
    createdAt: new Date().toISOString()
  };

  item.availableQuantity -= quantity;
  borrowings.unshift(borrowing);

  if (!saveData()) {
    item.availableQuantity += quantity;
    borrowings.shift();
    return;
  }

  $("borrowForm").reset();
  $("borrowQuantity").value = 1;
  setDates();
  renderAll();
  notify("Borrow transaction recorded!");
}

// ---------- RETURN ----------

function openReturnDialog(id) {
  const borrowing = borrowings.find(b => b.id === id && b.status === "Borrowed");
  if (!borrowing) return;

  $("returnBorrowId").value = id;
  $("returnSummary").textContent =
    `${borrowing.borrowerName} · ${borrowing.equipmentName} · ${borrowing.quantity} unit(s)`;

  $("returnCondition").value = "Good";
  $("returnNotes").value = "";

  $("returnDialog").showModal();
}

function confirmReturn() {
  const id = $("returnBorrowId").value;
  const borrowing = borrowings.find(b => b.id === id && b.status === "Borrowed");

  if (!borrowing) {
    notify("Hindi makita ang active borrowing record.");
    return;
  }

  const item = inventory.find(x => x.id === borrowing.equipmentId);
  if (!item) {
    notify("Hindi makita ang equipment record.");
    return;
  }

  const condition = $("returnCondition").value;
  const notes = $("returnNotes").value.trim();
  const isUnusable = ["Damaged", "Needs Repair"].includes(condition);

  borrowing.status = "Returned";
  borrowing.returnedAt = todayISO();
  borrowing.returnCondition = condition;
  borrowing.returnNotes = notes;

  if (isUnusable) {
    item.unavailableQuantity += borrowing.quantity;
  } else {
    item.availableQuantity += borrowing.quantity;
  }

  if (!saveData()) {
    borrowing.status = "Borrowed";
    borrowing.returnedAt = "";
    borrowing.returnCondition = "";
    borrowing.returnNotes = "";
    if (isUnusable) item.unavailableQuantity -= borrowing.quantity;
    else item.availableQuantity -= borrowing.quantity;
    return;
  }

  $("returnDialog").close();
  renderAll();
  notify("Return recorded successfully!");
}

// ---------- ACTIVE BORROWINGS ----------

function renderActiveBorrowings() {
  const active = borrowings.filter(b => b.status === "Borrowed");

  $("activeBorrowingsBody").innerHTML = active.length
    ? active.map(b => `
      <tr>
        <td><strong>${escapeHTML(b.borrowerName)}</strong><br>
          <span class="muted">${escapeHTML(b.equipmentName)}</span><br>
          <small>${escapeHTML(b.borrowerId)}</small>
        </td>
        <td>${dateLabel(b.dueDate)}</td>
        <td>${b.quantity}</td>
        <td><button class="table-action" data-return="${escapeHTML(b.id)}">Return</button></td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="muted">No active borrowings.</td></tr>`;
}

// ---------- HISTORY ----------

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
        <td><strong>${escapeHTML(b.borrowerName)}</strong><br><small>${escapeHTML(b.borrowerId)}</small></td>
        <td>${escapeHTML(b.equipmentName)}</td>
        <td>${b.quantity}</td>
        <td>${dateLabel(b.borrowDate)}</td>
        <td>${dateLabel(b.dueDate)}</td>
        <td>${dateLabel(b.returnedAt)}</td>
        <td><span class="status ${b.status === "Borrowed" ? "borrowed" : ""}">${b.status === "Borrowed" ? "Active" : "Returned"}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="muted">No matching transactions.</td></tr>`;
}

// ---------- NOTIFICATIONS ----------

function renderNotifications() {
  const active = borrowings.filter(b => b.status === "Borrowed");
  const overdue = active.filter(b => b.dueDate < todayISO());
  const dueToday = active.filter(b => b.dueDate === todayISO());

  const alerts = [
    ...overdue.map(b => ({ b, label: "OVERDUE", kind: "overdue" })),
    ...dueToday.map(b => ({ b, label: "DUE TODAY", kind: "today" }))
  ];

  $("overdueCount").textContent = overdue.length;
  $("dueTodayCount").textContent = dueToday.length;
  $("notificationBadge").textContent = alerts.length;
  $("notificationBadge").classList.toggle("hidden", alerts.length === 0);

  $("notificationList").innerHTML = alerts.length
    ? alerts.map(({ b, label, kind }) => `
      <div class="notification ${kind === "overdue" ? "overdue" : ""}">
        <div>
          <strong>${label}: ${escapeHTML(b.equipmentName)} — ${escapeHTML(b.borrowerName)}</strong>
          <small>ID: ${escapeHTML(b.borrowerId)} · Due ${dateLabel(b.dueDate)} · ${b.quantity} unit(s)</small>
        </div>
        <button class="table-action" data-alert-return="${escapeHTML(b.id)}">Process return</button>
      </div>
    `).join("")
    : `<p class="muted">No overdue or due-today transactions.</p>`;
}

// ---------- DASHBOARD / ANALYTICS ----------

function renderAnalytics() {
  const total = inventory.reduce((sum, x) => sum + Number(x.totalQuantity || 0), 0);
  const available = inventory.reduce((sum, x) => sum + Number(x.availableQuantity || 0), 0);
  const unavailable = inventory.reduce((sum, x) => sum + Number(x.unavailableQuantity || 0), 0);
  const borrowed = borrowings
    .filter(b => b.status === "Borrowed")
    .reduce((sum, b) => sum + Number(b.quantity || 0), 0);

  $("totalItems").textContent = inventory.length;
  $("totalQuantity").textContent = total;
  $("availableItems").textContent = available;
  $("borrowedItems").textContent = borrowed;

  const max = Math.max(total, 1);
  const values = [
    ["Available", available],
    ["Borrowed", borrowed],
    ["Unavailable", unavailable]
  ];

  $("analyticsBars").innerHTML = values.map(([label, value]) => `
    <div class="bar-row">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, value / max * 100)}%"></div></div>
      <strong class="bar-count">${value}</strong>
    </div>
  `).join("");
}

function renderAll() {
  renderInventory();
  renderBorrowSelect();
  renderActiveBorrowings();
  renderHistory();
  renderNotifications();
  renderAnalytics();
}

// ---------- CSV EXPORT ----------

function exportHistory() {
  const headers = [
    "Borrower", "Borrower ID", "Contact", "Equipment", "Quantity",
    "Borrow Date", "Due Date", "Returned Date", "Status",
    "Return Condition", "Return Notes"
  ];

  const rows = borrowings.map(b => [
    b.borrowerName, b.borrowerId, b.borrowerContact, b.equipmentName,
    b.quantity, b.borrowDate, b.dueDate, b.returnedAt, b.status,
    b.returnCondition, b.returnNotes
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `eborrow-history-${todayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------- QR CODE ----------

function showEquipmentQr(item) {
  selectedQrEquipmentId = item.id;
  $("scanResult").textContent = `Selected: ${item.name} (ID: ${item.id})`;
  $("makeQr").disabled = false;
  $("qrOutput").innerHTML = "";

  if (window.QRCode) {
    new QRCode($("qrOutput"), {
      text: `EBORROW:${item.id}`,
      width: 160,
      height: 160
    });
  } else {
    $("qrOutput").textContent = `QR payload: EBORROW:${item.id}`;
    notify("QR generator library did not load.");
  }
}

async function startScanner() {
  if (!window.Html5Qrcode) {
    notify("QR scanner library did not load. Check your internet connection.");
    return;
  }

  try {
    if (!qrScanner) qrScanner = new Html5Qrcode("qr-reader");

    $("startScanner").disabled = true;

    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async decodedText => {
        await stopScanner();

        const id = decodedText.startsWith("EBORROW:")
          ? decodedText.slice(8)
          : decodedText;

        const item = inventory.find(x => x.id === id);

        if (item) {
          showEquipmentQr(item);
          $("scanResult").textContent =
            `Found: ${item.name} · ${item.availableQuantity}/${item.totalQuantity} available`;
          notify("Equipment found.");
        } else {
          $("scanResult").textContent = `QR scanned: ${decodedText}. No matching equipment found.`;
          notify("Walang matching equipment sa inventory.");
        }
      },
      () => {}
    );

    $("stopScanner").disabled = false;
  } catch (error) {
    console.error("Scanner error:", error);
    $("startScanner").disabled = false;
    notify("Hindi mabuksan ang camera. Payagan ang camera access at gumamit ng HTTPS.");
  }
}

async function stopScanner() {
  if (qrScanner && qrScanner.isScanning) {
    try {
      await qrScanner.stop();
      await qrScanner.clear();
    } catch (error) {
      console.warn("Scanner stop:", error);
    }
  }

  $("startScanner").disabled = false;
  $("stopScanner").disabled = true;
}

// ---------- DATE DEFAULTS ----------

function setDates() {
  $("borrowDate").value = todayISO();
  $("dueDate").value = todayISO();
  $("dueDate").min = todayISO();
}

// ---------- EVENT LISTENERS ----------

function bindEvents() {
  $("adminToggleButton").addEventListener("click", toggleAdmin);

  $("addEquipmentTop").addEventListener("click", openAddForm);
  $("addEquipmentButton").addEventListener("click", openAddForm);
  $("quickAdd").addEventListener("click", openAddForm);

  $("cancelForm").addEventListener("click", closeEquipmentForm);
  $("inventoryForm").addEventListener("submit", saveEquipment);
  $("itemImage").addEventListener("change", handleImageChange);

  $("inventoryList").addEventListener("click", handleInventoryClick);

  $("searchInput").addEventListener("input", renderInventory);
  $("filterCategory").addEventListener("change", renderInventory);
  $("filterStatus").addEventListener("change", renderInventory);

  $("borrowForm").addEventListener("submit", saveBorrow);
  $("borrowDate").addEventListener("change", () => {
    $("dueDate").min = $("borrowDate").value;
  });
  $("quickBorrow").addEventListener("click", () => {
    $("borrow").scrollIntoView({ behavior: "smooth" });
  });

  $("activeBorrowingsBody").addEventListener("click", event => {
    const button = event.target.closest("[data-return]");
    if (button) openReturnDialog(button.dataset.return);
  });

  $("notificationList").addEventListener("click", event => {
    const button = event.target.closest("[data-alert-return]");
    if (button) openReturnDialog(button.dataset.alertReturn);
  });

  $("confirmReturn").addEventListener("click", confirmReturn);
  $("cancelReturn").addEventListener("click", () => $("returnDialog").close());

  $("historySearch").addEventListener("input", renderHistory);
  $("historyStatus").addEventListener("change", renderHistory);
  $("exportHistory").addEventListener("click", exportHistory);

  $("makeQr").addEventListener("click", () => {
    const item = inventory.find(x => x.id === selectedQrEquipmentId);
    if (item) showEquipmentQr(item);
  });

  $("quickScan").addEventListener("click", () => {
    $("qrSection").scrollIntoView({ behavior: "smooth" });
  });

  $("startScanner").addEventListener("click", startScanner);
  $("stopScanner").addEventListener("click", stopScanner);
}

// ---------- START APPLICATION ----------

function init() {
  loadData();
  bindEvents();
  setDates();
  updateAdminUI();
  renderAll();

  console.log("E-BORROW loaded successfully.");
  console.log("Inventory records:", inventory.length);
}

document.addEventListener("DOMContentLoaded", init);

window.addEventListener("beforeunload", () => {
  if (qrScanner?.isScanning) {
    qrScanner.stop().catch(() => {});
  }
});

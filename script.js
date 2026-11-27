// ========================================
// E-BORROW ELECTRONIC INVENTORY SYSTEM
// ========================================

// LOAD INVENTORY DATA
function loadInventory() {
    try {
        return JSON.parse(localStorage.getItem("eb_inventory")) || [];
    } catch (error) {
        return [];
    }
}

let inventory = loadInventory();
let editingId = null;
let selectedImage = "";

// SAVE INVENTORY
function saveInventory() {
    try {
        localStorage.setItem(
            "eb_inventory",
            JSON.stringify(inventory)
        );
        return true;
    } catch (error) {
        alert("Storage is full. Try using a smaller image.");
        return false;
    }
}

// ESCAPE HTML
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// IMAGE UPLOAD
document.getElementById("itemImage")
    .addEventListener("change", function(event) {

        const file = event.target.files[0];

        if (!file) return;

        if (!["image/jpeg", "image/png", "image/webp"]
            .includes(file.type)) {
            alert("Please select a JPG, PNG, or WEBP image.");
            event.target.value = "";
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert("Image must be smaller than 10MB.");
            event.target.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = function(e) {
            const img = new Image();

            img.onload = function() {
                const canvas = document.createElement("canvas");

                const maxSize = 900;

                let width = img.width;
                let height = img.height;

                if (width > height && width > maxSize) {
                    height = Math.round(height * maxSize / width);
                    width = maxSize;
                } else if (height > maxSize) {
                    width = Math.round(width * maxSize / height);
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;

                const context = canvas.getContext("2d");

                context.drawImage(img, 0, 0, width, height);

                selectedImage = canvas.toDataURL(
                    "image/jpeg",
                    0.75
                );

                showImagePreview(selectedImage);
            };

            img.onerror = function() {
                alert("Unable to read this image.");
            };

            img.src = e.target.result;
        };

        reader.onerror = function() {
            alert("Unable to load image.");
        };

        reader.readAsDataURL(file);
    });

// SHOW IMAGE PREVIEW
function showImagePreview(image) {
    const preview = document.getElementById("imagePreview");
    const placeholder = document.getElementById("uploadPlaceholder");

    if (image) {
        preview.src = image;
        preview.classList.remove("hidden");
        placeholder.classList.add("hidden");
    } else {
        preview.removeAttribute("src");
        preview.classList.add("hidden");
        placeholder.classList.remove("hidden");
    }
}

// RESET FORM
function resetForm() {
    document.getElementById("inventoryForm").reset();

    editingId = null;
    selectedImage = "";

    showImagePreview("");

    document.getElementById("formTitle").textContent =
        "Add New Equipment";

    document.getElementById("saveButton").textContent =
        "Save Equipment";
}

// SHOW ADD FORM
function showAddForm() {
    resetForm();

    document.getElementById("addItem").classList.remove("hidden");

    document.getElementById("addItem").scrollIntoView({
        behavior: "smooth"
    });
}

// CANCEL FORM
function cancelForm() {
    resetForm();

    document.getElementById("addItem").classList.add("hidden");
}

// SAVE OR UPDATE EQUIPMENT
document.getElementById("inventoryForm")
    .addEventListener("submit", function(event) {

        event.preventDefault();

        const name = document.getElementById("itemName")
            .value.trim();

        const category = document.getElementById("itemCategory")
            .value;

        const quantity = Number(
            document.getElementById("itemQuantity").value
        );

        const condition = document.getElementById("itemCondition")
            .value;

        const description = document.getElementById("itemDescription")
            .value.trim();

        if (!name || !category || !Number.isInteger(quantity) ||
            quantity < 1) {
            alert("Please enter valid equipment information.");
            return;
        }

        if (editingId !== null) {

            const index = inventory.findIndex(
                item => item.id === editingId
            );

            if (index === -1) {
                alert("Equipment not found.");
                return;
            }

            const updatedItem = {
                ...inventory[index],
                name,
                category,
                quantity,
                condition,
                description,
                image: selectedImage || inventory[index].image || ""
            };

            inventory[index] = updatedItem;

        } else {

            const newItem = {
                id: Date.now(),
                name,
                category,
                quantity,
                condition,
                description,
                image: selectedImage,
                dateAdded: new Date().toISOString()
            };

            inventory.push(newItem);
        }

        if (!saveInventory()) return;

        resetForm();

        document.getElementById("addItem")
            .classList.add("hidden");

        renderInventory();

        alert(
            editingId === null
                ? "Equipment added successfully!"
                : "Equipment updated successfully!"
        );

    });

// INVENTORY DISPLAY
function renderInventory() {

    const container = document.getElementById("inventoryList");

    const search = document.getElementById("searchInput")
        .value.toLowerCase().trim();

    const category = document.getElementById("filterCategory").value;
    const status = document.getElementById("filterStatus").value;

    const filtered = inventory.filter(item => {

        const matchesSearch =
            item.name.toLowerCase().includes(search) ||
            item.category.toLowerCase().includes(search) ||
            item.description.toLowerCase().includes(search);

        const matchesCategory =
            category === "All" || item.category === category;

        const itemStatus = getStatus(item);

        const matchesStatus =
            status === "All" || itemStatus === status;

        return matchesSearch &&
            matchesCategory &&
            matchesStatus;
    });

    document.getElementById("emptyMessage")
        .classList.toggle("hidden", filtered.length !== 0);

    container.innerHTML = filtered.map(item => {

        const itemStatus = getStatus(item);

        const imageHTML = item.image
            ? `<img class="item-image"
                    src="${item.image}"
                    alt="${escapeHTML(item.name)}">`
            : <div class="no-image">📦</div>;

        return `
            <div class="inventory-card">

                ${imageHTML}

                <div class="item-content">

                    <h3>${escapeHTML(item.name)}</h3>

                    <p>${escapeHTML(item.category)}</p>

                    <p>
                        Quantity: <strong>${item.quantity}</strong>
                    </p>

                    <p>
                        Condition: ${escapeHTML(item.condition)}
                    </p>

                    <p>
                        ${escapeHTML(item.description || "No description")}
                    </p>

                    <span class="status ${
                        itemStatus === "Borrowed"
                            ? "borrowed"
                            : itemStatus === "Unavailable"
                                ? "unavailable"
                                : ""
                    }">
                        ${itemStatus}
                    </span>

                    <div class="item-actions">

                        <button class="edit-btn"
                            onclick="editItem(${item.id})">
                            Edit
                        </button>

                        <button class="delete-btn"
                            onclick="deleteItem(${item.id})">
                            Delete
                        </button>

                    </div>

                </div>

            </div>
        `;
    }).join("");

    updateDashboard();
}

// GET EQUIPMENT STATUS
function getStatus(item) {

    if (item.condition === "Damaged") {
        return "Unavailable";
    }

    if (item.condition === "Needs Repair") {
        return "Unavailable";
    }

    if (item.quantity <= 0) {
        return "Unavailable";
    }

    if (item.status === "Borrowed") {
        return "Borrowed";
    }

    return "Available";
}

// EDIT EQUIPMENT
function editItem(id) {

    const item = inventory.find(item => item.id === id);

    if (!item) {
        alert("Equipment not found.");
        return;
    }

    editingId = id;

    selectedImage = item.image || "";

    document.getElementById("itemName").value = item.name;
    document.getElementById("itemCategory").value = item.category;
    document.getElementById("itemQuantity").value = item.quantity;
    document.getElementById("itemCondition").value = item.condition;
    document.getElementById("itemDescription").value =
        item.description || "";

    showImagePreview(selectedImage);

    document.getElementById("formTitle").textContent =
        "Edit Equipment";

    document.getElementById("saveButton").textContent =
        "Update Equipment";

    document.getElementById("addItem").classList.remove("hidden");

    document.getElementById("addItem").scrollIntoView({
        behavior: "smooth"
    });
}

// DELETE EQUIPMENT
function deleteItem(id) {

    const item = inventory.find(item => item.id === id);

    if (!item) return;

    const confirmDelete = confirm(
        "Are you sure you want to delete " + item.name + "?"
    );

    if (!confirmDelete) return;

    inventory = inventory.filter(item => item.id !== id);

    if (!saveInventory()) return;

    renderInventory();

    alert("Equipment deleted successfully!");
}

// DASHBOARD STATISTICS
function updateDashboard() {

    const totalItems = inventory.length;

    const totalQuantity = inventory.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
    );

    const available = inventory
        .filter(item => getStatus(item) === "Available")
        .reduce((total, item) => total + Number(item.quantity || 0), 0);

    const borrowed = inventory
        .filter(item => getStatus(item) === "Borrowed")
        .reduce((total, item) => total + Number(item.quantity || 0), 0);

    document.getElementById("totalItems").textContent =
        totalItems;

    document.getElementById("totalQuantity").textContent =
        totalQuantity;

    document.getElementById("availableItems").textContent =
        available;

    document.getElementById("borrowedItems").textContent =
        borrowed;
}

// INITIALIZE INVENTORY
renderInventory();

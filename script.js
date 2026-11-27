// ==========================================
// E-BORROW - FIREBASE FIRESTORE SYSTEM
// ==========================================

// FIREBASE IMPORTS

import { initializeApp } from
"https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from
"https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    runTransaction,
    serverTimestamp
} from
"https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// ==========================================
// FIREBASE CONFIGURATION
// ==========================================

// PALITAN ITO NG ACTUAL FIREBASE CONFIG MO

const firebaseConfig = {

    apiKey: "YOUR_API_KEY",

    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",

    projectId: "YOUR_PROJECT_ID",

    storageBucket: "YOUR_PROJECT_ID.appspot.com",

    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",

    appId: "YOUR_APP_ID"

};


// INITIALIZE FIREBASE

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


// FIRESTORE COLLECTIONS

const equipmentCol = collection(db, "equipment");

const borrowingsCol = collection(db, "borrowings");


// ==========================================
// GLOBAL VARIABLES
// ==========================================

let inventory = [];

let borrowings = [];

let editingId = null;

let selectedImage = "";

let selectedQrEquipmentId = null;

let unsubscribeEquipment = null;

let unsubscribeBorrowings = null;

let qrScanner = null;

let toastTimer = null;


// ==========================================
// HELPER FUNCTIONS
// ==========================================

const $ = id => document.getElementById(id);


const todayISO = () => {

    const d = new Date();

    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

};


const escapeHTML = value =>

    String(value ?? "").replace(/[&<>"']/g, c => ({

        "&":"&amp;",

        "<":"&lt;",

        ">":"&gt;",

        '"':"&quot;",

        "'":"&#39;"

    })[c]);


const dateLabel = value =>

    value
        ? new Date(`${value}T00:00:00`).toLocaleDateString()
        : "—";


// TOAST NOTIFICATION

const notify = message => {

    const toast = $("toast");

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        toast.classList.remove("show");

    }, 3200);

};


// SHOW OR HIDE APPLICATION

const showApp = signedIn => {

    $("authPanel").classList.toggle("hidden", signedIn);

    $("appContent").classList.toggle("hidden", !signedIn);

    $("signOutButton").classList.toggle("hidden", !signedIn);

};


// GET EQUIPMENT STATUS

const statusFor = item => {

    const unavailable = Number(item.unavailableQuantity || 0);

    const borrowed =
        Number(item.totalQuantity || 0) -
        Number(item.availableQuantity || 0) -
        unavailable;

    if (["Damaged", "Needs Repair"].includes(item.condition)) {

        return "Unavailable";

    }

    if (Number(item.availableQuantity) <= 0 && borrowed <= 0) {

        return "Unavailable";

    }

    if (borrowed > 0) {

        return "Borrowed";

    }

    return "Available";

};


// ==========================================
// FIREBASE AUTHENTICATION
// ==========================================


// LOGIN

$("authForm").addEventListener("submit", async e => {

    e.preventDefault();

    try {

        await signInWithEmailAndPassword(

            auth,

            $("authEmail").value.trim(),

            $("authPassword").value

        );

    } catch (err) {

        notify(authError(err));

    }

});


// REGISTER

$("registerButton").addEventListener("click", async () => {

    try {

        await createUserWithEmailAndPassword(

            auth,

            $("authEmail").value.trim(),

            $("authPassword").value

        );

        notify("Account created. You are signed in.");

    } catch (err) {

        notify(authError(err));

    }

});


// LOGOUT

$("signOutButton").addEventListener("click", async () => {

    await stopScanner();

    await signOut(auth);

});


// AUTH ERROR HANDLER

function authError(err) {

    const messages = {

        "auth/invalid-email":
            "Enter a valid email address.",

        "auth/weak-password":
            "Use a password with at least 6 characters.",

        "auth/email-already-in-use":
            "An account already exists for this email.",

        "auth/invalid-credential":
            "Incorrect email or password.",

        "auth/operation-not-allowed":
            "Enable Email/Password sign-in in Firebase Authentication."

    };

    return messages[err.code] || err.message || "Authentication failed.";

}


// AUTH STATE LISTENER

onAuthStateChanged(auth, user => {

    $("userEmail").textContent = user ? user.email : "Not signed in";

    showApp(!!user);

    if (user) {

        startDataListeners();

    } else {

        if (unsubscribeEquipment) unsubscribeEquipment();

        if (unsubscribeBorrowings) unsubscribeBorrowings();

        inventory = [];

        borrowings = [];

    }

});


// ==========================================
// FIRESTORE REAL-TIME DATABASE
// ==========================================

function startDataListeners() {

    if (unsubscribeEquipment) unsubscribeEquipment();

    if (unsubscribeBorrowings) unsubscribeBorrowings();


    // EQUIPMENT LISTENER

    unsubscribeEquipment = onSnapshot(

        query(equipmentCol, orderBy("name")),

        snap => {

            inventory = snap.docs.map(d => ({

                id: d.id,

                ...d.data()

            }));

            renderAll();

        },

        err => notify("Inventory read failed: " + err.message)

    );


    // BORROWING LISTENER

    unsubscribeBorrowings = onSnapshot(

        query(borrowingsCol, orderBy("createdAt", "desc")),

        snap => {

            borrowings = snap.docs.map(d => ({

                id: d.id,

                ...d.data()

            }));

            renderAll();

        },

        err => notify("Borrowing history read failed: " + err.message)

    );

}


// ==========================================
// EQUIPMENT FORM
// ==========================================


// RESET FORM

function resetForm() {

    $("inventoryForm").reset();

    editingId = null;

    selectedImage = "";

    showImagePreview("");

    $("formTitle").textContent = "Add New Equipment";

    $("saveButton").textContent = "Save Equipment";

}


// OPEN ADD FORM

function openAddForm() {

    resetForm();

    $("addItem").classList.remove("hidden");

    $("addItem").scrollIntoView({

        behavior: "smooth"

    });

}


// IMAGE PREVIEW

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


// ADD BUTTONS

$("addEquipmentTop").addEventListener("click", openAddForm);

$("addEquipmentButton").addEventListener("click", openAddForm);

$("quickAdd").addEventListener("click", openAddForm);


// CANCEL FORM

$("cancelForm").addEventListener("click", () => {

    resetForm();

    $("addItem").classList.add("hidden");

});


// ==========================================
// IMAGE UPLOAD
// ==========================================

$("itemImage").addEventListener("change", e => {

    const file = e.target.files?.[0];

    if (!file) return;


    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {

        notify("Choose a JPG, PNG, or WEBP image.");

        e.target.value = "";

        return;

    }


    if (file.size > 5 * 1024 * 1024) {

        notify("Image must be 5MB or smaller.");

        e.target.value = "";

        return;

    }


    const reader = new FileReader();


    reader.onload = () => {

        const image = new Image();


        image.onload = () => {

            const scale = Math.min(

                1,

                900 / Math.max(image.width, image.height)

            );


            const canvas = document.createElement("canvas");


            canvas.width = Math.round(image.width * scale);

            canvas.height = Math.round(image.height * scale);


            canvas.getContext("2d").drawImage(

                image,

                0,

                0,

                canvas.width,

                canvas.height

            );


            selectedImage = canvas.toDataURL("image/jpeg", 0.72);

            showImagePreview(selectedImage);

        };


        image.onerror = () => notify("Unable to process this image.");

        image.src = reader.result;

    };


    reader.onerror = () => notify("Unable to read this image.");

    reader.readAsDataURL(file);

});


// ==========================================
// SAVE OR UPDATE EQUIPMENT
// ==========================================

$("inventoryForm").addEventListener("submit", async e => {

    e.preventDefault();


    const name = $("itemName").value.trim();

    const category = $("itemCategory").value;

    const totalQuantity = Number($("itemQuantity").value);

    const condition = $("itemCondition").value;

    const description = $("itemDescription").value.trim();


    if (

        !name ||

        !category ||

        !Number.isInteger(totalQuantity) ||

        totalQuantity < 1

    ) {

        notify("Enter a name, category, and valid quantity.");

        return;

    }


    try {

        // UPDATE EXISTING EQUIPMENT

        if (editingId) {

            const old = inventory.find(x => x.id === editingId);

            if (!old) throw new Error("Equipment record no longer exists.");


            const unavailableCount = Number(old.unavailableQuantity || 0);

            const borrowedCount =

                Number(old.totalQuantity) -

                Number(old.availableQuantity) -

                unavailableCount;


            if (totalQuantity < borrowedCount + unavailableCount) {

                notify(

                    `Quantity cannot be lower than the ${borrowedCount} borrowed plus ${unavailableCount} unavailable unit(s).`

                );

                return;

            }


            await updateDoc(

                doc(db, "equipment", editingId),

                {

                    name,

                    category,

                    totalQuantity,

                    unavailableQuantity: unavailableCount,

                    availableQuantity:

                        totalQuantity - borrowedCount - unavailableCount,

                    condition,

                    description,

                    image: selectedImage || old.image || "",

                    updatedAt: serverTimestamp()

                }

            );


            notify("Equipment updated.");


        } else {


            // ADD NEW EQUIPMENT

            await addDoc(equipmentCol, {

                name,

                category,

                totalQuantity,

                availableQuantity: totalQuantity,

                unavailableQuantity: 0,

                condition,

                description,

                image: selectedImage,

                createdAt: serverTimestamp(),

                createdBy: auth.currentUser.uid

            });


            notify("Equipment added.");

        }


        resetForm();

        $("addItem").classList.add("hidden");


    } catch (err) {

        notify("Save failed: " + err.message);

    }

});


// ==========================================
// INVENTORY DISPLAY
// ==========================================

function renderInventory() {

    const search = $("searchInput").value.toLowerCase().trim();

    const category = $("filterCategory").value;

    const filterStatus = $("filterStatus").value;


    const filtered = inventory.filter(item => {

        const haystack =

            `${item.name} ${item.category} ${item.description || ""}`.toLowerCase();


        return (

            haystack.includes(search) &&

            (category === "All" || item.category === category) &&

            (filterStatus === "All" || statusFor(item) === filterStatus)

        );

    });


    $("emptyMessage").classList.toggle(

        "hidden",

        filtered.length !== 0

    );


    $("inventoryList").innerHTML = filtered.map(item => {

        const status = statusFor(item);


        const image = item.image

            ? `<img class="item-image" src="${item.image}" alt="${escapeHTML(item.name)}">`

            : `<div class="no-image">📦</div>`;


        return `

            <article class="inventory-card">

                ${image}

                <div class="item-content">

                    <h3>${escapeHTML(item.name)}</h3>

                    <p>${escapeHTML(item.category)}</p>

                    <p>

                        Available:

                        <strong>${Number(item.availableQuantity) || 0}</strong>

                        /

                        ${Number(item.totalQuantity) || 0}

                    </p>

                    <p>

                        Condition: ${escapeHTML(item.condition)}

                    </p>

                    <p>

                        ${escapeHTML(item.description || "No description")}

                    </p>

                    <span class="status ${

                        status === "Borrowed"

                            ? "borrowed"

                            : status === "Unavailable"

                                ? "unavailable"

                                : ""

                    }">

                        ${status}

                    </span>

                    <div class="item-actions">

                        <button

                            class="edit-btn"

                            data-action="edit"

                            data-id="${item.id}">

                            Edit

                        </button>

                        <button

                            class="secondary-btn"

                            data-action="qr"

                            data-id="${item.id}">

                            QR Code

                        </button>

                        <button

                            class="delete-btn danger-btn"

                            data-action="delete"

                            data-id="${item.id}">

                            Delete

                        </button>

                    </div>

                </div>

            </article>

        `;

    }).join("");

}


// INVENTORY ACTIONS

$("inventoryList").addEventListener("click", async e => {

    const btn = e.target.closest("button[data-action]");

    if (!btn) return;


    const item = inventory.find(x => x.id === btn.dataset.id);

    if (!item) return;


    // EDIT

    if (btn.dataset.action === "edit") {

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

        $("addItem").scrollIntoView({

            behavior: "smooth"

        });

    }


    // DELETE

    else if (btn.dataset.action === "delete") {

        const active = borrowings.some(

            b => b.equipmentId === item.id && b.status === "Borrowed"

        );


        if (active) {

            notify("This equipment has active borrowings. Process returns before deleting it.");

            return;

        }


        if (confirm(`Delete ${item.name}? This cannot be undone.`)) {

            try {

                await deleteDoc(doc(db, "equipment", item.id));

                notify("Equipment deleted.");

            } catch (err) {

                notify("Delete failed: " + err.message);

            }

        }

    }


    // QR CODE

    else if (btn.dataset.action === "qr") {

        selectedQrEquipmentId = item.id;

        await showEquipmentQr(item);

    }

});


// ==========================================
// BORROW EQUIPMENT
// ==========================================


// AVAILABLE EQUIPMENT DROPDOWN

function renderBorrowSelect() {

    const available = inventory.filter(x =>

        Number(x.availableQuantity) > 0 &&

        !["Damaged", "Needs Repair"].includes(x.condition)

    );


    $("borrowEquipment").innerHTML =

        `<option value="">Select available equipment</option>` +

        available.map(x =>

            `<option value="${x.id}">

                ${escapeHTML(x.name)} (${x.availableQuantity} available)

            </option>`

        ).join("");

}


// SET DEFAULT DATES

$("borrowDate").value = todayISO();

$("dueDate").value = todayISO();


$("borrowDate").addEventListener("change", () => {

    $("dueDate").min = $("borrowDate").value;

});


$("quickBorrow").addEventListener("click", () => {

    $("borrow").scrollIntoView({

        behavior: "smooth"

    });

});


// BORROW TRANSACTION

$("borrowForm").addEventListener("submit", async e => {

    e.preventDefault();


    const equipmentId = $("borrowEquipment").value;

    const qty = Number($("borrowQuantity").value);

    const borrowDate = $("borrowDate").value;

    const dueDate = $("dueDate").value;


    if (

        !equipmentId ||

        !Number.isInteger(qty) ||

        qty < 1 ||

        !borrowDate ||

        !dueDate ||

        dueDate < borrowDate

    ) {

        notify("Check the equipment, quantity, and dates.");

        return;

    }


    const equipmentRef = doc(db, "equipment", equipmentId);


    try {

        await runTransaction(db, async tx => {

            const equipmentSnap = await tx.get(equipmentRef);


            if (!equipmentSnap.exists()) {

                throw new Error("Equipment record not found.");

            }


            const equipment = equipmentSnap.data();


            if (qty > Number(equipment.availableQuantity)) {

                throw new Error("Not enough available units.");

            }


            if (["Damaged", "Needs Repair"].includes(equipment.condition)) {

                throw new Error("This equipment is unavailable due to its condition.");

            }


            const borrowingRef = doc(borrowingsCol);


            tx.update(equipmentRef, {

                availableQuantity:

                    Number(equipment.availableQuantity) - qty,

                updatedAt: serverTimestamp()

            });


            tx.set(borrowingRef, {

                borrowerName: $("borrowerName").value.trim(),

                borrowerId: $("borrowerId").value.trim(),

                borrowerContact: $("borrowerContact").value.trim(),

                equipmentId,

                equipmentName: equipment.name,

                quantity: qty,

                borrowDate,

                dueDate,

                status: "Borrowed",

                returnCondition: "",

                returnNotes: "",

                returnedAt: "",

                createdAt: serverTimestamp(),

                createdBy: auth.currentUser.uid

            });

        });


        $("borrowForm").reset();

        $("borrowQuantity").value = 1;

        $("borrowDate").value = todayISO();

        $("dueDate").value = todayISO();


        notify("Borrow transaction recorded.");


    } catch (err) {

        notify("Borrow failed: " + err.message);

    }

});


// ==========================================
// RETURN EQUIPMENT
// ==========================================


// OPEN RETURN DIALOG

function openReturnDialog(id) {

    const b = borrowings.find(x => x.id === id);

    if (!b) return;


    $("returnBorrowId").value = id;


    $("returnSummary").textContent =

        `${b.borrowerName} · ${b.equipmentName} · ${b.quantity} unit(s)`;


    $("returnCondition").value = "Good";

    $("returnNotes").value = "";


    $("returnDialog").showModal();

}


// CANCEL RETURN

$("cancelReturn").addEventListener("click", () => {

    $("returnDialog").close();

});


// CONFIRM RETURN

$("confirmReturn").addEventListener("click", async () => {

    const id = $("returnBorrowId").value;

    const b = borrowings.find(x => x.id === id);

    if (!b) return;


    const equipmentRef = doc(db, "equipment", b.equipmentId);

    const borrowingRef = doc(db, "borrowings", id);


    try {

        await runTransaction(db, async tx => {

            const [equipmentSnap, borrowingSnap] = await Promise.all([

                tx.get(equipmentRef),

                tx.get(borrowingRef)

            ]);


            if (

                !borrowingSnap.exists() ||

                borrowingSnap.data().status !== "Borrowed"

            ) {

                throw new Error("This transaction has already been returned.");

            }


            if (!equipmentSnap.exists()) {

                throw new Error("Equipment record is missing. Contact the administrator.");

            }


            const equipment = equipmentSnap.data();

            const condition = $("returnCondition").value;

            const unavailableNow = Number(equipment.unavailableQuantity || 0);

            const isUnusable =

                condition === "Damaged" ||

                condition === "Needs Repair";


            // RESTORE AVAILABLE STOCK

            tx.update(equipmentRef, {

                availableQuantity: Math.min(

                    Number(equipment.totalQuantity) -

                    unavailableNow -

                    (isUnusable ? Number(b.quantity) : 0),

                    Number(equipment.availableQuantity) +

                    (isUnusable ? 0 : Number(b.quantity))

                ),

                unavailableQuantity:

                    unavailableNow +

                    (isUnusable ? Number(b.quantity) : 0),

                updatedAt: serverTimestamp()

            });


            // UPDATE BORROWING RECORD

            tx.update(borrowingRef, {

                status: "Returned",

                returnedAt: todayISO(),

                returnCondition: condition,

                returnNotes: $("returnNotes").value.trim(),

                processedReturnBy: auth.currentUser.uid

            });

        });


        $("returnDialog").close();

        notify("Return recorded successfully.");


    } catch (err) {

        notify("Return failed: " + err.message);

    }

});


// ==========================================
// ACTIVE BORROWINGS
// ==========================================

function renderActiveBorrowings() {

    const active = borrowings.filter(

        b => b.status === "Borrowed"

    );


    $("activeBorrowingsBody").innerHTML = active.length

        ? active.map(b => `

            <tr>

                <td>

                    <strong>${escapeHTML(b.borrowerName)}</strong>

                    <br>

                    <span class="muted">

                        ${escapeHTML(b.equipmentName)}

                    </span>

                    <br>

                    <small>${escapeHTML(b.borrowerId)}</small>

                </td>

                <td>${dateLabel(b.dueDate)}</td>

                <td>${b.quantity}</td>

                <td>

                    <button

                        class="table-action"

                        data-return="${b.id}">

                        Return

                    </button>

                </td>

            </tr>

        `).join("")

        : `

            <tr>

                <td colspan="4" class="muted">

                    No active borrowings.

                </td>

            </tr>

        `;

}


// RETURN BUTTON

$("activeBorrowingsBody").addEventListener("click", e => {

    const btn = e.target.closest("[data-return]");

    if (btn) {

        openReturnDialog(btn.dataset.return);

    }

});


// ==========================================
// BORROWING HISTORY
// ==========================================

function renderHistory() {

    const search = $("historySearch").value.toLowerCase().trim();

    const status = $("historyStatus").value;


    const rows = borrowings.filter(b => {

        const hay =

            `${b.borrowerName} ${b.borrowerId} ${b.equipmentName}`.toLowerCase();


        return (

            hay.includes(search) &&

            (status === "All" || b.status === status)

        );

    });


    $("historyBody").innerHTML = rows.length

        ? rows.map(b => `

            <tr>

                <td>

                    <strong>${escapeHTML(b.borrowerName)}</strong>

                    <br>

                    <small>${escapeHTML(b.borrowerId)}</small>

                </td>

                <td>${escapeHTML(b.equipmentName)}</td>

                <td>${b.quantity}</td>

                <td>${dateLabel(b.borrowDate)}</td>

                <td>${dateLabel(b.dueDate)}</td>

                <td>${dateLabel(b.returnedAt)}</td>

                <td>

                    <span class="status ${

                        b.status === "Borrowed" ? "borrowed" : ""

                    }">

                        ${b.status === "Borrowed" ? "Active" : "Returned"}

                    </span>

                </td>

            </tr>

        `).join("")

        : `

            <tr>

                <td colspan="7" class="muted">

                    No matching transactions.

                </td>

            </tr>

        `;

}


// HISTORY SEARCH

$("historySearch").addEventListener("input", renderHistory);

$("historyStatus").addEventListener("change", renderHistory);


// ==========================================
// NOTIFICATIONS AND OVERDUE ALERTS
// ==========================================

function renderNotifications() {

    const active = borrowings.filter(

        b => b.status === "Borrowed"

    );


    const overdue = active.filter(

        b => b.dueDate < todayISO()

    );


    const dueToday = active.filter(

        b => b.dueDate === todayISO()

    );


    const alerts = [

        ...overdue.map(b => ({

            b,

            kind: "overdue",

            label: "OVERDUE"

        })),

        ...dueToday.map(b => ({

            b,

            kind: "today",

            label: "DUE TODAY"

        }))

    ];


    $("overdueCount").textContent = overdue.length;

    $("dueTodayCount").textContent = dueToday.length;


    $("notificationBadge").textContent = alerts.length;


    $("notificationBadge").classList.toggle(

        "hidden",

        alerts.length === 0

    );


    $("notificationList").innerHTML = alerts.length

        ? alerts.map(({ b, kind, label }) => `

            <div class="notification ${

                kind === "overdue" ? "overdue" : ""

            }">

                <div>

                    <strong>

                        ${label}: ${escapeHTML(b.equipmentName)}

                        —

                        ${escapeHTML(b.borrowerName)}

                    </strong>

                    <small>

                        ID: ${escapeHTML(b.borrowerId)}

                        · Due ${dateLabel(b.dueDate)}

                        · ${b.quantity} unit(s)

                    </small>

                </div>

                <button

                    class="table-action"

                    data-alert-return="${b.id}">

                    Process return

                </button>

            </div>

        `).join("")

        : `<p class="muted">No overdue or due-today transactions.</p>`;

}


// PROCESS RETURN FROM ALERT

$("notificationList").addEventListener("click", e => {

    const btn = e.target.closest("[data-alert-return]");

    if (btn) {

        openReturnDialog(btn.dataset.alertReturn);

    }

});


// ==========================================
// DASHBOARD ANALYTICS
// ==========================================

function renderAnalytics() {

    const total = inventory.reduce(

        (s, x) => s + Number(x.totalQuantity || 0),

        0

    );


    const available = inventory.reduce(

        (s, x) => s + Number(x.availableQuantity || 0),

        0

    );


    const unavailable = inventory.reduce(

        (s, x) => s + Number(x.unavailableQuantity || 0),

        0

    );


    const borrowed = Math.max(

        0,

        total - available - unavailable

    );


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

            <div class="bar-track">

                <div

                    class="bar-fill"

                    style="width:${Math.min(100, value / max * 100)}%">

                </div>

            </div>

            <strong class="bar-count">${value}</strong>

        </div>

    `).join("");

}


// ==========================================
// RENDER ALL DATA
// ==========================================

function renderAll() {

    renderInventory();

    renderBorrowSelect();

    renderActiveBorrowings();

    renderHistory();

    renderNotifications();

    renderAnalytics();

}


// SEARCH AND FILTERS

["searchInput", "filterCategory", "filterStatus"].forEach(id => {

    $(id).addEventListener(

        id === "searchInput" ? "input" : "change",

        renderInventory

    );

});


// ==========================================
// EXPORT BORROWING HISTORY TO CSV
// ==========================================

$("exportHistory").addEventListener("click", () => {

    const headers = [

        "Borrower",

        "Borrower ID",

        "Contact",

        "Equipment",

        "Quantity",

        "Borrow Date",

        "Due Date",

        "Returned Date",

        "Status",

        "Return Condition",

        "Return Notes"

    ];


    const rows = borrowings.map(b => [

        b.borrowerName,

        b.borrowerId,

        b.borrowerContact,

        b.equipmentName,

        b.quantity,

        b.borrowDate,

        b.dueDate,

        b.returnedAt,

        b.status,

        b.returnCondition,

        b.returnNotes

    ]);


    const csv = [headers, ...rows]

        .map(row => row.map(v =>

            `"${String(v ?? "").replace(/"/g, '""')}"`

        ).join(","))

        .join("\r\n");


    const url = URL.createObjectURL(

        new Blob([csv], {

            type: "text/csv;charset=utf-8"

        })

    );


    const a = document.createElement("a");

    a.href = url;

    a.download = `eborrow-history-${todayISO()}.csv`;

    a.click();


    URL.revokeObjectURL(url);

});


// ==========================================
// QR CODE GENERATOR
// ==========================================

// QR FORMAT:
// EBORROW:FIRESTORE_EQUIPMENT_DOCUMENT_ID

async function showEquipmentQr(item) {

    $("scanResult").textContent =

        `Selected: ${item.name} (ID: ${item.id})`;


    $("makeQr").disabled = false;

    $("qrOutput").innerHTML = "";


    if (window.QRCode) {

        new QRCode($("qrOutput"), {

            text: `EBORROW:${item.id}`,

            width: 160,

            height: 160

        });

    } else {

        $("qrOutput").textContent =

            `QR payload: EBORROW:${item.id}`;

    }

}


// SCROLL TO QR SECTION

$("inventoryList").addEventListener("click", e => {

    const btn = e.target.closest('button[data-action="qr"]');

    if (btn) {

        $("qrSection").scrollIntoView({

            behavior: "smooth"

        });

    }

});


// GENERATE SELECTED QR

$("makeQr").addEventListener("click", () => {

    const item = inventory.find(

        x => x.id === selectedQrEquipmentId

    );


    if (item) {

        showEquipmentQr(item);

    }

});


// QUICK SCAN BUTTON

$("quickScan").addEventListener("click", () => {

    $("qrSection").scrollIntoView({

        behavior: "smooth"

    });

});


// ==========================================
// QR CODE SCANNER
// ==========================================

async function startScanner() {

    if (!window.Html5Qrcode) {

        notify("QR scanner library did not load. Check your internet connection.");

        return;

    }


    try {

        if (!qrScanner) {

            qrScanner = new Html5Qrcode("qr-reader");

        }


        $("startScanner").disabled = true;


        await qrScanner.start(

            { facingMode: "environment" },

            {

                fps: 10,

                qrbox: {

                    width: 230,

                    height: 230

                }

            },


            async decodedText => {

                await stopScanner();


                const id = decodedText.startsWith("EBORROW:")

                    ? decodedText.slice(8)

                    : decodedText;


                const item = inventory.find(

                    x => x.id === id

                );


                if (item) {

                    selectedQrEquipmentId = item.id;

                    await showEquipmentQr(item);


                    $("scanResult").textContent =

                        `Found: ${item.name} · ${item.availableQuantity}/${item.totalQuantity} available`;

                } else {

                    $("scanResult").textContent =

                        `QR read: ${decodedText}. No matching equipment was found in this project.`;

                }


                notify(

                    item

                        ? "Equipment found."

                        : "QR code scanned, but no matching equipment was found."

                );

            },


            () => {}

        );


        $("stopScanner").disabled = false;


    } catch (err) {

        $("startScanner").disabled = false;


        notify(

            "Could not start camera. Allow camera access and use HTTPS or localhost."

        );

    }

}


// STOP SCANNER

async function stopScanner() {

    if (qrScanner && qrScanner.isScanning) {

        try {

            await qrScanner.stop();

        } catch (e) {}

    }


    $("startScanner").disabled = false;

    $("stopScanner").disabled = true;

}


// SCANNER BUTTONS

$("startScanner").addEventListener("click", startScanner);

$("stopScanner").addEventListener("click", stopScanner);


// STOP CAMERA WHEN LEAVING PAGE

window.addEventListener("beforeunload", () => {

    if (qrScanner?.isScanning) {

        qrScanner.stop();

    }

});

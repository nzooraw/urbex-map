// Importations Firebase
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, updateDoc, setDoc, getDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDOBN0gJwIbrZFOymSwP9BnzNudubPorkU",
    authDomain: "urbex-map-b907d.firebaseapp.com",
    databaseURL: "https://urbex-map-b907d-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "urbex-map-b907d",
    storageBucket: "urbex-map-b907d.firebasestorage.app",
    messagingSenderId: "91725857148",
    appId: "1:91725857148:web:fa7545a9dbbd075a6be4f9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Éléments du DOM
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const logoutButton = document.getElementById('btn-logout');
const statusMessage = document.getElementById('status-message');

// Éléments Personnalisés
const kmlInput = document.getElementById('kml-input');
const btnTriggerImport = document.getElementById('btn-trigger-import');
const locationsListEl = document.getElementById('locations-list');
const locationsCountEl = document.getElementById('locations-count');
const searchInput = document.getElementById('search-input');
const cursorLat = document.getElementById('cursor-lat');
const cursorLng = document.getElementById('cursor-lng');

// Configuration Admin
const ADMIN_EMAIL = "enzocomyn@protonmail.com";
let currentUser = null;
let userPermissions = { role: 'user', canAddPoints: false };

function isAdmin() {
    return (currentUser && currentUser.email === ADMIN_EMAIL) || (userPermissions.role === 'admin');
}

function canAddPoints() {
    return isAdmin() || userPermissions.canAddPoints;
}

let map = null;
let markersCluster = null;
let allLocations = [];
let activeFilters = new Set();

// Observateur d'Authentification
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        console.log("Autorisé :", user.email);

        // Récupération des permissions
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                userPermissions = userDoc.data();
            } else {
                userPermissions = { role: 'user', canAddPoints: false };
            }
        } catch (e) {
            console.error(e);
        }

        // MAJ Pseudo UI
        const displayNameEl = document.getElementById('user-display-name');
        if (displayNameEl) {
            // Pseudo > Email > 'Utilisateur'
            const pseudo = userPermissions.pseudo || user.email.split('@')[0] || 'Explorateur';
            displayNameEl.textContent = pseudo.toUpperCase();
        }

        loginScreen.style.display = 'none';
        appScreen.style.display = 'flex';

        // Mise à jour UI selon rôle
        if (isAdmin()) {
            document.body.classList.add('is-admin');
            if (btnTriggerImport) btnTriggerImport.style.display = 'block';
            const btnOpenAdmin = document.getElementById('btn-open-admin');
            if (btnOpenAdmin) btnOpenAdmin.style.display = 'block';
        } else {
            document.body.classList.remove('is-admin');

            if (btnTriggerImport) {
                btnTriggerImport.style.display = (isAdmin() || canAddPoints()) ? 'block' : 'none';
            }

            const btnOpenAdmin = document.getElementById('btn-open-admin');
            if (btnOpenAdmin) btnOpenAdmin.style.display = 'none';
        }

        initMap();
        loadLocations();
    } else {
        console.log("NON AUTORISÉ");
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
        userPermissions = { role: 'user', canAddPoints: false };
    }
});

// --- 5. INITIALISATION CARTE & GEOJSON ---
let worldGeoJSON = null;

async function loadWorldData() {
    try {
        const res = await fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");
        worldGeoJSON = await res.json();
        console.log("Données Monde chargées. Traitement des points existants...");

        // Correction Condition de Course : Si des points sont arrivés avant la carte
        if (allLocations.length > 0) {
            let updated = false;
            allLocations.forEach(loc => {
                if (!loc.country) {
                    loc.country = detectCountry(loc.lat, loc.lng);
                    updated = true;
                }
            });

            if (updated) {
                renderLocations(allLocations);
            }
        }

        // Toujours remplir le menu déroulant une fois les données monde prêtes
        updateCountryDropdown();
    } catch (e) { console.error("Échec chargement données monde", e); }
}

function initMap() {
    if (map !== null) { map.invalidateSize(); return; }
    loadWorldData();

    // Création de la Carte (Restreinte à un monde)
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        worldCopyJump: false,
        maxBounds: [[-90, -180], [90, 180]], // Restreindre le panoramique
        maxBoundsViscosity: 1.0, // Limites collantes
        minZoom: 3 // Empêcher de dézoomer trop loin
    }).setView([46.603354, 1.888334], 6);


    // --- DÉFINITION DES COUCHES ---

    // 1. Mode Sombre (Défaut)
    const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        noWrap: true,
        bounds: [[-90, -180], [90, 180]]
    });

    // 2. Satellite (Esri World Imagery)
    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        noWrap: true,
        bounds: [[-90, -180], [90, 180]],
        attribution: 'Tiles &copy; Esri'
    });

    // 3. Plan (OSM - Assombri si besoin, mais standard ici)
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        noWrap: true,
        bounds: [[-90, -180], [90, 180]],
        attribution: '&copy; OpenStreetMap'
    });

    // Ajouter Défaut (Retour au Sombre)
    darkLayer.addTo(map);

    // Contrôle des Couches
    const baseMaps = {
        "Sombre": darkLayer,
        "Satellite": satLayer,
        "Plan": streetLayer
    };

    L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map);


    L.control.zoom({ position: 'topright' }).addTo(map);

    markersCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50
    });
    map.addLayer(markersCluster);

    map.on('mousemove', (e) => {
        cursorLat.textContent = e.latlng.lat.toFixed(4);
        cursorLng.textContent = e.latlng.lng.toFixed(4);
    });
}

// --- 6. CHARGEMENT DES DONNÉES & RENDU ---
async function loadLocations() {
    markersCluster.clearLayers();
    locationsListEl.innerHTML = '';
    allLocations = [];

    try {
        const querySnapshot = await getDocs(collection(db, "lieux"));
        querySnapshot.forEach((document) => {
            const data = document.data();
            data.id = document.id;

            // DÉDUPLICATION : Vérifier si on a déjà ce point (par coords)
            // Utilisation d'un petit epsilon pour comparaison flottante
            const isDup = allLocations.some(l =>
                Math.abs(l.lat - data.lat) < 0.0001 && Math.abs(l.lng - data.lng) < 0.0001
            );

            if (!isDup) {
                // Si le pays est manquant...
                if (!data.country && worldGeoJSON) {
                    data.country = detectCountry(data.lat, data.lng);
                }
                allLocations.push(data);
            }
        });

        // Remplir le Menu Déroulant
        updateCountryDropdown();

        // Rendu Initial : Appliquer Filtres (Vide au départ)
        applyFilters();

        // Lancer détection si geojson arrive plus tard
        if (worldGeoJSON) {
            let updated = false;
            allLocations.forEach(loc => {
                if (!loc.country) {
                    loc.country = detectCountry(loc.lat, loc.lng);
                    updated = true;
                }
            });
            // Mettre à jour la vue seulement si un filtre est actif
            if (updated && activeFilters.size > 0) applyFilters();
        }

    } catch (error) {
        console.error("Erreur Base de Données :", error);
    }
}

// --- 10. SYSTÈME MODAL PERSONNALISÉ ---
const modal = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

// Aide pour afficher le modal en remplacement de Alert/Confirm
// Aide pour afficher le modal en remplacement de Alert/Confirm
function showModal(title, message, isConfirm = false) {
    return new Promise((resolve) => {
        // Re-query elements strictly to avoid stale references after replaceChild
        const btnConfirm = document.getElementById('modal-btn-confirm');
        const btnCancel = document.getElementById('modal-btn-cancel');

        modalTitle.textContent = title;
        modalMessage.innerHTML = message;

        btnCancel.style.display = isConfirm ? 'block' : 'none';
        btnConfirm.textContent = isConfirm ? 'Confirmer' : 'OK';

        modal.classList.add('active');

        // Nettoyage des anciens écouteurs via clônage
        const newConfirm = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newConfirm, btnConfirm);

        const newCancel = btnCancel.cloneNode(true);
        btnCancel.parentNode.replaceChild(newCancel, btnCancel);

        // Ré-assignation des écouteurs
        newConfirm.addEventListener('click', () => {
            modal.classList.remove('active');
            resolve(true); // Confirmé
        });

        newCancel.addEventListener('click', () => {
            modal.classList.remove('active');
            resolve(false); // Annulé
        });
    });
}

// --- 11. SYSTÈME D'ÉDITION ---
const editModal = document.getElementById('edit-modal');
const editIdInput = document.getElementById('edit-id');
const editNameInput = document.getElementById('edit-name');
const editDescInput = document.getElementById('edit-desc');
const editPhotoInput = document.getElementById('edit-photo-url');
const editPhotosList = document.getElementById('edit-photos-list');
const btnAddPhoto = document.getElementById('btn-add-photo');
const btnSaveEdit = document.getElementById('btn-save-edit');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

let currentEditPhotos = [];

function openEditModal(locationId) {
    const loc = allLocations.find(l => l.id === locationId);
    if (!loc) return;

    editIdInput.value = loc.id;
    editNameInput.value = loc.nom || "";
    editDescInput.value = loc.description || "";
    currentEditPhotos = loc.photos || [];

    renderEditPhotos();
    editModal.classList.add('active');
}

function renderEditPhotos() {
    editPhotosList.innerHTML = '';
    currentEditPhotos.forEach((url, idx) => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'photo-thumb';
        img.title = "Cliquez pour supprimer";
        img.onclick = () => {
            currentEditPhotos.splice(idx, 1);
            renderEditPhotos();
        };
        editPhotosList.appendChild(img);
    });
}

btnAddPhoto.addEventListener('click', () => {
    const url = editPhotoInput.value.trim();
    if (url) {
        currentEditPhotos.push(url);
        editPhotoInput.value = '';
        renderEditPhotos();
    }
});

btnCancelEdit.addEventListener('click', () => {
    editModal.classList.remove('active');
});

btnSaveEdit.addEventListener('click', async () => {
    const id = editIdInput.value;
    const updates = {
        nom: editNameInput.value,
        description: editDescInput.value,
        photos: currentEditPhotos,
        // Suivre qui a édité
        last_edited_by: auth.currentUser ? auth.currentUser.email : "Anonyme"
    };

    try {
        await updateDoc(doc(db, "lieux", id), updates);

        // Mise à jour locale
        const loc = allLocations.find(l => l.id === id);
        if (loc) {
            Object.assign(loc, updates);
        }

        editModal.classList.remove('active');
        renderLocations(allLocations);
        showModal("Succès", "Informations mises à jour.");

    } catch (e) {
        showModal("Erreur", e.message);
    }
});

// Éléments Dropdown Personnalisés
const dropdownBtn = document.getElementById('country-dropdown-btn');
const dropdownList = document.getElementById('country-list');

// Basculer Dropdown
if (dropdownBtn) {
    console.log("Bouton Dropdown Trouvé");
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log("Dropdown Cliqué ! Ouverture.");
        dropdownList.classList.toggle('open');
    });

    // Fermer au clic extérieur
    document.addEventListener('click', (e) => {
        if (!dropdownBtn.contains(e.target) && !dropdownList.contains(e.target)) {
            dropdownList.classList.remove('open');
        }
    });
} else {
    console.error("CRITIQUE : Bouton Dropdown NON Trouvé");
}

// Remplir Liste Checkbox Personnalisée
function updateCountryDropdown() {
    if (!dropdownList) return;

    dropdownList.innerHTML = '';

    // --- BARRE D'OUTILS (Toujours Visible) ---
    const toolbar = document.createElement('div');
    toolbar.className = 'dropdown-toolbar';

    const btnAll = document.createElement('button');
    btnAll.className = 'dropdown-action-btn';
    btnAll.textContent = 'Tout cocher';
    btnAll.onclick = (e) => {
        e.stopPropagation();
        if (worldGeoJSON) {
            const allCountries = worldGeoJSON.features.map(f => f.properties.name);
            allCountries.forEach(c => activeFilters.add(c));
            updateActiveFiltersUI();
            applyFilters();
            updateHeaderCount();
        }
    };

    const btnNone = document.createElement('button');
    btnNone.className = 'dropdown-action-btn';
    btnNone.textContent = 'Tout décocher';
    btnNone.onclick = (e) => {
        e.stopPropagation();
        activeFilters.clear();
        updateActiveFiltersUI();
        applyFilters();
        updateHeaderCount();
    };

    toolbar.appendChild(btnAll);
    toolbar.appendChild(btnNone);
    dropdownList.appendChild(toolbar);

    // --- VÉRIFICATION DONNÉES ---
    if (!worldGeoJSON) {
        const loading = document.createElement('div');
        loading.className = 'checkbox-item';
        loading.innerHTML = '<span style="color:#888;">Chargement des données...</span>';
        dropdownList.appendChild(loading);
        return;
    }

    // --- ÉLÉMENTS DE LISTE ---
    const allCountries = worldGeoJSON.features.map(f => f.properties.name).sort();

    allCountries.forEach(c => {
        // MASQUER si déjà sélectionné (Demande Utilisateur)
        if (activeFilters.has(c)) return;

        const item = document.createElement('div');
        item.className = 'checkbox-item'; // Garder classe pour style hover

        // Contenu : Juste texte
        item.textContent = c;
        item.style.paddingLeft = '15px'; // Assurer bon espacement

        // Événement : Clic Ligne pour Sélectionner
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            // On garde ouvert pour vitesse

            activeFilters.add(c);
            updateActiveFiltersUI();
            applyFilters();
            updateHeaderCount();
        });

        dropdownList.appendChild(item);
    });
}

function updateHeaderCount() {
    const count = activeFilters.size;
    const span = dropdownBtn.querySelector('span');
    if (count > 0) {
        span.innerHTML = `<i class="fa-solid fa-globe"></i> ${count} Pays sélectionné(s)`;
        span.style.color = 'var(--accent)';
    } else {
        span.innerHTML = `<i class="fa-solid fa-globe"></i> Filtrer par pays...`;
        span.style.color = '';
    }
}


// --- SYSTÈME DE FILTRAGE (MULTI-SÉLECTION) ---
// activeFilters est maintenant global
const activeFiltersContainer = document.getElementById('active-filters');


function updateActiveFiltersUI() {
    activeFiltersContainer.innerHTML = '';

    // Vérifier si TOUT est sélectionné
    let isAllSelected = false;
    if (worldGeoJSON) {
        // Vérification approximative
        const total = worldGeoJSON.features.map(f => f.properties.name).length;
        if (activeFilters.size >= total && total > 0) isAllSelected = true;
    }

    if (isAllSelected) {
        // Tag Spécial "Tout Sélectionné"
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        tag.style.background = 'rgba(0, 242, 255, 0.2)';
        tag.style.borderColor = 'var(--accent)';
        tag.style.color = 'var(--accent)';
        tag.innerHTML = `<i class="fa-solid fa-list-check"></i> Tout est coché <i class="fa-solid fa-xmark"></i>`;
        tag.title = "Tout décocher";
        tag.onclick = () => {
            activeFilters.clear();
            updateActiveFiltersUI();
            applyFilters();
            updateHeaderCount();
        };
        activeFiltersContainer.appendChild(tag);
    } else {
        // Tags Réguliers
        activeFilters.forEach(country => {
            const tag = document.createElement('div');
            tag.className = 'filter-tag';
            tag.innerHTML = `${country} <i class="fa-solid fa-xmark"></i>`;
            tag.onclick = () => {
                // Retirer du Set
                activeFilters.delete(country);

                // Re-rendu UI
                updateActiveFiltersUI();
                applyFilters();
                updateHeaderCount();
            };
            activeFiltersContainer.appendChild(tag);
        });
    }

    // Rafraîchir la liste dropdown pour refléter les changements
    updateCountryDropdown();
}

function applyFilters() {
    // DÉPART VIDE : Si aucun filtre, ne rien afficher
    if (activeFilters.size === 0) {
        markersCluster.clearLayers();
        locationsListEl.innerHTML = '<div class="empty-state">Veuillez sélectionner un ou plusieurs pays pour afficher les lieux.</div>';
        locationsCountEl.textContent = "0"; // Forcer 0 (Demandé)
        return;
    }

    const filtered = allLocations.filter(loc => activeFilters.has(loc.country));
    renderLocations(filtered);

    // FORCER COMPTEUR A 0 (Demande Utilisateur : "reste a 0")
    locationsCountEl.textContent = "0";

    // Zoom pour ajuster
    if (filtered.length > 0) {
        const group = new L.featureGroup(filtered.map(f => L.marker([f.lat, f.lng])));
        map.fitBounds(group.getBounds());
    }
}

function renderLocations(locations) {
    markersCluster.clearLayers();
    locationsListEl.innerHTML = '';

    if (locations.length === 0) {
        locationsListEl.innerHTML = '<div class="empty-state">Aucun point trouvé</div>';
        return;
    }

    locations.forEach(loc => {
        addMarkerAndListItem(loc);
    });
}

function addMarkerAndListItem(data) {
    if (!data.lat || !data.lng) return;

    // 1. Créer Marqueur avec Icône Personnalisée
    const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: '<i class="fa-solid fa-location-dot"></i>',
        iconSize: [24, 24],
        iconAnchor: [12, 24], // Pointe de l'épingle
        popupAnchor: [0, -28]
    });

    const marker = L.marker([data.lat, data.lng], {
        title: data.nom,
        icon: customIcon
    });

    marker.bindTooltip(data.nom || "Inconnu", {
        permanent: false,
        direction: 'top',
        className: 'dark-tooltip',
        opacity: 0.9
    });

    let photoHtml = '';
    if (data.photos && data.photos.length > 0) {
        // HTML Carrousel
        const images = data.photos.map((url, index) =>
            `<img src="${url}" class="${index === 0 ? 'active' : ''}" data-idx="${index}" id="img-${data.id}-${index}" onclick="window.openLightbox(this.src)" style="cursor:zoom-in;">`
        ).join('');

        let controls = '';
        if (data.photos.length > 1) {
            controls = `
            <div class="carousel-controls">
                <button class="carousel-btn" onclick="window.prevPhoto('${data.id}', ${data.photos.length})"><i class="fa-solid fa-chevron-left"></i></button>
                <button class="carousel-btn" onclick="window.nextPhoto('${data.id}', ${data.photos.length})"><i class="fa-solid fa-chevron-right"></i></button>
            </div>`;
        }

        photoHtml = `<div class="popup-gallery" id="gallery-${data.id}">
            ${images}
            ${controls}
        </div>`;
    }

    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
        <h3>${data.nom || "Point sans nom"}</h3>
        ${photoHtml}
        <p><strong>Pays:</strong> ${data.country || "Détection..."}</p>
        <p class="coords-display"><i class="fa-solid fa-location-crosshairs"></i> ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}</p>
        <p style="font-size:11px; color:#888;">Ajouté par: ${data.added_by || "Inconnu"}</p>
        <p>${data.description || "Pas d'infos."}</p>
        <div class="popup-actions">
            <a href="https://www.google.com/maps?q=${data.lat},${data.lng}" target="_blank" class="btn-gmaps">
                <i class="fa-solid fa-map-location-dot"></i> Maps
            </a>
            ${(isAdmin() || canAddPoints()) ? `
            <button class="btn-edit-marker tool-btn small" title="Modifier">
                <i class="fa-solid fa-pen"></i>
            </button>
            ` : ''} 
            ${isAdmin() ? `
            <button class="btn-delete-marker tool-btn small" data-id="${data.id}">
                <i class="fa-solid fa-trash"></i>
            </button>
            ` : ''}
        </div>
    `;

    // Actions
    if (isAdmin() || canAddPoints()) {
        // Permettre modification pour contributeurs aussi ?
        const editBtn = popupContent.querySelector('.btn-edit-marker');
        if (editBtn) {
            editBtn.onclick = (e) => {
                console.log("Bouton Édition Cliqué pour :", data.id);
                marker.closePopup();
                openEditModal(data.id);
            };
        }
    }

    if (isAdmin()) {
        const deleteBtn = popupContent.querySelector('.btn-delete-marker');
        if (deleteBtn) {
            deleteBtn.onclick = () => deleteLocation(data.id, marker);
        }
    }

    marker.bindPopup(popupContent, { maxWidth: 300 });
    markersCluster.addLayer(marker);

    // 2. Créer Élément Liste Sidebar
    const item = document.createElement('div');
    item.className = 'location-item';
    item.innerHTML = `
        <h4>${data.nom || "N/A"}</h4>
        <p>${data.country ? data.country.toUpperCase() : "..."}</p>
    `;

    item.addEventListener('click', () => {
        markersCluster.zoomToShowLayer(marker, () => { marker.openPopup(); });
    });

    locationsListEl.appendChild(item);
}


// --- 7. INTERACTIONS ---

// LOGIQUE FILTRE
const countryFilter = document.getElementById('country-filter');
if (countryFilter) {
    countryFilter.addEventListener('change', (e) => {
        const selected = e.target.value;
        console.log("Changement Filtre :", selected);

        // Logique Multi-select
        if (selected) {
            activeFilters.add(selected);
            updateActiveFiltersUI();
            applyFilters();

            // Forcer reset dropdown
            setTimeout(() => {
                e.target.value = "";
            }, 50);
        }
    });
}

// Suppression
async function deleteLocation(docId, marker) {
    // Vérification Modal Personnalisé
    const confirmDelete = await showModal("Confirmation", "Voulez-vous vraiment supprimer ce point définitivement ?", true);
    if (confirmDelete) {
        try {
            await deleteDoc(doc(db, "lieux", docId));
            markersCluster.removeLayer(marker);

            // Synchro Locale
            const idx = allLocations.findIndex(l => l.id === docId);
            if (idx > -1) allLocations.splice(idx, 1);

            showModal("Supprimé", "Point retiré de la base.");
        } catch (e) {
            showModal("Erreur", e.message);
        }
    }
}

// Déclencheur Import KML
if (btnTriggerImport) {
    btnTriggerImport.addEventListener('click', () => { kmlInput.click(); });
}

if (kmlInput) {
    kmlInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            if (file.name.toLowerCase().endsWith('.kmz')) {
                // Gestion KMZ (KML Zippé)
                console.log("Traitement KMZ...");
                const zip = await JSZip.loadAsync(file);

                // Trouver le premier fichier .kml dans le zip
                const kmlFileName = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.kml'));

                if (kmlFileName) {
                    const kmlText = await zip.file(kmlFileName).async("string");
                    parseAndSaveKML(kmlText);
                } else {
                    showModal("Erreur", "Fichier KMZ invalide : aucun .kml trouvé à l'intérieur.");
                }
            } else {
                // Gestion KML standard
                const reader = new FileReader();
                reader.onload = async (event) => {
                    parseAndSaveKML(event.target.result);
                };
                reader.readAsText(file);
            }
        } catch (err) {
            console.error(err);
            showModal("Erreur", "Impossible de lire le fichier. Voir la console.");
        }
    });
}

// Recherche
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allLocations.filter(loc => {
            const n = (loc.nom || "").toLowerCase();
            const c = (loc.country || "").toLowerCase();
            return n.includes(term) || c.includes(term);
        });
        renderLocations(filtered);
    });
}

// --- 8. AIDES & ALGORITHMES ---

// Algorithme Point dans Polygone (Ray Casting)
function isPointInPoly(pt, poly) {
    let pointLng = pt[1];
    let pointLat = pt[0];

    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i][0], yi = poly[i][1];
        let xj = poly[j][0], yj = poly[j][1];

        let intersect = ((yi > pointLat) != (yj > pointLat))
            && (pointLng < (xj - xi) * (pointLat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function detectCountry(lat, lng) {
    if (!worldGeoJSON) return null;

    for (const feature of worldGeoJSON.features) {
        // MultiPolygon support
        if (feature.geometry.type === "Polygon") {
            if (isPointInPoly([lat, lng], feature.geometry.coordinates[0])) {
                return feature.properties.name;
            }
        } else if (feature.geometry.type === "MultiPolygon") {
            for (const polygon of feature.geometry.coordinates) {
                if (isPointInPoly([lat, lng], polygon[0])) {
                    return feature.properties.name;
                }
            }
        }
    }
    return null;
}

async function parseAndSaveKML(kmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, "text/xml");
    const placemarks = xmlDoc.getElementsByTagName("Placemark");

    // Ensure world data is loaded
    if (!worldGeoJSON) await loadWorldData();

    let newPoints = [];
    const total = placemarks.length;

    modalTitle.textContent = "Analyse...";
    modalMessage.innerHTML = `${total} points détectés.`;
    modal.classList.add('active');
    modalBtnConfirm.style.display = 'none'; // Lock UI

    const currentUserEmail = auth.currentUser ? auth.currentUser.email : "Anonymous";

    // 1. Parsing with Yielding
    for (let i = 0; i < total; i++) {
        if (i % 500 === 0) await new Promise(r => setTimeout(r, 0));

        const placemark = placemarks[i];
        const nameTag = placemark.getElementsByTagName("name")[0];
        const nom = nameTag ? nameTag.textContent : "Point Importé";
        const descTag = placemark.getElementsByTagName("description")[0];
        const description = descTag ? descTag.textContent : "";

        const pointTag = placemark.getElementsByTagName("Point")[0];
        if (pointTag) {
            const coordsTag = pointTag.getElementsByTagName("coordinates")[0];
            if (coordsTag) {
                const parts = coordsTag.textContent.trim().split(',');
                const lng = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);

                if (!isNaN(lat) && !isNaN(lng)) {
                    // Check Dupes
                    const isDup = allLocations.some(l =>
                        Math.abs(l.lat - lat) < 0.0001 && Math.abs(l.lng - lng) < 0.0001
                    ) || newPoints.some(l =>
                        Math.abs(l.lat - lat) < 0.0001 && Math.abs(l.lng - lng) < 0.0001
                    );

                    if (!isDup) {
                        const detectedCountry = detectCountry(lat, lng) || "Unknown";
                        newPoints.push({
                            nom, description, lat, lng,
                            country: detectedCountry,
                            added_by: currentUserEmail,
                            date_import: new Date().toISOString()
                        });
                    }
                }
            }
        }
    }

    if (newPoints.length === 0) {
        modal.classList.remove('active');
        showModal("Info", "Aucun nouveau point (tous doublons).");
        return;
    }

    // 2. Batch Writing
    const BATCH_SIZE = 500;
    const batches = [];

    modalMessage.innerHTML = `Enregistrement de ${newPoints.length} points...`;

    for (let i = 0; i < newPoints.length; i += BATCH_SIZE) {
        const chunk = newPoints.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(pt => {
            const ref = doc(collection(db, "lieux"));
            batch.set(ref, pt);
            allLocations.push({ id: ref.id, ...pt });
        });
        batches.push(batch.commit());
    }

    try {
        await Promise.all(batches);
        modal.classList.remove('active');

        updateCountryDropdown();
        renderLocations(allLocations);

        showModal("Succès", `${newPoints.length} points importés !`);
    } catch (e) {
        console.error(e);
        showModal("Erreur", "Problème d'enregistrement.");
    }
}


// --- 12. ADMIN PANEL LOGIC ---
// const adminPanel = document.getElementById('admin-panel'); // Removed
const btnOpenAdmin = document.getElementById('btn-open-admin');
const adminModal = document.getElementById('admin-modal');
const btnCloseAdmin = document.getElementById('btn-close-admin');
const btnCreateUser = document.getElementById('btn-create-user');

const newUserEmail = document.getElementById('new-user-email');
const newUserPass = document.getElementById('new-user-pass');

// Open Admin Modal
if (btnOpenAdmin && adminModal) {
    btnOpenAdmin.addEventListener('click', () => {
        adminModal.classList.add('active');
    });
}

// Close Admin Modal
if (btnCloseAdmin && adminModal) {
    btnCloseAdmin.addEventListener('click', () => {
        adminModal.classList.remove('active');
        // Clear fields? Maybe not needed.
    });
}

if (btnCreateUser) {
    btnCreateUser.addEventListener('click', async () => {
        const email = newUserEmail.value;
        const pass = newUserPass.value;

        // Safety check for elements before access
        const adminCheckEl = document.getElementById('check-is-admin');
        const canAddCheckEl = document.getElementById('check-can-add');
        const pseudoInput = document.getElementById('new-user-pseudo');

        const isAdminCheck = adminCheckEl ? adminCheckEl.checked : false;
        const canAddCheck = canAddCheckEl ? canAddCheckEl.checked : false;
        const pseudo = pseudoInput ? pseudoInput.value.trim() : "Explorateur";

        if (!email || !pass) {
            showModal("Admin", "Veuillez remplir email et mot de passe.");
            return;
        }

        const confirmCreate = await showModal("Création de compte",
            `Créer le compte <b>${email}</b> ?<br>
             Pseudo: <b>${pseudo}</b><br>
             Admin: <b>${isAdminCheck ? 'OUI' : 'NON'}</b><br>
             Ajout points: <b>${canAddCheck ? 'OUI' : 'NON'}</b>`, true);

        if (confirmCreate) {
            let secondaryApp = null;
            try {
                // Initialize a secondary app instance to avoid logging out the current admin
                secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);

                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
                const newUser = userCredential.user;

                // Save Permissions & Pseudo to Firestore
                await setDoc(doc(db, "users", newUser.uid), {
                    email: email,
                    pseudo: pseudo,
                    role: isAdminCheck ? 'admin' : 'user',
                    canAddPoints: canAddCheck,
                    createdAt: new Date().toISOString()
                });

                showModal("Succès", `Utilisateur créé !<br>Pseudo: ${pseudo}`);

                // Reset form
                newUserEmail.value = "";
                newUserPass.value = "";
                if (pseudoInput) pseudoInput.value = "";
                if (adminCheckEl) adminCheckEl.checked = false;
                if (canAddCheckEl) canAddCheckEl.checked = false;

                if (adminModal) adminModal.classList.remove('active');

                // Cleanup
                if (secondaryAuth) await signOut(secondaryAuth);
                if (secondaryApp) await deleteApp(secondaryApp);

            } catch (error) {
                console.error("Erreur création utilisateur :", error);

                // Ensure UI is unlocked even on error
                if (adminModal) adminModal.classList.remove('active');
                if (secondaryApp) await deleteApp(secondaryApp).catch(console.error);

                showModal("Erreur", `Échec création : ${error.message}`);
            }
        }
    });
}



loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(err => statusMessage.textContent = "ACCÈS REFUSÉ");
    signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(err => statusMessage.textContent = "ACCÈS REFUSÉ");
});

if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log("Déconnexion réussie");
        }).catch((error) => {
            console.error("Erreur déconnexion:", error);
        });
    });
}


// --- 13. SIDEBAR TOGGLE ---
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const sidebar = document.querySelector('.sidebar');

if (btnToggleSidebar && sidebar) {
    console.log("Sidebar Toggle Initialized"); // Debug
    btnToggleSidebar.addEventListener('click', () => {
        console.log("Toggle Clicked"); // Debug
        sidebar.classList.toggle('collapsed');

        // Toggle Icon
        const icon = btnToggleSidebar.querySelector('i');
        if (sidebar.classList.contains('collapsed')) {
            // Closed -> Show Arrow Right to open
            icon.classList.replace('fa-chevron-left', 'fa-chevron-right');
        } else {
            // Open -> Show Arrow Left to hide
            icon.classList.replace('fa-chevron-right', 'fa-chevron-left');
        }

        // Timeout to invalidate map size
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 350);
    });
} else {
    console.error("Sidebar elements not found:", { btnToggleSidebar, sidebar });
}


// --- 14. CAROUSEL FUNCTIONS (Global) ---
window.nextPhoto = function (id, total) {
    const gallery = document.getElementById(`gallery-${id}`);
    if (!gallery) return;

    // Find current active
    const activeImg = gallery.querySelector('img.active');
    let currentIdx = activeImg ? parseInt(activeImg.getAttribute('data-idx')) : 0;

    // Calculate next
    let nextIdx = (currentIdx + 1) % total;

    // Update classes
    if (activeImg) activeImg.classList.remove('active');
    const nextImg = gallery.querySelector(`img[data-idx="${nextIdx}"]`);
    if (nextImg) nextImg.classList.add('active');
};

window.prevPhoto = function (id, total) {
    const gallery = document.getElementById(`gallery-${id}`);
    if (!gallery) return;

    // Find current active
    const activeImg = gallery.querySelector('img.active');
    let currentIdx = activeImg ? parseInt(activeImg.getAttribute('data-idx')) : 0;

    // Calculate prev
    let prevIdx = (currentIdx - 1 + total) % total;

    // Update classes
    if (activeImg) activeImg.classList.remove('active');
    const prevImg = gallery.querySelector(`img[data-idx="${prevIdx}"]`);
    if (prevImg) prevImg.classList.add('active');
};

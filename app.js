// --- 1. IMPORTS FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 2. CONFIGURATION (Tes clés) ---
const firebaseConfig = {
  apiKey: "AIzaSyDOBN0gJwIbrZFOymSwP9BnzNudubPorkU",
  authDomain: "urbex-map-b907d.firebaseapp.com",
  databaseURL: "https://urbex-map-b907d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "urbex-map-b907d",
  storageBucket: "urbex-map-b907d.firebasestorage.app",
  messagingSenderId: "91725857148",
  appId: "1:91725857148:web:fa7545a9dbbd075a6be4f9"
};

// Initialisation
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 3. ÉLÉMENTS HTML ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const logoutButton = document.getElementById('btn-logout');
const statusMessage = document.getElementById('status-message');

// Variable pour la carte (pour éviter de la créer deux fois)
let map = null;

// --- 4. LE GARDIEN (Surveillance Auth) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // === ACCÈS AUTORISÉ ===
        console.log("Connecté :", user.email);
        
        loginScreen.style.display = 'none'; // On cache le verrou
        appScreen.style.display = 'block';  // On affiche l'appli

        // On initialise la carte
        initMap();
        
        // On charge les lieux depuis Firestore
        chargerLieux();

    } else {
        // === ACCÈS REFUSÉ ===
        console.log("Déconnecté.");
        
        loginScreen.style.display = 'flex'; // On affiche le verrou
        appScreen.style.display = 'none';   // On cache l'appli
    }
});

// --- 5. INITIALISATION CARTE (Leaflet) ---
function initMap() {
    // Si la carte existe déjà, on ne fait rien
    if (map !== null) {
        map.invalidateSize(); // Recalcule la taille si la fenêtre a changé
        return; 
    }

    // Création de la carte (Centrée sur Paris par défaut)
    map = L.map('map').setView([48.8566, 2.3522], 13);

    // Ajout du fond de carte (OpenStreetMap - style sombre ou standard)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19
    }).addTo(map);

    // Petit fix technique pour Leaflet quand il est dans une div cachée
    setTimeout(() => { map.invalidateSize(); }, 100);
}

// --- 6. GESTION DES LIEUX (Firestore) ---
async function chargerLieux() {
    try {
        const querySnapshot = await getDocs(collection(db, "lieux"));
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log("Lieu chargé :", data);

            // Vérifie que le lieu a bien des coordonnées
            if (data.lat && data.lng) {
                // Ajoute un marqueur sur la carte
                L.marker([data.lat, data.lng])
                 .addTo(map)
                 .bindPopup(`<b>${data.nom || "Lieu inconnu"}</b><br>${data.description || ""}`);
            }
        });
    } catch (error) {
        console.error("Erreur lecture DB :", error);
    }
}

// --- 7. ÉVÉNEMENTS BOUTONS ---

// Connexion
loginForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Empêche le rechargement de page
    const email = emailInput.value;
    const password = passwordInput.value;

    statusMessage.textContent = "Connexion en cours...";
    
    signInWithEmailAndPassword(auth, email, password)
        .catch((error) => {
            statusMessage.textContent = "Erreur : Email ou mot de passe incorrect.";
            console.error(error);
        });
});

// Déconnexion
logoutButton.addEventListener('click', () => {
    signOut(auth);
});

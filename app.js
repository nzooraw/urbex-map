// --- 1. IMPORTS FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// On ajoute addDoc, deleteDoc et doc pour gérer l'ajout et la suppression
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 2. CONFIGURATION ---
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

// --- 3. ÉLÉMENTS HTML ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const logoutButton = document.getElementById('btn-logout');
const statusMessage = document.getElementById('status-message');

// Nouveaux éléments pour le KML
const kmlInput = document.getElementById('kml-input');
const btnImportKml = document.getElementById('btn-import-kml');

let map = null;

// --- 4. LE GARDIEN (Auth) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Connecté :", user.email);
        loginScreen.style.display = 'none';
        appScreen.style.display = 'block';
        initMap();
        chargerLieux(); // On charge les points existants
    } else {
        console.log("Déconnecté.");
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

// --- 5. INITIALISATION CARTE ---
function initMap() {
    if (map !== null) { map.invalidateSize(); return; }
    
    // Carte sombre
    map = L.map('map').setView([46.603354, 1.888334], 6); // Centré sur la France
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
    }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 100);
}

// --- 6. CHARGEMENT DES DONNÉES ---
async function chargerLieux() {
    // On nettoie la carte avant de recharger (pour éviter les doublons si on recharge)
    map.eachLayer((layer) => {
        if (layer instanceof L.Marker) { map.removeLayer(layer); }
    });

    try {
        const querySnapshot = await getDocs(collection(db, "lieux"));
        querySnapshot.forEach((document) => {
            const data = document.data();
            // On passe l'ID du document pour pouvoir le supprimer plus tard
            ajouterMarqueurSurCarte(data, document.id);
        });
    } catch (error) {
        console.error("Erreur lecture DB :", error);
    }
}

// --- 7. CRÉATION DU MARQUEUR (Avec Nom, Coordonnées et Suppression) ---
function ajouterMarqueurSurCarte(data, docId) {
    if (!data.lat || !data.lng) return;

    // A. Le titre natif (S'affiche quand on laisse la souris 1 seconde sur le point)
    // On l'utilise pour afficher les coordonnées comme demandé
    const coordTexte = `Lat: ${data.lat}, Lng: ${data.lng}`;

    const marker = L.marker([data.lat, data.lng], {
        title: coordTexte // Coordonnées au survol souris
    }).addTo(map);

    // B. Le Tooltip Permanent (Le nom affiché tout le temps)
    marker.bindTooltip(data.nom || "Inconnu", {
        permanent: true, 
        direction: 'top',
        className: 'my-labels' // Classe CSS optionnelle si tu veux styliser le texte
    });

    // C. La Popup avec le bouton Supprimer
    // On crée les éléments en JS pour pouvoir attacher l'événement "click" proprement
    const div = document.createElement('div');
    
    const h3 = document.createElement('h3');
    h3.textContent = data.nom || "Lieu sans nom";
    
    const p = document.createElement('p');
    p.textContent = data.description || "Pas de description";

    const btnDelete = document.createElement('button');
    btnDelete.textContent = "🗑️ Supprimer ce point";
    btnDelete.style.backgroundColor = "red";
    btnDelete.style.color = "white";
    btnDelete.style.border = "none";
    btnDelete.style.padding = "5px 10px";
    btnDelete.style.cursor = "pointer";
    btnDelete.style.marginTop = "10px";

    // L'action de suppression
    btnDelete.onclick = async () => {
        if (confirm("Voulez-vous vraiment supprimer ce point définitivement ?")) {
            try {
                await deleteDoc(doc(db, "lieux", docId));
                map.removeLayer(marker); // On enlève le point de la carte visuellement
                console.log("Point supprimé de la base de données");
            } catch (e) {
                alert("Erreur lors de la suppression : " + e.message);
            }
        }
    };

    div.appendChild(h3);
    div.appendChild(p);
    div.appendChild(btnDelete);

    marker.bindPopup(div);
}

// --- 8. LOGIQUE D'IMPORT KML ---
// Déclenche le clic sur l'input caché quand on clique sur le bouton bleu
if(btnImportKml) {
    btnImportKml.addEventListener('click', () => {
        kmlInput.click();
    });
}

// Quand un fichier est choisi
if(kmlInput) {
    kmlInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target.result;
            analyserEtSauvegarderKML(text);
        };
        reader.readAsText(file);
    });
}

// Analyse du fichier KML (XML)
async function analyserEtSauvegarderKML(kmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, "text/xml");
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    
    let count = 0;
    console.log(`Trouvé ${placemarks.length} points dans le KML.`);

    for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        
        // Extraction du nom
        const nameTag = placemark.getElementsByTagName("name")[0];
        const nom = nameTag ? nameTag.textContent : "Point KML Importé";
        
        // Extraction description
        const descTag = placemark.getElementsByTagName("description")[0];
        const description = descTag ? descTag.textContent : "";

        // Extraction coordonnées (KML est souvent: Lng,Lat,Alt)
        const pointTag = placemark.getElementsByTagName("Point")[0];
        if (pointTag) {
            const coordsTag = pointTag.getElementsByTagName("coordinates")[0];
            if (coordsTag) {
                const coordsRaw = coordsTag.textContent.trim();
                const parts = coordsRaw.split(',');
                
                // Attention: KML = Longitude, Latitude. Leaflet/Firebase = Latitude, Longitude
                const lng = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);

                if (!isNaN(lat) && !isNaN(lng)) {
                    // Sauvegarde dans Firebase
                    try {
                        await addDoc(collection(db, "lieux"), {
                            nom: nom,
                            description: description,
                            lat: lat,
                            lng: lng,
                            date_import: new Date().toISOString()
                        });
                        count++;
                    } catch (e) {
                        console.error("Erreur sauvegarde point:", e);
                    }
                }
            }
        }
    }

    alert(`${count} points ont été importés avec succès ! La carte va s'actualiser.`);
    chargerLieux(); // On rafraichit l'affichage
}

// --- 9. BOUTONS LOGIN/LOGOUT ---
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(err => statusMessage.textContent = "Erreur login");
});

logoutButton.addEventListener('click', () => { signOut(auth); });

// --- 1. IMPORTATION DES FONCTIONS FIREBASE (Via CDN pour le navigateur) ---
// Note : J'utilise les liens URL complets pour que ça marche directement sans installation complexe.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 2. TA CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDOBN0gJwIbrZFOymSwP9BnzNudubPorkU",
  authDomain: "urbex-map-b907d.firebaseapp.com",
  databaseURL: "https://urbex-map-b907d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "urbex-map-b907d",
  storageBucket: "urbex-map-b907d.firebasestorage.app",
  messagingSenderId: "91725857148",
  appId: "1:91725857148:web:fa7545a9dbbd075a6be4f9"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 3. RÉCUPÉRATION DES ÉLÉMENTS HTML ---
const loginForm = document.getElementById('login-form');       
const emailInput = document.getElementById('email');           
const passwordInput = document.getElementById('password');     
const loginButton = document.getElementById('btn-login');      
const logoutButton = document.getElementById('btn-logout');    
const mapContainer = document.getElementById('map-container'); 

// --- 4. GESTION DE L'ÉTAT (Connecté ou Pas ?) ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    // --- L'UTILISATEUR EST CONNECTÉ ---
    console.log("Utilisateur connecté :", user.email);
    
    // Interface : on cache le login, on montre la carte
    if(loginForm) loginForm.style.display = 'none';
    if(logoutButton) logoutButton.style.display = 'block';
    if(mapContainer) mapContainer.style.display = 'block';

    // On charge les données
    chargerLesLieux();

  } else {
    // --- PERSONNE N'EST CONNECTÉ ---
    console.log("Aucun utilisateur connecté.");

    // Interface : on montre le login, on cache la carte
    if(loginForm) loginForm.style.display = 'block';
    if(logoutButton) logoutButton.style.display = 'none';
    if(mapContainer) mapContainer.style.display = 'none';
  }
});

// --- 5. FONCTION SE CONNECTER (Login uniquement) ---
if (loginButton) {
  loginButton.addEventListener('click', (e) => {
    e.preventDefault(); 

    const email = emailInput.value;
    const password = passwordInput.value;

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        console.log("Connexion réussie !");
      })
      .catch((error) => {
        console.error("Erreur de connexion :", error.message);
        alert("Erreur : " + error.message);
      });
  });
}

// --- 6. FONCTION SE DÉCONNECTER ---
if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    signOut(auth).then(() => {
      console.log("Déconnexion réussie");
    }).catch((error) => {
      console.error("Erreur déconnexion", error);
    });
  });
}

// --- 7. CHARGEMENT DES DONNÉES DEPUIS FIRESTORE ---
async function chargerLesLieux() {
  console.log("Chargement des lieux en cours...");
  
  try {
    // Nouvelle syntaxe pour récupérer la collection "lieux"
    const querySnapshot = await getDocs(collection(db, "lieux"));
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log("Lieu trouvé :", data);
      
      // --- AJOUTE ICI TON CODE POUR LES MARQUEURS ---
      // Exemple : L.marker([data.lat, data.lng]).addTo(map);
    });
  } catch (error) {
    console.error("Erreur lors du chargement des lieux (Permissions ?) :", error);
  }
}

window.onload = function() {
    // --- CONFIGURATION FIREBASE ---
    const firebaseConfig = {
      apiKey: "AIzaSyDOBN0gJwIbrZFOymSwP9BnzNudubPorkU",
      authDomain: "urbex-map-b907d.firebaseapp.com",
      projectId: "urbex-map-b907d",
      storageBucket: "urbex-map-b907d.appspot.com",
      messagingSenderId: "91725857148",
      appId: "1:91725857148:web:fa7545a9dbbd075a6be4f9"
    };

    // Initialisation Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let map;
    const adminEmail = "enzocomyn@protonmail.com";

    // --- Fonction pour gérer l'état de connexion ---
    function handleAuthState(user) {
        const loginDiv = document.getElementById("login");
        const mapDiv = document.getElementById("map");
        const kmlDiv = document.getElementById("kmlContainer");
        const logoutBtn = document.getElementById("logoutBtn");

        if(user){
            console.log("Utilisateur connecté :", user.email);

            loginDiv.style.display = "none";
            mapDiv.style.display = "block";
            logoutBtn.style.display = "block";

            if(!map) map = initMap();

            // Afficher le bouton KML seulement pour admin
            if(user.email.trim().toLowerCase() === adminEmail.toLowerCase()){
                kmlDiv.style.display = "block";
            } else {
                kmlDiv.style.display = "none";
            }

            // Charger tous les spots depuis Firestore
            loadSpots();
        } else {
            loginDiv.style.display = "block";
            mapDiv.style.display = "none";
            kmlDiv.style.display = "none";
            logoutBtn.style.display = "none";
        }
    }

    // --- Forcer la déconnexion au chargement ---
    auth.signOut().then(() => {
        auth.onAuthStateChanged(handleAuthState);
    });

    // --- LOGIN ---
    document.getElementById("loginBtn").addEventListener("click", () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        auth.signInWithEmailAndPassword(email, password)
            .catch(err => document.getElementById("loginError").innerText = err.message);
    });

    // --- LOGOUT ---
    document.getElementById("logoutBtn").addEventListener("click", () => {
        auth.signOut().then(() => location.reload());
    });

    // --- INITIALISER LA CARTE ---
    function initMap() {
        const mapInstance = L.map('map').setView([48.8566, 2.3522], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(mapInstance);
        return mapInstance;
    }

    // --- IMPORT KML POUR ADMIN ---
    document.getElementById("importKmlBtn").addEventListener("click", () => {
        const fileInput = document.getElementById("kmlFile");
        if(fileInput.files.length === 0){
            alert("Veuillez sélectionner un fichier KML");
            return;
        }
        const file = fileInput.files[0];

        const reader = new FileReader();
        reader.onload = async function(e){
            const kmlText = e.target.result;
            const spots = parseKML(kmlText);

            // Ajouter chaque spot dans Firestore (seul admin peut écrire)
            for(const spot of spots){
                await db.collection("kml").add(spot);
            }

            alert(`Import terminé : ${spots.length} spots ajoutés`);
        };
        reader.readAsText(file);
    });

    // --- PARSER KML ---
    function parseKML(kmlText){
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlText, "text/xml");
        const placemarks = xmlDoc.getElementsByTagName("Placemark");
        const spots = [];

        for(let i=0;i<placemarks.length;i++){
            const placemark = placemarks[i];
            const name = placemark.getElementsByTagName("name")[0]?.textContent || "Spot";
            const coordText = placemark.getElementsByTagName("coordinates")[0]?.textContent;
            if(!coordText) continue;

            const [lon, lat] = coordText.trim().split(",").map(Number);
            spots.push({name, lat, lon});
        }
        return spots;
    }

    // --- CHARGER LES SPOTS DEPUIS FIRESTORE ---
    async function loadSpots(){
        const snapshot = await db.collection("kml").get();
        snapshot.forEach(doc => {
            const data = doc.data();
            L.marker([data.lat, data.lon]).addTo(map).bindPopup(data.name);
        });
    }
};

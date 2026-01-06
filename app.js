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

    // Initialisation Firebase (version compat)
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    let map; // variable globale pour la carte
    const adminEmail = "enzocomyn@protonmail.com"; // ton email admin exact

    // --- LOGIN ---
    const loginBtn = document.getElementById("loginBtn");
    loginBtn.addEventListener("click", () => {
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      auth.signInWithEmailAndPassword(email, password)
        .catch(err => {
          document.getElementById("loginError").innerText = err.message;
        });
    });

    // --- OBSERVER L'ÉTAT DE CONNEXION ---
    auth.onAuthStateChanged((user) => {
        if(user){
            console.log("Utilisateur connecté :", user.email); // pour vérifier l'email exact

            // Masquer le login et afficher la carte
            document.getElementById("login").style.display = "none";
            document.getElementById("map").style.display = "block";

            // Initialiser la carte si pas déjà fait
            if(!map) map = initMap();

            // Afficher le bouton KML seulement pour l'admin (sécurisé)
            if(user.email.trim().toLowerCase() === adminEmail.toLowerCase()){
                const kmlContainer = document.getElementById("kmlContainer");
                if(kmlContainer) kmlContainer.style.display = "block";
            }
        }
    });

    // --- CARTE LEAFLET ---
    function initMap() {
      const mapInstance = L.map('map').setView([48.8566, 2.3522], 5); // centre Paris

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(mapInstance);

      // point test
      L.marker([48.8566, 2.3522]).addTo(mapInstance).bindPopup("Spot test");

      return mapInstance;
    }

    // --- IMPORT KML ---
    const importBtn = document.getElementById("importKmlBtn");
    importBtn.addEventListener("click", () => {
        const fileInput = document.getElementById("kmlFile");
        if (fileInput.files.length === 0) {
            alert("Veuillez sélectionner un fichier KML");
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            const text = e.target.result;
            parseKML(text, map);
        };

        reader.readAsText(file);
    });

    // --- FONCTION POUR PARSER LE KML ---
    function parseKML(kmlText, map) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlText, "text/xml");
        const placemarks = xmlDoc.getElementsByTagName("Placemark");

        for (let i = 0; i < placemarks.length; i++) {
            const placemark = placemarks[i];
            const name = placemark.getElementsByTagName("name")[0]?.textContent || "Spot";
            const coordText = placemark.getElementsByTagName("coordinates")[0]?.textContent;

            if (!coordText) continue;

            const [lon, lat] = coordText.trim().split(",").map(Number);

            L.marker([lat, lon]).addTo(map).bindPopup(name);
        }

        alert(`Import terminé : ${placemarks.length} spots ajoutés`);
    }
};

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

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    const adminEmail = "enzocomyn@protonmail.com";
    let map;

    const loginDiv = document.getElementById("login");
    const logoutBtn = document.getElementById("logoutBtn");
    const kmlDiv = document.getElementById("kmlContainer");

    // --- PAS DE SESSION PERSISTANTE POUR TEST ---
    auth.setPersistence(firebase.auth.Auth.Persistence.NONE)
        .then(() => console.log("Session non persistante : login requis à chaque reload"))
        .catch(err => console.error(err));

    // --- GÉRER L'ÉTAT DE CONNEXION ---
    auth.onAuthStateChanged(user => {
        if(user){
            loginDiv.style.display = "none";
            logoutBtn.style.display = "block";
            document.getElementById("map").style.display = "block";

            if(!map) map = initMap();

            // Admin → montrer KML
            if(user.email.trim().toLowerCase() === adminEmail.toLowerCase()){
                kmlDiv.style.display = "block";
                attachKmlListener();
            } else {
                kmlDiv.style.display = "none";
            }

            loadSpots();
        } else {
            loginDiv.style.display = "block";
            logoutBtn.style.display = "none";
            document.getElementById("map").style.display = "none";
            kmlDiv.style.display = "none";
        }
    });

    // --- LOGIN ---
    document.getElementById("loginBtn").addEventListener("click", () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        auth.signInWithEmailAndPassword(email, password)
            .then(userCredential => {
                document.getElementById("loginError").innerText = "";
                console.log("Connecté :", userCredential.user.email);
            })
            .catch(err => {
                console.log("Erreur login :", err.message);
                document.getElementById("loginError").innerText = err.message;
            });
    });

    // --- LOGOUT ---
    logoutBtn.addEventListener("click", () => {
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

    // --- ATTACHER LE BOUTON KML ---
    function attachKmlListener() {
        const importBtn = document.getElementById("importKmlBtn");
        importBtn.removeEventListener("click", importKML); // retire si déjà attaché
        importBtn.addEventListener("click", importKML);
    }

    // --- IMPORT KML ---
    async function importKML() {
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

            for(const spot of spots){
                await db.collection("kml").add(spot);
            }
            alert(`Import terminé : ${spots.length} spots ajoutés`);
            loadSpots(); // recharge les markers sur la carte
        };
        reader.readAsText(file);
    }

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

    // --- CHARGER LES SPOTS FIRESTORE ---
    async function loadSpots(){
        if(!map) return;
        const snapshot = await db.collection("kml").get();
        snapshot.forEach(doc => {
            const data = doc.data();
            L.marker([data.lat, data.lon]).addTo(map).bindPopup(data.name);
        });
    }
};

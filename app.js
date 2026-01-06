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

    // --- ELEMENTS HTML ---
    const loginDiv = document.getElementById("login");
    const logoutBtn = document.getElementById("logoutBtn");
    const mapDiv = document.getElementById("map");
    const kmlDiv = document.getElementById("kmlContainer");
    const loginError = document.getElementById("loginError");
    let map;

    // --- AFFICHAGE INITIAL ---
    loginDiv.style.display = "block";
    logoutBtn.style.display = "none";
    mapDiv.style.display = "none";
    kmlDiv.style.display = "none";

    console.log("kmlDiv =", kmlDiv); // Vérifie que l'élément existe

    // --- LOGIN MANUEL ---
    document.getElementById("loginBtn").addEventListener("click", () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        auth.signInWithEmailAndPassword(email, password)
            .then(userCredential => {
                const user = userCredential.user;

                // Affichage après login
                loginDiv.style.display = "none";
                logoutBtn.style.display = "block";
                mapDiv.style.display = "block";

                if(!map) map = initMap();

                // Bouton KML visible uniquement pour admin
                if(user.email.trim().toLowerCase() === adminEmail.toLowerCase()){
                    kmlDiv.style.display = "block";
                    attachKmlListener();
                } else {
                    kmlDiv.style.display = "none";
                }

                loadSpots();
            })
            .catch(err => {
                loginError.innerText = err.message;
            });
    });

    // --- LOGOUT ---
    logoutBtn.addEventListener("click", () => {
        auth.signOut().then(() => {
            loginDiv.style.display = "block";
            logoutBtn.style.display = "none";
            mapDiv.style.display = "none";
            kmlDiv.style.display = "none";
            if(map) map.eachLayer(layer => map.removeLayer(layer));
        });
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
        importBtn.removeEventListener("click", importKML);
        importBtn.addEventListener("click", importKML);
    }

    // --- IMPORT KML ---
    async function importKML() {
        const fileInput = document.getElementById("kmlFile");
        if(fileInput.files.length === 0){
            alert("Veuillez sélectionner un KML");
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e){
            const spots = parseKML(e.target.result);
            for(const spot of spots){
                await db.collection("kml").add(spot);
            }
            alert(`Import terminé : ${spots.length} spots ajoutés`);
            loadSpots();
        };
        reader.readAsText(fileInput.files[0]);
    }

    // --- PARSER KML ---
    function parseKML(kmlText){
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlText,"text/xml");
        const placemarks = xmlDoc.getElementsByTagName("Placemark");
        const spots = [];

        for(let i=0;i<placemarks.length;i++){
            const p = placemarks[i];
            const name = p.getElementsByTagName("name")[0]?.textContent || "Spot";
            const coordText = p.getElementsByTagName("coordinates")[0]?.textContent;
            if(!coordText) continue;

            const [lon, lat] = coordText.trim().split(",").map(Number);
            spots.push({name, lat, lon});
        }

        return spots;
    }

    // --- CHARGER LES SPOTS FIRESTORE ---
    async function loadSpots(){
        if(!map) return;
        // Supprime les markers existants
        map.eachLayer(layer => {
            if(layer instanceof L.Marker) map.removeLayer(layer);
        });

        const snapshot = await db.collection("kml").get();
        snapshot.forEach(doc => {
            const data = doc.data();
            L.marker([data.lat, data.lon]).addTo(map).bindPopup(data.name);
        });
    }
};

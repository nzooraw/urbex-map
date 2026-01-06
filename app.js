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
    let markers = []; // pour garder la référence des markers et docId

    // --- AFFICHAGE INITIAL ---
    loginDiv.style.display = "block";
    logoutBtn.style.display = "none";
    mapDiv.style.display = "none";
    kmlDiv.style.display = "none";

    // --- LOGIN ---
    document.getElementById("loginBtn").addEventListener("click", function() {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        auth.signInWithEmailAndPassword(email, password)
            .then(function(userCredential) {
                const user = userCredential.user;

                loginDiv.style.display = "none";
                logoutBtn.style.display = "block"; // toujours visible
                mapDiv.style.display = "block";

                if(!map) map = initMap();

                const isAdmin = user.email.trim().toLowerCase() === adminEmail.toLowerCase();

                // Bouton KML pour admin
                kmlDiv.style.display = isAdmin ? "block" : "none";
                if(isAdmin) attachKmlListener();

                loadSpots(isAdmin);
            })
            .catch(function(error) {
                loginError.innerText = error.message;
            });
    });

    // --- LOGOUT ---
    logoutBtn.addEventListener("click", function() {
        auth.signOut().then(function() {
            loginDiv.style.display = "block";
            logoutBtn.style.display = "none";
            mapDiv.style.display = "none";
            kmlDiv.style.display = "none";
            clearMarkers();
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
        importBtn.onclick = importKML;
    }

    // --- IMPORT KML ---
    function importKML() {
        const fileInput = document.getElementById("kmlFile");
        if(fileInput.files.length === 0){
            alert("Veuillez sélectionner un fichier KML");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e){
            const spots = parseKML(e.target.result);
            spots.forEach(function(spot){
                db.collection("kml").add(spot);
            });
            alert("Import terminé : " + spots.length + " spots ajoutés");
            loadSpots(true); // reload markers admin
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
            const coords = coordText.trim().split(",");
            if(coords.length < 2) continue;
            const lon = parseFloat(coords[0]);
            const lat = parseFloat(coords[1]);
            if(isNaN(lat) || isNaN(lon)) continue;
            spots.push({name: name, lat: lat, lon: lon});
        }

        return spots;
    }

    // --- CHARGER LES SPOTS ---
    function loadSpots(isAdmin = false){
        if(!map) return;
        clearMarkers();

        db.collection("kml").get().then(function(snapshot){
            snapshot.forEach(function(doc){
                const data = doc.data();
                const marker = L.marker([data.lat, data.lon]).addTo(map);

                let popupText = `<b>${data.name}</b><br>Lat: ${data.lat.toFixed(6)}, Lon: ${data.lon.toFixed(6)}`;
                if(isAdmin){
                    popupText += `<br><button onclick="deleteMarker('${doc.id}')">Supprimer</button>`;
                }

                marker.bindPopup(popupText);
                markers.push({marker: marker, docId: doc.id});
            });
        });
    }

    // --- SUPPRIMER UN MARKER (admin) ---
    window.deleteMarker = function(docId){
        if(confirm("Supprimer ce spot ?")){
            db.collection("kml").doc(docId).delete().then(function(){
                loadSpots(true);
            }).catch(function(err){
                alert("Erreur suppression : " + err.message);
            });
        }
    }

    // --- SUPPRIMER TOUS LES MARKERS ---
    function clearMarkers(){
        markers.forEach(m => {
            map.removeLayer(m.marker);
        });
        markers = [];
    }
};

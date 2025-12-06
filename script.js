class RERDisplay {
    constructor() {
        this.data = {
            stops: new Map(),
            routes: new Map(),
            trips: new Map(),
            stopTimes: new Map()
        };
        
        this.currentStopId = this.getStopIdFromURL();
        this.selectedLines = { line1: null, line2: null };
        this.selectedDirections = { line1: null, line2: null };
        
        this.init();
    }
    
    async init() {
        console.log('🚇 Initialisation du plan RER');
        this.updateCurrentTime();
        
        try {
            await this.loadData();
            this.updateStationInfo();
            this.setupControls();
            this.renderDisplay();
            
            // Démarrer les mises à jour
            setInterval(() => this.updateCurrentTime(), 1000);
            setInterval(() => this.updateTimestamp(), 1000);
            setInterval(() => this.renderDisplay(), 5000); // Mise à jour toutes les 5 secondes
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Impossible de charger les données');
        }
    }
    
    getStopIdFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || '8775860'; // Gare de Lyon par défaut
    }
    
    async loadData() {
        console.log('📥 Chargement des données GTFS...');
        
        // Fichiers à charger
        const files = ['stops', 'routes', 'trips', 'stop_times'];
        const loadedFiles = [];
        
        for (const file of files) {
            try {
                const response = await fetch(`gtfs/${file}.txt`);
                if (response.ok) {
                    const text = await response.text();
                    this.parseFile(file, text);
                    loadedFiles.push(file);
                    console.log(`✅ ${file}.txt chargé`);
                } else {
                    console.warn(`⚠️ ${file}.txt non trouvé`);
                }
            } catch (error) {
                console.warn(`⚠️ Erreur avec ${file}.txt:`, error.message);
            }
        }
        
        if (loadedFiles.length === 0) {
            // Si aucun fichier GTFS, utiliser des données de démonstration
            console.log('⚠️ Utilisation des données de démonstration');
            this.loadDemoData();
        }
        
        console.log('🎉 Données chargées avec succès');
    }
    
    parseFile(fileName, text) {
        if (!text || !text.trim()) return;
        
        const lines = text.trim().split('\n');
        if (lines.length < 2) return;
        
        const headers = lines[0].split(',').map(h => h.trim());
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            const row = {};
            
            headers.forEach((header, idx) => {
                if (idx < values.length) {
                    row[header] = values[idx];
                }
            });
            
            this.processRow(fileName, row);
        }
    }
    
    processRow(fileName, row) {
        switch (fileName) {
            case 'stops':
                if (row.stop_id && row.stop_name) {
                    this.data.stops.set(row.stop_id, {
                        id: row.stop_id,
                        name: row.stop_name.toUpperCase(),
                        code: row.stop_code || ''
                    });
                }
                break;
                
            case 'routes':
                if (row.route_id) {
                    // Définir les couleurs pour les lignes RER
                    const colors = {
                        'RERA': '#FF0000',
                        'RERB': '#0000FF', 
                        'RERC': '#FFCC00',
                        'RERD': '#00CC66',
                        'RERE': '#9966FF'
                    };
                    
                    this.data.routes.set(row.route_id, {
                        id: row.route_id,
                        shortName: row.route_short_name || row.route_id,
                        longName: row.route_long_name || '',
                        color: colors[row.route_id] || '#666666'
                    });
                }
                break;
                
            case 'trips':
                if (row.trip_id && row.route_id) {
                    this.data.trips.set(row.trip_id, {
                        id: row.trip_id,
                        routeId: row.route_id,
                        headsign: row.trip_headsign ? row.trip_headsign.toUpperCase() : '',
                        directionId: parseInt(row.direction_id) || 0
                    });
                }
                break;
                
            case 'stop_times':
                if (row.trip_id && row.stop_id) {
                    const tripId = row.trip_id;
                    if (!this.data.stopTimes.has(tripId)) {
                        this.data.stopTimes.set(tripId, []);
                    }
                    
                    this.data.stopTimes.get(tripId).push({
                        tripId: tripId,
                        stopId: row.stop_id,
                        sequence: parseInt(row.stop_sequence) || 0
                    });
                }
                break;
        }
    }
    
    loadDemoData() {
        // Données de démonstration pour RER A et B
        const demoStops = [
            {id: '8775860', name: 'GARE DE LYON RER'},
            {id: '8775861', name: 'CHATELET - LES HALLES'},
            {id: '8775862', name: 'AUBER'},
            {id: '8775863', name: 'CHARLES DE GAULLE - ÉTOILE'},
            {id: '8775864', name: 'LA DÉFENSE'},
            {id: '8775865', name: 'NANTERRE PRÉFECTURE'},
            {id: '8775866', name: 'NANTERRE UNIVERSITÉ'},
            {id: '8775867', name: 'NANTERRE VILLE'},
            {id: '8775868', name: 'SARTROUVILLE'},
            {id: '8775869', name: 'MAISONS-LAFFITTE'},
            {id: '8775870', name: 'LE VÉSINET - LE PECQ'},
            {id: '8775871', name: 'NATION'},
            {id: '8775872', name: 'VINCENNES'},
            {id: '8775873', name: 'FONTENAY-SOUS-BOIS'},
            {id: '8775874', name: 'NOGENT-SUR-MARNE'}
        ];
        
        const demoRoutes = [
            {id: 'RERA', shortName: 'A', longName: 'RER A', color: '#FF0000'},
            {id: 'RERB', shortName: 'B', longName: 'RER B', color: '#0000FF'},
            {id: 'RERC', shortName: 'C', longName: 'RER C', color: '#FFCC00'},
            {id: 'RERD', shortName: 'D', longName: 'RER D', color: '#00CC66'}
        ];
        
        const demoTrips = [
            {id: 'T1', routeId: 'RERA', headsign: 'SAINT-GERMAIN-EN-LAYE', directionId: 0},
            {id: 'T2', routeId: 'RERA', headsign: 'MARNE-LA-VALLÉE', directionId: 1},
            {id: 'T3', routeId: 'RERB', headsign: 'AÉROPORT CDG', directionId: 0},
            {id: 'T4', routeId: 'RERB', headsign: 'SAINT-RÉMY-LÈS-CHEVREUSE', directionId: 1}
        ];
        
        const demoStopTimes = {
            'T1': [
                {tripId: 'T1', stopId: '8775860', sequence: 10},
                {tripId: 'T1', stopId: '8775861', sequence: 11},
                {tripId: 'T1', stopId: '8775862', sequence: 12},
                {tripId: 'T1', stopId: '8775863', sequence: 13},
                {tripId: 'T1', stopId: '8775864', sequence: 14},
                {tripId: 'T1', stopId: '8775865', sequence: 15},
                {tripId: 'T1', stopId: '8775866', sequence: 16},
                {tripId: 'T1', stopId: '8775867', sequence: 17},
                {tripId: 'T1', stopId: '8775868', sequence: 18},
                {tripId: 'T1', stopId: '8775869', sequence: 19},
                {tripId: 'T1', stopId: '8775870', sequence: 20}
            ],
            'T2': [
                {tripId: 'T2', stopId: '8775860', sequence: 10},
                {tripId: 'T2', stopId: '8775861', sequence: 11},
                {tripId: 'T2', stopId: '8775871', sequence: 12},
                {tripId: 'T2', stopId: '8775872', sequence: 13},
                {tripId: 'T2', stopId: '8775873', sequence: 14},
                {tripId: 'T2', stopId: '8775874', sequence: 15}
            ],
            'T3': [
                {tripId: 'T3', stopId: '8775860', sequence: 5},
                {tripId: 'T3', stopId: '8775861', sequence: 6},
                {tripId: 'T3', stopId: '8775862', sequence: 7},
                {tripId: 'T3', stopId: '8775863', sequence: 8},
                {tripId: 'T3', stopId: '8775864', sequence: 9}
            ],
            'T4': [
                {tripId: 'T4', stopId: '8775860', sequence: 5},
                {tripId: 'T4', stopId: '8775861', sequence: 6},
                {tripId: 'T4', stopId: '8775862', sequence: 7},
                {tripId: 'T4', stopId: '8775871', sequence: 8}
            ]
        };
        
        // Charger les données de démonstration
        demoStops.forEach(stop => this.data.stops.set(stop.id, stop));
        demoRoutes.forEach(route => this.data.routes.set(route.id, route));
        demoTrips.forEach(trip => this.data.trips.set(trip.id, trip));
        Object.entries(demoStopTimes).forEach(([tripId, stops]) => {
            this.data.stopTimes.set(tripId, stops);
        });
    }
    
    updateStationInfo() {
        const stop = this.data.stops.get(this.currentStopId);
        const stationName = stop ? stop.name : `ARRÊT ${this.currentStopId}`;
        
        document.getElementById('station-name').textContent = stationName;
        document.getElementById('stop-id').textContent = this.currentStopId;
    }
    
    updateCurrentTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('current-time').textContent = timeStr;
    }
    
    updateTimestamp() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('update-time').textContent = timeStr;
    }
    
    setupControls() {
        this.populateLineSelectors();
        this.setupEventListeners();
    }
    
    populateLineSelectors() {
        // Obtenir toutes les routes disponibles
        const routes = Array.from(this.data.routes.values())
            .sort((a, b) => a.shortName.localeCompare(b.shortName));
        
        // Remplir les sélecteurs de ligne
        const line1Select = document.getElementById('line1');
        const line2Select = document.getElementById('line2');
        
        routes.forEach(route => {
            const option1 = this.createOption(route);
            const option2 = this.createOption(route);
            
            line1Select.appendChild(option1);
            line2Select.appendChild(option2);
        });
        
        // Sélectionner RER A et B par défaut
        const defaultLine1 = routes.find(r => r.shortName === 'A');
        const defaultLine2 = routes.find(r => r.shortName === 'B');
        
        if (defaultLine1) {
            line1Select.value = defaultLine1.id;
            this.onLineChange('line1');
        }
        if (defaultLine2) {
            line2Select.value = defaultLine2.id;
            this.onLineChange('line2');
        }
    }
    
    createOption(route) {
        const option = document.createElement('option');
        option.value = route.id;
        option.textContent = `RER ${route.shortName}`;
        option.style.color = route.color;
        return option;
    }
    
    setupEventListeners() {
        document.getElementById('line1').addEventListener('change', () => {
            this.selectedLines.line1 = document.getElementById('line1').value;
            this.onLineChange('line1');
        });
        
        document.getElementById('line2').addEventListener('change', () => {
            this.selectedLines.line2 = document.getElementById('line2').value;
            this.onLineChange('line2');
        });
        
        document.getElementById('direction1').addEventListener('change', () => {
            this.selectedDirections.line1 = document.getElementById('direction1').value;
            this.renderDisplay();
        });
        
        document.getElementById('direction2').addEventListener('change', () => {
            this.selectedDirections.line2 = document.getElementById('direction2').value;
            this.renderDisplay();
        });
    }
    
    onLineChange(lineKey) {
        const lineSelect = document.getElementById(lineKey);
        const directionSelect = document.getElementById(lineKey.replace('line', 'direction'));
        const routeId = lineSelect.value;
        
        // Réinitialiser la direction
        directionSelect.innerHTML = '<option value="">-- Toutes directions --</option>';
        this.selectedDirections[lineKey] = null;
        
        if (!routeId) {
            this.selectedLines[lineKey] = null;
            this.renderDisplay();
            return;
        }
        
        this.selectedLines[lineKey] = routeId;
        
        // Obtenir les directions disponibles pour cette ligne
        const directions = this.getDirectionsForRoute(routeId);
        
        // Remplir les directions
        directions.forEach(dir => {
            const option = document.createElement('option');
            option.value = dir.id;
            option.textContent = dir.name;
            directionSelect.appendChild(option);
        });
        
        // Sélectionner la première direction par défaut
        if (directions.length > 0) {
            directionSelect.value = directions[0].id;
            this.selectedDirections[lineKey] = directions[0].id;
        }
        
        this.renderDisplay();
    }
    
    getDirectionsForRoute(routeId) {
        const directions = new Map();
        
        for (const [tripId, trip] of this.data.trips) {
            if (trip.routeId === routeId) {
                const stopTimes = this.data.stopTimes.get(tripId) || [];
                const hasCurrentStop = stopTimes.some(st => st.stopId === this.currentStopId);
                
                if (hasCurrentStop) {
                    const dirName = trip.headsign || `Direction ${trip.directionId}`;
                    if (!directions.has(trip.directionId)) {
                        directions.set(trip.directionId, {
                            id: trip.directionId,
                            name: dirName
                        });
                    }
                }
            }
        }
        
        return Array.from(directions.values()).sort((a, b) => a.id - b.id);
    }
    
    renderDisplay() {
        const container = document.getElementById('scheme-container');
        
        // Obtenir les données pour chaque ligne
        const line1Data = this.getLineData('line1');
        const line2Data = this.getLineData('line2');
        
        // Vérifier si aucune ligne n'est sélectionnée
        if (!line1Data && !line2Data) {
            this.showNoSelection();
            return;
        }
        
        // Construire l'affichage
        let html = '<div class="lines-display">';
        
        // Afficher la ligne 1 si sélectionnée
        if (line1Data) {
            html += this.createLineHTML(line1Data, 1);
        }
        
        // Afficher la ligne 2 si sélectionnée
        if (line2Data) {
            html += this.createLineHTML(line2Data, 2);
        }
        
        // Afficher la section partagée si les deux lignes sont sélectionnées
        if (line1Data && line2Data) {
            html += this.createSharedSectionHTML(line1Data, line2Data);
        }
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    getLineData(lineKey) {
        const routeId = this.selectedLines[lineKey];
        const directionId = this.selectedDirections[lineKey];
        
        if (!routeId) return null;
        
        const route = this.data.routes.get(routeId);
        if (!route) return null;
        
        // Obtenir les arrêts pour cette ligne
        const stops = this.getStopsForLine(routeId, directionId);
        
        return {
            route: route,
            directionId: directionId,
            stops: stops,
            nextStop: stops.length > 0 ? stops[0] : null
        };
    }
    
    getStopsForLine(routeId, directionId) {
        // Trouver un trajet pour cette ligne et direction
        let targetTrip = null;
        
        for (const [tripId, trip] of this.data.trips) {
            if (trip.routeId === routeId) {
                if (!directionId || trip.directionId.toString() === directionId.toString()) {
                    const stopTimes = this.data.stopTimes.get(tripId) || [];
                    const hasCurrentStop = stopTimes.some(st => st.stopId === this.currentStopId);
                    
                    if (hasCurrentStop) {
                        targetTrip = tripId;
                        break;
                    }
                }
            }
        }
        
        if (!targetTrip) return [];
        
        // Obtenir les arrêts après l'arrêt actuel
        const stopTimes = this.data.stopTimes.get(targetTrip) || [];
        const currentStopIndex = stopTimes.findIndex(st => st.stopId === this.currentStopId);
        
        if (currentStopIndex === -1) return [];
        
        const nextStops = [];
        const maxStops = 5; // Nombre maximum d'arrêts à afficher
        
        for (let i = currentStopIndex + 1; i < stopTimes.length && nextStops.length < maxStops; i++) {
            const stopTime = stopTimes[i];
            const stop = this.data.stops.get(stopTime.stopId);
            
            if (stop) {
                nextStops.push({
                    ...stop,
                    isNext: i === currentStopIndex + 1,
                    sequence: i
                });
            }
        }
        
        return nextStops;
    }
    
    createLineHTML(lineData, lineNumber) {
        const route = lineData.route;
        const directionName = lineData.directionId ? 
            this.getDirectionName(lineData.route.id, lineData.directionId) : 'TOUTES DIRECTIONS';
        
        return `
            <div class="line-section">
                <div class="line-header">
                    <div class="line-badge" style="background: ${route.color}">
                        ${route.shortName}
                    </div>
                    <div class="line-name">${route.longName}</div>
                    <div class="line-direction">→ ${directionName}</div>
                </div>
                
                <div class="stops-horizontal">
                    <div class="stops-track" style="background: ${route.color}"></div>
                    <div class="stops-list">
                        ${this.createStopsHTML(lineData.stops, lineNumber)}
                    </div>
                </div>
            </div>
        `;
    }
    
    createStopsHTML(stops, lineNumber) {
        if (stops.length === 0) {
            return '<div class="no-stops">Aucun arrêt suivant</div>';
        }
        
        return stops.map((stop, index) => {
            const isNext = stop.isNext;
            const isInactive = index > 0; // Les arrêts après le prochain sont inactifs
            
            let className = 'stop-point';
            let stopClass = '';
            
            if (isNext) {
                stopClass = 'next';
            } else if (isInactive) {
                stopClass = 'inactive';
            }
            
            return `
                <div class="${className}">
                    <div class="stop-marker ${stopClass}"></div>
                    <div class="stop-name ${stopClass}">
                        ${stop.name}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    createSharedSectionHTML(line1Data, line2Data) {
        const route1 = line1Data.route;
        const route2 = line2Data.route;
        
        // Trouver les arrêts partagés
        const sharedStops = this.findSharedStops(line1Data.stops, line2Data.stops);
        
        if (sharedStops.length === 0) return '';
        
        // Créer la section partagée
        return `
            <div class="line-section shared-section" 
                 style="--color1: ${route1.color}; --color2: ${route2.color}">
                <div class="line-header">
                    <div class="line-badge" style="background: linear-gradient(90deg, ${route1.color} 0%, ${route2.color} 100%)">
                        ${route1.shortName}/${route2.shortName}
                    </div>
                    <div class="line-name">SECTION COMMUNE</div>
                    <div class="line-direction">Lignes partagées</div>
                </div>
                
                <div class="stops-horizontal">
                    <div class="stops-track"></div>
                    <div class="stops-list">
                        ${this.createSharedStopsHTML(sharedStops)}
                    </div>
                </div>
            </div>
        `;
    }
    
    findSharedStops(stops1, stops2) {
        const shared = [];
        const stopIds2 = new Set(stops2.map(s => s.id));
        
        for (const stop1 of stops1) {
            if (stopIds2.has(stop1.id)) {
                shared.push(stop1);
            }
        }
        
        return shared;
    }
    
    createSharedStopsHTML(stops) {
        return stops.map((stop, index) => {
            const isFirst = index === 0;
            const stopClass = isFirst ? 'next' : 'inactive';
            
            return `
                <div class="stop-point">
                    <div class="stop-marker ${stopClass}"></div>
                    <div class="stop-name ${stopClass}">
                        ${stop.name}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    getDirectionName(routeId, directionId) {
        for (const [tripId, trip] of this.data.trips) {
            if (trip.routeId === routeId && trip.directionId.toString() === directionId.toString()) {
                return trip.headsign || `Direction ${directionId}`;
            }
        }
        return `Direction ${directionId}`;
    }
    
    showNoSelection() {
        const container = document.getElementById('scheme-container');
        container.innerHTML = `
            <div class="no-data">
                <h3>ⓘ SÉLECTIONNEZ UNE LIGNE</h3>
                <p>Choisissez une ou deux lignes dans les menus ci-dessus</p>
                <p>Les lignes RER A et B sont sélectionnées par défaut</p>
            </div>
        `;
    }
    
    showError(message) {
        const container = document.getElementById('scheme-container');
        container.innerHTML = `
            <div class="error-message">
                <h3>❌ ${message}</h3>
                <p>Vérifiez que les fichiers GTFS sont présents dans le dossier /gtfs/</p>
                <p>Ou utilisez les données de démonstration incluses</p>
            </div>
        `;
    }
}

// Démarrer l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚇 Application RER initialisée');
    window.rerDisplay = new RERDisplay();
});

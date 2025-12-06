class GTFSRouteDisplay {
    constructor() {
        this.data = {
            stops: new Map(),
            stopTimes: new Map(),
            trips: new Map(),
            routes: new Map(),
            calendar: new Map()
        };
        this.isLoaded = false;
        this.currentStopId = this.getStopIdFromURL();
    }

    async init() {
        console.log('🚇 Initialisation de l\'affichage des lignes RER');
        this.showLoading('Chargement du plan des lignes...');
        
        try {
            await this.loadGTFSData();
            this.updateStationInfo();
            await this.setupControls();
            this.renderRouteDisplay();
            this.startAutoRefresh();
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Impossible de charger les données GTFS');
        }
    }

    getStopIdFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || '8775860'; // Gare de Lyon par défaut
    }

    async loadGTFSData() {
        const files = [
            'gtfs/stops.txt',
            'gtfs/stop_times.txt', 
            'gtfs/trips.txt',
            'gtfs/routes.txt',
            'gtfs/calendar.txt'
        ];

        const results = {};
        
        for (const file of files) {
            try {
                const response = await fetch(file);
                if (response.ok) {
                    results[file] = await response.text();
                }
            } catch (error) {
                console.warn(`⚠️ ${file} non chargé:`, error.message);
            }
        }

        this.parseData(results);
        this.isLoaded = true;
        console.log('✅ Données GTFS chargées');
    }

    parseData(results) {
        // Парсим stops.txt
        if (results['gtfs/stops.txt']) {
            const lines = results['gtfs/stops.txt'].split('\n');
            const headers = lines[0].split(',');
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = lines[i].split(',');
                    const stop = {};
                    headers.forEach((header, index) => {
                        stop[header] = values[index] || '';
                    });
                    this.data.stops.set(stop.stop_id, {
                        id: stop.stop_id,
                        name: stop.stop_name,
                        lat: stop.stop_lat,
                        lon: stop.stop_lon,
                        code: stop.stop_code
                    });
                }
            }
        }

        // Парсим routes.txt
        if (results['gtfs/routes.txt']) {
            const lines = results['gtfs/routes.txt'].split('\n');
            const headers = lines[0].split(',');
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = lines[i].split(',');
                    const route = {};
                    headers.forEach((header, index) => {
                        route[header] = values[index] || '';
                    });
                    this.data.routes.set(route.route_id, {
                        id: route.route_id,
                        shortName: route.route_short_name || route.route_id,
                        longName: route.route_long_name || '',
                        color: route.route_color ? `#${route.route_color}` : '#666666'
                    });
                }
            }
        }

        // Парсим trips.txt
        if (results['gtfs/trips.txt']) {
            const lines = results['gtfs/trips.txt'].split('\n');
            const headers = lines[0].split(',');
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = lines[i].split(',');
                    const trip = {};
                    headers.forEach((header, index) => {
                        trip[header] = values[index] || '';
                    });
                    this.data.trips.set(trip.trip_id, {
                        id: trip.trip_id,
                        routeId: trip.route_id,
                        serviceId: trip.service_id,
                        headsign: trip.trip_headsign || '',
                        directionId: parseInt(trip.direction_id) || 0
                    });
                }
            }
        }

        // Парсим stop_times.txt
        if (results['gtfs/stop_times.txt']) {
            const lines = results['gtfs/stop_times.txt'].split('\n');
            const headers = lines[0].split(',');
            const stopTimesByTrip = new Map();
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = lines[i].split(',');
                    const stopTime = {};
                    headers.forEach((header, index) => {
                        stopTime[header] = values[index] || '';
                    });
                    
                    const tripId = stopTime.trip_id;
                    if (!stopTimesByTrip.has(tripId)) {
                        stopTimesByTrip.set(tripId, []);
                    }
                    stopTimesByTrip.get(tripId).push({
                        tripId: stopTime.trip_id,
                        stopId: stopTime.stop_id,
                        sequence: parseInt(stopTime.stop_sequence) || 0,
                        arrival: stopTime.arrival_time,
                        departure: stopTime.departure_time || stopTime.arrival_time
                    });
                }
            }
            
            // Сортируем по последовательности
            stopTimesByTrip.forEach((stops, tripId) => {
                stops.sort((a, b) => a.sequence - b.sequence);
                this.data.stopTimes.set(tripId, stops);
            });
        }
    }

    updateStationInfo() {
        const stopInfo = this.data.stops.get(this.currentStopId);
        const stationName = stopInfo ? stopInfo.name : `Arrêt ${this.currentStopId}`;
        
        document.getElementById('station-title').textContent = stationName;
        document.getElementById('stop-id').textContent = this.currentStopId;
        document.title = `Plan RER - ${stationName}`;
    }

    async setupControls() {
        // Получаем линии на этой остановке
        const routes = this.getRoutesAtStop(this.currentStopId);
        
        // Заполняем селекторы
        this.populateLineSelectors(routes);
        
        // Назначаем обработчики
        document.getElementById('line1').addEventListener('change', () => {
            this.updateDirections('line1', 'direction1');
            this.renderRouteDisplay();
        });
        
        document.getElementById('line2').addEventListener('change', () => {
            this.updateDirections('line2', 'direction2');
            this.renderRouteDisplay();
        });
        
        document.getElementById('direction1').addEventListener('change', () => this.renderRouteDisplay());
        document.getElementById('direction2').addEventListener('change', () => this.renderRouteDisplay());
        
        // Выбираем первые значения по умолчанию
        if (routes.length > 0) {
            document.getElementById('line1').value = routes[0].id;
            this.updateDirections('line1', 'direction1');
        }
        if (routes.length > 1) {
            document.getElementById('line2').value = routes[1].id;
            this.updateDirections('line2', 'direction2');
        }
    }

    getRoutesAtStop(stopId) {
        const routeIds = new Set();
        
        // Ищем маршруты через trips и stop_times
        for (const [tripId, trip] of this.data.trips) {
            const stopTimes = this.data.stopTimes.get(tripId) || [];
            const hasStop = stopTimes.some(st => st.stopId === stopId);
            if (hasStop) {
                routeIds.add(trip.routeId);
            }
        }
        
        const routes = [];
        for (const routeId of routeIds) {
            const route = this.data.routes.get(routeId);
            if (route) {
                routes.push(route);
            }
        }
        
        // Сортируем по короткому имени
        return routes.sort((a, b) => {
            const numA = parseInt(a.shortName.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.shortName.replace(/\D/g, '')) || 0;
            if (numA !== numB) return numA - numB;
            return a.shortName.localeCompare(b.shortName);
        });
    }

    populateLineSelectors(routes) {
        const line1Select = document.getElementById('line1');
        const line2Select = document.getElementById('line2');
        
        // Очищаем
        line1Select.innerHTML = '<option value="">-- Sélectionner ligne --</option>';
        line2Select.innerHTML = '<option value="">-- Sélectionner ligne --</option>';
        
        // Добавляем опции
        routes.forEach(route => {
            const option = document.createElement('option');
            option.value = route.id;
            option.textContent = `${route.shortName} - ${route.longName}`;
            option.style.color = route.color;
            option.style.backgroundColor = '#1a1a2e';
            
            line1Select.appendChild(option.cloneNode(true));
            line2Select.appendChild(option.cloneNode(true));
        });
    }

    updateDirections(lineSelectId, directionSelectId) {
        const lineSelect = document.getElementById(lineSelectId);
        const directionSelect = document.getElementById(directionSelectId);
        const routeId = lineSelect.value;
        
        // Очищаем
        directionSelect.innerHTML = '<option value="">-- Toutes directions --</option>';
        
        if (!routeId) return;
        
        // Получаем направления для этого маршрута
        const directions = this.getDirectionsForRoute(routeId, this.currentStopId);
        
        // Добавляем опции
        directions.forEach(dir => {
            const option = document.createElement('option');
            option.value = dir.id;
            option.textContent = dir.name;
            directionSelect.appendChild(option);
        });
    }

    getDirectionsForRoute(routeId, stopId) {
        const directions = new Map();
        
        for (const [tripId, trip] of this.data.trips) {
            if (trip.routeId === routeId) {
                const stopTimes = this.data.stopTimes.get(tripId) || [];
                const hasStop = stopTimes.some(st => st.stopId === stopId);
                
                if (hasStop) {
                    const directionName = trip.headsign || `Direction ${trip.directionId}`;
                    if (!directions.has(trip.directionId)) {
                        directions.set(trip.directionId, {
                            id: trip.directionId,
                            name: directionName
                        });
                    }
                }
            }
        }
        
        return Array.from(directions.values());
    }

    async renderRouteDisplay() {
        if (!this.isLoaded) {
            this.showLoading('Chargement des données...');
            return;
        }

        const line1 = document.getElementById('line1').value;
        const dir1 = document.getElementById('direction1').value;
        const line2 = document.getElementById('line2').value;
        const dir2 = document.getElementById('direction2').value;

        // Собираем информацию для отображения
        const displayData = [];
        
        if (line1) {
            const route1 = this.data.routes.get(line1);
            if (route1) {
                const stops1 = this.getRouteStops(line1, dir1, this.currentStopId);
                displayData.push({
                    route: route1,
                    directionId: dir1,
                    stops: stops1,
                    isShared: false
                });
            }
        }
        
        if (line2) {
            const route2 = this.data.routes.get(line2);
            if (route2) {
                const stops2 = this.getRouteStops(line2, dir2, this.currentStopId);
                displayData.push({
                    route: route2,
                    directionId: dir2,
                    stops: stops2,
                    isShared: false
                });
            }
        }
        
        // Проверяем совместные участки
        this.checkSharedSections(displayData);
        
        // Отображаем
        this.displayRouteScheme(displayData);
        this.updateTimestamp();
    }

    getRouteStops(routeId, directionId, currentStopId) {
        const stops = [];
        const currentStopIndex = -1;
        
        // Находим все trips для этого маршрута и направления
        for (const [tripId, trip] of this.data.trips) {
            if (trip.routeId === routeId && 
                (!directionId || trip.directionId.toString() === directionId)) {
                
                const stopTimes = this.data.stopTimes.get(tripId) || [];
                
                // Находим текущую остановку в этом trip
                const currentStopIndex = stopTimes.findIndex(st => st.stopId === currentStopId);
                if (currentStopIndex === -1) continue;
                
                // Берем несколько остановок до и после
                const startIdx = Math.max(0, currentStopIndex - 3);
                const endIdx = Math.min(stopTimes.length - 1, currentStopIndex + 5);
                
                for (let i = startIdx; i <= endIdx; i++) {
                    const stopTime = stopTimes[i];
                    const stopInfo = this.data.stops.get(stopTime.stopId);
                    if (stopInfo && !stops.find(s => s.id === stopInfo.id)) {
                        stops.push({
                            id: stopInfo.id,
                            name: stopInfo.name,
                            isCurrent: stopTime.stopId === currentStopId,
                            sequence: i,
                            isTerminal: i === 0 || i === stopTimes.length - 1
                        });
                    }
                }
                
                break; // Берем первый подходящий trip
            }
        }
        
        // Сортируем по последовательности
        return stops.sort((a, b) => a.sequence - b.sequence);
    }

    checkSharedSections(displayData) {
        if (displayData.length !== 2) return;
        
        const stops1 = displayData[0].stops;
        const stops2 = displayData[1].stops;
        
        // Находим общие остановки
        const sharedStops = [];
        const stopMap1 = new Map(stops1.map(s => [s.id, s]));
        
        stops2.forEach(stop2 => {
            if (stopMap1.has(stop2.id)) {
                sharedStops.push(stop2.id);
            }
        });
        
        // Если есть общие остановки, помечаем их
        if (sharedStops.length > 2) { // Нужно хотя бы 3 для значимого совместного участка
            displayData[0].isShared = true;
            displayData[1].isShared = true;
            displayData[0].sharedStops = sharedStops;
            displayData[1].sharedStops = sharedStops;
        }
    }

    displayRouteScheme(displayData) {
        const container = document.getElementById('route-display');
        
        if (displayData.length === 0) {
            container.innerHTML = `
                <div class="no-selection">
                    <h3>ⓘ Sélectionnez au moins une ligne</h3>
                    <p>Choisissez une ou deux lignes pour afficher leur parcours</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="route-scheme">';
        
        displayData.forEach((data, index) => {
            html += this.createRouteLineHTML(data, index);
        });
        
        // Если есть совместные участки, показываем их
        if (displayData.length === 2 && displayData[0].isShared && displayData[1].isShared) {
            html += this.createSharedSectionHTML(displayData);
        }
        
        html += '</div>';
        container.innerHTML = html;
    }

    createRouteLineHTML(data, index) {
        const route = data.route;
        const directionName = data.directionId ? 
            this.getDirectionName(data.route.id, data.directionId) : 'Toutes directions';
        
        return `
            <div class="route-line" style="--line-color: ${route.color};">
                <div class="line-header" style="color: ${route.color};">
                    <div class="line-badge" style="background: ${route.color};">
                        ${route.shortName}
                    </div>
                    <div class="line-title">${route.longName}</div>
                    <div class="line-direction">→ ${directionName}</div>
                </div>
                
                <div class="stops-container">
                    <div class="line-track"></div>
                    <div class="stops-list">
                        ${data.stops.map(stop => `
                            <div class="stop-item">
                                <div class="stop-marker"></div>
                                <div class="stop-name ${stop.isCurrent ? 'current' : ''} ${stop.isTerminal ? 'terminal' : ''}">
                                    ${this.escapeHTML(stop.name)}
                                    ${stop.isCurrent ? ' (Vous êtes ici)' : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    createSharedSectionHTML(displayData) {
        const route1 = displayData[0].route;
        const route2 = displayData[1].route;
        const sharedStops = displayData[0].sharedStops || [];
        
        // Берем только 3-5 общих остановок для отображения
        const displayStops = sharedStops.slice(0, Math.min(5, sharedStops.length));
        const stopNames = displayStops.map(id => {
            const stop = this.data.stops.get(id);
            return stop ? stop.name : id;
        });
        
        return `
            <div class="shared-section">
                <div class="shared-connector" style="--line1-color: ${route1.color}; --line2-color: ${route2.color};"></div>
                <div class="shared-info">
                    <h4>📌 Lignes partagées</h4>
                    <p>Les lignes ${route1.shortName} et ${route2.shortName} partagent les arrêts:</p>
                    <div class="shared-stops">
                        ${stopNames.map(name => `<span class="shared-stop">${this.escapeHTML(name)}</span>`).join(' → ')}
                    </div>
                </div>
            </div>
        `;
    }

    getDirectionName(routeId, directionId) {
        for (const [tripId, trip] of this.data.trips) {
            if (trip.routeId === routeId && trip.directionId.toString() === directionId.toString()) {
                return trip.headsign || `Direction ${directionId}`;
            }
        }
        return `Direction ${directionId}`;
    }

    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateTimestamp() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('update-time').textContent = timeStr;
    }

    showLoading(message) {
        const container = document.getElementById('route-display');
        container.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('route-display');
        container.innerHTML = `
            <div class="error-message">
                <h3>❌ ${message}</h3>
                <p>Vérifiez que les fichiers GTFS sont présents dans le dossier /gtfs/</p>
                <p>Fichiers requis: stops.txt, routes.txt, trips.txt, stop_times.txt</p>
            </div>
        `;
    }

    startAutoRefresh() {
        // Обновляем каждые 30 секунд
        setInterval(() => {
            this.renderRouteDisplay();
        }, 30000);
        
        // Обновляем время каждую минуту
        setInterval(() => {
            this.updateTimestamp();
        }, 60000);
    }
}

// Демо-данные для тестирования без GTFS
function createDemoData() {
    console.log('⚠️ Utilisation des données de démonstration');
    
    // Создаем демо-данные RER
    const demoData = {
        stops: new Map([
            ['8775860', {id: '8775860', name: 'GARE DE LYON RER', lat: '', lon: '', code: ''}],
            ['8775861', {id: '8775861', name: 'CHATELET - LES HALLES', lat: '', lon: '', code: ''}],
            ['8775862', {id: '8775862', name: 'AUBER', lat: '', lon: '', code: ''}],
            ['8775863', {id: '8775863', name: 'CHARLES DE GAULLE - ÉTOILE', lat: '', lon: '', code: ''}],
            ['8775864', {id: '8775864', name: 'LA DÉFENSE', lat: '', lon: '', code: ''}],
            ['8775865', {id: '8775865', name: 'NANTERRE PRÉFECTURE', lat: '', lon: '', code: ''}],
            ['8775866', {id: '8775866', name: 'NANTERRE UNIVERSITÉ', lat: '', lon: '', code: ''}],
            ['8775867', {id: '8775867', name: 'NANTERRE VILLE', lat: '', lon: '', code: ''}],
            ['8775868', {id: '8775868', name: 'HOUILLES - CARRIÈRES-SUR-SEINE', lat: '', lon: '', code: ''}],
            ['8775869', {id: '8775869', name: 'SARTROUVILLE', lat: '', lon: '', code: ''}],
            ['8775870', {id: '8775870', name: 'MAISONS-LAFFITTE', lat: '', lon: '', code: ''}],
            ['8775871', {id: '8775871', name: 'LE VÉSINET - LE PECQ', lat: '', lon: '', code: ''}],
            ['8775872', {id: '8775872', name: 'LE VÉSINET CENTRE', lat: '', lon: '', code: ''}],
            ['8775873', {id: '8775873', name: 'CHATOU - CROISSY', lat: '', lon: '', code: ''}],
            ['8775874', {id: '8775874', name: 'RUEL - MALMAISON', lat: '', lon: '', code: ''}],
            ['8775875', {id: '8775875', name: 'NATION', lat: '', lon: '', code: ''}],
            ['8775876', {id: '8775876', name: 'VINCENNES', lat: '', lon: '', code: ''}],
            ['8775877', {id: '8775877', name: 'FONTENAY-SOUS-BOIS', lat: '', lon: '', code: ''}],
            ['8775878', {id: '8775878', name: 'NOGENT-SUR-MARNE', lat: '', lon: '', code: ''}],
            ['8775879', {id: '8775879', name: 'JOINVILLE-LE-PONT', lat: '', lon: '', code: ''}],
            ['8775880', {id: '8775880', name: 'SAINT-MAUR - CRÉTEIL', lat: '', lon: '', code: ''}]
        ]),
        
        routes: new Map([
            ['RERA', {id: 'RERA', shortName: 'A', longName: 'RER A', color: '#FF0000'}],
            ['RERB', {id: 'RERB', shortName: 'B', longName: 'RER B', color: '#0000FF'}],
            ['RERC', {id: 'RERC', shortName: 'C', longName: 'RER C', color: '#FFCC00'}],
            ['RERD', {id: 'RERD', shortName: 'D', longName: 'RER D', color: '#00CC66'}]
        ]),
        
        trips: new Map([
            ['T1', {id: 'T1', routeId: 'RERA', serviceId: 'WEEK', headsign: 'SAINT-GERMAIN-EN-LAYE', directionId: 0}],
            ['T2', {id: 'T2', routeId: 'RERA', serviceId: 'WEEK', headsign: 'MARNE-LA-VALLÉE', directionId: 1}],
            ['T3', {id: 'T3', routeId: 'RERB', serviceId: 'WEEK', headsign: 'AÉROPORT CHARLES DE GAULLE', directionId: 0}],
            ['T4', {id: 'T4', routeId: 'RERB', serviceId: 'WEEK', headsign: 'SAINT-RÉMY-LÈS-CHEVREUSE', directionId: 1}]
        ]),
        
        stopTimes: new Map()
    };
    
    // Создаем демо-стоп-таймс для RER A
    demoData.stopTimes.set('T1', [
        {tripId: 'T1', stopId: '8775860', sequence: 10, arrival: '08:00:00', departure: '08:01:00'},
        {tripId: 'T1', stopId: '8775861', sequence: 11, arrival: '08:05:00', departure: '08:06:00'},
        {tripId: 'T1', stopId: '8775862', sequence: 12, arrival: '08:08:00', departure: '08:09:00'},
        {tripId: 'T1', stopId: '8775863', sequence: 13, arrival: '08:12:00', departure: '08:13:00'},
        {tripId: 'T1', stopId: '8775864', sequence: 14, arrival: '08:18:00', departure: '08:19:00'},
        {tripId: 'T1', stopId: '8775865', sequence: 15, arrival: '08:22:00', departure: '08:23:00'},
        {tripId: 'T1', stopId: '8775866', sequence: 16, arrival: '08:25:00', departure: '08:26:00'},
        {tripId: 'T1', stopId: '8775867', sequence: 17, arrival: '08:28:00', departure: '08:29:00'}
    ]);
    
    demoData.stopTimes.set('T2', [
        {tripId: 'T2', stopId: '8775860', sequence: 10, arrival: '08:00:00', departure: '08:01:00'},
        {tripId: 'T2', stopId: '8775861', sequence: 11, arrival: '08:04:00', departure: '08:05:00'},
        {tripId: 'T2', stopId: '8775875', sequence: 12, arrival: '08:10:00', departure: '08:11:00'},
        {tripId: 'T2', stopId: '8775876', sequence: 13, arrival: '08:14:00', departure: '08:15:00'},
        {tripId: 'T2', stopId: '8775877', sequence: 14, arrival: '08:18:00', departure: '08:19:00'},
        {tripId: 'T2', stopId: '8775878', sequence: 15, arrival: '08:22:00', departure: '08:23:00'},
        {tripId: 'T2', stopId: '8775879', sequence: 16, arrival: '08:26:00', departure: '08:27:00'},
        {tripId: 'T2', stopId: '8775880', sequence: 17, arrival: '08:30:00', departure: '08:31:00'}
    ]);
    
    demoData.stopTimes.set('T3', [
        {tripId: 'T3', stopId: '8775860', sequence: 5, arrival: '08:00:00', departure: '08:02:00'},
        {tripId: 'T3', stopId: '8775861', sequence: 6, arrival: '08:06:00', departure: '08:07:00'},
        {tripId: 'T3', stopId: '8775862', sequence: 7, arrival: '08:10:00', departure: '08:11:00'},
        {tripId: 'T3', stopId: '8775863', sequence: 8, arrival: '08:15:00', departure: '08:16:00'}
    ]);
    
    return demoData;
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    const display = new GTFSRouteDisplay();
    
    // Загружаем демо-данные если нет реальных
    setTimeout(() => {
        if (!display.isLoaded) {
            console.log('Chargement des données de démonstration...');
            display.data = createDemoData();
            display.isLoaded = true;
            display.updateStationInfo();
            display.setupControls();
            display.renderRouteDisplay();
            display.startAutoRefresh();
        }
    }, 2000);
    
    window.routeDisplay = display;
});

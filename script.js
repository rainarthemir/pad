class RERLinesDisplay {
    constructor() {
        this.gtfsData = {
            stops: new Map(),
            routes: new Map(),
            trips: new Map(),
            stopTimes: new Map()
        };
        
        this.currentStopId = this.getStopIdFromURL();
        this.selectedLines = { line1: null, line2: null };
        this.selectedDirections = { line1: null, line2: null };
        this.isLoaded = false;
        
        this.init();
    }

    async init() {
        this.showLoading();
        this.updateCurrentTime();
        
        try {
            await this.loadGTFSData();
            this.isLoaded = true;
            this.updateStationInfo();
            this.populateLineSelectors();
            this.setupEventListeners();
            this.renderLinesScheme();
            
            // Старт обновления времени
            setInterval(() => this.updateCurrentTime(), 1000);
            setInterval(() => this.updateTimestamp(), 1000);
            setInterval(() => this.renderLinesScheme(), 30000); // Каждые 30 секунд
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Erreur de chargement des données GTFS');
        }
    }

    getStopIdFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || '8775860'; // Gare de Lyon par défaut
    }

    async loadGTFSData() {
        const files = ['stops', 'routes', 'trips', 'stop_times'];
        
        for (const file of files) {
            try {
                const response = await fetch(`gtfs/${file}.txt`);
                if (response.ok) {
                    const text = await response.text();
                    this.parseGTFSFile(file, text);
                }
            } catch (error) {
                console.warn(`File gtfs/${file}.txt not loaded:`, error.message);
            }
        }
        
        if (this.gtfsData.stops.size === 0) {
            throw new Error('GTFS files not found or empty');
        }
    }

    parseGTFSFile(fileName, text) {
        if (!text.trim()) return;
        
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',').map(v => v.trim());
            const row = {};
            
            headers.forEach((header, idx) => {
                if (idx < values.length) {
                    row[header] = values[idx];
                }
            });
            
            this.processGTFSRow(fileName, row);
        }
    }

    processGTFSRow(fileName, row) {
        switch (fileName) {
            case 'stops':
                if (row.stop_id && row.stop_name) {
                    this.gtfsData.stops.set(row.stop_id, {
                        id: row.stop_id,
                        name: row.stop_name.toUpperCase(),
                        code: row.stop_code || ''
                    });
                }
                break;
                
            case 'routes':
                if (row.route_id) {
                    this.gtfsData.routes.set(row.route_id, {
                        id: row.route_id,
                        shortName: row.route_short_name || row.route_id,
                        longName: row.route_long_name || '',
                        color: row.route_color ? `#${row.route_color}` : '#666666'
                    });
                }
                break;
                
            case 'trips':
                if (row.trip_id && row.route_id) {
                    this.gtfsData.trips.set(row.trip_id, {
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
                    if (!this.gtfsData.stopTimes.has(tripId)) {
                        this.gtfsData.stopTimes.set(tripId, []);
                    }
                    
                    this.gtfsData.stopTimes.get(tripId).push({
                        tripId: tripId,
                        stopId: row.stop_id,
                        sequence: parseInt(row.stop_sequence) || 0,
                        arrival: row.arrival_time,
                        departure: row.departure_time || row.arrival_time
                    });
                }
                break;
        }
    }

    updateStationInfo() {
        const stop = this.gtfsData.stops.get(this.currentStopId);
        const stationName = stop ? stop.name : `ARRÊT ${this.currentStopId}`;
        
        document.getElementById('station-title').textContent = stationName;
        document.getElementById('stop-id').textContent = this.currentStopId;
        document.title = `Plan RER - ${stationName}`;
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

    populateLineSelectors() {
        const routes = Array.from(this.gtfsData.routes.values())
            .filter(route => route.shortName.match(/^[A-E]$/i)) // Только RER A-E
            .sort((a, b) => a.shortName.localeCompare(b.shortName));
        
        const line1Select = document.getElementById('line1');
        const line2Select = document.getElementById('line2');
        
        // Очищаем и добавляем опции
        [line1Select, line2Select].forEach(select => {
            select.innerHTML = '<option value="">-- Sélection --</option>';
            routes.forEach(route => {
                const option = document.createElement('option');
                option.value = route.id;
                option.textContent = `RER ${route.shortName}`;
                option.style.color = route.color;
                select.appendChild(option);
            });
        });
        
        // Устанавливаем значения по умолчанию
        if (routes.length > 0) {
            line1Select.value = routes[0].id;
            this.onLineChange('line1');
        }
        if (routes.length > 1) {
            line2Select.value = routes[1].id;
            this.onLineChange('line2');
        }
    }

    setupEventListeners() {
        document.getElementById('line1').addEventListener('change', () => this.onLineChange('line1'));
        document.getElementById('line2').addEventListener('change', () => this.onLineChange('line2'));
        document.getElementById('direction1').addEventListener('change', () => this.onDirectionChange('line1'));
        document.getElementById('direction2').addEventListener('change', () => this.onDirectionChange('line2'));
    }

    onLineChange(lineKey) {
        const select = document.getElementById(lineKey);
        const routeId = select.value;
        const directionSelect = document.getElementById(lineKey.replace('line', 'direction'));
        
        // Сбрасываем направление
        directionSelect.innerHTML = '<option value="">-- Sélection --</option>';
        
        if (!routeId) {
            this.selectedLines[lineKey] = null;
            this.renderLinesScheme();
            return;
        }
        
        this.selectedLines[lineKey] = routeId;
        
        // Получаем направления для этой линии на текущей остановке
        const directions = this.getDirectionsForRoute(routeId);
        
        // Заполняем направления
        directions.forEach(dir => {
            const option = document.createElement('option');
            option.value = dir.id;
            option.textContent = dir.name;
            directionSelect.appendChild(option);
        });
        
        // Выбираем первое направление по умолчанию
        if (directions.length > 0) {
            directionSelect.value = directions[0].id;
            this.selectedDirections[lineKey] = directions[0].id;
        }
        
        this.renderLinesScheme();
    }

    onDirectionChange(lineKey) {
        const select = document.getElementById(lineKey.replace('line', 'direction'));
        this.selectedDirections[lineKey] = select.value;
        this.renderLinesScheme();
    }

    getDirectionsForRoute(routeId) {
        const directions = new Map();
        
        for (const [tripId, trip] of this.gtfsData.trips) {
            if (trip.routeId === routeId) {
                const stopTimes = this.gtfsData.stopTimes.get(tripId) || [];
                const hasCurrentStop = stopTimes.some(st => st.stopId === this.currentStopId);
                
                if (hasCurrentStop) {
                    const dirName = trip.headsign || `DIRECTION ${trip.directionId}`;
                    if (!directions.has(trip.directionId)) {
                        directions.set(trip.directionId, {
                            id: trip.directionId,
                            name: dirName
                        });
                    }
                }
            }
        }
        
        return Array.from(directions.values());
    }

    renderLinesScheme() {
        if (!this.isLoaded) return;
        
        const container = document.getElementById('lines-scheme');
        
        // Получаем данные для обеих линий
        const line1Data = this.getLineData('line1');
        const line2Data = this.getLineData('line2');
        
        // Если ни одна линия не выбрана
        if (!line1Data && !line2Data) {
            this.showNoSelection();
            return;
        }
        
        // Строим схему
        let html = '<div class="scheme-vertical">';
        
        // Линия 1
        if (line1Data) {
            html += this.createLineSection(line1Data, 1);
        }
        
        // Линия 2
        if (line2Data) {
            html += this.createLineSection(line2Data, 2);
        }
        
        // Если выбраны обе линии, показываем совместный участок
        if (line1Data && line2Data) {
            const sharedSection = this.createSharedSection(line1Data, line2Data);
            if (sharedSection) {
                html += sharedSection;
            }
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Обновляем цвета в легенде
        this.updateLegendColors(line1Data, line2Data);
    }

    getLineData(lineKey) {
        const routeId = this.selectedLines[lineKey];
        const directionId = this.selectedDirections[lineKey];
        
        if (!routeId) return null;
        
        const route = this.gtfsData.routes.get(routeId);
        if (!route) return null;
        
        // Находим остановки для этой линии и направления
        const stops = this.getStopsForRoute(routeId, directionId);
        
        return {
            route: route,
            directionId: directionId,
            stops: stops,
            nextStop: this.getNextStop(stops),
            isActive: true
        };
    }

    getStopsForRoute(routeId, directionId) {
        // Находим trip для этого маршрута и направления
        let targetTrip = null;
        
        for (const [tripId, trip] of this.gtfsData.trips) {
            if (trip.routeId === routeId && 
                (!directionId || trip.directionId.toString() === directionId.toString())) {
                
                const stopTimes = this.gtfsData.stopTimes.get(tripId) || [];
                const hasCurrentStop = stopTimes.some(st => st.stopId === this.currentStopId);
                
                if (hasCurrentStop) {
                    targetTrip = tripId;
                    break;
                }
            }
        }
        
        if (!targetTrip) return [];
        
        // Получаем остановки для этого trip
        const stopTimes = this.gtfsData.stopTimes.get(targetTrip) || [];
        const currentStopIndex = stopTimes.findIndex(st => st.stopId === this.currentStopId);
        
        if (currentStopIndex === -1) return [];
        
        // Берем следующие остановки (максимум 5)
        const nextStops = [];
        const maxStops = 5;
        
        for (let i = currentStopIndex + 1; i < stopTimes.length && nextStops.length < maxStops; i++) {
            const stopTime = stopTimes[i];
            const stop = this.gtfsData.stops.get(stopTime.stopId);
            if (stop) {
                nextStops.push({
                    ...stop,
                    isCurrent: stopTime.stopId === this.currentStopId,
                    isNext: nextStops.length === 0, // Первая остановка после текущей - следующая
                    sequence: i
                });
            }
        }
        
        return nextStops;
    }

    getNextStop(stops) {
        return stops.find(stop => stop.isNext) || stops[0];
    }

    createLineSection(lineData, lineNumber) {
        const route = lineData.route;
        const direction = lineData.directionId ? 
            this.getDirectionName(lineData.route.id, lineData.directionId) : 'TOUTES DIRECTIONS';
        
        return `
            <div class="route-column" id="line-${lineNumber}">
                <div class="route-header">
                    <div class="route-badge" style="background: ${route.color}">
                        ${route.shortName}
                    </div>
                    <div class="route-title">${route.longName}</div>
                    <div class="route-direction">→ ${direction}</div>
                </div>
                
                <div class="stops-horizontal">
                    <div class="stops-container">
                        ${this.createStopsHTML(lineData.stops, lineNumber)}
                    </div>
                    <div class="line-track" style="background: ${route.color};"></div>
                </div>
            </div>
        `;
    }

    createStopsHTML(stops, lineNumber) {
        if (stops.length === 0) {
            return '<div class="no-stops">Aucun arrêt suivant</div>';
        }
        
        return stops.map((stop, index) => {
            let className = 'stop-item';
            let markerClass = '';
            
            if (stop.isNext) {
                className += ' next';
                markerClass = 'next';
            } else if (index > 0) {
                className += ' inactive';
                markerClass = 'inactive';
            }
            
            return `
                <div class="${className}">
                    <div class="stop-marker ${markerClass}" style="border-color: ${this.getLineColor(lineNumber)};"></div>
                    <div class="stop-name ${markerClass}">
                        ${stop.name}
                    </div>
                </div>
            `;
        }).join('');
    }

    createSharedSection(line1Data, line2Data) {
        const route1 = line1Data.route;
        const route2 = line2Data.route;
        
        // Находим общие остановки
        const sharedStops = this.findSharedStops(line1Data.stops, line2Data.stops);
        
        if (sharedStops.length < 2) return ''; // Нужно минимум 2 общие остановки
        
        // Определяем цвет градиента
        const gradient = `linear-gradient(90deg, ${route1.color} 0%, ${route2.color} 100%)`;
        
        return `
            <div class="route-column shared-section">
                <div class="route-header">
                    <div class="route-badge" style="background: ${gradient}">
                        ${route1.shortName}/${route2.shortName}
                    </div>
                    <div class="route-title">SECTION COMMUNE</div>
                    <div class="route-direction">Lignes partagées</div>
                </div>
                
                <div class="stops-horizontal">
                    <div class="stops-container">
                        ${this.createSharedStopsHTML(sharedStops, route1.color, route2.color)}
                    </div>
                    <div class="line-track" style="background: ${gradient};"></div>
                </div>
            </div>
        `;
    }

    findSharedStops(stops1, stops2) {
        const shared = [];
        const stopIds2 = new Set(stops2.map(s => s.id));
        
        // Ищем общие остановки в том же порядке
        for (const stop1 of stops1) {
            if (stopIds2.has(stop1.id)) {
                shared.push({
                    ...stop1,
                    isShared: true
                });
            }
        }
        
        return shared;
    }

    createSharedStopsHTML(stops, color1, color2) {
        return stops.map((stop, index) => {
            const isNext = index === 0; // Первая общая остановка - следующая
            const className = `stop-item ${isNext ? 'next' : 'inactive'}`;
            
            return `
                <div class="${className}">
                    <div class="stop-marker" style="border-color: ${isNext ? color1 : '#666666'};"></div>
                    <div class="stop-name ${isNext ? 'next' : 'inactive'}">
                        ${stop.name}
                    </div>
                </div>
            `;
        }).join('');
    }

    getDirectionName(routeId, directionId) {
        for (const [tripId, trip] of this.gtfsData.trips) {
            if (trip.routeId === routeId && trip.directionId.toString() === directionId.toString()) {
                return trip.headsign || `DIRECTION ${directionId}`;
            }
        }
        return `DIRECTION ${directionId}`;
    }

    getLineColor(lineNumber) {
        const lineKey = `line${lineNumber}`;
        const routeId = this.selectedLines[lineKey];
        if (!routeId) return '#666666';
        
        const route = this.gtfsData.routes.get(routeId);
        return route ? route.color : '#666666';
    }

    updateLegendColors(line1Data, line2Data) {
        const line1Color = line1Data ? line1Data.route.color : '#666666';
        const line2Color = line2Data ? line2Data.route.color : '#666666';
        
        // Обновляем цвета в легенде
        document.querySelector('.legend-color.line1-color').style.background = line1Color;
        document.querySelector('.legend-color.line2-color').style.background = line2Color;
        
        // Обновляем градиент в легенде
        if (line1Data && line2Data) {
            document.querySelector('.legend-color.shared').style.background = 
                `linear-gradient(90deg, ${line1Color} 0%, ${line2Color} 100%)`;
        }
    }

    showLoading() {
        const container = document.getElementById('lines-scheme');
        container.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>Chargement du plan des lignes...</p>
            </div>
        `;
    }

    showNoSelection() {
        const container = document.getElementById('lines-scheme');
        container.innerHTML = `
            <div class="no-data">
                <h3>ⓘ SÉLECTIONNEZ UNE LIGNE</h3>
                <p>Choisissez une ou deux lignes pour afficher le plan</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('lines-scheme');
        container.innerHTML = `
            <div class="error-message">
                <h3>❌ ${message}</h3>
                <p>Vérifiez que les fichiers GTFS sont dans le dossier /gtfs/</p>
                <p>Fichiers requis: stops.txt, routes.txt, trips.txt, stop_times.txt</p>
            </div>
        `;
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.rerDisplay = new RERLinesDisplay();
});

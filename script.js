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
        this.retryCount = 0;
        this.maxRetries = 3;
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
            this.showError('Impossible de charger les données GTFS. Vérifiez les fichiers dans le dossier /gtfs/');
        }
    }

    getStopIdFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || '8775860'; // Gare de Lyon par défaut
    }

    async loadGTFSData() {
        const files = [
            { name: 'stops', path: 'gtfs/stops.txt' },
            { name: 'routes', path: 'gtfs/routes.txt' },
            { name: 'trips', path: 'gtfs/trips.txt' },
            { name: 'stop_times', path: 'gtfs/stop_times.txt' },
            { name: 'calendar', path: 'gtfs/calendar.txt' }
        ];

        for (const file of files) {
            try {
                const text = await this.loadFileWithRetry(file.path);
                if (text) {
                    this.parseFile(file.name, text);
                }
            } catch (error) {
                console.warn(`Fichier ${file.path} non chargé:`, error.message);
            }
        }

        if (this.data.routes.size === 0 || this.data.stops.size === 0) {
            throw new Error('Fichiers GTFS incomplets ou non trouvés');
        }

        this.isLoaded = true;
        console.log('✅ Données GTFS chargées');
        console.log(`📊 Routes: ${this.data.routes.size}, Arrêts: ${this.data.stops.size}`);
    }

    async loadFileWithRetry(filepath) {
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                const response = await fetch(filepath);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.text();
            } catch (error) {
                if (i === this.maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
        return null;
    }

    parseFile(fileName, text) {
        if (!text || text.trim().length === 0) return;

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
                        name: row.stop_name,
                        lat: row.stop_lat || '',
                        lon: row.stop_lon || '',
                        code: row.stop_code || ''
                    });
                }
                break;
                
            case 'routes':
                if (row.route_id) {
                    this.data.routes.set(row.route_id, {
                        id: row.route_id,
                        shortName: row.route_short_name || row.route_id,
                        longName: row.route_long_name || '',
                        color: row.route_color ? `#${row.route_color}` : '#666666'
                    });
                }
                break;
                
            case 'trips':
                if (row.trip_id && row.route_id) {
                    this.data.trips.set(row.trip_id, {
                        id: row.trip_id,
                        routeId: row.route_id,
                        serviceId: row.service_id || 'WEEK',
                        headsign: row.trip_headsign || '',
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
                        sequence: parseInt(row.stop_sequence) || 0,
                        arrival: row.arrival_time,
                        departure: row.departure_time || row.arrival_time
                    });
                }
                break;
                
            case 'calendar':
                if (row.service_id) {
                    this.data.calendar.set(row.service_id, {
                        service_id: row.service_id,
                        monday: row.monday === '1',
                        tuesday: row.tuesday === '1',
                        wednesday: row.wednesday === '1',
                        thursday: row.thursday === '1',
                        friday: row.friday === '1',
                        saturday: row.saturday === '1',
                        sunday: row.sunday === '1'
                    });
                }
                break;
        }
    }

    updateStationInfo() {
        const stopInfo = this.data.stops.get(this.currentStopId);
        let stationName = `Arrêt ${this.currentStopId}`;
        
        if (stopInfo) {
            stationName = stopInfo.name;
        } else {
            // Пытаемся найти остановку по части имени
            for (const [id, stop] of this.data.stops) {
                if (id.includes(this.currentStopId) || 
                    stop.name.toLowerCase().includes(this.currentStopId.toLowerCase())) {
                    this.currentStopId = id;
                    stationName = stop.name;
                    break;
                }
            }
        }
        
        document.getElementById('station-title').textContent = stationName;
        document.getElementById('stop-id').textContent = this.currentStopId;
        document.title = `Plan RER - ${stationName}`;
    }

    async setupControls() {
        // Получаем линии на этой остановке
        const routes = this.getRoutesAtStop(this.currentStopId);
        
        if (routes.length === 0) {
            this.showError('Aucune ligne trouvée pour cet arrêt. Essayez un autre ID.');
            return;
        }
        
        // Заполняем селекторы
        this.populateLineSelectors(routes);
        
        // Назначаем обработчики
        this.setupEventListeners();
        
        // Выбираем первые значения по умолчанию
        if (routes.length > 0) {
            document.getElementById('line1').value = routes[0].id;
            this.updateDirections('line1', 'direction1');
        }
        if (routes.length > 1) {
            document.getElementById('line2').value = routes[1].id;
            this.updateDirections('line2', 'direction2');
        }
        
        // Первый рендер
        this.renderRouteDisplay();
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
            // Извлекаем числа из названий (A1, B2, etc.)
            const getNumber = (str) => {
                const match = str.match(/\d+/);
                return match ? parseInt(match[0]) : 0;
            };
            
            const numA = getNumber(a.shortName);
            const numB = getNumber(b.shortName);
            if (numA !== numB) return numA - numB;
            
            // Сортируем по буквам
            const letterA = a.shortName.replace(/\d+/g, '').toUpperCase();
            const letterB = b.shortName.replace(/\d+/g, '').toUpperCase();
            return letterA.localeCompare(letterB);
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

    setupEventListeners() {
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
                            name: directionName,
                            tripId: tripId
                        });
                    }
                }
            }
        }
        
        return Array.from(directions.values()).sort((a, b) => a.id - b.id);
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
                if (stops1.length > 0) {
                    displayData.push({
                        route: route1,
                        directionId: dir1,
                        stops: stops1,
                        isShared: false
                    });
                }
            }
        }
        
        if (line2) {
            const route2 = this.data.routes.get(line2);
            if (route2) {
                const stops2 = this.getRouteStops(line2, dir2, this.currentStopId);
                if (stops2.length > 0) {
                    displayData.push({
                        route: route2,
                        directionId: dir2,
                        stops: stops2,
                        isShared: false
                    });
                }
            }
        }
        
        if (displayData.length === 0) {
            this.showNoSelection();
            return;
        }
        
        // Проверяем совместные участки
        if (displayData.length === 2) {
            this.checkSharedSections(displayData);
        }
        
        // Отображаем
        this.displayRouteScheme(displayData);
        this.updateTimestamp();
    }

    getRouteStops(routeId, directionId, currentStopId) {
        const allStops = [];
        
        // Находим все trips для этого маршрута и направления
        for (const [tripId, trip] of this.data.trips) {
            if (trip.routeId !== routeId) continue;
            if (directionId && trip.directionId.toString() !== directionId.toString()) continue;
            
            const stopTimes = this.data.stopTimes.get(tripId) || [];
            const currentStopIndex = stopTimes.findIndex(st => st.stopId === currentStopId);
            
            if (currentStopIndex === -1) continue;
            
            // Берем несколько остановок до и после
            const startIdx = Math.max(0, currentStopIndex - 4);
            const endIdx = Math.min(stopTimes.length - 1, currentStopIndex + 6);
            
            for (let i = startIdx; i <= endIdx; i++) {
                const stopTime = stopTimes[i];
                const stopInfo = this.data.stops.get(stopTime.stopId);
                
                if (stopInfo) {
                    // Проверяем, нет ли уже этой остановки
                    const existingStop = allStops.find(s => s.id === stopInfo.id);
                    if (!existingStop) {
                        allStops.push({
                            id: stopInfo.id,
                            name: stopInfo.name,
                            isCurrent: stopTime.stopId === currentStopId,
                            sequence: i,
                            isTerminal: i === 0 || i === stopTimes.length - 1,
                            tripId: tripId
                        });
                    }
                }
            }
            
            // Если нашли подходящий trip, выходим
            if (allStops.length > 0) break;
        }
        
        // Сортируем по последовательности
        return allStops.sort((a, b) => a.sequence - b.sequence);
    }

    checkSharedSections(displayData) {
        const stops1 = displayData[0].stops;
        const stops2 = displayData[1].stops;
        
        if (stops1.length === 0 || stops2.length === 0) return;
        
        // Находим общие остановки
        const stopIds1 = new Set(stops1.map(s => s.id));
        const sharedStops = stops2.filter(s => stopIds1.has(s.id)).map(s => s.id);
        
        // Если есть общие остановки (кроме текущей), помечаем их
        const currentStopId = this.currentStopId;
        const relevantSharedStops = sharedStops.filter(id => id !== currentStopId);
        
        if (relevantSharedStops.length >= 2) {
            displayData[0].isShared = true;
            displayData[1].isShared = true;
            displayData[0].sharedStops = sharedStops;
            displayData[1].sharedStops = sharedStops;
        }
    }

    displayRouteScheme(displayData) {
        const container = document.getElementById('route-display');
        
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
                    <div class="line-direction">→ ${this.escapeHTML(directionName)}</div>
                </div>
                
                <div class="stops-container">
                    <div class="line-track"></div>
                    <div class="stops-list">
                        ${data.stops.map(stop => `
                            <div class="stop-item">
                                <div class="stop-marker"></div>
                                <div class="stop-name ${stop.isCurrent ? 'current' : ''} ${stop.isTerminal ? 'terminal' : ''}">
                                    ${this.escapeHTML(stop.name)}
                                    ${stop.isCurrent ? ' <span class="current-marker">(Vous êtes ici)</span>' : ''}
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
        
        if (sharedStops.length === 0) return '';
        
        // Фильтруем текущую остановку
        const relevantStops = sharedStops.filter(id => id !== this.currentStopId);
        if (relevantStops.length === 0) return '';
        
        // Берем 3-5 общих остановок для отображения
        const displayStops = relevantStops.slice(0, Math.min(5, relevantStops.length));
        const stopNames = displayStops.map(id => {
            const stop = this.data.stops.get(id);
            return stop ? stop.name : id;
        });
        
        return `
            <div class="shared-section">
                <div class="shared-connector" style="--line1-color: ${route1.color}; --line2-color: ${route2.color};"></div>
                <div class="shared-info">
                    <h4>📌 Section commune</h4>
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
        if (!text) return '';
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

    showNoSelection() {
        const container = document.getElementById('route-display');
        container.innerHTML = `
            <div class="no-selection">
                <h3>ⓘ Sélectionnez au moins une ligne</h3>
                <p>Choisissez une ou deux lignes pour afficher leur parcours</p>
                <p class="tip">💡 Conseil: Sélectionnez une ligne dans les menus déroulants ci-dessus</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('route-display');
        container.innerHTML = `
            <div class="error-message">
                <h3>❌ ${message}</h3>
                <p>Vérifiez que les fichiers GTFS sont présents dans le dossier /gtfs/</p>
                <div class="file-list">
                    <p><strong>Fichiers requis:</strong></p>
                    <ul>
                        <li>stops.txt - Liste des arrêts</li>
                        <li>routes.txt - Informations sur les lignes</li>
                        <li>trips.txt - Trajets des véhicules</li>
                        <li>stop_times.txt - Horaires aux arrêts</li>
                    </ul>
                </div>
                <p class="tip">📥 Téléchargez les données GTFS RER depuis <a href="https://data.iledefrance-mobilites.fr" target="_blank">data.iledefrance-mobilites.fr</a></p>
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

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.routeDisplay = new GTFSRouteDisplay();
    window.routeDisplay.init();
});

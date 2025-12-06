// Основной класс для работы с GTFS данными
class GTFSLoader {
    constructor() {
        this.data = {
            stops: new Map(),
            stopTimes: new Map(),
            trips: new Map(),
            routes: new Map(),
            calendar: new Map(),
            calendarDates: new Map()
        };
        this.isLoaded = false;
        this.stopTimesByStop = new Map(); // Кэш для быстрого поиска по остановке
    }

    async loadAllData() {
        console.log('📥 Début du chargement des données GTFS...');
        
        const files = [
            { name: 'stops', file: 'gtfs/stops.txt' },
            { name: 'stop_times', file: 'gtfs/stop_times.txt' },
            { name: 'trips', file: 'gtfs/trips.txt' },
            { name: 'routes', file: 'gtfs/routes.txt' },
            { name: 'calendar', file: 'gtfs/calendar.txt' },
            { name: 'calendar_dates', file: 'gtfs/calendar_dates.txt' }
        ];

        const results = {};
        
        for (const { name, file } of files) {
            try {
                console.log(`📂 Chargement de ${file}...`);
                const text = await this.fetchFile(file);
                results[name] = text;
                console.log(`✅ ${file} chargé (${text.length} octets)`);
            } catch (error) {
                console.warn(`⚠️ Impossible de charger ${file}:`, error.message);
                results[name] = '';
            }
        }

        // Парсим данные
        this.parseStops(results.stops);
        this.parseStopTimes(results.stop_times);
        this.parseTrips(results.trips);
        this.parseRoutes(results.routes);
        this.parseCalendar(results.calendar);
        this.parseCalendarDates(results.calendar_dates);
        
        // Строим кэш для быстрого поиска
        this.buildStopTimesCache();
        
        this.isLoaded = true;
        console.log('🎉 Données GTFS chargées avec succès!');
        console.log(`📊 Statistiques:
            - Arrêts: ${this.data.stops.size}
            - Trajets: ${this.data.trips.size}
            - Lignes: ${this.data.routes.size}
            - Horaires: ${this.data.stopTimes.size}
        `);
        
        return true;
    }

    async fetchFile(filename) {
        const response = await fetch(filename);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        return await response.text();
    }

    parseCSV(text) {
        if (!text || text.trim().length === 0) {
            return [];
        }
        
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            // Простой парсинг CSV (без кавычек для GTFS)
            const values = line.split(',').map(v => v.trim());
            const row = {};
            
            for (let j = 0; j < Math.min(headers.length, values.length); j++) {
                row[headers[j]] = values[j] || '';
            }
            
            rows.push(row);
        }
        
        return rows;
    }

    parseStops(text) {
        if (!text) return;
        
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            if (row.stop_id && row.stop_name) {
                this.data.stops.set(row.stop_id, {
                    id: row.stop_id,
                    name: row.stop_name,
                    lat: parseFloat(row.stop_lat) || 0,
                    lon: parseFloat(row.stop_lon) || 0,
                    code: row.stop_code || ''
                });
            }
        });
    }

    parseStopTimes(text) {
        if (!text) return;
        
        const rows = this.parseCSV(text);
        const stopTimesByTrip = new Map();
        
        rows.forEach(row => {
            if (!row.trip_id || !row.stop_id) return;
            
            const tripId = row.trip_id;
            const stopTime = {
                trip_id: tripId,
                arrival_time: row.arrival_time,
                departure_time: row.departure_time || row.arrival_time,
                stop_id: row.stop_id,
                stop_sequence: parseInt(row.stop_sequence) || 0
            };
            
            if (!stopTimesByTrip.has(tripId)) {
                stopTimesByTrip.set(tripId, []);
            }
            stopTimesByTrip.get(tripId).push(stopTime);
        });
        
        // Сортируем по stop_sequence
        stopTimesByTrip.forEach((stops, tripId) => {
            stops.sort((a, b) => a.stop_sequence - b.stop_sequence);
            this.data.stopTimes.set(tripId, stops);
        });
    }

    parseTrips(text) {
        if (!text) return;
        
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            if (row.trip_id && row.route_id) {
                this.data.trips.set(row.trip_id, {
                    trip_id: row.trip_id,
                    route_id: row.route_id,
                    service_id: row.service_id || 'WEEK',
                    trip_headsign: row.trip_headsign || '',
                    direction_id: parseInt(row.direction_id) || 0
                });
            }
        });
    }

    parseRoutes(text) {
        if (!text) return;
        
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            if (row.route_id) {
                this.data.routes.set(row.route_id, {
                    route_id: row.route_id,
                    short_name: row.route_short_name || row.route_id,
                    long_name: row.route_long_name || '',
                    type: parseInt(row.route_type) || 2,
                    color: row.route_color ? `#${row.route_color}` : '#666666'
                });
            }
        });
    }

    parseCalendar(text) {
        if (!text) return;
        
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            if (row.service_id) {
                this.data.calendar.set(row.service_id, {
                    service_id: row.service_id,
                    monday: row.monday === '1',
                    tuesday: row.tuesday === '1',
                    wednesday: row.wednesday === '1',
                    thursday: row.thursday === '1',
                    friday: row.friday === '1',
                    saturday: row.saturday === '1',
                    sunday: row.sunday === '1',
                    start_date: row.start_date,
                    end_date: row.end_date
                });
            }
        });
    }

    parseCalendarDates(text) {
        if (!text) return;
        
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            if (row.service_id && row.date) {
                const serviceId = row.service_id;
                if (!this.data.calendarDates.has(serviceId)) {
                    this.data.calendarDates.set(serviceId, []);
                }
                this.data.calendarDates.get(serviceId).push({
                    date: row.date,
                    exception_type: parseInt(row.exception_type) || 1
                });
            }
        });
    }

    buildStopTimesCache() {
        console.log('🔨 Construction du cache des horaires...');
        
        // Строим обратный индекс: stop_id -> [stop_time]
        for (const [tripId, stopTimes] of this.data.stopTimes) {
            for (const stopTime of stopTimes) {
                const stopId = stopTime.stop_id;
                if (!this.stopTimesByStop.has(stopId)) {
                    this.stopTimesByStop.set(stopId, []);
                }
                
                this.stopTimesByStop.get(stopId).push({
                    ...stopTime,
                    trip_id: tripId
                });
            }
        }
        
        console.log(`✅ Cache construit: ${this.stopTimesByStop.size} arrêts indexés`);
    }

    // Получаем информацию об остановке
    getStopInfo(stopId) {
        return this.data.stops.get(stopId);
    }

    // Получаем все маршруты на остановке
    getRoutesForStop(stopId) {
        const routeIds = new Set();
        const stopTimes = this.stopTimesByStop.get(stopId) || [];
        
        stopTimes.forEach(stopTime => {
            const trip = this.data.trips.get(stopTime.trip_id);
            if (trip) {
                routeIds.add(trip.route_id);
            }
        });
        
        const routes = [];
        for (const routeId of routeIds) {
            const route = this.data.routes.get(routeId);
            if (route) {
                routes.push({
                    id: route.route_id,
                    shortName: route.short_name,
                    longName: route.long_name,
                    color: route.color
                });
            }
        }
        
        return routes.sort((a, b) => {
            // Сортируем по короткому имени (A, B, C...)
            return a.shortName.localeCompare(b.shortName);
        });
    }

    // Получаем направления для маршрута на остановке
    getDirectionsForRoute(stopId, routeId) {
        const directions = new Map();
        const stopTimes = this.stopTimesByStop.get(stopId) || [];
        
        stopTimes.forEach(stopTime => {
            const trip = this.data.trips.get(stopTime.trip_id);
            if (trip && trip.route_id === routeId) {
                const directionId = trip.direction_id;
                const directionName = trip.trip_headsign || `Direction ${directionId}`;
                
                if (!directions.has(directionId)) {
                    directions.set(directionId, {
                        id: directionId,
                        name: directionName,
                        headsign: trip.trip_headsign
                    });
                }
            }
        });
        
        return Array.from(directions.values());
    }

    // Получаем ближайшие отправления
    getNextDepartures(stopId, routeId = null, directionId = null, maxResults = 6) {
        if (!this.isLoaded) return [];
        
        const now = new Date();
        const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        
        // Получаем все stop_times для этой остановки
        const stopTimes = this.stopTimesByStop.get(stopId) || [];
        const departures = [];
        
        for (const stopTime of stopTimes) {
            const trip = this.data.trips.get(stopTime.trip_id);
            if (!trip) continue;
            
            // Фильтруем по маршруту, если указан
            if (routeId && trip.route_id !== routeId) continue;
            
            // Фильтруем по направлению, если указано
            if (directionId !== null && trip.direction_id !== directionId) continue;
            
            // Проверяем активность сервиса (упрощенная проверка)
            if (!this.isServiceActive(trip.service_id)) continue;
            
            // Время отправления в секундах
            const departureSeconds = this.timeToSeconds(stopTime.departure_time);
            
            // Только будущие отправления (или в ближайшие 2 минуты)
            if (departureSeconds >= currentTime - 120) {
                const route = this.data.routes.get(trip.route_id);
                
                // Получаем следующие остановки
                const nextStops = this.getNextStops(stopTime.trip_id, stopTime.stop_sequence);
                
                // Получаем конечную станцию
                const finalStop = this.getFinalStop(stopTime.trip_id);
                
                departures.push({
                    tripId: stopTime.trip_id,
                    routeId: trip.route_id,
                    routeShortName: route?.short_name || trip.route_id,
                    routeLongName: route?.long_name || '',
                    routeColor: route?.color || '#666666',
                    headsign: trip.trip_headsign,
                    destination: finalStop?.name || trip.trip_headsign,
                    departureTime: stopTime.departure_time,
                    departureSeconds: departureSeconds,
                    minutes: Math.max(0, Math.floor((departureSeconds - currentTime) / 60)),
                    nextStops: nextStops,
                    directionId: trip.direction_id,
                    stopSequence: stopTime.stop_sequence
                });
            }
        }
        
        // Сортируем по времени и ограничиваем
        return departures
            .sort((a, b) => a.departureSeconds - b.departureSeconds)
            .slice(0, maxResults);
    }

    // Получаем следующие остановки после текущей
    getNextStops(tripId, currentStopSequence) {
        const stopTimes = this.data.stopTimes.get(tripId);
        if (!stopTimes) return [];
        
        const nextStops = [];
        for (const stopTime of stopTimes) {
            if (stopTime.stop_sequence > currentStopSequence && nextStops.length < 5) {
                const stop = this.data.stops.get(stopTime.stop_id);
                if (stop) {
                    nextStops.push(stop.name);
                }
            }
        }
        return nextStops;
    }

    // Получаем конечную остановку маршрута
    getFinalStop(tripId) {
        const stopTimes = this.data.stopTimes.get(tripId);
        if (!stopTimes || stopTimes.length === 0) return null;
        
        const lastStopTime = stopTimes[stopTimes.length - 1];
        return this.data.stops.get(lastStopTime.stop_id);
    }

    // Упрощенная проверка активности сервиса
    isServiceActive(serviceId) {
        // Если нет данных calendar, считаем все активными
        if (this.data.calendar.size === 0) return true;
        
        const calendar = this.data.calendar.get(serviceId);
        if (!calendar) return false;
        
        const today = new Date();
        const dayOfWeek = today.getDay();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = days[dayOfWeek];
        
        return calendar[dayName] === true;
    }

    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        if (parts.length !== 3) return 0;
        
        let hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseInt(parts[2]);
        
        // Обработка времени больше 24 часов
        if (hours >= 24) {
            hours -= 24;
        }
        
        return hours * 3600 + minutes * 60 + seconds;
    }
}

// Основной класс табло
class DepartureBoard {
    constructor() {
        this.gtfs = new GTFSLoader();
        this.currentStopId = this.getStopIdFromURL();
        this.departures = [];
        this.updateInterval = null;
        this.init();
    }

    getStopIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || '8775860'; // Gare de Lyon по умолчанию
    }

    async init() {
        // Показываем загрузку
        this.showLoading('Chargement des données GTFS...');
        
        // Обновляем ID остановки
        document.getElementById('stop-id').textContent = this.currentStopId;
        
        try {
            // Загружаем GTFS данные
            await this.gtfs.loadAllData();
            
            // Обновляем информацию об остановке
            this.updateStationInfo();
            
            // Настраиваем селекторы
            await this.setupSelectors();
            
            // Загружаем первые отправления
            await this.loadDepartures();
            
            // Запускаем автообновление
            this.startAutoUpdate();
            
        } catch (error) {
            console.error('Erreur d\'initialisation:', error);
            this.showError('Erreur de chargement des données. Vérifiez les fichiers GTFS.');
        }
    }

    updateStationInfo() {
        const stopInfo = this.gtfs.getStopInfo(this.currentStopId);
        const stationName = stopInfo ? stopInfo.name : `Arrêt ${this.currentStopId}`;
        
        document.getElementById('station-title').textContent = stationName;
        document.title = `Tablo RER - ${stationName}`;
    }

    async setupSelectors() {
        // Получаем маршруты для этой остановки
        const routes = this.gtfs.getRoutesForStop(this.currentStopId);
        
        if (routes.length === 0) {
            this.showError('Aucune ligne trouvée pour cet arrêt.');
            return;
        }
        
        // Заполняем селекторы
        this.populateLineSelectors(routes);
        
        // Устанавливаем обработчики
        this.setupEventListeners();
    }

    populateLineSelectors(routes) {
        const line1Select = document.getElementById('line1');
        const line2Select = document.getElementById('line2');
        
        // Очищаем
        line1Select.innerHTML = '<option value="">-- Sélectionnez une ligne --</option>';
        line2Select.innerHTML = '<option value="">-- Sélectionnez une ligne --</option>';
        
        // Добавляем опции
        routes.forEach(route => {
            const option1 = document.createElement('option');
            option1.value = route.id;
            option1.textContent = `${route.shortName} - ${route.longName}`;
            option1.style.color = route.color;
            
            const option2 = option1.cloneNode(true);
            
            line1Select.appendChild(option1);
            line2Select.appendChild(option2);
        });
        
        // Выбираем первые две линии по умолчанию
        if (routes.length >= 1) {
            line1Select.value = routes[0].id;
            this.updateDirections('line1', 'direction1');
        }
        if (routes.length >= 2) {
            line2Select.value = routes[1].id;
            this.updateDirections('line2', 'direction2');
        }
    }

    setupEventListeners() {
        document.getElementById('line1').addEventListener('change', () => {
            this.updateDirections('line1', 'direction1');
            this.loadDepartures();
        });
        
        document.getElementById('line2').addEventListener('change', () => {
            this.updateDirections('line2', 'direction2');
            this.loadDepartures();
        });
        
        document.getElementById('direction1').addEventListener('change', () => this.loadDepartures());
        document.getElementById('direction2').addEventListener('change', () => this.loadDepartures());
    }

    updateDirections(lineSelectId, directionSelectId) {
        const lineSelect = document.getElementById(lineSelectId);
        const directionSelect = document.getElementById(directionSelectId);
        const routeId = lineSelect.value;
        
        // Очищаем
        directionSelect.innerHTML = '<option value="">-- Sélectionnez une direction --</option>';
        
        if (!routeId) return;
        
        // Получаем направления
        const directions = this.gtfs.getDirectionsForRoute(this.currentStopId, routeId);
        
        // Заполняем
        directions.forEach(direction => {
            const option = document.createElement('option');
            option.value = direction.id;
            option.textContent = direction.name;
            directionSelect.appendChild(option);
        });
        
        // Выбираем первое по умолчанию
        if (directions.length > 0) {
            directionSelect.value = directions[0].id;
        }
    }

    async loadDepartures() {
        if (!this.gtfs.isLoaded) return;
        
        try {
            // Получаем выбранные значения
            const line1 = document.getElementById('line1').value;
            const direction1 = document.getElementById('direction1').value;
            const line2 = document.getElementById('line2').value;
            const direction2 = document.getElementById('direction2').value;
            
            // Собираем отправления
            const allDepartures = [];
            
            if (line1 && direction1) {
                const deps1 = this.gtfs.getNextDepartures(
                    this.currentStopId,
                    line1,
                    parseInt(direction1),
                    3
                );
                deps1.forEach(dep => dep.source = 'line1');
                allDepartures.push(...deps1);
            }
            
            if (line2 && direction2) {
                const deps2 = this.gtfs.getNextDepartures(
                    this.currentStopId,
                    line2,
                    parseInt(direction2),
                    3
                );
                deps2.forEach(dep => dep.source = 'line2');
                allDepartures.push(...deps2);
            }
            
            // Сортируем по времени
            this.departures = allDepartures.sort((a, b) => a.minutes - b.minutes);
            
            // Отображаем
            this.renderDepartures();
            this.updateTimestamp();
            
        } catch (error) {
            console.error('Erreur de chargement des départs:', error);
            this.showError('Erreur de chargement des horaires');
        }
    }

    renderDepartures() {
        const container = document.getElementById('departure-list');
        
        if (this.departures.length === 0) {
            container.innerHTML = `
                <div class="no-departures">
                    <h3>🚫 Aucun départ prévu</h3>
                    <p>Vérifiez votre sélection de ligne et direction.</p>
                </div>
            `;
            return;
        }
        
        // Группируем по времени для совместных отображений
        const grouped = this.groupDeparturesByTime();
        
        let html = '';
        
        grouped.forEach((group, groupIndex) => {
            if (group.length === 1) {
                html += this.createDepartureHTML(group[0], groupIndex);
            } else {
                html += this.createSharedDepartureHTML(group, groupIndex);
            }
        });
        
        container.innerHTML = html;
    }

    groupDeparturesByTime() {
        const groups = [];
        const tolerance = 3; // минуты
        
        this.departures.forEach(departure => {
            let added = false;
            
            for (const group of groups) {
                if (Math.abs(group[0].minutes - departure.minutes) <= tolerance) {
                    group.push(departure);
                    added = true;
                    break;
                }
            }
            
            if (!added) {
                groups.push([departure]);
            }
        });
        
        return groups;
    }

    createDepartureHTML(departure, index) {
        const timeDisplay = departure.minutes === 0 ? 'À l\'instant' : 
                           departure.minutes === 1 ? '1 min' : 
                           `${departure.minutes} min`;
        
        return `
            <div class="departure-item" style="border-left-color: ${departure.routeColor}; animation-delay: ${index * 0.1}s">
                <div class="line-badge" style="background: ${departure.routeColor}">
                    ${departure.routeShortName}
                </div>
                <div class="departure-info">
                    <div class="destination">${this.escapeHTML(departure.destination)}</div>
                    <div class="next-stops">Direction: ${this.escapeHTML(departure.headsign)}</div>
                    ${departure.nextStops.length > 0 ? `
                        <div class="stops-list">
                            Prochains arrêts: 
                            ${departure.nextStops.slice(0, 3).map(stop => 
                                `<span class="stop-item">${this.escapeHTML(stop)}</span>`
                            ).join('')}
                            ${departure.nextStops.length > 3 ? 
                                `<span class="stop-item">+${departure.nextStops.length - 3}</span>` : 
                                ''
                            }
                        </div>
                    ` : ''}
                </div>
                <div class="time">${timeDisplay}</div>
                <div class="platform">${this.getRandomPlatform()}</div>
            </div>
        `;
    }

    createSharedDepartureHTML(departures, groupIndex) {
        let html = `<div class="shared-line-group">`;
        
        departures.forEach((departure, i) => {
            html += this.createDepartureHTML(departure, groupIndex + i);
            
            if (i < departures.length - 1) {
                html += `<div class="shared-line-connector" 
                          style="--line1-color: ${departures[i].routeColor}; 
                                 --line2-color: ${departures[i + 1].routeColor};"></div>`;
            }
        });
        
        html += `</div>`;
        return html;
    }

    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getRandomPlatform() {
        const platforms = ['A', 'B', 'C', 'D', 'E', 'F'];
        return `Voie ${platforms[Math.floor(Math.random() * platforms.length)]}`;
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

    showLoading(message = 'Chargement...') {
        const container = document.getElementById('departure-list');
        container.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('departure-list');
        container.innerHTML = `
            <div class="error-message">
                <h3>❌ ${message}</h3>
                <p>Vérifiez que les fichiers GTFS sont dans le dossier /gtfs/</p>
                <p>Fichiers requis: stops.txt, stop_times.txt, trips.txt, routes.txt</p>
            </div>
        `;
    }

    startAutoUpdate() {
        // Обновляем каждые 30 секунд
        this.updateInterval = setInterval(() => {
            this.loadDepartures();
        }, 30000);
        
        // Таймстамп каждую секунду
        setInterval(() => {
            this.updateTimestamp();
        }, 1000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.board = new DepartureBoard();
});

// Если файлы GTFS недоступны, показываем инструкцию
window.addEventListener('error', (e) => {
    if (e.target.src && e.target.src.includes('.txt')) {
        console.error('Fichier GTFS non trouvé:', e.target.src);
    }
});

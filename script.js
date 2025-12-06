// GTFS Data Manager - работает ТОЛЬКО с GTFS файлами
class GTFSManager {
    constructor() {
        this.stops = [];
        this.stopTimes = [];
        this.trips = [];
        this.routes = [];
        this.calendar = [];
        this.dataLoaded = false;
        this.loadStatus = {
            stops: false,
            stopTimes: false,
            trips: false,
            routes: false,
            calendar: false
        };
        this.loadAttempts = 0;
        this.maxLoadAttempts = 3;
    }

    async loadGTFSData() {
        console.log("Loading GTFS data from files...");
        this.showStatus("Loading GTFS files...");
        
        try {
            // Пытаемся загрузить все GTFS файлы
            const files = [
                { name: 'stops', required: true },
                { name: 'stop_times', required: true },
                { name: 'trips', required: true },
                { name: 'routes', required: true },
                { name: 'calendar', required: false }
            ];
            
            const loadPromises = files.map(file => this.loadGTFSFile(file.name, file.required));
            await Promise.allSettled(loadPromises);
            
            // Проверяем загрузились ли обязательные файлы
            const essentialFilesLoaded = this.loadStatus.stops && 
                                        this.loadStatus.stopTimes && 
                                        this.loadStatus.trips && 
                                        this.loadStatus.routes;
            
            if (!essentialFilesLoaded) {
                this.loadAttempts++;
                
                if (this.loadAttempts < this.maxLoadAttempts) {
                    console.log(`Retrying GTFS load (attempt ${this.loadAttempts + 1}/${this.maxLoadAttempts})...`);
                    setTimeout(() => this.loadGTFSData(), 1000);
                    return false;
                }
                
                throw new Error("Failed to load essential GTFS files after multiple attempts");
            }
            
            console.log("GTFS data loaded successfully:", {
                stops: this.stops.length,
                stopTimes: this.stopTimes.length,
                trips: this.trips.length,
                routes: this.routes.length,
                calendar: this.calendar.length
            });
            
            this.dataLoaded = true;
            this.showStatus("GTFS data loaded");
            return true;
            
        } catch (error) {
            console.error("Critical error loading GTFS data:", error);
            this.showStatus(`Error: ${error.message}`);
            return false;
        }
    }

    async loadGTFSFile(fileName, required = true) {
        try {
            this.showStatus(`Loading ${fileName}.txt...`);
            
            const response = await fetch(`gtfs/${fileName}.txt`);
            
            if (!response.ok) {
                if (required) {
                    throw new Error(`Failed to load ${fileName}.txt: ${response.status}`);
                } else {
                    console.warn(`Optional file ${fileName}.txt not found, skipping`);
                    return;
                }
            }
            
            const text = await response.text();
            const data = this.parseCSV(text);
            
            // Сохраняем данные
            switch(fileName) {
                case 'stops':
                    this.stops = data;
                    this.loadStatus.stops = true;
                    break;
                case 'stop_times':
                    this.stopTimes = data;
                    this.loadStatus.stopTimes = true;
                    break;
                case 'trips':
                    this.trips = data;
                    this.loadStatus.trips = true;
                    break;
                case 'routes':
                    this.routes = data;
                    this.loadStatus.routes = true;
                    break;
                case 'calendar':
                    this.calendar = data;
                    this.loadStatus.calendar = true;
                    break;
            }
            
            console.log(`Loaded ${fileName}.txt: ${data.length} records`);
            this.showStatus(`${fileName}.txt loaded (${data.length} records)`);
            
        } catch (error) {
            console.error(`Error loading ${fileName}.txt:`, error);
            
            if (required) {
                this.showStatus(`Failed to load ${fileName}.txt`);
                throw error;
            }
        }
    }

    parseCSV(text) {
        if (!text || text.trim().length === 0) {
            return [];
        }

        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return [];

        // Определяем разделитель
        const firstLine = lines[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';
        
        // Парсим заголовки
        const headers = this.parseCSVLine(firstLine, delimiter)
            .map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = this.parseCSVLine(line, delimiter);
            
            if (values.length !== headers.length) {
                console.warn(`Line ${i + 1}: Column mismatch, skipping`);
                continue;
            }

            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = values[index] ? values[index].trim().replace(/"/g, '') : '';
            });
            
            data.push(obj);
        }

        return data;
    }

    parseCSVLine(line, delimiter = ',') {
        const values = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
            } else if (inQuotes && char === quoteChar && nextChar === quoteChar) {
                // Экранированная кавычка
                current += quoteChar;
                i++;
            } else if (inQuotes && char === quoteChar) {
                inQuotes = false;
            } else if (!inQuotes && char === delimiter) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        values.push(current);
        return values;
    }

    showStatus(message) {
        const statusElement = document.getElementById('gtfsStatus');
        if (statusElement) {
            statusElement.innerHTML = `
                <div>${message}</div>
                <div class="file-status">
                    <span class="${this.loadStatus.stops ? 'loaded' : 'pending'}">stops.txt</span>
                    <span class="${this.loadStatus.stopTimes ? 'loaded' : 'pending'}">stop_times.txt</span>
                    <span class="${this.loadStatus.trips ? 'loaded' : 'pending'}">trips.txt</span>
                    <span class="${this.loadStatus.routes ? 'loaded' : 'pending'}">routes.txt</span>
                </div>
            `;
            
            // Добавляем стили для статусов
            if (!document.querySelector('#gtfs-status-styles')) {
                const style = document.createElement('style');
                style.id = 'gtfs-status-styles';
                style.textContent = `
                    .file-status {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 5px;
                        margin-top: 5px;
                        font-size: 12px;
                    }
                    .file-status span {
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: monospace;
                    }
                    .file-status .loaded {
                        background: rgba(72, 187, 120, 0.2);
                        color: #48bb78;
                    }
                    .file-status .pending {
                        background: rgba(245, 101, 101, 0.2);
                        color: #f56565;
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }

    // Методы поиска и обработки данных
    findStopById(stopId) {
        if (!stopId || !this.dataLoaded) return null;
        
        // Сначала ищем точное совпадение по stop_id
        let stop = this.stops.find(s => 
            s.stop_id && s.stop_id.toString().toLowerCase() === stopId.toString().toLowerCase()
        );
        
        // Если не нашли, ищем по stop_code
        if (!stop) {
            stop = this.stops.find(s => 
                s.stop_code && s.stop_code.toString().toLowerCase() === stopId.toString().toLowerCase()
            );
        }
        
        // Если все еще не нашли, ищем частичное совпадение в названии
        if (!stop) {
            const searchTerm = stopId.toString().toLowerCase();
            stop = this.stops.find(s => 
                s.stop_name && s.stop_name.toLowerCase().includes(searchTerm)
            );
        }
        
        return stop || null;
    }

    findStopsByName(name) {
        if (!name || !this.dataLoaded) return [];
        
        const searchTerm = name.toString().toLowerCase().trim();
        if (!searchTerm) return [];
        
        return this.stops.filter(stop => {
            if (stop.stop_name && stop.stop_name.toLowerCase().includes(searchTerm)) return true;
            if (stop.stop_id && stop.stop_id.toString().toLowerCase().includes(searchTerm)) return true;
            if (stop.stop_code && stop.stop_code.toString().toLowerCase().includes(searchTerm)) return true;
            return false;
        }).slice(0, 10);
    }

    getTripsForStop(stopId) {
        if (!stopId || !this.dataLoaded || !this.stopTimes.length) return [];
        
        // Находим все stop_times для этой остановки
        const stopTimesForStop = this.stopTimes.filter(st => 
            st.stop_id && st.stop_id.toString() === stopId.toString()
        );
        
        if (stopTimesForStop.length === 0) return [];
        
        // Получаем уникальные trip_ids
        const tripIds = [...new Set(stopTimesForStop.map(st => st.trip_id))];
        
        // Получаем информацию о рейсах
        const trips = tripIds.map(tripId => {
            const trip = this.trips.find(t => t.trip_id && t.trip_id.toString() === tripId.toString());
            if (!trip) return null;
            
            const stopTime = stopTimesForStop.find(st => 
                st.trip_id && st.trip_id.toString() === tripId.toString()
            );
            
            const route = this.routes.find(r => 
                r.route_id && r.route_id.toString() === (trip.route_id || '').toString()
            );
            
            return {
                trip_id: tripId,
                arrival_time: stopTime?.arrival_time || stopTime?.departure_time || '',
                departure_time: stopTime?.departure_time || '',
                stop_sequence: stopTime?.stop_sequence || '0',
                direction_id: trip.direction_id || '0',
                route_id: trip.route_id || '',
                route_short_name: route?.route_short_name || route?.route_id || '',
                route_long_name: route?.route_long_name || '',
                trip_headsign: trip.trip_headsign || route?.route_long_name || ''
            };
        }).filter(trip => trip !== null && trip.route_id);
        
        return trips;
    }

    getRouteDirections(routeId, stopId) {
        const tripsForRoute = this.getTripsForStop(stopId)
            .filter(trip => trip.route_id && trip.route_id.toString() === routeId.toString());
        
        if (tripsForRoute.length === 0) return [];
        
        // Группируем по направлению
        const directions = {};
        
        tripsForRoute.forEach(trip => {
            const dirId = trip.direction_id || '0';
            const headsign = trip.trip_headsign || `Direction ${dirId}`;
            
            if (!directions[dirId]) {
                directions[dirId] = {
                    direction_id: dirId,
                    trips: [],
                    headsign: headsign,
                    nextTrip: null,
                    route_short_name: trip.route_short_name
                };
            }
            
            // Добавляем рейс, если его еще нет
            const exists = directions[dirId].trips.some(t => 
                t.trip_id && t.trip_id.toString() === trip.trip_id.toString()
            );
            
            if (!exists) {
                directions[dirId].trips.push(trip);
            }
        });
        
        // Сортируем рейсы по времени
        Object.values(directions).forEach(dir => {
            dir.trips.sort((a, b) => {
                const timeA = this.parseTimeString(a.arrival_time);
                const timeB = this.parseTimeString(b.arrival_time);
                return timeA - timeB;
            });
            dir.nextTrip = this.getNextTrip(dir.trips);
        });
        
        return Object.values(directions);
    }

    getNextTrip(trips) {
        const now = new Date();
        const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        
        let nextTrip = null;
        let minDiff = Infinity;
        
        trips.forEach(trip => {
            if (!trip.arrival_time) return;
            
            const tripSeconds = this.parseTimeString(trip.arrival_time);
            if (tripSeconds === null) return;
            
            let diff = tripSeconds - currentSeconds;
            
            // Корректировка для времени после полуночи (например, 25:30:00)
            if (diff < -3600) { // Если разница больше 1 часа в прошлом
                diff += 24 * 3600;
            }
            
            // Игнорируем поезда, которые ушли больше чем 5 минут назад
            if (diff < -300) return;
            
            if (diff >= 0 && diff < minDiff) {
                minDiff = diff;
                nextTrip = {
                    ...trip,
                    arrival_seconds: tripSeconds,
                    diff_minutes: Math.max(0, Math.ceil(diff / 60)),
                    arrival_time_formatted: this.formatTimeFromSeconds(tripSeconds)
                };
            }
        });
        
        return nextTrip;
    }

    getStopsForDirection(routeId, directionId, currentStopId) {
        // Находим подходящий рейс
        let sampleTrip = this.trips.find(t => 
            t.route_id && t.route_id.toString() === routeId.toString() &&
            t.direction_id && t.direction_id.toString() === directionId.toString()
        );
        
        // Если не нашли, берем любой рейс с этим route_id
        if (!sampleTrip) {
            sampleTrip = this.trips.find(t => 
                t.route_id && t.route_id.toString() === routeId.toString()
            );
        }
        
        if (!sampleTrip || !sampleTrip.trip_id) return [];
        
        // Получаем все остановки для этого рейса
        return this.getStopsForTrip(sampleTrip.trip_id, currentStopId);
    }

    getStopsForTrip(tripId, currentStopId) {
        if (!tripId || !this.stopTimes.length) return [];
        
        // Фильтруем и сортируем остановки
        const stopsForTrip = this.stopTimes
            .filter(st => 
                st.trip_id && st.trip_id.toString() === tripId.toString()
            )
            .sort((a, b) => {
                const seqA = parseInt(a.stop_sequence) || 0;
                const seqB = parseInt(b.stop_sequence) || 0;
                return seqA - seqB;
            })
            .map(st => {
                const stopInfo = this.stops.find(s => 
                    s.stop_id && s.stop_id.toString() === st.stop_id.toString()
                );
                
                return {
                    stop_id: st.stop_id || '',
                    stop_name: stopInfo?.stop_name || `Stop ${st.stop_id}`,
                    arrival_time: st.arrival_time || st.departure_time || '',
                    departure_time: st.departure_time || '',
                    stop_sequence: parseInt(st.stop_sequence) || 0,
                    is_current: st.stop_id && st.stop_id.toString() === currentStopId.toString()
                };
            });
        
        return stopsForTrip;
    }

    parseTimeString(timeStr) {
        if (!timeStr) return null;
        
        const match = timeStr.match(/(\d{1,2}):(\d{2}):?(\d{2})?/);
        if (!match) return null;
        
        let hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;
        
        // Обработка формата >24 часов (например, 25:30:00)
        if (hours >= 24) {
            hours = hours % 24;
        }
        
        return hours * 3600 + minutes * 60 + seconds;
    }

    formatTimeFromSeconds(seconds) {
        if (seconds === null || seconds === undefined) return '--:--';
        
        const hours = Math.floor(seconds / 3600) % 24;
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
}

// PAD Display Manager
class PADDisplay {
    constructor() {
        this.gtfs = new GTFSManager();
        this.currentStopId = null;
        this.currentRoute = null;
        this.currentDirection = null;
        this.stations = [];
        this.updateInterval = null;
        this.init();
    }

    async init() {
        this.showMessage('Loading GTFS data...', 'loading');
        
        // Загружаем GTFS данные
        const loaded = await this.gtfs.loadGTFSData();
        
        if (!loaded) {
            this.showMessage(
                'Failed to load GTFS data. Please make sure GTFS files are in the /gtfs folder.',
                'error'
            );
            return;
        }
        
        // Проверяем URL на наличие stop ID
        this.checkURLForStopId();
        
        // Инициализируем обработчики событий
        this.initEventListeners();
        
        // Запускаем часы
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        
        // Автообновление каждые 60 секунд
        this.updateInterval = setInterval(() => {
            if (this.currentStopId) {
                this.refreshData();
            }
        }, 60000);
    }

    showMessage(message, type = 'info') {
        const stationsTrack = document.getElementById('stationsTrack');
        if (!stationsTrack) return;
        
        stationsTrack.innerHTML = `
            <div class="message ${type}">
                <i class="fas fa-${type === 'loading' ? 'spinner fa-spin' : 
                                 type === 'error' ? 'exclamation-triangle' : 
                                 'info-circle'}"></i>
                <div>${message}</div>
            </div>
        `;
    }

    checkURLForStopId() {
        const urlParams = new URLSearchParams(window.location.search);
        const stopId = urlParams.get('id');
        
        if (stopId) {
            document.getElementById('stopSearch').value = stopId;
            this.loadStop(stopId);
        }
    }

    initEventListeners() {
        // Кнопка поиска
        document.getElementById('searchBtn').addEventListener('click', () => {
            const searchValue = document.getElementById('stopSearch').value.trim();
            if (searchValue) {
                this.loadStop(searchValue);
            }
        });
        
        // Enter в поле поиска
        document.getElementById('stopSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchValue = e.target.value.trim();
                if (searchValue) {
                    this.loadStop(searchValue);
                }
            }
        });
        
        // Кнопка обновления
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });
        
        // Убираем демо кнопку, так как она нам не нужна
        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            demoBtn.style.display = 'none';
        }
        
        // Ссылка "View Source"
        document.getElementById('viewSource')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('https://github.com/yourusername/gtfs-pad', '_blank');
        });
    }

    async loadStop(stopIdOrName) {
        if (!this.gtfs.dataLoaded) {
            this.showMessage('GTFS data is still loading. Please wait...', 'error');
            return;
        }
        
        this.showMessage(`Searching for stop: ${stopIdOrName}...`, 'loading');
        
        // Ищем остановку
        const stop = this.gtfs.findStopById(stopIdOrName);
        
        if (!stop) {
            // Пробуем найти по имени
            const similarStops = this.gtfs.findStopsByName(stopIdOrName);
            
            if (similarStops.length === 0) {
                this.showMessage(`Stop "${stopIdOrName}" not found in GTFS data.`, 'error');
                return;
            }
            
            if (similarStops.length === 1) {
                // Если нашли только одну остановку, используем ее
                this.currentStopId = similarStops[0].stop_id;
            } else {
                // Если нашли несколько, показываем выбор
                this.showStopSelection(similarStops);
                return;
            }
        } else {
            this.currentStopId = stop.stop_id;
        }
        
        this.updateURL(this.currentStopId);
        await this.processStop();
    }

    showStopSelection(stops) {
        const stationsTrack = document.getElementById('stationsTrack');
        if (!stationsTrack) return;
        
        stationsTrack.innerHTML = `
            <div class="selection-container">
                <h3>Multiple stops found:</h3>
                <div class="stops-list">
                    ${stops.map(stop => `
                        <div class="stop-item" data-stop-id="${stop.stop_id}">
                            <div class="stop-name">${stop.stop_name || 'Unnamed Stop'}</div>
                            <div class="stop-id">ID: ${stop.stop_id}</div>
                            ${stop.stop_code ? `<div class="stop-code">Code: ${stop.stop_code}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        // Добавляем обработчики
        document.querySelectorAll('.stop-item').forEach(item => {
            item.addEventListener('click', () => {
                const stopId = item.getAttribute('data-stop-id');
                document.getElementById('stopSearch').value = stopId;
                this.currentStopId = stopId;
                this.updateURL(stopId);
                this.processStop();
            });
        });
    }

    updateURL(stopId) {
        const url = new URL(window.location);
        url.searchParams.set('id', stopId);
        window.history.replaceState({}, '', url);
    }

    async processStop() {
        if (!this.currentStopId) {
            this.showMessage('No stop selected.', 'error');
            return;
        }
        
        this.showMessage('Loading stop information...', 'loading');
        
        try {
            // Получаем рейсы для этой остановки
            const trips = this.gtfs.getTripsForStop(this.currentStopId);
            
            if (trips.length === 0) {
                this.showMessage('No trips found for this stop.', 'error');
                return;
            }
            
            // Группируем по маршрутам
            const routes = {};
            trips.forEach(trip => {
                if (!trip.route_id) return;
                
                const routeId = trip.route_id;
                if (!routes[routeId]) {
                    routes[routeId] = {
                        route_id: routeId,
                        route_short_name: trip.route_short_name,
                        route_long_name: trip.route_long_name,
                        trips: []
                    };
                }
                routes[routeId].trips.push(trip);
            });
            
            // Выбираем маршрут с наибольшим количеством рейсов
            let selectedRouteId = null;
            let maxTrips = 0;
            
            for (const [routeId, route] of Object.entries(routes)) {
                if (route.trips.length > maxTrips) {
                    maxTrips = route.trips.length;
                    selectedRouteId = routeId;
                }
            }
            
            if (!selectedRouteId) {
                this.showMessage('Could not determine route.', 'error');
                return;
            }
            
            this.currentRoute = routes[selectedRouteId];
            
            // Получаем направления для этого маршрута
            const directions = this.gtfs.getRouteDirections(selectedRouteId, this.currentStopId);
            
            if (directions.length === 0) {
                this.showMessage('No directions found for this route.', 'error');
                return;
            }
            
            // Выбираем направление с ближайшим рейсом
            directions.sort((a, b) => {
                const aTime = a.nextTrip ? a.nextTrip.diff_minutes : Infinity;
                const bTime = b.nextTrip ? b.nextTrip.diff_minutes : Infinity;
                return aTime - bTime;
            });
            
            this.currentDirection = directions[0];
            
            // Получаем остановки для этого направления
            this.stations = this.gtfs.getStopsForDirection(
                selectedRouteId, 
                this.currentDirection.direction_id, 
                this.currentStopId
            );
            
            if (this.stations.length === 0) {
                this.showMessage('Could not load route information.', 'error');
                return;
            }
            
            // Обновляем отображение
            this.updateDisplay();
            this.updateInfoPanel(trips, directions);
            
        } catch (error) {
            console.error('Error processing stop:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
        }
    }

    updateDisplay() {
        if (!this.currentRoute || !this.currentDirection || !this.stations.length) {
            return;
        }
        
        // Обновляем заголовок
        const lineName = document.getElementById('lineName');
        const lineDirection = document.getElementById('lineDirection');
        
        lineName.textContent = this.currentRoute.route_short_name || 
                              this.currentRoute.route_id || 
                              '--';
        
        lineDirection.textContent = this.currentDirection.headsign || 
                                   `Direction ${this.currentDirection.direction_id}`;
        
        // Обновляем время
        const now = new Date();
        const currentTime = document.getElementById('currentTime');
        const nextTrainTime = document.getElementById('nextTrainTime');
        
        currentTime.textContent = now.toLocaleTimeString([], {
            hour: '2-digit', 
            minute: '2-digit'
        });
        
        if (this.currentDirection.nextTrip) {
            const nextTime = this.gtfs.formatTimeFromSeconds(
                this.currentDirection.nextTrip.arrival_seconds
            );
            nextTrainTime.textContent = 
                `Next: ${nextTime} (in ${this.currentDirection.nextTrip.diff_minutes} min)`;
        } else {
            nextTrainTime.textContent = 'Next: --:--';
        }
        
        // Отображаем станции
        this.renderStations();
        
        // Обновляем подвал
        const lastStop = this.stations[this.stations.length - 1];
        const destinationName = document.getElementById('destinationName');
        const updateStatus = document.getElementById('updateStatus');
        
        destinationName.textContent = lastStop?.stop_name || 'Unknown destination';
        
        updateStatus.textContent = 
            `Last update: ${now.toLocaleTimeString([], {
                hour: '2-digit', 
                minute: '2-digit'
            })}`;
    }

    renderStations() {
        const stationsTrack = document.getElementById('stationsTrack');
        if (!stationsTrack) return;
        
        const currentIndex = this.stations.findIndex(s => s.is_current);
        
        stationsTrack.innerHTML = this.stations.map((station, index) => {
            let stationClass = 'station';
            
            if (index < currentIndex) {
                stationClass += ' passed';
            } else if (index === currentIndex) {
                stationClass += ' current';
            } else {
                stationClass += ' upcoming';
            }
            
            // Форматируем время
            let timeDisplay = '';
            if (station.arrival_time) {
                const timeMatch = station.arrival_time.match(/(\d{1,2}):(\d{2})/);
                if (timeMatch) {
                    const hours = timeMatch[1].padStart(2, '0');
                    const minutes = timeMatch[2];
                    timeDisplay = `${hours}:${minutes}`;
                }
            }
            
            return `
                <div class="${stationClass}">
                    <div class="station-name">${station.stop_name}</div>
                    ${timeDisplay ? `<div class="station-time">${timeDisplay}</div>` : ''}
                    ${station.is_current ? '<div class="station-current">CURRENT</div>' : ''}
                </div>
            `;
        }).join('');
    }

    updateInfoPanel(trips, directions) {
        // Обновляем информацию о текущей остановке
        const currentStop = this.gtfs.findStopById(this.currentStopId);
        document.getElementById('currentStopInfo').textContent = 
            currentStop ? currentStop.stop_name : 'Unknown';
        
        // Обновляем количество направлений
        document.getElementById('directionsCount').textContent = directions.length;
        
        // Обновляем время до следующего поезда
        const nextTrainMinutes = document.getElementById('nextTrainMinutes');
        if (this.currentDirection.nextTrip) {
            nextTrainMinutes.textContent = this.currentDirection.nextTrip.diff_minutes;
        } else {
            nextTrainMinutes.textContent = '--';
        }
        
        // Обновляем список следующих поездов
        const followingTrainsList = document.getElementById('followingTrains');
        followingTrainsList.innerHTML = '';
        
        // Собираем все ближайшие рейсы из всех направлений
        const upcomingTrips = [];
        
        directions.forEach(dir => {
            if (dir.nextTrip) {
                upcomingTrips.push({
                    ...dir.nextTrip,
                    direction: dir.headsign || `Direction ${dir.direction_id}`
                });
            }
            
            // Добавляем еще несколько рейсов из этого направления
            dir.trips.slice(0, 3).forEach(trip => {
                if (trip.arrival_time && (!dir.nextTrip || trip.trip_id !== dir.nextTrip.trip_id)) {
                    const tripSeconds = this.gtfs.parseTimeString(trip.arrival_time);
                    if (tripSeconds === null) return;
                    
                    const now = new Date();
                    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                    
                    let diff = tripSeconds - currentSeconds;
                    if (diff < -3600) diff += 24 * 3600;
                    
                    if (diff > 0 && diff < 3600) { // В течение следующего часа
                        upcomingTrips.push({
                            ...trip,
                            arrival_seconds: tripSeconds,
                            diff_minutes: Math.ceil(diff / 60),
                            direction: dir.headsign || `Direction ${dir.direction_id}`
                        });
                    }
                }
            });
        });
        
        // Сортируем и показываем
        upcomingTrips.sort((a, b) => a.diff_minutes - b.diff_minutes);
        
        if (upcomingTrips.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No upcoming trains in the next hour';
            followingTrainsList.appendChild(li);
        } else {
            upcomingTrips.slice(0, 8).forEach(trip => {
                const li = document.createElement('li');
                const time = this.gtfs.formatTimeFromSeconds(trip.arrival_seconds);
                li.textContent = `${time} (in ${trip.diff_minutes} min) - ${trip.direction}`;
                followingTrainsList.appendChild(li);
            });
        }
    }

    updateClock() {
        const now = new Date();
        const liveClock = document.getElementById('liveClock');
        if (liveClock) {
            liveClock.textContent = now.toLocaleTimeString([], {
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit'
            });
        }
    }

    refreshData() {
        if (this.currentStopId) {
            this.processStop();
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.padDisplay = new PADDisplay();
});

// Добавляем глобальную функцию для отладки
window.debugGTFS = function() {
    if (window.padDisplay && window.padDisplay.gtfs) {
        console.log('GTFS Data Status:', window.padDisplay.gtfs.loadStatus);
        console.log('Current Stop ID:', window.padDisplay.currentStopId);
        console.log('Current Route:', window.padDisplay.currentRoute);
        console.log('Current Direction:', window.padDisplay.currentDirection);
    }
};

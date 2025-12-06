class GTFSProcessor {
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
    }

    async loadAllData() {
        try {
            console.log('Loading GTFS data...');
            
            // Загружаем все необходимые файлы параллельно
            const [
                stopsText,
                stopTimesText,
                tripsText,
                routesText,
                calendarText,
                calendarDatesText
            ] = await Promise.all([
                this.loadFile('gtfs/stops.txt'),
                this.loadFile('gtfs/stop_times.txt'),
                this.loadFile('gtfs/trips.txt'),
                this.loadFile('gtfs/routes.txt'),
                this.loadFile('gtfs/calendar.txt'),
                this.loadFile('gtfs/calendar_dates.txt')
            ]);

            // Парсим данные
            this.parseStops(stopsText);
            this.parseStopTimes(stopTimesText);
            this.parseTrips(tripsText);
            this.parseRoutes(routesText);
            this.parseCalendar(calendarText);
            this.parseCalendarDates(calendarDatesText);
            
            this.isLoaded = true;
            console.log('GTFS data loaded successfully');
            console.log(`Loaded: ${this.data.stops.size} stops, ${this.data.trips.size} trips`);
            
            return true;
        } catch (error) {
            console.error('Error loading GTFS data:', error);
            return false;
        }
    }

    async loadFile(filename) {
        try {
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`Failed to load ${filename}: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error loading ${filename}:`, error);
            throw error;
        }
    }

    parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length === 0) return [];
        
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            
            for (let j = 0; j < headers.length; j++) {
                if (j < values.length) {
                    row[headers[j]] = values[j].trim();
                }
            }
            
            rows.push(row);
        }
        
        return rows;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    parseStops(text) {
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            this.data.stops.set(row.stop_id, {
                id: row.stop_id,
                name: row.stop_name,
                lat: parseFloat(row.stop_lat),
                lon: parseFloat(row.stop_lon),
                code: row.stop_code
            });
        });
    }

    parseStopTimes(text) {
        const rows = this.parseCSV(text);
        const stopTimesByTrip = new Map();
        
        rows.forEach(row => {
            const tripId = row.trip_id;
            const stopId = row.stop_id;
            
            if (!stopTimesByTrip.has(tripId)) {
                stopTimesByTrip.set(tripId, []);
            }
            
            stopTimesByTrip.get(tripId).push({
                trip_id: tripId,
                arrival_time: row.arrival_time,
                departure_time: row.departure_time,
                stop_id: stopId,
                stop_sequence: parseInt(row.stop_sequence),
                pickup_type: parseInt(row.pickup_type) || 0,
                drop_off_type: parseInt(row.drop_off_type) || 0
            });
        });
        
        // Сортируем остановки в каждом рейсе по последовательности
        stopTimesByTrip.forEach((stops, tripId) => {
            stops.sort((a, b) => a.stop_sequence - b.stop_sequence);
            this.data.stopTimes.set(tripId, stops);
        });
    }

    parseTrips(text) {
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            this.data.trips.set(row.trip_id, {
                trip_id: row.trip_id,
                route_id: row.route_id,
                service_id: row.service_id,
                trip_headsign: row.trip_headsign,
                direction_id: parseInt(row.direction_id) || 0,
                shape_id: row.shape_id
            });
        });
    }

    parseRoutes(text) {
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            this.data.routes.set(row.route_id, {
                route_id: row.route_id,
                short_name: row.route_short_name,
                long_name: row.route_long_name,
                type: parseInt(row.route_type),
                color: row.route_color || '000000',
                text_color: row.route_text_color || 'FFFFFF'
            });
        });
    }

    parseCalendar(text) {
        const rows = this.parseCSV(text);
        rows.forEach(row => {
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
        });
    }

    parseCalendarDates(text) {
        const rows = this.parseCSV(text);
        rows.forEach(row => {
            const serviceId = row.service_id;
            const date = row.date;
            
            if (!this.data.calendarDates.has(serviceId)) {
                this.data.calendarDates.set(serviceId, []);
            }
            
            this.data.calendarDates.get(serviceId).push({
                date: date,
                exception_type: parseInt(row.exception_type)
            });
        });
    }

    // Проверяем, активен ли сервис на сегодня
    isServiceActiveToday(serviceId) {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const dayOfWeek = today.getDay(); // 0 = воскресенье, 1 = понедельник
        
        // Проверяем calendar_dates.txt
        const dateExceptions = this.data.calendarDates.get(serviceId) || [];
        for (const exception of dateExceptions) {
            if (exception.date === todayStr) {
                return exception.exception_type === 1; // 1 = добавлен, 2 = удален
            }
        }
        
        // Проверяем calendar.txt
        const calendar = this.data.calendar.get(serviceId);
        if (!calendar) return false;
        
        // Проверяем даты
        if (todayStr < calendar.start_date || todayStr > calendar.end_date) {
            return false;
        }
        
        // Проверяем день недели
        const dayMap = {
            0: 'sunday',
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday',
            5: 'friday',
            6: 'saturday'
        };
        
        return calendar[dayMap[dayOfWeek]];
    }

    // Получаем ближайшие отправления для остановки
    getNextDepartures(stopId, maxResults = 10) {
        if (!this.isLoaded) return [];
        
        const departures = [];
        const now = new Date();
        const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        
        // Ищем все stop_times для этой остановки
        for (const [tripId, stopTimes] of this.data.stopTimes) {
            for (let i = 0; i < stopTimes.length; i++) {
                const stopTime = stopTimes[i];
                
                if (stopTime.stop_id === stopId) {
                    // Получаем информацию о рейсе
                    const trip = this.data.trips.get(tripId);
                    if (!trip) continue;
                    
                    // Проверяем, активен ли сервис сегодня
                    if (!this.isServiceActiveToday(trip.service_id)) {
                        continue;
                    }
                    
                    // Получаем информацию о маршруте
                    const route = this.data.routes.get(trip.route_id);
                    if (!route) continue;
                    
                    // Парсим время отправления
                    const departureSeconds = this.timeToSeconds(stopTime.departure_time);
                    
                    // Если отправление в будущем (или в ближайшие 5 минут в прошлом)
                    if (departureSeconds >= currentTime - 300) {
                        // Получаем следующие остановки
                        const nextStops = [];
                        for (let j = i + 1; j < Math.min(i + 6, stopTimes.length); j++) {
                            const nextStop = this.data.stops.get(stopTimes[j].stop_id);
                            if (nextStop) {
                                nextStops.push(nextStop.name);
                            }
                        }
                        
                        // Получаем конечную станцию
                        const lastStopTime = stopTimes[stopTimes.length - 1];
                        const lastStop = this.data.stops.get(lastStopTime.stop_id);
                        
                        departures.push({
                            tripId: tripId,
                            routeId: route.route_id,
                            routeShortName: route.short_name,
                            routeLongName: route.long_name,
                            routeColor: '#' + (route.color || '000000'),
                            headsign: trip.trip_headsign,
                            destination: lastStop ? lastStop.name : trip.trip_headsign,
                            departureTime: stopTime.departure_time,
                            departureSeconds: departureSeconds,
                            minutes: Math.floor((departureSeconds - currentTime) / 60),
                            nextStops: nextStops,
                            directionId: trip.direction_id,
                            stopSequence: stopTime.stop_sequence
                        });
                    }
                    break; // Переходим к следующему рейсу
                }
            }
        }
        
        // Сортируем по времени и ограничиваем количество
        return departures
            .sort((a, b) => a.departureSeconds - b.departureSeconds)
            .slice(0, maxResults);
    }

    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        if (parts.length !== 3) return 0;
        
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseInt(parts[2]);
        
        // Обрабатываем время больше 24 часов (например, 25:30:00)
        return hours * 3600 + minutes * 60 + seconds;
    }

    // Получаем информацию об остановке
    getStopInfo(stopId) {
        return this.data.stops.get(stopId);
    }

    // Получаем все маршруты, проходящие через остановку
    getRoutesForStop(stopId) {
        const routeIds = new Set();
        
        for (const [tripId, stopTimes] of this.data.stopTimes) {
            for (const stopTime of stopTimes) {
                if (stopTime.stop_id === stopId) {
                    const trip = this.data.trips.get(tripId);
                    if (trip) {
                        routeIds.add(trip.route_id);
                    }
                    break;
                }
            }
        }
        
        const routes = [];
        for (const routeId of routeIds) {
            const route = this.data.routes.get(routeId);
            if (route) {
                routes.push({
                    id: routeId,
                    shortName: route.short_name,
                    longName: route.long_name,
                    color: '#' + (route.color || '000000')
                });
            }
        }
        
        return routes.sort((a, b) => a.shortName.localeCompare(b.shortName));
    }

    // Получаем направления для маршрута на остановке
    getDirectionsForRoute(stopId, routeId) {
        const directions = new Map();
        
        for (const [tripId, stopTimes] of this.data.stopTimes) {
            const trip = this.data.trips.get(tripId);
            if (!trip || trip.route_id !== routeId) continue;
            
            for (const stopTime of stopTimes) {
                if (stopTime.stop_id === stopId) {
                    const direction = {
                        id: trip.direction_id,
                        name: trip.trip_headsign || `Direction ${trip.direction_id}`,
                        trips: []
                    };
                    
                    if (!directions.has(trip.direction_id)) {
                        directions.set(trip.direction_id, direction);
                    }
                    break;
                }
            }
        }
        
        return Array.from(directions.values());
    }
}

class DepartureBoard {
    constructor() {
        this.gtfs = new GTFSProcessor();
        this.currentStopId = this.getStopIdFromURL();
        this.departures = [];
        this.isLoading = false;
        this.updateInterval = null;
        
        this.init();
    }

    async init() {
        this.showLoading();
        
        // Сначала загружаем GTFS данные
        const success = await this.gtfs.loadAllData();
        
        if (!success) {
            this.showError('Erreur de chargement des données GTFS');
            return;
        }
        
        // Обновляем информацию об остановке
        this.updateStationInfo();
        
        // Настраиваем селекторы
        this.setupSelectors();
        
        // Загружаем первые данные
        await this.loadDepartures();
        
        // Запускаем автообновление
        this.startAutoUpdate();
    }

    getStopIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || '8775860'; // Gare de Lyon RER по умолчанию
    }

    updateStationInfo() {
        const stopInfo = this.gtfs.getStopInfo(this.currentStopId);
        const stationName = stopInfo ? stopInfo.name : `Arrêt ${this.currentStopId}`;
        
        document.querySelector('.station-name').textContent = stationName;
        document.getElementById('stop-id').textContent = this.currentStopId;
        document.title = `Tablo RER - ${stationName}`;
    }

    setupSelectors() {
        // Получаем маршруты для этой остановки
        const routes = this.gtfs.getRoutesForStop(this.currentStopId);
        
        // Заполняем селекторы линий
        this.populateLineSelectors(routes);
        
        // Назначаем обработчики событий
        document.getElementById('line1').addEventListener('change', (e) => this.onLineChange(e.target, 'direction1'));
        document.getElementById('line2').addEventListener('change', (e) => this.onLineChange(e.target, 'direction2'));
        
        document.getElementById('direction1').addEventListener('change', () => this.loadDepartures());
        document.getElementById('direction2').addEventListener('change', () => this.loadDepartures());
    }

    populateLineSelectors(routes) {
        const line1Select = document.getElementById('line1');
        const line2Select = document.getElementById('line2');
        
        // Очищаем селекторы
        line1Select.innerHTML = '';
        line2Select.innerHTML = '<option value="">-- Choisir ligne --</option>';
        
        // Добавляем маршруты в первый селектор
        routes.forEach(route => {
            const option = document.createElement('option');
            option.value = route.id;
            option.textContent = `${route.shortName} - ${route.longName}`;
            option.dataset.color = route.color;
            line1Select.appendChild(option.cloneNode(true));
            line2Select.appendChild(option);
        });
        
        // Выбираем первый маршрут по умолчанию
        if (routes.length > 0) {
            line1Select.value = routes[0].id;
            this.onLineChange(line1Select, 'direction1');
        }
        
        // Выбираем второй маршрут, если есть
        if (routes.length > 1) {
            line2Select.value = routes[1].id;
            this.onLineChange(line2Select, 'direction2');
        }
    }

    async onLineChange(lineSelect, directionSelectId) {
        const routeId = lineSelect.value;
        const directionSelect = document.getElementById(directionSelectId);
        
        // Очищаем селектор направлений
        directionSelect.innerHTML = '<option value="">-- Choisir direction --</option>';
        
        if (!routeId) return;
        
        // Получаем направления для этого маршрута
        const directions = this.gtfs.getDirectionsForRoute(this.currentStopId, routeId);
        
        // Заполняем селектор направлений
        directions.forEach(direction => {
            const option = document.createElement('option');
            option.value = direction.id;
            option.textContent = direction.name;
            directionSelect.appendChild(option);
        });
        
        // Выбираем первое направление по умолчанию
        if (directions.length > 0) {
            directionSelect.value = directions[0].id;
        }
        
        // Обновляем табло
        await this.loadDepartures();
    }

    async loadDepartures() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            const line1 = document.getElementById('line1').value;
            const direction1 = document.getElementById('direction1').value;
            const line2 = document.getElementById('line2').value;
            const direction2 = document.getElementById('direction2').value;
            
            const departures = [];
            
            // Загружаем отправления для первой линии
            if (line1 && direction1) {
                const deps1 = this.getDeparturesForLine(line1, parseInt(direction1));
                departures.push(...deps1);
            }
            
            // Загружаем отправления для второй линии
            if (line2 && direction2) {
                const deps2 = this.getDeparturesForLine(line2, parseInt(direction2));
                departures.push(...deps2);
            }
            
            // Сортируем и ограничиваем количество
            this.departures = departures
                .sort((a, b) => a.minutes - b.minutes)
                .slice(0, 6);
            
            // Отображаем
            this.renderDepartures();
            this.updateTimestamp();
        } catch (error) {
            console.error('Error loading departures:', error);
            this.showError('Erreur de chargement des horaires');
        } finally {
            this.isLoading = false;
        }
    }

    getDeparturesForLine(routeId, directionId) {
        // Получаем все отправления для остановки
        const allDepartures = this.gtfs.getNextDepartures(this.currentStopId, 20);
        
        // Фильтруем по маршруту и направлению
        return allDepartures.filter(dep => 
            dep.routeId === routeId && dep.directionId === directionId
        );
    }

    renderDepartures() {
        const container = document.getElementById('departure-list');
        
        if (this.departures.length === 0) {
            container.innerHTML = `
                <div class="no-departures">
                    <h3>Aucun départ prévu</h3>
                    <p>Aucun train n'est prévu dans les prochaines heures.</p>
                </div>
            `;
            return;
        }
        
        // Группируем отправления по времени для выявления совместных линий
        const groupedDepartures = this.groupDeparturesByTime();
        
        container.innerHTML = '';
        
        groupedDepartures.forEach((group, index) => {
            if (group.length === 1) {
                // Одиночное отправление
                const departure = group[0];
                const element = this.createDepartureElement(departure, index);
                container.appendChild(element);
            } else {
                // Совместные отправления
                const groupElement = this.createSharedDepartureGroup(group, index);
                container.appendChild(groupElement);
            }
        });
    }

    groupDeparturesByTime() {
        const groups = [];
        const timeTolerance = 2; // минуты
        
        this.departures.forEach(departure => {
            let addedToGroup = false;
            
            for (const group of groups) {
                const groupTime = group[0].minutes;
                if (Math.abs(departure.minutes - groupTime) <= timeTolerance) {
                    group.push(departure);
                    addedToGroup = true;
                    break;
                }
            }
            
            if (!addedToGroup) {
                groups.push([departure]);
            }
        });
        
        return groups;
    }

    createDepartureElement(departure, index) {
        const div = document.createElement('div');
        div.className = 'departure-item';
        div.style.borderLeftColor = departure.routeColor;
        div.style.animationDelay = `${index * 0.1}s`;
        
        const timeStr = this.formatTime(departure.minutes);
        
        div.innerHTML = `
            <div class="line-badge line-${departure.routeShortName}" style="background: ${departure.routeColor}">
                ${departure.routeShortName}
            </div>
            <div class="departure-info">
                <div class="destination">${departure.destination}</div>
                <div class="next-stops">Direction: ${departure.headsign}</div>
                ${departure.nextStops.length > 0 ? `
                    <div class="stops-list">
                        ${departure.nextStops.slice(0, 4).map(stop => 
                            `<span class="stop-item">${stop}</span>`
                        ).join('')}
                        ${departure.nextStops.length > 4 ? 
                            `<span class="stop-item">+${departure.nextStops.length - 4}</span>` : 
                            ''
                        }
                    </div>
                ` : ''}
            </div>
            <div class="time">${timeStr}</div>
            <div class="platform">Voie ${Math.floor(Math.random() * 4) + 1}</div>
        `;
        
        return div;
    }

    createSharedDepartureGroup(departures, index) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'shared-line-group';
        
        // Создаем элементы для каждого отправления в группе
        departures.forEach((departure, i) => {
            const element = this.createDepartureElement(departure, index + i);
            element.classList.add('shared-line-item');
            groupDiv.appendChild(element);
            
            // Добавляем соединитель между элементами (кроме последнего)
            if (i < departures.length - 1) {
                const connector = document.createElement('div');
                connector.className = 'shared-line-connector';
                connector.style.setProperty('--line1-color', departure.routeColor);
                connector.style.setProperty('--line2-color', departures[i + 1].routeColor);
                groupDiv.appendChild(connector);
            }
        });
        
        return groupDiv;
    }

    formatTime(minutes) {
        if (minutes < 0) return 'À l\'heure';
        if (minutes < 1) return '< 1 min';
        if (minutes < 60) return `${minutes} min`;
        
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h${mins.toString().padStart(2, '0')}`;
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

    showLoading() {
        const container = document.getElementById('departure-list');
        container.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>Chargement des horaires...</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('departure-list');
        container.innerHTML = `
            <div class="error-message">
                <h3>${message}</h3>
                <p>Veuillez réessayer dans quelques instants.</p>
            </div>
        `;
    }

    startAutoUpdate() {
        // Очищаем предыдущий интервал, если был
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        // Устанавливаем новый интервал
        this.updateInterval = setInterval(() => {
            this.loadDepartures();
        }, 5000); // 5 секунд
        
        // Также обновляем таймстамп каждую секунду
        setInterval(() => {
            this.updateTimestamp();
        }, 1000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.departureBoard = new DepartureBoard();
});

// Функция для тестирования с mock данными (если GTFS нет)
async function setupMockData() {
    // Создаем простые mock данные для тестирования
    const mockData = {
        stops: [
            {stop_id: '8775860', stop_name: 'Gare de Lyon RER', stop_lat: '48.844', stop_lon: '2.373'},
            {stop_id: '8775861', stop_name: 'Châtelet-Les Halles', stop_lat: '48.861', stop_lon: '2.347'}
        ],
        routes: [
            {route_id: 'RERA', route_short_name: 'A', route_long_name: 'RER A', route_color: 'FF0000'},
            {route_id: 'RERB', route_short_name: 'B', route_long_name: 'RER B', route_color: '0000FF'}
        ],
        trips: [
            {trip_id: 'T1', route_id: 'RERA', service_id: 'WEEK', trip_headsign: 'Saint-Germain-en-Laye', direction_id: '0'},
            {trip_id: 'T2', route_id: 'RERA', service_id: 'WEEK', trip_headsign: 'Marne-la-Vallée', direction_id: '1'}
        ]
    };
    
    // Сохраняем в localStorage для тестирования
    localStorage.setItem('mock_gtfs', JSON.stringify(mockData));
}

// Если нужно протестировать без GTFS данных, раскомментируйте:
// setupMockData();

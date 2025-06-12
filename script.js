const apiKey = "9226dd382097432c13dcfd65dca44cdf";

let map = null;
let marker = null;

function updateMap(lat, lon, cityName) {
  if (!map) {
    map = L.map("map").setView([lat, lon], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    marker = L.marker([lat, lon]).addTo(map).bindPopup(cityName).openPopup();
  } else {
    map.setView([lat, lon], 10);
    marker.setLatLng([lat, lon]).setPopupContent(cityName).openPopup();
  }
  setTimeout(() => {
    map.invalidateSize();
  }, 300);
}


const weatherInfoDiv = document.getElementById("weatherInfo");
const searchHistoryDiv = document.getElementById("searchHistory");

const favoritesListDiv = document.getElementById("favoritesList");
let favoriteCities = [];

// Load favorites from localStorage
if (localStorage.getItem("favoriteCities")) {
  favoriteCities = JSON.parse(localStorage.getItem("favoriteCities"));
  renderFavorites();
  displayFavoritesDashboard(); // ✅ This populates the weather cards for each saved favorite
}




const toggleDarkModeBtn = document.getElementById("toggleDarkMode");
const activitySelect = document.getElementById("activitySelect");

let forecastChart = null;
let searchHistory = [];



// Load history from localStorage if available
if (localStorage.getItem("searchHistory")) {
  searchHistory = JSON.parse(localStorage.getItem("searchHistory"));
  renderSearchHistory();
}

toggleDarkModeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});

activitySelect.addEventListener("change", () => {
  const city = document.getElementById("cityInput").value.trim();
  if (city) getWeather(city);
});

// 🎤 Voice Search Setup
const voiceBtn = document.getElementById("voiceSearch");

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  voiceBtn.addEventListener("click", () => {
    recognition.start();
    voiceBtn.textContent = "🎙️ Listening...";
  });

  recognition.addEventListener("result", (event) => {
    const spokenCity = event.results[0][0].transcript;
    document.getElementById("cityInput").value = spokenCity;
    getWeather();
    voiceBtn.textContent = "🎤";
  });

  recognition.addEventListener("end", () => {
    voiceBtn.textContent = "🎤";
  });

  recognition.addEventListener("error", (e) => {
    alert("Voice recognition error: " + e.error);
    voiceBtn.textContent = "🎤";
  });
} else {
  voiceBtn.disabled = true;
  voiceBtn.title = "Voice recognition not supported in this browser";
}



async function getWeather(cityFromHistory = null) {
  let city = cityFromHistory || document.getElementById("cityInput").value.trim();
  if (!city) return alert("Please enter a city name.");

  try {
    // URLs for current weather and forecast
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&appid=${apiKey}`;

    // Fetch current weather and forecast data
    const [weatherRes, forecastRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(forecastUrl),
    ]);

    if (!weatherRes.ok) throw new Error(`Weather API error: ${weatherRes.status}`);
    if (!forecastRes.ok) throw new Error(`Forecast API error: ${forecastRes.status}`);

    const weatherData = await weatherRes.json();
    const forecastData = await forecastRes.json();

    const tz = await fetchCityTimezone(weatherData.coord.lat, weatherData.coord.lon);

    displayCurrentWeather(weatherData);
    displayLocalTime(
      weatherData.timezone,
      weatherData.sys.sunrise,
      weatherData.sys.sunset
    );
    // NEW - show local time with timezone
    displayForecastGraph(forecastData);

    updateMap(weatherData.coord.lat, weatherData.coord.lon, weatherData.name);

    // Fetch air quality using lat/lon from weatherData
    await fetchAirQuality(weatherData.coord.lat, weatherData.coord.lon);
    showActivityAdvice(forecastData);

    addToSearchHistory(city);
  } catch (error) {
    console.error("Fetch error:", error);
    alert("Error fetching weather data. Check city name and try again.");
  }
}

function displayCurrentWeather(data) {
  const city = data.name.toLowerCase();

  document.getElementById("cityName").innerHTML = `
    ${data.name}, ${data.sys.country}
    <button id="fav-btn" title="Add to Favorites" style="margin-left:8px; font-size:18px; cursor:pointer;">
      ${favoriteCities.includes(city) ? '⭐' : '☆'}
    </button>
  `;

  document.getElementById("currentTemp").textContent = `Temperature: ${data.main.temp}°C`;
  document.getElementById("humidity").textContent = `Humidity: ${data.main.humidity}%`;
  document.getElementById("windSpeed").textContent = `Wind: ${data.wind.speed} m/s`;
  document.getElementById("weatherIcon").src = `http://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;

  const sunrise = new Date(data.sys.sunrise * 1000);
  const sunset = new Date(data.sys.sunset * 1000);


  document.getElementById("sunrise").textContent = `🌅 Sunrise: ${sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  document.getElementById("sunset").textContent = `🌇 Sunset: ${sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;



  // Temp-based alerts
  const temp = data.main.temp;
  if (temp > 35) {
    showAlert("⚠️ Danger: Extreme heat!", "red");
  } else if (temp < 0) {
    showAlert("❄️ Caution: Freezing temperatures!", "orange");
  } else {
    hideAlert();
  }

  // Storm-based alerts
  const weatherId = data.weather[0].id;
  if (weatherId >= 200 && weatherId < 300) {
    showAlert("🌩️ Storm alert: Thunderstorms in the area!", "red");
  }

  // Handle favorite button logic
  const favBtn = document.getElementById("fav-btn");
  favBtn.addEventListener("click", () => {
    if (favoriteCities.includes(city)) {
      favoriteCities = favoriteCities.filter(c => c !== city);
      favBtn.textContent = '☆';
    } else {
      favoriteCities.push(city);
      favBtn.textContent = '⭐';
    }
    localStorage.setItem("favoriteCities", JSON.stringify(favoriteCities));
    renderFavorites();
    displayFavoritesDashboard()
  });

  // Apply condition-based class and effects
  const mainCondition = data.weather[0].main.toLowerCase();
  const isNight = data.dt < data.sys.sunrise || data.dt > data.sys.sunset;

  document.body.className = ""; // clear previous classes
  document.body.classList.add(`weather-${mainCondition}`);
  if (isNight) document.body.classList.add("night");
  else document.body.classList.add("day");

  updateWeatherEffects(mainCondition, isNight);

  // Fade in weather section
  weatherInfoDiv.classList.add("visible", "fade-in");
  setTimeout(() => {
    weatherInfoDiv.classList.add("visible");
  }, 50);

  // ---- Weather visual effects helpers ----
  function clearWeatherEffects() {
    const container = document.getElementById("weather-effects-container");
    container.innerHTML = "";
  }

  function createRaindrops() {
    clearWeatherEffects();
    const container = document.getElementById("weather-effects-container");
    for (let i = 0; i < 100; i++) {
      const drop = document.createElement("div");
      drop.classList.add("raindrop");
      drop.style.left = Math.random() * 100 + "vw";
      drop.style.top = Math.random() * -20 + "vh";
      drop.style.animationDuration = 1 + Math.random() * 1 + "s";
      drop.style.animationDelay = Math.random() * 2 + "s";
      container.appendChild(drop);
    }
  }

  function createSnowflakes() {
    clearWeatherEffects();
    const container = document.getElementById("weather-effects-container");
    for (let i = 0; i < 50; i++) {
      const snow = document.createElement("div");
      snow.classList.add("snowflake");
      snow.style.left = Math.random() * 100 + "vw";
      snow.style.top = Math.random() * -10 + "vh";
      snow.style.fontSize = 10 + Math.random() * 15 + "px";
      snow.style.animationDuration = 5 + Math.random() * 5 + "s";
      snow.style.animationDelay = Math.random() * 10 + "s";
      snow.textContent = "❄";
      container.appendChild(snow);
    }
  }

  function createClouds() {
    clearWeatherEffects();
    const container = document.getElementById("weather-effects-container");
    const sizes = ["small", "medium", "large"];
    for (let i = 0; i < 6; i++) {
      const cloud = document.createElement("div");
      cloud.classList.add("cloud", sizes[Math.floor(Math.random() * sizes.length)]);
      cloud.style.top = Math.random() * 50 + "vh";
      cloud.style.left = -200 + Math.random() * -500 + "px";
      cloud.style.animationDuration = 60 + Math.random() * 60 + "s";
      cloud.style.animationDelay = Math.random() * 30 + "s";
      container.appendChild(cloud);
    }
  }

  function createLightning() {
    clearWeatherEffects();
    const container = document.getElementById("weather-effects-container");
    const flash = document.createElement("div");
    flash.classList.add("lightning");
    container.appendChild(flash);
    setTimeout(() => flash.remove(), 800);
  }

  function createStars() {
    clearWeatherEffects();
    const container = document.getElementById("weather-effects-container");
    for (let i = 0; i < 80; i++) {
      const star = document.createElement("div");
      star.classList.add("star");
      star.style.width = star.style.height = (1 + Math.random() * 2) + "px";
      star.style.top = Math.random() * 100 + "vh";
      star.style.left = Math.random() * 100 + "vw";
      star.style.animationDuration = 2 + Math.random() * 3 + "s";
      star.style.animationDelay = Math.random() * 5 + "s";
      container.appendChild(star);
    }
  }

  function createFog() {
    clearWeatherEffects();
    const fog = document.createElement("div");
    fog.classList.add("fog");
    document.getElementById("weather-effects-container").appendChild(fog);
  }

  function updateWeatherEffects(condition, isNight) {
    if (isNight) {
      createStars();
      return;
    }

    switch (condition) {
      case "rain":
      case "drizzle":
        createRaindrops();
        break;
      case "snow":
        createSnowflakes();
        break;
      case "clouds":
        createClouds();
        break;
      case "thunderstorm":
        createLightning();
        break;
      case "mist":
      case "haze":
      case "fog":
        createFog();
        break;
      case "clear":
        if (!isNight) {
          clearWeatherEffects();
          const container = document.getElementById("weather-effects-container");
          const rays = document.createElement("div");
          rays.classList.add("sun-rays");
          container.appendChild(rays);
        } else {
          createStars();
        }
        break;
      default:
        clearWeatherEffects();
    }

  }
}



// NEW: Display local time and timezone based on timezone offset (in seconds)
function displayLocalTime(offset, sunriseUnix, sunsetUnix) {
  const nowUTC = new Date(Date.now() + new Date().getTimezoneOffset() * 60000);
  const cityTime = new Date(nowUTC.getTime() + offset * 1000);

  const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const timeString = cityTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  document.getElementById("localTime").textContent = `Local Time: ${timeString}`;

  const sunrise = new Date((sunriseUnix + offset) * 1000);
  const sunset = new Date((sunsetUnix + offset) * 1000);

  const sunOptions = { hour: '2-digit', minute: '2-digit' };
  document.getElementById("sunrise").textContent = `🌅 Sunrise: ${sunrise.toLocaleTimeString('en-US', sunOptions)}`;
  document.getElementById("sunset").textContent = `🌇 Sunset: ${sunset.toLocaleTimeString('en-US', sunOptions)}`;
}



function displayForecastGraph(data) {
  const labels = [];
  const temps = [];
  const weatherIcons = [];

  const next24h = data.list.slice(0, 8); // 8 x 3-hr intervals = 24 hours

  next24h.forEach(entry => {
    const timeLabel = new Date(entry.dt * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    labels.push(timeLabel);
    temps.push(entry.main.temp);
    weatherIcons.push(`http://openweathermap.org/img/wn/${entry.weather[0].icon}.png`);
  });

  const ctx = document.getElementById("forecastChart").getContext("2d");
  if (forecastChart) forecastChart.destroy();

  forecastChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Temperature (°C)",
          data: temps,
          borderColor: "#0288d1",
          backgroundColor: "rgba(2, 136, 209, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              const index = context.dataIndex;
              const temp = temps[index].toFixed(1);
              return `Temp: ${temp}°C`;
            },
            afterLabel: function(context) {
              const index = context.dataIndex;
              return `🕒 ${labels[index]}`;
            },
            title: function() {
              return ""; // Remove default title
            },
            footer: function(context) {
              const index = context[0].dataIndex;
              const iconUrl = weatherIcons[index];
              return `🌤 Icon: ${iconUrl.split("/").pop().split(".")[0]}`;
            },
          },
          external: function(context) {
            const tooltipModel = context.tooltip;
            let tooltipEl = document.getElementById("chartjs-tooltip");

            if (!tooltipEl) {
              tooltipEl = document.createElement("div");
              tooltipEl.id = "chartjs-tooltip";
              tooltipEl.innerHTML = "<img id='tooltip-img' style='height: 30px; margin-bottom: 5px;'><div></div>";
              document.body.appendChild(tooltipEl);
            }

            const tooltipImg = document.getElementById("tooltip-img");
            const index = tooltipModel.dataPoints?.[0]?.dataIndex;
            if (index != null) {
              tooltipImg.src = weatherIcons[index];
            }

            if (tooltipModel.opacity === 0) {
              tooltipEl.style.opacity = 0;
              tooltipEl.style.left = "-9999px";
              tooltipEl.style.top = "-9999px";
              return;
            }


            tooltipEl.style.opacity = 1;
            tooltipEl.style.position = "absolute";
            const canvasRect = context.chart.canvas.getBoundingClientRect();
            tooltipEl.style.left = canvasRect.left + window.scrollX + tooltipModel.caretX + "px";
            const verticalOffset = -85;  // Adjust this value as needed (negative moves tooltip up)
            tooltipEl.style.top = canvasRect.top + window.scrollY + tooltipModel.caretY + verticalOffset + "px";


            tooltipEl.style.pointerEvents = "none";
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          title: {
            display: true,
            text: "Temperature (°C)",
          },
        },
        x: {
          title: {
            display: true,
            text: "Time (next 24 hrs)",
          },
        },
      },
    },
  });
}


async function fetchAirQuality(lat, lon) {
  try {
    const aqiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
    const response = await fetch(aqiUrl);
    if (!response.ok) throw new Error(`AQI API error: ${response.status}`);

    const data = await response.json();
    const aqi = data.list[0].main.aqi;

    const aqiText = mapAQIToText(aqi);
    document.getElementById("aqi").textContent = `Air Quality: ${aqiText} (${aqi})`;

    if (aqi >= 4) {
      showAlert("🚫 Warning: Air quality is poor!", "red");
    } else if (aqi === 3) {
      showAlert("⚠️ Moderate air quality – sensitive groups beware.", "orange");
    }

  } catch (error) {
    console.error("AQI fetch error:", error);
    document.getElementById("aqi").textContent = "Air Quality: N/A";
  }
}

function mapAQIToText(aqi) {
  switch (aqi) {
    case 1:
      return "Good";
    case 2:
      return "Fair";
    case 3:
      return "Moderate";
    case 4:
      return "Poor";
    case 5:
      return "Very Poor";
    default:
      return "Unknown";
  }
}

function showAlert(message, colorClass) {
  const alertBox = document.getElementById("alertBox");
  alertBox.textContent = message;
  alertBox.className = `alert-box ${colorClass}`;
  alertBox.style.display = "block";
}

function hideAlert() {
  const alertBox = document.getElementById("alertBox");
  alertBox.style.display = "none";
}




function showActivityAdvice(forecastData) {
  const activity = activitySelect.value;
  const adviceEl = document.getElementById("activityAdvice");
  const next24h = forecastData.list.slice(0, 8); // 8 x 3-hour forecasts = 24 hours

  const startTimeStr = document.getElementById("availableStart").value;
  const endTimeStr = document.getElementById("availableEnd").value;

  const [startHour, startMin] = startTimeStr.split(":").map(Number);
  const [endHour, endMin] = endTimeStr.split(":").map(Number);
  const availableStartMinutes = startHour * 60 + startMin;
  const availableEndMinutes = endHour * 60 + endMin;

  const reasons = [];
  const suitableTimes = [];

  next24h.forEach(entry => {
    const temp = entry.main.temp;
    const weatherId = entry.weather[0].id;
    const wind = entry.wind.speed;
    const entryDate = new Date(entry.dt * 1000);
    const hour = entryDate.getHours();

    let good = true;
    let reason = [];

    // Weather type categories
    const isRain = weatherId >= 500 && weatherId <= 531;
    const isSnow = weatherId >= 600 && weatherId <= 622;
    const isThunder = weatherId >= 200 && weatherId <= 232;
    const isBadWeather = isRain || isSnow || isThunder;

    // Convert to minute range
    const entryMinutes = hour * 60 + entryDate.getMinutes();
    const isOutsideTime = entryMinutes < availableStartMinutes || entryMinutes > availableEndMinutes;
    if (isOutsideTime) reason.push("outside your available hours");

    // ACTIVITY LOGIC:
    switch (activity) {
      case "walk":
      case "dogwalk":
        if (isThunder) reason.push("thunderstorm risk");
        else if (isRain && temp < 10) reason.push("cold rain");
        break;

      case "run":
      case "hike":
        if (isBadWeather) reason.push("bad weather");
        if (temp > 28) reason.push("too hot for intense activity");
        break;

      case "bike":
        if (isBadWeather) reason.push("wet or dangerous roads");
        if (wind > 10) reason.push("strong winds");
        break;

      case "swimming":
        if (temp < 22) reason.push("too cold for swimming");
        if (isThunder) reason.push("unsafe due to storm");
        if (wind > 15) reason.push("windy and choppy water");
        break;

      case "picnic":
        if (isBadWeather || wind > 12) reason.push("unpleasant outdoor conditions");
        if (temp < 10 || temp > 30) reason.push("uncomfortable temperatures");
        break;

      case "sports":
        if (isBadWeather || temp > 32) reason.push("unsafe or extreme weather");
        break;

      case "stargazing":
        if (hour < 18 && hour > 5) reason.push("not nighttime");
        if (weatherId >= 801) reason.push("too cloudy to see stars");
        break;

      case "photography":
        if (isBadWeather) reason.push("bad lighting or rain risk");
        break;

      default:
        reason.push("no logic defined for this activity");
    }

    if (reason.length > 0) {
      good = false;
      reasons.push(...reason);
    }

    if (good) {
      suitableTimes.push({ entry, temp });
    }
  });

  // DISPLAY FINAL ADVICE
  if (suitableTimes.length === 0) {
    const uniqueReasons = [...new Set(reasons)];
    adviceEl.textContent = `⚠️ No good time in the next 24 hours for ${activity}. Reason: ${uniqueReasons.join(", ")}.`;
  } else {
    const best = suitableTimes.sort((a, b) => a.temp - b.temp)[0].entry;
    const bestTime = new Date(best.dt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    adviceEl.textContent = `✅ Best time to ${activity}: around ${bestTime} at ${best.main.temp.toFixed(1)}°C. Conditions look good!`;
  }
}







function addToSearchHistory(city) {
  city = city.toLowerCase();
  if (!searchHistory.includes(city)) {
    searchHistory.unshift(city);
    if (searchHistory.length > 5) searchHistory.pop(); // Keep max 5 recent searches
    localStorage.setItem("searchHistory", JSON.stringify(searchHistory));
    renderSearchHistory();
  }
}

function renderSearchHistory() {
  searchHistoryDiv.innerHTML = "";
  searchHistory.forEach((city) => {
    const btn = document.createElement("button");
    btn.textContent = city;
    btn.addEventListener("click", () => getWeather(city));
    searchHistoryDiv.appendChild(btn);
  });
}// last closing brace

function renderFavorites() {
  favoritesListDiv.innerHTML = "";
  favoriteCities.forEach(city => {
    const btn = document.createElement("button");
    btn.textContent = city + " ⭐";
    btn.classList.add("favorite-btn");
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      getWeather(city); // reuse your existing getWeather function
    });
    favoritesListDiv.appendChild(btn);
  });
}

async function fetchCityTimezone(lat, lon) {
  try {
    const res = await fetch(`http://worldtimeapi.org/api/timezone`);
    const zones = await res.json();
    const match = zones.find(z => z.startsWith(lat > 0 ? zones.find(y => y.includes(Math.trunc(lat))) : ''));
    return match || zones[0];
  } catch {
    return null;
  }
}

async function fetchAirQuality(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('AQI API error');
    const data = await res.json();
    displayAirQuality(data);
  } catch (error) {
    console.error("AQI fetch error:", error);
  }
}


function displayAirQuality(data) {
  // OpenWeather AQI scale: 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=Very Poor
  const aqi = data.list[0].main.aqi;
  const aqiInfo = {
    1: { label: "Good", color: "green", advice: "Great air quality. Enjoy outdoor activities!" },
    2: { label: "Fair", color: "yellowgreen", advice: "Air quality is acceptable." },
    3: { label: "Moderate", color: "orange", advice: "Sensitive groups should reduce prolonged outdoor exertion." },
    4: { label: "Poor", color: "red", advice: "Limit outdoor activities. Consider masks." },
    5: { label: "Very Poor", color: "darkred", advice: "Avoid outdoor exposure if possible." }
  };

  const info = aqiInfo[aqi] || aqiInfo[1];

  // Create or update AQI display container
  let aqiDiv = document.getElementById("aqi-info");
  if (!aqiDiv) {
    aqiDiv = document.createElement("div");
    aqiDiv.id = "aqi-info";
    aqiDiv.style.marginTop = "10px";
    aqiDiv.style.padding = "8px";
    aqiDiv.style.borderRadius = "5px";
    aqiDiv.style.fontWeight = "600";
    aqiDiv.style.fontSize = "1rem";
    aqiDiv.style.width = "fit-content";
    aqiDiv.style.color = "white";
    document.getElementById("currentTemp").parentElement.appendChild(aqiDiv);
  }

  aqiDiv.style.backgroundColor = info.color;
  aqiDiv.textContent = `AQI: ${aqi} (${info.label}) — ${info.advice}`;
}

async function displayFavoritesDashboard() {
  const container = document.getElementById("favoritesDashboard");
  container.innerHTML = ""; // Clear previous cards

  if (favoriteCities.length === 0) {
    container.innerHTML = "<p>No favorite cities added yet.</p>";
    return;
  }

  for (const city of favoriteCities) {
    try {
      // Fetch weather data for each favorite city
      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`;
      const res = await fetch(weatherUrl);
      if (!res.ok) throw new Error("Failed to fetch weather for " + city);
      const data = await res.json();

      // Create a card div with brief weather info
      const card = document.createElement("div");
      card.classList.add("favorite-card");
      card.style.minWidth = "180px";
      card.style.border = "1px solid #ccc";
      card.style.borderRadius = "8px";
      card.style.padding = "12px";
      card.style.background = "#f9f9f9";

      card.innerHTML = `
        <h4>${data.name}, ${data.sys.country}</h4>
        <img src="http://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png" alt="Icon" style="width:50px;">
        <p>${data.weather[0].main}</p>
        <p>Temp: ${data.main.temp}°C</p>
        <p>Humidity: ${data.main.humidity}%</p>
      `;

      container.appendChild(card);
    } catch (err) {
      console.warn(err);
    }
  }
}



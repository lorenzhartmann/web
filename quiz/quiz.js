(function () {
    "use strict";

    var MAX_NUMBER = 10; // cities per game, matches the original

    var menuEl = document.getElementById("quiz-menu");
    var gameEl = document.getElementById("quiz-game");
    var endEl = document.getElementById("quiz-end");
    var canvas = document.getElementById("quiz-canvas");
    var ctx = canvas.getContext("2d");
    var cityNameEl = document.getElementById("quiz-city-name");
    var totalEl = document.getElementById("quiz-total");
    var resultBox = document.getElementById("quiz-result");
    var resultTextEl = document.getElementById("quiz-result-text");
    var nextBtn = document.getElementById("quiz-next-btn");
    var restartBtn = document.getElementById("quiz-restart-btn");
    var finalScoreEl = document.getElementById("quiz-final-score");

    var mapImage = new Image();
    mapImage.src = "../objects/quiz-map.jpg";

    var cityData = null; // { easy: [...], hard: [...], capitals: [...] }
    var db = null; // currently selected city list
    var state = "menu"; // 'menu' | 'guessing' | 'result' | 'end'
    var city = null;
    var guessNumber = 0;
    var totalDistance = 0;
    var vGuess = null;
    var vActual = null;
    var dist = 0;

    // ---------- geometry (ported from the original Python game) ----------
    // The canvas itself IS the map (no header baked in, unlike the original
    // pygame surface), so pixel<->angle conversion needs no header offset.

    function coordsFromPixel(px, py, w, h) {
        var phi = (px / w) * 2 * Math.PI;
        var theta = (py / h) * Math.PI;
        return [theta, phi];
    }

    function pixelFromLatLng(lat, lng, w, h) {
        var x = (w / 2) * (1 + lng / 180);
        var y = (h / 2) * (1 - lat / 90);
        return [x, y];
    }

    function cartesian(theta, phi) {
        return [
            Math.sin(theta) * Math.cos(phi),
            Math.sin(theta) * Math.sin(phi),
            Math.cos(theta),
        ];
    }

    function atanPositive(y, x) {
        var a = Math.atan2(y, x);
        return a >= 0 ? a : a + 2 * Math.PI;
    }

    function makeVector(x, y, z, w, h) {
        var r = Math.sqrt(x * x + y * y + z * z);
        var theta = Math.acos(z / r);
        var phi = atanPositive(y, x);
        return {
            x: x, y: y, z: z, r: r, theta: theta, phi: phi,
            xpixel: w * (phi / (2 * Math.PI)),
            ypixel: (theta / Math.PI) * h,
        };
    }

    function vecTimes(v, lam, w, h) {
        return makeVector(v.x * lam, v.y * lam, v.z * lam, w, h);
    }

    function vecSum(a, b, w, h) {
        return makeVector(a.x + b.x, a.y + b.y, a.z + b.z, w, h);
    }

    function distanceKm(vg, va) {
        var lat1 = -vg.theta + Math.PI / 2, lng1 = vg.phi - Math.PI / 2;
        var lat2 = -va.theta + Math.PI / 2, lng2 = va.phi - Math.PI / 2;
        var angle = Math.acos(
            Math.sin(lat1) * Math.sin(lat2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng1 - lng2)
        );
        return angle * 6371; // km
    }

    function circleColor(d) {
        var cutoff = 5000;
        if (d > cutoff) return "rgb(255,0,0)";
        var p = d / cutoff;
        return "rgb(" + Math.round(255 * p) + "," + Math.round(255 * (1 - p)) + ",0)";
    }

    // ---------- canvas sizing ----------

    function resizeCanvas() {
        var wrap = canvas.parentElement;
        var cssWidth = wrap.clientWidth;
        var cssHeight = cssWidth / 2; // map is a 2:1 equirectangular projection
        var dpr = window.devicePixelRatio || 1;
        canvas.style.width = cssWidth + "px";
        canvas.style.height = cssHeight + "px";
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render();
    }

    function canvasSize() {
        return [canvas.clientWidth, canvas.clientHeight];
    }

    // ---------- rendering ----------

    function drawCircle(v, radius, color) {
        ctx.beginPath();
        ctx.arc(v.xpixel, v.ypixel, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
    }

    function drawGeodesic(w, h) {
        var n = 200;
        for (var i = 0; i < n; i++) {
            var t = i / n;
            var a = vecTimes(vGuess, t, w, h);
            var b = vecTimes(vActual, 1 - t, w, h);
            var p = vecSum(a, b, w, h);
            drawCircle(p, 2, "rgb(0,0,0)");
        }
    }

    function render() {
        var size = canvasSize();
        var w = size[0], h = size[1];
        if (!w || !h) return;

        ctx.clearRect(0, 0, w, h);
        if (mapImage.complete && mapImage.naturalWidth) {
            ctx.drawImage(mapImage, 0, 0, w, h);
        }

        if (state === "result" && vGuess && vActual) {
            drawGeodesic(w, h);
            drawCircle(vGuess, 7, circleColor(dist));
            drawCircle(vActual, 7, "rgb(0,200,0)");
        }
    }

    // ---------- game flow ----------

    function chooseCity() {
        guessNumber += 1;
        return db[Math.floor(Math.random() * db.length)];
    }

    function showScreen(name) {
        menuEl.hidden = name !== "menu";
        gameEl.hidden = name !== "game";
        endEl.hidden = name !== "end";
    }

    function startGame(mode) {
        if (!cityData) {
            alert("Sorry, the city data failed to load, so the game can't start. Try reloading the page.");
            return;
        }
        db = cityData[mode];
        guessNumber = 0;
        totalDistance = 0;
        state = "guessing";
        city = chooseCity();
        vGuess = null;
        vActual = null;
        resultBox.hidden = true;
        showScreen("game");
        updateStatusText();
        resizeCanvas();
    }

    function updateStatusText() {
        cityNameEl.textContent = (state === "guessing" || state === "result") ? city.city : "";
        totalEl.textContent = "Total distance: " + Math.round(totalDistance) + " km";
    }

    function handleGuess(clickX, clickY) {
        var size = canvasSize();
        var w = size[0], h = size[1];
        var coords = coordsFromPixel(clickX, clickY, w, h);
        var cart = cartesian(coords[0], coords[1]);
        vGuess = makeVector(cart[0], cart[1], cart[2], w, h);

        var actualPixel = pixelFromLatLng(city.lat, city.lng, w, h);
        var actualCoords = coordsFromPixel(actualPixel[0], actualPixel[1], w, h);
        var actualCart = cartesian(actualCoords[0], actualCoords[1]);
        vActual = makeVector(actualCart[0], actualCart[1], actualCart[2], w, h);

        dist = distanceKm(vGuess, vActual);
        totalDistance += dist;

        state = "result";
        resultTextEl.innerHTML =
            "Distance to target: " + Math.round(dist) + " km<br>" +
            city.city + " (" + city.country + "), population " + city.population.toLocaleString("en-US");
        resultBox.hidden = false;
        updateStatusText();
        render();
    }

    function nextCity() {
        if (guessNumber >= MAX_NUMBER) {
            state = "end";
            finalScoreEl.textContent = "Your score: " + Math.round(totalDistance) + " km total distance.";
            showScreen("end");
            return;
        }
        city = chooseCity();
        vGuess = null;
        vActual = null;
        state = "guessing";
        resultBox.hidden = true;
        updateStatusText();
        render();
    }

    // ---------- input ----------

    document.querySelectorAll(".quiz-mode-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            startGame(btn.dataset.mode);
        });
    });

    canvas.addEventListener("click", function (ev) {
        if (state !== "guessing") return;
        var rect = canvas.getBoundingClientRect();
        handleGuess(ev.clientX - rect.left, ev.clientY - rect.top);
    });

    nextBtn.addEventListener("click", nextCity);

    restartBtn.addEventListener("click", function () {
        state = "menu";
        showScreen("menu");
    });

    document.addEventListener("keydown", function (ev) {
        if (ev.key !== "ArrowRight") return;
        if (state === "result") nextCity();
    });

    window.addEventListener("resize", function () {
        if (!gameEl.hidden) resizeCanvas();
    });

    mapImage.addEventListener("load", render);

    // Loaded from cities-data.js (a plain <script>, not fetch()) so the game
    // also works when the page is opened directly from disk (file://), where
    // fetch() of local files is blocked by the browser.
    cityData = window.QUIZ_CITIES || null;
    if (!cityData) {
        console.error("City data (cities-data.js) did not load.");
    }
})();

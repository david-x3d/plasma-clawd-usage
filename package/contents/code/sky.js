// Sky behind the mascot - straight port of lib/sky.ps1, drawn on a Canvas 2D context.
.pragma library
.import "parse.js" as P
.import "strings.js" as S

function hex(h) {   // '#AARRGGBB' or '#RRGGBB'
    h = h.replace("#", "");
    if (h.length === 6) h = "FF" + h;
    return { a: parseInt(h.substr(0, 2), 16), r: parseInt(h.substr(2, 2), 16),
             g: parseInt(h.substr(4, 2), 16), b: parseInt(h.substr(6, 2), 16) };
}
function css(c, op) {
    var a = c.a / 255 * (op === undefined ? 1 : op);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a.toFixed(4) + ")";
}
function mix(a, b, k) {
    k = Math.max(0, Math.min(1, k));
    function t(x, y) { return Math.floor(x + (y - x) * k); }
    return { a: t(a.a, b.a), r: t(a.r, b.r), g: t(a.g, b.g), b: t(a.b, b.b) };
}
function dim(c, g) {
    var l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b, f = 1 - 0.3 * g;
    return { a: c.a, r: Math.floor((c.r + (l - c.r) * g) * f), g: Math.floor((c.g + (l - c.g) * g) * f),
             b: Math.floor((c.b + (l - c.b) * g) * f) };
}

var SkyPal = {
    night: { top: hex("#00304A8C"), bottom: hex("#1A304A8C"), light: 0.0 },
    dawn:  { top: hex("#00404E8A"), bottom: hex("#33E08A66"), light: 0.5 },
    day:   { top: hex("#004A8CCB"), bottom: hex("#2E6FA8D8"), light: 1.0 },
    dusk:  { top: hex("#00383070"), bottom: hex("#33D86A50"), light: 0.5 }
};
var SkyPhases = ["dawn", "day", "dusk", "night"];
var Col = {
    sunHigh: hex("#FFFDE68A"), sunLow: hex("#FFFB923C"),
    snowDay: hex("#80DDE4EC"), snowNight: hex("#50A1A8B5"),
    cloudDay: hex("#FFB4B4BC"), cloudNight: hex("#FF5E5E68"), cloudRain: hex("#FF52525B")
};

function pixelGeo(rows, px) {
    var g = [];
    for (var y = 0; y < rows.length; y++) {
        var x = 0;
        while (x < rows[y].length) {
            if (rows[y][x] !== "#") { x++; continue; }
            var x0 = x;
            while (x < rows[y].length && rows[y][x] === "#") x++;
            g.push([x0 * px, y * px, (x - x0) * px, px]);
        }
    }
    return g;
}

var SunGeo = pixelGeo(["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."], 1.4);
var MoonPx = 1.3;
var CloudShapes = [
    ["....###.....", "..#######...", ".##########.", "############"],
    ["..###...", ".######.", "########"],
    ["...##.##..", ".########.", "##########"]
];

var Sky = { force: null, forceWx: null, key: "", w: 0, h: 0, flash: 0, moonKey: "",
            light: 0, kind: null, starOp: 0, clouds: 0, rain: 0, snow: 0, tick: 0,
            gTop: SkyPal.night.top, gBottom: SkyPal.night.bottom, ground: false, groundCol: Col.snowNight,
            cloudCol: Col.cloudDay, sun: null, sunCol: Col.sunHigh, glow: null, moon: null, moonLit: [], moonDark: [] };

var Stars = [], Clouds = [], Fog = [], Drops = [], Flakes = [];
for (var i = 0; i < 20; i++) Stars.push({ fx: Math.random(), fy: Math.random() * 0.6, x: 0, y: 0 });
for (i = 0; i < 9; i++) {
    var rows = CloudShapes[i % CloudShapes.length];
    Clouds.push({ geo: pixelGeo(rows, 2), w: rows[0].length * 2, x: -1, fy: 0.05 + 0.3 * Math.random(),
                  v: 0.7 + 0.6 * Math.random(), fade: 0 });
}
for (i = 0; i < 3; i++) Fog.push({ x: Math.random(), fy: 0.42 + 0.2 * i });
for (i = 0; i < 40; i++) Drops.push({ x: 0, y: -99, v: 0 });
for (i = 0; i < 34; i++) Flakes.push({ x: 0, y: -99, v: 0, ph: 0 });

function setMoonPhase(lat) {
    var P_ = 29.530588853;
    var age = (((Date.now() - Date.UTC(2000, 0, 6, 18, 14, 0)) / 86400000 % P_) + P_) % P_;
    var key = Math.round(age * 2) + "|" + (lat < 0);
    if (key === Sky.moonKey) return;
    Sky.moonKey = key;
    var th = 2 * Math.PI * age / P_, k = Math.cos(th), n = 7, r = n / 2.0;
    var lit = [], dark = [];
    for (var y = 0; y < n; y++) {
        var a = "", b = "";
        for (var x = 0; x < n; x++) {
            var u = (x + 0.5 - r) / r, v = (y + 0.5 - r) / r;
            if (lat < 0) u = -u;
            var inside = (u * u + v * v) <= 1.05;
            var t = k * Math.sqrt(Math.max(0, 1 - v * v));
            var on = inside && (th < Math.PI ? u > t : u < -t);
            a += on ? "#" : "."; b += (inside && !on) ? "#" : ".";
        }
        lit.push(a); dark.push(b);
    }
    Sky.moonLit = pixelGeo(lit, MoonPx);
    Sky.moonDark = pixelGeo(dark, MoonPx);
}

// Position on the arc: p 0..1 from horizon to horizon; null if below the horizon.
function onArc(p, half) {
    if (p < -0.06 || p > 1.06) return null;
    var alt = Math.sin(Math.PI * p);
    return { x: 7 + p * (Sky.w - 14) - half, y: Sky.h + 3 - alt * (Sky.h - 12) - half };
}

// Weather to draw: from developer mode or fresh (no older than 3 hours).
function skyWeather(wx) {
    if (Sky.forceWx !== null) return { code: Sky.forceWx, wind: 12.0 };
    if (wx && (Date.now() - wx.at) < 3 * 3600000) return wx;
    return null;
}

// UTC offset of the place in minutes, when the weather told it; null - system time zone.
function placeTz(wx) { return wx && wx.offset !== undefined && wx.offset !== null ? wx.offset : null; }

// Minutes since midnight at the place.
function placeMinutes(wx) {
    var now = new Date(), tz = placeTz(wx);
    if (tz === null) return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    var m = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60 + tz;
    return ((m % 1440) + 1440) % 1440;
}

function sunTimes(wx, place) {
    if (wx && wx.sunrise !== null && wx.sunset !== null) return { sr: wx.sunrise, ss: wx.sunset };
    if (place) return P.sunCalc(place.lat, place.lon, placeTz(wx));
    return { sr: 420.0, ss: 1140.0 };
}

function tip(l, wx, place) {
    var parts = [], w = skyWeather(wx);
    if (Sky.forceWx !== null || Sky.force) {
        var what = [];
        if (Sky.force) what.push(S.T(l, "phase." + Sky.force));
        if (Sky.forceWx !== null) what.push(P.weatherKind(l, Sky.forceWx).name);
        parts.push("dev · " + what.join(", "));
    } else if (w) {
        var temp = Math.round(w.temp);
        var line = (temp > 0 ? "+" : "") + temp + "°, " + P.weatherKind(l, w.code).name;
        if (place && place.city) line = place.city + " · " + line;
        parts.push(line);
        parts.push(S.F(S.T(l, "sky.wind"), Math.round(w.wind / 3.6)));
    } else parts.push(S.T(l, "sky.noData"));
    var st = sunTimes(wx, place);
    function hm(m) { m = Math.floor(m); var h = Math.floor(m / 60) % 24, mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
    parts.push(S.F(S.T(l, "sky.sun"), hm(st.sr), hm(st.ss)));
    return parts.join("\n");
}

function fillRects(ctx, rects, ox, oy) {
    for (var i = 0; i < rects.length; i++) { var r = rects[i]; ctx.fillRect(ox + r[0], oy + r[1], r[2], r[3]); }
}

// env: { lang, wx, place }
function step(ctx, w, h, env) {
    var s = Sky;
    s.tick++;
    if (w <= 0 || h <= 0) return;
    if (w !== s.w || h !== s.h) {
        s.w = w; s.h = h; s.key = "";
        Stars.forEach(function (st) { st.x = Math.round(st.fx * (w - 2)); st.y = Math.round(2 + st.fy * h); });
        Clouds.forEach(function (c) { if (c.x < 0) c.x = Math.random() * w; });
    }
    var st = sunTimes(env.wx, env.place), sr = st.sr, ss = st.ss;
    var t = placeMinutes(env.wx);
    if (s.force === "dawn") t = sr - 10;
    else if (s.force === "day") t = (sr + ss) / 2;
    else if (s.force === "dusk") t = ss + 10;
    else if (s.force === "night") t = 0;
    var wx = skyWeather(env.wx);
    var code = wx ? wx.code : 0, wind = wx ? wx.wind : 8.0;

    var key = Math.floor(t) + "|" + code + "|" + w + "|" + h;
    if (key !== s.key) {
        s.key = key;
        var kind = P.weatherKind(env.lang, code);
        s.kind = kind;
        var stops = [[sr - 80, "night"], [sr - 10, "dawn"], [sr + 70, "day"], [ss - 70, "day"], [ss + 10, "dusk"], [ss + 80, "night"]];
        var a = SkyPal.night, b = SkyPal.night, k = 0;
        for (var i = 0; i < stops.length - 1; i++) {
            if (t >= stops[i][0] && t < stops[i + 1][0]) {
                a = SkyPal[stops[i][1]]; b = SkyPal[stops[i + 1][1]];
                k = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
                break;
            }
        }
        s.light = a.light + (b.light - a.light) * k;
        var g = kind.cover * 0.9;
        s.gTop = dim(mix(a.top, b.top, k), g);
        s.gBottom = dim(mix(a.bottom, b.bottom, k), g);
        s.ground = kind.snow > 0;
        s.groundCol = mix(Col.snowNight, Col.snowDay, s.light);
        var cc = mix(Col.cloudNight, Col.cloudDay, s.light);
        if (kind.rain || kind.storm) cc = mix(cc, Col.cloudRain, 0.55);
        s.cloudCol = cc;

        var vis = Math.max(0, 1 - kind.cover * 1.15);
        s.vis = vis;
        var p = (t - sr) / (ss - sr);
        s.sun = vis > 0 ? onArc(p, 4.9) : null;
        s.glow = s.sun ? onArc(p, 10) : null;
        if (s.sun) s.sunCol = mix(Col.sunLow, Col.sunHigh, Math.sin(Math.PI * p) * 1.6);
        setMoonPhase(env.place ? env.place.lat : 50);
        var q = ((t - ss + 1440) % 1440) / (sr + 1440 - ss);
        s.moon = vis > 0 ? onArc(q, 4.55) : null;

        s.starOp = (1 - s.light * 2) * Math.max(0, 1 - kind.cover * 1.4);
        var dens = Math.max(1.0, w / 140.0);
        s.clouds = Math.min(Clouds.length, Math.round(kind.cover * 5 * dens));
        s.rain = Math.min(Drops.length, Math.round(kind.rain * dens));
        s.snow = Math.min(Flakes.length, Math.round(kind.snow * dens));
    }
    var kd = s.kind;

    // ---- paint: background gradient, then the effects layer at 0.7, then edge fade ----
    ctx.clearRect(0, 0, w, h);
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, css(s.gTop)); grad.addColorStop(1, css(s.gBottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    var FX = 0.7;
    // Stars twinkle.
    if (s.starOp > 0) {
        ctx.fillStyle = "#F8FAFC";
        Stars.forEach(function (st, i) {
            ctx.globalAlpha = FX * Math.max(0, s.starOp * (0.55 + 0.45 * Math.sin(s.tick / 7.0 + i * 1.7)));
            ctx.fillRect(st.x, st.y, 1.2, 1.2);
        });
    }
    if (s.moon) {
        ctx.globalAlpha = FX * s.vis;
        ctx.fillStyle = "rgba(229,231,235,0.18)"; fillRects(ctx, s.moonDark, s.moon.x, s.moon.y);
        ctx.fillStyle = "#F1F5F9"; fillRects(ctx, s.moonLit, s.moon.x, s.moon.y);
    }
    if (s.sun) {
        ctx.globalAlpha = FX * s.vis;
        if (s.glow) {
            var rg = ctx.createRadialGradient(s.glow.x + 10, s.glow.y + 10, 0, s.glow.x + 10, s.glow.y + 10, 10);
            rg.addColorStop(0, "rgba(253,230,138,0.25)"); rg.addColorStop(1, "rgba(253,230,138,0)");
            ctx.fillStyle = rg;
            ctx.beginPath(); ctx.ellipse(s.glow.x, s.glow.y, 20, 20); ctx.fill();
        }
        ctx.fillStyle = css(s.sunCol);
        fillRects(ctx, SunGeo, s.sun.x, s.sun.y);
    }
    // Clouds drift with the wind, extra ones fade out, needed ones fade in.
    var drift = 0.04 + wind / 350.0;
    ctx.fillStyle = css(s.cloudCol);
    Clouds.forEach(function (c, i) {
        var want = i < s.clouds ? 1 : 0;
        c.fade += Math.max(-0.03, Math.min(0.03, want - c.fade));
        if (c.fade <= 0) return;
        c.x += drift * c.v;
        if (c.x > w) { c.x = -c.w; c.fy = 0.05 + 0.3 * Math.random(); }
        ctx.globalAlpha = FX * 0.65 * c.fade;
        fillRects(ctx, c.geo, Math.round(c.x), Math.round(c.fy * h));
    });
    // Fog - translucent bands, crawling slowly.
    if (kd.fog) Fog.forEach(function (fg) {
        fg.x = (fg.x + 0.0015) % 1.6;
        var x0 = (fg.x - 0.6) * w, fw = w * 0.6;
        var lg = ctx.createLinearGradient(x0, 0, x0 + fw, 0);
        lg.addColorStop(0, "rgba(229,231,235,0)"); lg.addColorStop(0.5, "rgba(229,231,235,1)"); lg.addColorStop(1, "rgba(229,231,235,0)");
        ctx.globalAlpha = FX * (0.14 + 0.05 * Math.sin(s.tick / 20.0 + fg.fy * 10));
        ctx.fillStyle = lg;
        ctx.fillRect(x0, fg.fy * h, fw, 3);
    });
    // Rain slants with the wind.
    var slant = Math.min(1.2, wind / 25.0);
    ctx.globalAlpha = FX;
    ctx.fillStyle = "rgba(147,197,253,0.5)";
    Drops.forEach(function (d, i) {
        if (i >= s.rain) { d.y = -99; return; }
        if (d.y < -50 || d.y > h) {
            d.x = Math.random() * (w + 10) - 10;
            d.y = d.y < -50 ? Math.random() * h : -4;
            d.v = 3.5 + 1.5 * Math.random();
        }
        d.y += d.v; d.x += slant;
        ctx.fillRect(d.x, d.y, 1, 3.5);
    });
    // Snow falls slowly and sways.
    ctx.fillStyle = "rgba(228,228,231,0.75)";
    Flakes.forEach(function (f, i) {
        if (i >= s.snow) { f.y = -99; return; }
        if (f.y < -50 || f.y > h) {
            f.x = Math.random() * w;
            f.y = f.y < -50 ? Math.random() * h : -2;
            f.v = 0.3 + 0.35 * Math.random();
            f.ph = Math.random() * 6.28;
        }
        f.y += f.v;
        ctx.fillRect(f.x + 1.5 * Math.sin(s.tick / 9.0 + f.ph) + slant * f.y / 4, f.y, 1.6, 1.6);
    });
    if (s.ground) { ctx.fillStyle = css(s.groundCol); ctx.fillRect(0, h - 1.5, w, 1.5); }
    // Thunderstorm: now and then the sky flashes, sometimes twice in a row.
    if (kd.storm && s.flash <= 0 && Math.floor(Math.random() * 140) === 0) s.flash = 7;
    if (s.flash > 0) {
        ctx.globalAlpha = FX * [0, 0.18, 0.05, 0, 0.25, 0.1, 0.04][s.flash - 1];
        ctx.fillStyle = "#F8FAFC";
        ctx.fillRect(0, 0, w, h);
        s.flash--;
    }
    // Opacity mask: fades into the window edges.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-in";
    var mg = ctx.createLinearGradient(0, 0, w, 0);
    mg.addColorStop(0, "rgba(0,0,0,0)"); mg.addColorStop(0.1, "rgba(0,0,0,1)");
    mg.addColorStop(0.9, "rgba(0,0,0,1)"); mg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
}

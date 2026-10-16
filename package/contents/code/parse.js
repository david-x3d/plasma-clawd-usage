// Parsers for `claude -p /usage`, `claude auth status`, status page, changelog, weather.
// Straight ports of lib/usage.ps1, account.ps1, status.ps1, version.ps1, weather.ps1.
.pragma library
.import "strings.js" as S

var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "Sep 16, 7:30am (Europe/Moscow)" or "Sep 21, 6am" -> Date in local time
function parseResetStamp(s) {
    if (!s) return null;
    var m = /([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)/.exec(s);
    if (!m) return null;
    var mon = MONTHS[m[1].toLowerCase()];
    if (mon === undefined) return null;
    var h = +m[3] % 12;
    if (m[5] === "pm") h += 12;
    var now = new Date();
    var dt = new Date(now.getFullYear(), mon, +m[2], h, m[4] ? +m[4] : 0, 0);
    // Around New Year the date may land in the past - then it is next year.
    if (dt.getTime() < now.getTime() - 30 * 86400000) dt.setFullYear(dt.getFullYear() + 1);
    return dt;
}

var StatRules = [
    { re: /^(\d+)% of your usage was at >(\S+) context/,                    key: "stat.bigCtx" },
    { re: /^(\d+)% of your usage went to always-on context over (\S+)/,     key: "stat.alwaysOn" },
    { re: /^(\d+)% of your usage came from subagent-heavy/,                 key: "stat.subagents" },
    { re: /^(\d+)% of your usage came from sessions active for (\d+)\+? hours/, key: "stat.long" },
    { re: /^Top MCP servers:\s*(.+)$/,                                      key: "stat.mcp" },
    { re: /^Top skills:\s*(.+)$/,                                           key: "stat.skills" },
    { re: /^Top subagents:\s*(.+)$/,                                        key: "stat.agents" }
];

function formatStatLine(l, line) {
    for (var i = 0; i < StatRules.length; i++) {
        var x = StatRules[i].re.exec(line);
        if (x) return S.F(S.T(l, StatRules[i].key), x.slice(1));
    }
    return line;
}

function parsePeriod(text, label) {
    var re = new RegExp("^" + label + "[^\\r\\n]*?(\\d+)\\s+requests[^\\r\\n]*?(\\d+)\\s+sessions[^\\r\\n]*\\r?\\n((?:[ \\t]+[^\\r\\n]*\\r?\\n?)*)", "m");
    var m = re.exec(text);
    if (!m) return null;
    var lines = [];
    m[3].split(/\r?\n/).forEach(function (r) { r = r.trim(); if (r) lines.push(r); });
    return { requests: +m[1], sessions: +m[2], lines: lines };
}

function parseUsage(text) {
    var u = { session: null, week: null, fable: null, sessionReset: null, weekReset: null, fableReset: null, day: null, week7: null };
    var m = /Current session:\s*(\d+)%[^\r\n]*?resets\s*([^\r\n]+)/.exec(text);
    if (m) { u.session = +m[1]; u.sessionReset = parseResetStamp(m[2]); }
    m = /Current week \(all models\):\s*(\d+)%[^\r\n]*?resets\s*([^\r\n]+)/.exec(text);
    if (m) { u.week = +m[1]; u.weekReset = parseResetStamp(m[2]); }
    m = /Current week \(Fable\):\s*(\d+)%(?:[^\r\n]*?resets\s*([^\r\n]+))?/.exec(text);
    if (m) { u.fable = +m[1]; u.fableReset = parseResetStamp(m[2]); }
    u.day = parsePeriod(text, "Last 24h");
    u.week7 = parsePeriod(text, "Last 7d");
    return (u.session !== null || u.week !== null) ? u : null;
}

function formatSpan(l, end) {
    var ms = end.getTime() - Date.now();
    if (ms <= 0) return null;
    var totalH = ms / 3600000;
    var days = Math.floor(ms / 86400000), hours = Math.floor(ms / 3600000) % 24, mins = Math.floor(ms / 60000) % 60;
    if (totalH >= 24) return S.F(S.T(l, "span.d"), days, hours);
    if (totalH >= 1) return S.F(S.T(l, "span.h"), Math.floor(totalH), mins);
    return S.F(S.T(l, "span.m"), mins);
}

var PlanNames = { max: "Max", pro: "Pro", team: "Team", enterprise: "Enterprise", free: "Free" };

function parseAuth(text) {
    var j;
    try { j = JSON.parse(text); } catch (e) { return null; }
    var plan = j.subscriptionType ? String(j.subscriptionType) : "";
    if (PlanNames[plan]) plan = PlanNames[plan];
    else if (!plan && j.authMethod && j.authMethod !== "claude.ai") plan = "API";
    return { loggedIn: !!j.loggedIn, plan: plan, email: j.email ? String(j.email) : "" };
}

function parseStatus(text) {
    var j;
    try { j = JSON.parse(text); } catch (e) { return null; }
    var broken = [];
    (j.components || []).forEach(function (c) {
        if (c.group || c.status === "operational") return;
        broken.push({ name: String(c.name).replace(/\s*\(.*\)\s*$/, ""), state: String(c.status) });
    });
    return {
        indicator: String(j.status && j.status.indicator),
        incidents: (j.incidents || []).map(function (i) { return i.name; }),
        broken: broken
    };
}

// Each live session: "<starttime>\t<json>" from the shell loop in main.qml.
function parseSessions(text) {
    var list = [];
    String(text || "").split("\n").forEach(function (row) {
        var tab = row.indexOf("\t");
        if (tab < 0) return;
        var start = row.substring(0, tab), j;
        try { j = JSON.parse(row.substring(tab + 1)); } catch (e) { return; }
        if (!j.pid) return;
        // A file can outlive its process: the pid must be the same process.
        if (j.procStart && String(j.procStart) !== start) return;
        var name = j.name ? String(j.name) : "";
        if (!name && j.cwd) name = String(j.cwd).replace(/\/+$/, "").split("/").pop();
        list.push({ name: name, cwd: j.cwd ? String(j.cwd) : "", busy: j.status === "busy",
                    waiting: j.status === "waiting", waitingFor: j.waitingFor ? String(j.waitingFor) : "" });
    });
    return list;
}

function cmpVer(a, b) {
    var x = String(a).split("."), y = String(b).split(".");
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
        var d = (+x[i] || 0) - (+y[i] || 0);
        if (d) return d;
    }
    return 0;
}

function parseChangelog(text, from, to) {
    var items = [];
    String(text).split(/^## /m).forEach(function (chunk) {
        var m = /^(\d+\.\d+\.\d+)/.exec(chunk);
        if (!m) return;
        if (cmpVer(m[1], from) <= 0 || cmpVer(m[1], to) > 0) return;
        chunk.split(/\r?\n/).forEach(function (line) {
            var x = /^\s*[-*]\s+(.+)$/.exec(line);
            if (x) items.push(x[1].replace(/`/g, ""));
        });
    });
    return { "for": to, from: from, items: items };
}

// ----- weather -----

var WeatherKinds = [
    { codes: [0],          id: "clear",       cover: 0.0 },
    { codes: [1],          id: "mostlyClear", cover: 0.2 },
    { codes: [2],          id: "partly",      cover: 0.5 },
    { codes: [3],          id: "overcast",    cover: 0.85 },
    { codes: [45, 48],     id: "fog",         cover: 0.7,  fog: true },
    { codes: [51, 53, 55], id: "drizzle",     cover: 0.8,  rain: 6 },
    { codes: [56, 57],     id: "iceDrizzle",  cover: 0.8,  rain: 6 },
    { codes: [61, 63, 65], id: "rain",        cover: 0.9,  rain: 12 },
    { codes: [66, 67],     id: "iceRain",     cover: 0.9,  rain: 12 },
    { codes: [71, 73, 75], id: "snow",        cover: 0.85, snow: 10 },
    { codes: [77],         id: "grains",      cover: 0.85, snow: 8 },
    { codes: [80, 81, 82], id: "showers",     cover: 0.85, rain: 16 },
    { codes: [85, 86],     id: "snowShowers", cover: 0.9,  snow: 14 },
    { codes: [95, 96, 99], id: "storm",       cover: 1.0,  rain: 16, storm: true }
];

function weatherKind(l, code) {
    for (var n = 0; n < WeatherKinds.length; n++) {
        var k = WeatherKinds[n], i = k.codes.indexOf(code);
        if (i < 0) continue;
        var mul = k.codes.length === 3 ? [0.6, 1.0, 1.35][i] : 1.0;
        return { name: S.T(l, "wx." + k.id), cover: k.cover, fog: !!k.fog, storm: !!k.storm,
                 rain: Math.round((k.rain || 0) * mul), snow: Math.round((k.snow || 0) * mul) };
    }
    return { name: S.F(S.T(l, "wx.code"), code), cover: 0.5, fog: false, storm: false, rain: 0, snow: 0 };
}

function hhmmToMin(s) {
    var m = /T(\d{2}):(\d{2})/.exec(String(s));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
}

function parseOpenMeteo(j) {
    if (!j || !j.current) return null;
    var wx = { code: +j.current.weather_code, temp: +j.current.temperature_2m, wind: +j.current.wind_speed_10m,
               sunrise: null, sunset: null, at: Date.now() };
    try { wx.sunrise = hhmmToMin(j.daily.sunrise[0]); wx.sunset = hhmmToMin(j.daily.sunset[0]); } catch (e) {}
    return wx;
}

// met.no describes weather with a word: "lightrainshowers_day" -> WMO code.
function parseMetNo(j) {
    var d = j.properties.timeseries[0].data;
    var sym = String(d.next_1_hours && d.next_1_hours.summary.symbol_code || "").replace(/_(day|night|polartwilight)$/, "");
    var lvl = /^light/.test(sym) ? 0 : /^heavy/.test(sym) ? 2 : 1;
    var shw = /showers/.test(sym), code;
    if (/thunder/.test(sym)) code = 95;
    else if (/snow/.test(sym)) code = shw ? [85, 85, 86][lvl] : [71, 73, 75][lvl];
    else if (/sleet/.test(sym)) code = lvl === 2 ? 67 : 66;
    else if (/rain/.test(sym)) code = shw ? [80, 81, 82][lvl] : [61, 63, 65][lvl];
    else if (/^fog/.test(sym)) code = 45;
    else if (/^cloudy/.test(sym)) code = 3;
    else if (/^partlycloudy/.test(sym)) code = 2;
    else if (/^fair/.test(sym)) code = 1;
    else if (/^clearsky/.test(sym)) code = 0;
    else code = 3;
    return { code: code, temp: +d.instant.details.air_temperature, wind: 3.6 * +d.instant.details.wind_speed,
             sunrise: null, sunset: null, at: Date.now() };
}

// Sunrise and sunset from coordinates (NOAA formulas), local time, minutes from midnight.
function sunCalc(lat, lon) {
    var now = new Date();
    var doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    var gm = 2 * Math.PI / 365 * (doy - 0.5);
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(gm) - 0.032077 * Math.sin(gm) -
                       0.014615 * Math.cos(2 * gm) - 0.040849 * Math.sin(2 * gm));
    var dec = 0.006918 - 0.399912 * Math.cos(gm) + 0.070257 * Math.sin(gm) -
              0.006758 * Math.cos(2 * gm) + 0.000907 * Math.sin(2 * gm) -
              0.002697 * Math.cos(3 * gm) + 0.00148 * Math.sin(3 * gm);
    var la = lat * Math.PI / 180;
    var c = Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec);
    c = Math.max(-0.999, Math.min(0.999, c));
    var ha = Math.acos(c) * 180 / Math.PI;
    var tz = -now.getTimezoneOffset();
    return { sr: ((720 - 4 * (lon + ha) - eq + tz) % 1440 + 1440) % 1440,
             ss: ((720 - 4 * (lon - ha) - eq + tz) % 1440 + 1440) % 1440 };
}

// Clawd - straight port of lib/mascot.ps1, lib/hearts.ps1 and lib/mascot-step.ps1.
// Geometry is produced as rectangle lists [x, y, w, h] in the same units as the WPF
// version; the QML side paints them. step() advances one frame and returns what to draw.
.pragma library
.import "strings.js" as S

var ClawdCols = 9, ClawdRows = 3;
var MascotPx = 2.0, MascotPy = 2.2;
var MascotW = 2 * ClawdCols * MascotPx;
var MascotH = 26.4;
var MascotSink = 2 * MascotPy;
var geoCache = {};

var ClawdQuad = { " ": 0, "█": 15, "▀": 3, "▄": 12, "▌": 5, "▐": 10, "▘": 1, "▝": 2, "▖": 4, "▗": 8,
                  "▛": 7, "▜": 11, "▙": 13, "▟": 14 };

var ClawdArms = {
    down:  { r1L: " ▐", r1R: "",  r2L: "▝▜", r2R: "█▀" },
    up:    { r1L: "▗▟", r1R: "▄", r2L: " ▜", r2R: "█▘" },
    right: { r1L: " ▐", r1R: "▄", r2L: "▝▜", r2R: "█▘" },
    left:  { r1L: "▗▟", r1R: "",  r2L: " ▜", r2R: "█▀" }
};
var ClawdFeet = { both: " ▝▝   ▝▝ ", left: " ▝▝      ", right: "      ▝▝ " };
var ClawdFacing = {
    "right-12": [[" ▐█▜██▛█ ", 2, 8], ["▝▜██████▀", 2, 7], [" ▝▝   ▝▝ ", 0, 0]],
    "right-30": [["  █▛██▛▌ ", 2, 7], [" ▝█████▛ ", 2, 7], ["  ▘▘  ▘▘ ", 0, 0]],
    "right-55": [["  ▐█▛█▜  ", 3, 7], ["  ▐████  ", 3, 7], ["  ▝▝ ▝▝  ", 0, 0]],
    "right-75": [["   ██▛▌  ", 3, 6], ["   ███▌  ", 3, 6], ["   ▘  ▘  ", 0, 0]],
    "edge":     [["   ▐██   ", 4, 6], ["   ▐██   ", 4, 6], ["   ▝ ▝   ", 0, 0]],
    "back-105": [["   ███▌  ", 3, 6], ["   ███▌  ", 3, 6], ["   ▘  ▘  ", 0, 0]],
    "back-125": [["  ▐████  ", 3, 7], ["  ▐████  ", 3, 7], ["  ▝▝ ▝▝  ", 0, 0]],
    "back-150": [["  █████▌ ", 2, 7], [" ▝█████▛ ", 2, 7], ["  ▘▘  ▘▘ ", 0, 0]],
    "back":     [[" ▐██████ ", 2, 8], ["▝▜██████▀", 2, 7], [" ▝▝   ▝▝ ", 0, 0]],
    "left-75":  [["   ▛██▌  ", 3, 6], ["   ███▌  ", 3, 6], ["   ▘  ▘  ", 0, 0]],
    "left-55":  [["  ▐▜▛██  ", 3, 7], ["  ▐████  ", 3, 7], ["  ▝▝ ▝▝  ", 0, 0]],
    "left-30":  [["  ▛██▛█▌ ", 2, 7], [" ▝█████▛ ", 2, 7], ["  ▘▘  ▘▘ ", 0, 0]],
    "left-12":  [[" ▐▛███▜█ ", 2, 8], ["▝▜██████▀", 2, 7], [" ▝▝   ▝▝ ", 0, 0]]
};

var EyeShapes = {
    open: "1,2 1,3", left: "0,0 0,1", right: "2,0 2,1", closed: "0,3 1,3", blink: "0,3 1,3",
    wink: "1,2 1,3;0,3 1,3", happy: "0,3 1,2 2,3", focus: "1,3", wide: "0,1 1,1 0,2 1,2 0,3 1,3",
    x: "0,1 2,1 1,2 0,3 2,3", yawn: "0,3 1,3", gasp: "0,1 2,1 1,2 0,3 2,3"
};

var MascotMoods = ["sleep", "doze", "idle", "work", "wait", "dead"];

// ----------------------------------------------- animations from Claude Code ----
var ClawdFrameMs = 60;
var ClawdPoses = { "default": "open/down/both", "arms-up": "open/up/both",
                   "look-left": "left/down/both", "look-right": "right/down/both" };

function F(pose, n, off, x, poof, shadow) {
    n = n === undefined ? 1 : n;
    var fr = { off: off || 0, x: x || 0, poof: poof || "", shadow: shadow || "", facing: "" };
    if (pose.indexOf("face:") === 0) {
        fr.facing = pose.substring(5); fr.eyes = "open"; fr.arms = "down"; fr.feet = "both";
    } else {
        if (ClawdPoses[pose]) pose = ClawdPoses[pose];
        var p = pose.split("/"); fr.eyes = p[0]; fr.arms = p[1]; fr.feet = p[2];
    }
    var r = [];
    for (var i = 0; i < n; i++) r.push(fr);
    return r;
}
function cat() { var r = []; for (var i = 0; i < arguments.length; i++) r = r.concat(arguments[i]); return r; }
function turn(list, shadow) { var r = []; list.forEach(function (p) { r = r.concat(F("face:" + p, 1, 0, 0, "", shadow || "")); }); return r; }

var cr = cat(F("default", 1, 1, 0, "dot"), F("default", 1, 1, 0, "wave"));
var bo = F("default");
var ts = cat(F("closed/down/both"), bo);
var jumpSeq = cat(cr, F("arms-up", 3), bo, cr, F("arms-up", 3), bo);
var waddle = F("look-right", 1, 0, -9);
for (var u = -6; u <= -1; u++) waddle = waddle.concat(F("right/down/" + (u % 2 === 0 ? "left" : "right"), 2, 0, u));

var ClawdSeqs = {
    jump: jumpSeq,
    look: cat(F("look-right", 5), F("look-left", 5), bo),
    celebrate: cat(jumpSeq, F("default", 3, 1)),
    skip: cat(F("default", 1, 1, -9), F("arms-up", 2, 0, -6), F("default", 1, 0, -6),
              F("default", 1, 1, -6), F("arms-up", 2, 0, -3), F("default", 1, 0, -3),
              F("default", 1, 1, -3), F("arms-up", 2), cr, bo),
    spin: cat(F("look-left", 2), F("look-right", 2), F("look-left", 2), F("arms-up", 3), bo),
    peekaboo: cat(F("default", 1, 3), F("default", 3, 2), F("look-right", 3, 2), F("look-left", 3, 2),
                  F("default", 2, 2), F("default", 1, 1), F("arms-up", 4), F("default", 2), ts),
    drop: cat(F("arms-up", 1, -3), F("arms-up", 2, -2), F("arms-up", 2, -1), F("arms-up", 1), cr, F("default", 3), ts),
    waddle: cat(waddle, F("look-right", 2), F("default", 2), ts),
    peek: cat(F("look-right", 1, 0, -9), F("look-right", 5, 0, -6), F("look-right", 3, 0, -9),
              F("look-right", 4, 0, -5), F("arms-up", 2, 0, -3), F("arms-up", 2), cr, bo),
    wink: cat(F("wink/down/both", 5), bo),
    boop: cat(F("closed/down/both", 1, 1, 0, "dot"), F("closed/down/both", 2, 1, 0, "wave"),
              F("look-left", 4), F("default", 2), ts),
    tap: cat(F("open/down/left", 2), F("open/down/right", 2), F("open/down/left", 2), F("open/down/right", 2),
             F("open/down/left", 1), F("open/down/right", 1), F("arms-up", 3), bo),
    sneeze: cat(F("closed/up/both", 4), F("closed/down/both", 2, 1, 0, "wave"), F("closed/down/both", 2), F("default", 2), ts),
    turn: cat(turn(["right-12", "right-30", "right-55", "right-75", "edge"]),
              turn(["back-105", "back-125", "back-150", "back", "back"]),
              turn(["back-150", "back-125", "back-105", "edge"]),
              turn(["left-75", "left-55", "left-30", "left-12"]), bo),
    "coin-hop": cat(F("default", 2, 1), F("arms-up", 1, 0, 0, "", "wide"),
                    turn(["right-55", "edge", "back-125", "back"], "narrow"),
                    turn(["back-125", "edge", "left-55"], "narrow"),
                    F("arms-up", 1, 0, 0, "", "wide"), cr, bo)
};
var SeqOrder = ["jump", "look", "celebrate", "skip", "spin", "peekaboo", "drop", "waddle", "peek",
                "wink", "boop", "tap", "sneeze", "turn", "coin-hop"];
var ClawdClickActs = SeqOrder.filter(function (k) { return ClawdSeqs[k][0].x === 0 && k !== "celebrate"; });
var ClawdEntranceActs = SeqOrder.filter(function (k) { return k !== "celebrate"; });

var ActOrder = SeqOrder.concat(["wave", "stretch", "yawn", "stumble", "soul", "burrow", "unburrow", "stir"]);
var MascotActs = {
    wave: { len: 24 }, stretch: { len: 22 }, yawn: { len: 22 }, stumble: { len: 20 }, soul: { len: 66 },
    burrow: { len: 30, noDemo: true }, unburrow: { len: 28, noDemo: true }, stir: { len: 22, noDemo: true }
};
SeqOrder.forEach(function (k) { MascotActs[k] = { len: ClawdSeqs[k].length }; });

var MascotDemo = [
    { kind: "mood", id: "sleep" }, { kind: "mood", id: "doze" },
    { kind: "mood", id: "idle" }, { kind: "mood", id: "work" },
    { kind: "crit", id: "work" }, { kind: "mood", id: "wait" },
    { kind: "drain", id: "idle" }
].concat(ActOrder.filter(function (k) { return !MascotActs[k].noDemo; }).map(function (k) { return { kind: "act", id: k }; }));

var BurrowDig = 4;

function facingRows(name) { return ClawdFacing[name]; }

function getGeo(f) {
    var key = [f.eyes, f.arms, f.feet, f.look, f.flip, f.off, f.x, f.facing, f.poof, f.shadow, f.dig, f.spray].join("|");
    if (geoCache[key]) return geoCache[key];
    var W = 2 * ClawdCols, H = 4 * ClawdRows;
    var g = [];
    for (var i = 0; i < W; i++) { g.push([]); for (var j = 0; j < H; j++) g[i].push(0); }
    function paint(glyphs, col, row, mode) {
        var chars = Array.from(glyphs);
        for (var i = 0; i < chars.length; i++) {
            var c = chars[i];
            var fg = mode === "lid" ? 2 : 1;
            var bg = mode === "eyes" ? 2 : mode === "lid" ? 1 : 0;
            for (var sy = 0; sy < 4; sy++) for (var sx = 0; sx < 2; sx++) {
                var on;
                if (c === "▂") on = sy === 3;
                else on = !!(ClawdQuad[c] & ((sy < 2 ? 1 : 4) * (sx ? 2 : 1)));
                var v = on ? fg : bg;
                if (v) g[2 * (col + i) + sx][4 * row + sy] = v;
            }
        }
    }
    if (f.facing) {
        var rows = facingRows(f.facing);
        for (var r = 0; r < 3; r++) {
            var s = Array.from(rows[r][0]), from = rows[r][1], to = rows[r][2];
            paint(s.slice(0, from).join(""), 0, r, "");
            paint(s.slice(from, to).join(""), from, r, "eyes");
            paint(s.slice(to).join(""), to, r, "");
        }
    } else {
        var a = ClawdArms[f.arms];
        paint(a.r1L, 0, 0, ""); paint("██████", 2, 0, "eyes"); paint(a.r1R, 8, 0, "");
        paint(a.r2L, 0, 1, ""); paint("█████", 2, 1, "eyes"); paint(a.r2R, 7, 1, "");
        paint(ClawdFeet[f.feet], 0, 2, "");
        var eyes = f.eyes, shift = 0;
        if (eyes === "open" && f.look < 0) eyes = "left";
        else if (eyes === "open" && f.look > 0) eyes = "right";
        else if (["open", "left", "right", "wink"].indexOf(eyes) < 0) shift = f.look | 0;
        var sh = EyeShapes[eyes].split(";"), ex = [4, 12];
        for (var k = 0; k < 2; k++) {
            sh[Math.min(k, sh.length - 1)].split(" ").forEach(function (pt) {
                var d = pt.split(","), xx = ex[k] + (+d[0]) + shift;
                if (xx >= 0 && xx < W) g[xx][+d[1]] = 2;
            });
        }
        if (eyes === "yawn" || eyes === "gasp") for (var x = 8; x <= 10; x++) { g[x][4] = 2; g[x][5] = 2; }
    }

    var body = [], eyeG = [], fx = [], sand = [];
    var oy = 4 * (f.off | 0) + (f.dig | 0), ox = 2 * (f.x | 0);
    var lim = (f.dig | 0) > 0 ? H - 2 : H;
    for (var y = 0; y < H; y++) {
        var sy2 = y;
        if (f.flip) { if (y >= H - 2) continue; else sy2 = H - 3 - y; }
        var yy = sy2 + oy;
        if (yy < 0 || yy >= lim) continue;
        var x2 = 0;
        while (x2 < W) {
            var c = g[x2][y];
            if (!c) { x2++; continue; }
            var x0 = x2;
            while (x2 < W && g[x2][y] === c) x2++;
            var l = Math.max(0, x0 + ox), rr = Math.min(W, x2 + ox);
            if (rr <= l) continue;
            var rect = [l * MascotPx, yy * MascotPy, (rr - l) * MascotPx, MascotPy];
            (c === 2 ? eyeG : body).push(rect);
        }
    }
    if (f.poof && f.off > 0) {
        [0, W - 2].forEach(function (cx) {
            var pts = f.poof === "dot" ? [[0.6, 9.4, 0.8, 0.9]] : [[0.0, 9.6, 0.7, 0.6], [0.7, 9.1, 0.6, 0.6], [1.3, 9.6, 0.7, 0.6]];
            pts.forEach(function (p) { fx.push([(cx + p[0]) * MascotPx, p[1] * MascotPy, p[2] * MascotPx, p[3] * MascotPy]); });
        });
    }
    if (f.shadow) {
        var sc = f.shadow === "wide" ? 6 : 8, sw = f.shadow === "wide" ? 6 : 2;
        fx.push([sc * MascotPx, (H - 0.5) * MascotPy, sw * MascotPx, 0.5 * MascotPy]);
    }
    function px(x, y, w, h) { sand.push([x * MascotPx, y * MascotPy, w * MascotPx, h * MascotPy]); }
    var dig = f.dig | 0;
    if (dig >= 1) px(-2, H - 3, W + 4, 1);
    if (dig >= 2) px(-1, H - 4, W + 2, 1);
    if (dig >= 3) { px(-1, H - 5, 2, 1); px(W - 1, H - 5, 2, 1); }
    if ((f.spray | 0) > 0) {
        var s2 = f.spray | 0;
        [0, 1].forEach(function (k) {
            var d = s2 + 2 * k, sx = 1.5 + 0.9 * d, sy = (H - 4) - 0.9 * d * (5 - d) / 2;
            px(-sx, sy, 0.8, 0.8); px(W - 0.8 + sx, sy, 0.8, 0.8);
        });
    }
    var geo = { body: body, eyes: eyeG, fx: fx, sand: sand };
    geoCache[key] = geo;
    return geo;
}

// ----------------------------------------------------------------- hearts ----
var HeartPx = 1.4;
var HeartRows = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
function heartGeo(maxCol) {
    var r = [];
    for (var y = 0; y < HeartRows.length; y++)
        for (var x = 0; x <= maxCol; x++)
            if (HeartRows[y][x] === "#") r.push([x * HeartPx, y * HeartPx, HeartPx, HeartPx]);
    return r;
}
var HeartFull = heartGeo(6), HeartHalf = heartGeo(3);

var DrainStep = 22;
var DrainLen = 6 * DrainStep + 35;

var HealthTiers = {
    6: { speed: 1.25, hop: 300 },
    5: { speed: 1.0 },
    4: { speed: 0.9, yawn: 350 },
    3: { speed: 0.75, yawn: 200, eyes: "focus" },
    2: { speed: 0.55, yawn: 160, eyes: "focus", sweat: true },
    1: { speed: 0.35, eyes: "blink", sweat: true, stagger: true, stumble: 220 },
    0: { speed: 0.0 }
};

// ------------------------------------------------------------------ state ----
function rnd(n) { return Math.floor(Math.random() * n); }
function rndRange(a, b) { return a + Math.floor(Math.random() * (b - a)); }

var Mz = {
    x: -1.0, dir: 1, target: null, look: 0, tick: 0, blinkAt: 30,
    mood: "idle", cur: "idle", crit: false, idleSince: Date.now(),
    act: null, actT: 0, force: null, forceCrit: false, demo: -1, demoT: 0,
    pct: null, halves: null, lostT: -1, lostFrom: 0,
    forceHearts: null, drainT: -1, loveT: -1, noteT: -1, confT: -1,
    busy: -1, waiting: 0, lastReset: null, lastPct: null, buried: false
};

var ConfettiColors = ["#F87171", "#FBBF24", "#4ADE80", "#60A5FA", "#A78BFA", "#D77757"];
var Confetti = [];
for (var ci = 0; ci < 12; ci++) Confetti.push({ color: ConfettiColors[ci % ConfettiColors.length], x: 0, y: 0, v: 0, d: 0, w: 2, vis: false });

function startAct(name) {
    Mz.act = name; Mz.actT = 0;
    if (name === "celebrate") startConfetti();
}

function startConfetti() {
    Confetti.forEach(function (c) {
        c.x = Mz.x - 12 + Math.random() * (MascotW + 24);
        c.y = 34 + Math.random() * 12;
        c.v = 0.9 + Math.random() * 1.2;
        c.d = (Math.random() - 0.5) * 0.8;
    });
    Mz.confT = 0;
}

function click() {
    var m = Mz;
    m.idleSince = Date.now();
    if (m.mood === "dead" || m.cur === "dead") { if (!m.act) startAct("soul"); return; }
    m.loveT = 0;
    if (m.buried && m.cur === "sleep") { if (!m.act) startAct("stir"); return; }
    if (m.act) return;
    startAct(ClawdClickActs[rnd(ClawdClickActs.length)]);
}

// ss - sessions, real - usage, level(pct) -> 'ok'|'warn'|'crit'
function setMood(ss, real, level) {
    var m = Mz;
    var busy = ss.filter(function (s) { return s.busy; }).length;
    var waiting = ss.filter(function (s) { return s.waiting; }).length;
    var pct = real ? real.session : null;
    var mood;
    if (pct !== null && pct >= 100) mood = "dead";
    else if (waiting) mood = "wait";
    else if (busy) mood = "work";
    else if (ss.length) mood = "idle";
    else mood = "sleep";
    if (mood !== m.mood) m.idleSince = Date.now();
    m.mood = mood;
    if (m.busy > 0 && busy < m.busy && waiting <= m.waiting && !m.act) startAct("jump");
    m.busy = busy; m.waiting = waiting;
    m.crit = pct !== null && level(pct) === "crit";
    m.pct = pct;
    if (real && real.sessionReset) {
        var rs = real.sessionReset.getTime();
        if (m.lastReset && rs > m.lastReset && m.lastPct !== null && pct < m.lastPct) startAct("celebrate");
        m.lastReset = rs; m.lastPct = pct;
    }
}

function getHalves() {
    var m = Mz, h = null;
    if (m.forceHearts !== null) h = m.forceHearts | 0;
    else if (m.force === "dead") h = 0;
    else if (m.pct !== null) h = Math.ceil(Math.max(0, 100 - m.pct) * 6 / 100);
    if (h === null) return null;
    return Math.min(6, Math.max(0, h));
}

function stepHearts(l) {
    var m = Mz, halves = getHalves();
    if (halves === null) { m.halves = null; return { visible: false }; }
    var tip = S.T(l, "health." + halves);
    if (m.pct !== null && m.forceHearts === null) tip = S.F(S.T(l, "hearts.left"), tip, 100 - m.pct);
    if (m.halves !== null && halves < m.halves) { m.lostT = 0; m.lostFrom = m.halves; }
    m.halves = halves;
    var show = halves;
    if (m.lostT >= 0) {
        if (m.lostT % 4 < 2) show = m.lostFrom;
        m.lostT++;
        if (m.lostT >= 16) m.lostT = -1;
    }
    var beat = 1.0;
    if (halves > 0 && halves <= 2) { var p = m.tick % 12; if (p === 0) beat = 1.3; else if (p === 1) beat = 1.15; }
    return { visible: true, show: show, beat: beat, tip: tip };
}

// Soul - a translucent mini-Clawd with a tail, a thread runs to the mouth.
var SoulUp = 26, SoulBack = 48, SoulTop = 20.0, SoulPx = 1.4;
var SoulArt = ["..########..", "..#.####.#..", "############", "..########..", "...######...", "....####....", ".....##....."];
function soulGeo(h, t) {
    var g = [], p = SoulPx, sway = 2.5 * Math.sin(t / 4.0);
    var n = Math.floor(h / p);
    for (var i = 0; i < n; i++) {
        var k = i / Math.max(1, n);
        var dx = sway * k + 1.2 * Math.sin(t / 2.0 + i * 0.7) * Math.sin(k * Math.PI);
        g.push([Math.round(dx / p) * p - p / 2, -(i + 1) * p, p, p]);
    }
    var top = -h - SoulArt.length * p, x0 = Math.round(sway / p) * p - 6 * p;
    for (var y = 0; y < SoulArt.length; y++) {
        var row = SoulArt[y], x = 0;
        while (x < row.length) {
            if (row[x] !== "#") { x++; continue; }
            var a = x;
            while (x < row.length && row[x] === "#") x++;
            g.push([x0 + a * p, top + y * p, (x - a) * p, p]);
        }
    }
    return g;
}

function stepAct(f) {
    var m = Mz, t = m.actT, bubble = "";
    if (ClawdSeqs[m.act]) {
        var fr = ClawdSeqs[m.act][t];
        ["eyes", "arms", "feet", "off", "x", "facing", "poof", "shadow"].forEach(function (k) { f[k] = fr[k]; });
        f.look = 0;
        if (m.act === "celebrate") bubble = "!";
    } else {
        switch (m.act) {
        case "wave":
            f.look = 0; f.eyes = "happy";
            f.arms = Math.floor(t / 4) % 2 ? "down" : "right";
            break;
        case "stretch":
            if (t >= 4 && t < 18) { f.arms = "up"; f.eyes = "closed"; f.lift = 1.5; }
            break;
        case "yawn":
            f.look = 0;
            f.eyes = (t >= 3 && t < 17) ? "yawn" : "closed";
            break;
        case "stumble":
            if (t < 12) { f.off = 1; f.eyes = "closed"; } else f.eyes = "wide";
            f.look = 0;
            break;
        case "soul":
            f.flip = true; f.look = 0;
            if (t < 6) { f.eyes = "x"; f.feet = t % 2 ? "left" : "right"; }
            else if (t < SoulBack + 6) {
                f.eyes = "gasp"; f.soulT = t;
                if (t < SoulUp) { var k = (t - 6) / (SoulUp - 6.0); f.soul = SoulTop * (1 - (1 - k) * (1 - k)); }
                else if (t < SoulBack) f.soul = SoulTop + 1.5 * Math.sin((t - SoulUp) / 2.5);
                else { var k2 = (t - SoulBack) / 6.0; f.soul = SoulTop * (1 - k2 * k2); }
            } else if (t < SoulBack + 9) { f.eyes = "wide"; f.lift = 2.5; }
            else f.eyes = "x";
            break;
        case "burrow":
            if (t < 4) f.look = t < 2 ? -1 : 1;
            else if (t < 24) {
                f.look = 0; f.eyes = "focus";
                f.dig = Math.min(BurrowDig, Math.floor((t - 4) / 3.5));
                f.feet = Math.floor(t / 2) % 2 ? "left" : "right";
                f.arms = Math.floor(t / 2) % 2 ? "up" : "down";
                f.spray = (t % 3) + 1;
            } else { f.look = 0; f.dig = BurrowDig; f.eyes = t < 27 ? "blink" : "closed"; }
            break;
        case "unburrow":
            f.look = 0;
            if (t < 3) { f.dig = BurrowDig; f.eyes = "wide"; }
            else if (t < 9) {
                f.dig = Math.max(0, BurrowDig - (t - 3)); f.eyes = "wide"; f.arms = "up"; f.spray = (t % 3) + 1;
                if (t === 8) f.lift = 2;
            } else if (t < 21) {
                f.eyes = "closed";
                f.look = Math.floor(t / 2) % 2 ? -1 : 1;
                f.feet = Math.floor(t / 2) % 2 ? "left" : "right";
                if (t < 15) f.spray = (t % 3) + 1;
            } else if (t < 23) f.eyes = "blink";
            break;
        case "stir":
            f.dig = t < 15 ? BurrowDig - 1 : BurrowDig;
            if (t < 3) { f.eyes = "wide"; f.look = 0; }
            else if (t < 13) f.look = t < 8 ? -1 : 1;
            else if (t < 17) { f.eyes = "blink"; f.look = 0; }
            else { f.eyes = "closed"; f.look = 0; }
            break;
        }
    }
    m.actT++;
    if (m.actT >= MascotActs[m.act].len) m.act = null;
    return bubble;
}

function stopDemo() {
    var m = Mz;
    m.demo = -1; m.demoT = 0; m.force = null; m.forceCrit = false; m.act = null;
    if (m.drainT >= 0) { m.drainT = -1; m.forceHearts = null; }
}

function stepDemo() {
    var m = Mz, s = MascotDemo[m.demo];
    if (m.demoT === 0) {
        m.forceCrit = false;
        if (s.kind === "mood") { m.force = s.id; m.act = null; }
        else if (s.kind === "crit") { m.force = s.id; m.act = null; m.forceCrit = true; }
        else if (s.kind === "act") { m.force = "idle"; m.target = null; startAct(s.id); }
        else if (s.kind === "drain") { m.force = "work"; m.act = null; m.drainT = 0; }
    }
    m.demoT++;
    var len = s.kind === "act" ? MascotActs[s.id].len + 12 : s.kind === "drain" ? DrainLen + 10 : 55;
    if (m.demoT >= len) {
        m.demoT = 0; m.demo++;
        if (m.demo >= MascotDemo.length) stopDemo();
    }
}

// env: { lang, areaW, areaH, mouseOver, mouseX (area coords) }
function mouseLook(env) {
    if (!env.mouseOver || env.mouseX === null) return null;
    var cx = Mz.x + MascotW / 2;
    if (env.mouseX > cx + 10) return 1;
    if (env.mouseX < cx - 10) return -1;
    return 0;
}

function step(env) {
    var m = Mz, l = env.lang;
    m.tick++;
    var span = Math.max(0, env.areaW - MascotW);
    if (m.x < 0) m.x = span / 2;
    if (m.x > span) m.x = span;

    if (m.demo >= 0) stepDemo();
    if (m.drainT >= 0) {
        m.forceHearts = Math.max(0, 6 - Math.floor(m.drainT / DrainStep));
        m.drainT++;
        if (m.drainT >= DrainLen) { m.drainT = -1; m.forceHearts = null; }
    }
    var mood = m.force ? m.force : m.mood;
    if (m.forceHearts !== null && (m.forceHearts | 0) === 0) mood = "dead";
    var halves = getHalves();
    var tierN = halves === null ? 5 : halves;
    var tier = HealthTiers[tierN];
    var perky = tier.speed >= 0.9;
    var now = Date.now();
    if (env.mouseOver) m.idleSince = now;
    if (mood === "idle" && !m.force && (now - m.idleSince) >= 600000) mood = "doze";

    if (mood === "sleep") {
        if (!m.buried && !m.act) { m.buried = true; startAct("burrow"); }
    } else if (m.buried) {
        m.buried = false; startAct("unburrow");
    }

    var f = { feet: "both", look: m.look, eyes: "open", arms: "down", flip: false, lift: 0.0,
              off: 0, x: 0, facing: "", poof: "", shadow: "", soul: 0.0, soulT: 0, dig: 0, spray: 0 };
    m.cur = mood;
    var bubble = "", zzz = false, canBlink = true, dust = false, p, ml;

    if (m.act) {
        bubble = stepAct(f);
        canBlink = false;
    } else if (mood === "sleep") {
        f.dig = BurrowDig; f.eyes = "closed"; f.look = 0; zzz = true;
    } else if (mood === "doze") {
        f.look = 0;
        p = m.tick % 70;
        if (p < 6) { f.eyes = "wide"; if (p < 2) f.lift = 1.5; }
        else { f.eyes = "blink"; zzz = true; }
    } else if (mood === "dead") {
        f.flip = true; f.eyes = "x"; f.look = 0;
        p = m.tick % 50;
        if (p < 6) f.feet = p % 2 ? "left" : "right";
    } else if (mood === "wait") {
        bubble = "?"; f.eyes = "wide";
        ml = mouseLook(env);
        f.look = ml !== null ? ml : 0;
        p = m.tick % 40;
        if (p < 8) { var k = p / 7.0; f.lift = 12 * k * (1 - k); f.arms = "right"; }
    } else {
        var speed;
        if (mood === "work") {
            speed = 1.6 * tier.speed;
            if (m.target === null) m.target = m.dir > 0 ? span : 0.0;
        } else {
            speed = 0.6 * tier.speed;
            if (m.target === null) {
                if (rnd(70) === 0) m.target = Math.random() * span;
                else if (rnd(45) === 0) m.look = rndRange(-1, 2);
                else if (rnd(400) === 0) startAct(["wave", "stretch", "look"][rnd(3)]);
            }
        }
        var walking = false;
        if (m.target !== null) {
            var d = m.target - m.x;
            if (Math.abs(d) <= speed) {
                m.x = m.target; m.target = null;
                if (mood === "work") m.dir = -m.dir;
            } else {
                m.dir = Math.sign(d); m.x += speed * m.dir; m.look = m.dir; walking = true;
            }
        }
        if (walking) {
            var stepN = mood === "work" ? 2 : 3;
            if (tier.speed < 0.8) stepN++;
            if (tier.speed < 0.5) stepN++;
            f.feet = Math.floor(m.tick / stepN) % 2 ? "left" : "right";
            if (mood === "work") {
                if (f.feet === "left" && perky) f.lift = 1;
                dust = true;
                if (perky && rnd(150) === 0) startAct("jump");
            } else if (perky && m.noteT < 0 && rnd(80) === 0) {
                m.noteT = 0;
            }
            if (tier.stumble && rnd(tier.stumble) === 0) startAct("stumble");
        } else if (m.crit || m.forceCrit) {
            m.look = Math.floor(m.tick / 5) % 2 ? -1 : 1;
        } else {
            ml = mouseLook(env);
            if (ml !== null) m.look = ml;
        }
        f.look = m.look;
        if (mood === "work") f.eyes = "focus";
        if (!m.act) {
            if (tier.hop && rnd(tier.hop) === 0) startAct("jump");
            if (tier.yawn && rnd(tier.yawn) === 0) startAct("yawn");
        }
    }

    if (tier.eyes && !m.act && (f.eyes === "open" || f.eyes === "focus")) f.eyes = tier.eyes;
    if (m.loveT >= 0 && !m.act && f.eyes === "open") f.eyes = "happy";
    if (m.noteT >= 0) {
        if (!bubble && mood === "idle") bubble = "♪";
        m.noteT++;
        if (m.noteT >= 30) m.noteT = -1;
    }
    if (canBlink && f.eyes === "open" && m.tick >= m.blinkAt) {
        f.eyes = "blink";
        if (m.tick >= m.blinkAt + 1) m.blinkAt = m.tick + rndRange(25, 70);
    }

    var R = { geo: getGeo(f), ms: (m.act && ClawdSeqs[m.act]) ? ClawdFrameMs : 90 };
    var rx = m.x;
    if (tier.stagger && mood !== "sleep" && mood !== "dead") rx += 1.5 * Math.sin(m.tick / 3.0);
    R.left = Math.round(rx);
    R.bottom = f.lift - MascotSink;

    if (zzz) {
        p = (m.tick % 30) / 30.0;
        var zb = f.dig > 0 ? 9 : f.off > 0 ? 12 : 19;
        R.z = { size: 7 + 4 * p, op: 1 - p, left: m.x + 28 + 3 * Math.sin(p * 2 * Math.PI), bottom: zb + 14 * p };
    }
    if (bubble) {
        R.bubble = { text: bubble, color: bubble === "?" ? "#FBBF24" : bubble === "!" ? "#4ADE80" : "#93C5FD",
                     left: m.x + MascotW / 2 - 6, bottom: 22 + f.lift + 1.5 * Math.sin(m.tick / 3.0) };
    }
    if ((m.crit || m.forceCrit || tier.sweat) && mood !== "sleep" && mood !== "dead") {
        p = (m.tick % 20) / 20.0;
        R.sweat = { op: 1 - p, left: f.look < 0 ? 31 : 2, top: -2 + 6 * p - f.lift };
    }
    R.hearts = stepHearts(l);

    R.dust = [];
    if (dust) for (var i = 0; i < 3; i++) {
        p = ((m.tick + i * 3) % 9) / 9.0;
        var dx = m.dir > 0 ? 4 - 8 * p - 2 * i : MascotW - 6 + 8 * p + 2 * i;
        R.dust.push({ op: 0.7 * (1 - p), left: m.x + dx, bottom: 4 * p });
    }
    R.confetti = [];
    if (m.confT >= 0) {
        Confetti.forEach(function (c, i) {
            c.y -= c.v; c.x += c.d;
            if (c.y > 0) R.confetti.push({ color: c.color, left: c.x, bottom: c.y,
                                            w: Math.floor((m.tick + i) / 2) % 2 ? 2.5 : 1.2 });
        });
        m.confT++;
        if (m.confT >= 45) m.confT = -1;
    }
    if (m.loveT >= 0) {
        var kk = m.loveT / 20.0;
        R.love = { op: 1 - kk, left: m.x + MascotW / 2 - 5 + 2 * Math.sin(kk * 6), bottom: 23 + f.lift + 14 * kk };
        m.loveT++;
        if (m.loveT >= 20) m.loveT = -1;
    }
    if (f.soul > 0.5) {
        R.soul = { rects: soulGeo(f.soul, f.soulT), op: 0.7 + 0.15 * Math.sin(f.soulT / 1.7),
                   left: m.x + 9.5 * MascotPx, top: env.areaH - (f.lift + 6 * MascotPy) };
    }

    var tag = "";
    if (m.demo >= 0 || m.force || m.forceCrit || m.forceHearts !== null) {
        if (m.drainT >= 0) tag = mood === "dead" ? S.T(l, "mood.dead") : S.T(l, "health." + tierN);
        else if (m.act) tag = S.T(l, "act." + m.act);
        else if (m.forceCrit) tag = S.T(l, "tag.sweat");
        else tag = S.T(l, "mood." + mood);
        if (m.forceHearts !== null && m.drainT < 0 && mood !== "dead") tag = tag + " · " + S.T(l, "health." + tierN);
        if (m.demo >= 0) tag = S.F(S.T(l, "tag.demo"), m.demo + 1, MascotDemo.length, tag);
        else tag = "dev · " + tag;
    }
    R.tag = tag;
    return R;
}

// Entrance on widget start.
startAct(ClawdEntranceActs[rnd(ClawdEntranceActs.length)]);

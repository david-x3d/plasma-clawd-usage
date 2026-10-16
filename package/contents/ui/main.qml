/*
  Clawd Usage - KDE Plasma port of clawd-usage-winwidget.
  The widget is the floating window, the panel icon is the tray icon. All data is
  official: limit percentages and stats come from `claude -p /usage` (no model call,
  no tokens), the latest version number from downloads.claude.ai. Weather for the
  sky comes from Open-Meteo or met.no, location by IP via ipwho.is.
*/
import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support
import "../code/strings.js" as S
import "../code/parse.js" as P
import "../code/mascot.js" as M
import "../code/sky.js" as Sky

PlasmoidItem {
    id: root

    readonly property var cfg: Plasmoid.configuration
    readonly property string lang: S.lang(cfg.language)
    readonly property bool onDesktop: Plasmoid.formFactor === PlasmaCore.Types.Planar
    readonly property bool shown: onDesktop || expanded
    readonly property bool skyOn: cfg.showMascot && cfg.showSky
    readonly property string statusUrl: "https://status.claude.com"
    readonly property string claude: 'PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:/usr/local/bin:$PATH" claude'

    function t(k) { return S.T(lang, k); }
    function level(pct) {
        if (pct >= cfg.critPercent) return "crit";
        if (pct >= cfg.warnPercent) return "warn";
        return "ok";
    }
    readonly property var pal: ({ ok: "#4ADE80", warn: "#FBBF24", crit: "#F87171", dead: "#6B7280" })

    // ---- state ----
    property var usage: null
    property real usageAt: 0
    property real usageTry: 0
    property bool usageBusy: false
    property bool noClaude: false
    property var account: null
    property real authTry: 0
    property bool authBusy: false
    property var status: null
    property real statusAt: 0
    property real statusTry: 0
    property var sessions: []
    property bool sessBusy: false
    property string verLocal: ""
    property string verLatest: ""
    property real verAt: 0
    property var changes: null
    property real changesTry: 0
    property bool updating: false
    property var geo: null
    property real geoTry: 0
    property var wx: null
    property real wxTry: 0
    property bool wxAlt: false
    property string wxPlace: ""

    // ---- texts shown by the card ----
    property string pctText: "--"
    property color pctColor: pal.dead
    property var sessionPct: null
    property string lineReset: t("loading")
    property var weekPct: null
    property string lineWeek: ""
    property var fablePct: null
    property string lineFable: ""
    property string lineSessions: ""
    property string sessTip: ""
    property color statusDot: pal.dead
    property string lineStatus: t("st.loading")
    property string lineStatus2: ""
    property color statusFg: "#8B8B94"
    property string lineDay: ""
    property string lineDay2: ""
    property string lineWeek7: ""
    property string lineWeek72: ""
    property string lineVersion: ""
    property color versionColor: "#8B8B94"
    property string versionTip: ""
    property string lineStamp: ""
    property string lineAccount: ""
    property color accountColor: "#52525B"
    property string skyTip: ""
    property string trayText: "--"
    property color trayColor: pal.dead

    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: onDesktop ? fullRepresentation : compactRepresentation
    toolTipMainText: "Clawd Usage"
    toolTipSubText: ""

    fullRepresentation: Card {
        app: root
        Layout.preferredWidth: implicitWidth
        Layout.preferredHeight: implicitHeight
        Layout.minimumWidth: implicitWidth
        Layout.minimumHeight: implicitHeight
        Layout.maximumWidth: implicitWidth
        Layout.maximumHeight: implicitHeight
    }

    // Tray icon: the session percentage as a colored number.
    compactRepresentation: MouseArea {
        Layout.minimumWidth: height
        onClicked: root.expanded = !root.expanded
        Rectangle {
            anchors.centerIn: parent
            width: Math.min(parent.width, parent.height) * 31 / 32
            height: width
            radius: width / 2
            color: root.trayColor
            Text {
                anchors.centerIn: parent
                text: root.trayText
                color: "black"
                font.family: "Segoe UI"
                font.bold: true
                font.pixelSize: parent.width * (root.trayText.length >= 3 ? 14 : 17) / 32
            }
        }
    }

    Plasmoid.contextualActions: [
        PlasmaCore.Action {
            text: root.t("menu.toggle"); icon.name: "window"
            visible: !root.onDesktop
            onTriggered: root.expanded = !root.expanded
        },
        PlasmaCore.Action {
            text: root.t("menu.refresh"); icon.name: "view-refresh"
            onTriggered: { root.usageTry = 0; root.startUsage(); }
        },
        PlasmaCore.Action {
            text: root.t("menu.bigger"); icon.name: "zoom-in"
            onTriggered: Plasmoid.configuration.scale = Math.min(4.0, Math.round((root.cfg.scale + 0.1) * 100) / 100)
        },
        PlasmaCore.Action {
            text: root.t("menu.smaller"); icon.name: "zoom-out"
            onTriggered: Plasmoid.configuration.scale = Math.max(0.6, Math.round((root.cfg.scale - 0.1) * 100) / 100)
        },
        PlasmaCore.Action { isSeparator: true },
        PlasmaCore.Action {
            text: root.t("menu.language") + ": English"; checkable: true; checked: root.lang === "en"
            onTriggered: Plasmoid.configuration.language = "en"
        },
        PlasmaCore.Action {
            text: root.t("menu.language") + ": Русский"; checkable: true; checked: root.lang === "ru"
            onTriggered: Plasmoid.configuration.language = "ru"
        }
    ]

    function setDetails(open) { Plasmoid.configuration.expanded = open; }
    function hideWindow() { if (!onDesktop) expanded = false; }

    // ---- processes ----
    P5Support.DataSource {
        id: exec
        engine: "executable"
        connectedSources: []
        property var cbs: ({})
        onNewData: function (src, data) {
            var cb = cbs[src];
            delete cbs[src];
            disconnectSource(src);
            if (cb) cb(String(data.stdout || ""), data["exit code"]);
        }
        function run(cmd, cb) {
            if (cbs[cmd]) return;
            cbs[cmd] = cb;
            connectSource(cmd);
        }
    }

    function get(url, cb) {
        var x = new XMLHttpRequest();
        x.onreadystatechange = function () {
            if (x.readyState !== XMLHttpRequest.DONE) return;
            cb(x.status >= 200 && x.status < 300 ? x.responseText : null);
        };
        x.open("GET", url);
        try { x.setRequestHeader("User-Agent", "plasma-clawd-usage"); } catch (e) {}
        x.send();
    }

    function startUsage() {
        if (usageBusy) return;
        usageBusy = true;
        usageTry = Date.now();
        exec.run(claude + " -p /usage --output-format text </dev/null", function (out, code) {
            usageBusy = false;
            noClaude = code === 127;
            var u = P.parseUsage(out);
            if (u) { usage = u; usageAt = Date.now(); }
            updateWidget();
        });
    }

    function startAuth() {
        if (authBusy) return;
        authBusy = true;
        authTry = Date.now();
        exec.run(claude + " auth status </dev/null", function (out) {
            authBusy = false;
            var a = P.parseAuth(out);
            if (a) account = a;
        });
    }

    // Claude Code keeps its own registry: ~/.claude/sessions/<pid>.json. Only live
    // processes count, and procStart must match the process start time; our own
    // `claude -p /usage` and `claude auth status` are skipped.
    readonly property string sessionsCmd: "for f in \"$HOME\"/.claude/sessions/*.json; do p=$(basename \"$f\" .json); " +
        "[ -r /proc/$p/stat ] || continue; tr '\\0' ' ' </proc/$p/cmdline | grep -qE -- '-p /usage|auth status' && continue; " +
        "printf '%s\\t' \"$(sed 's/.*) //' /proc/$p/stat | cut -d' ' -f20)\"; tr -d '\\n' <\"$f\"; echo; done"

    function startSessions() {
        if (sessBusy) return;
        sessBusy = true;
        exec.run(sessionsCmd, function (out) {
            sessBusy = false;
            sessions = P.parseSessions(out);
            updateSessions();
        });
    }

    function startStatus() {
        statusTry = Date.now();
        get(statusUrl + "/api/v2/summary.json", function (txt) {
            if (txt === null) return;
            var s = P.parseStatus(txt);
            if (s) { status = s; statusAt = Date.now(); updateWidget(); }
        });
    }

    function startVersion() {
        verAt = Date.now();
        exec.run(claude + " --version </dev/null", function (out) {
            var m = /(\d+\.\d+\.\d+)/.exec(out);
            if (m) verLocal = m[1];
        });
        exec.run('cat "$HOME/.claude/settings.json"', function (out) {
            var ch = "latest";
            try { var s = JSON.parse(out); if (s.autoUpdatesChannel === "stable" || s.autoUpdatesChannel === "latest") ch = s.autoUpdatesChannel; } catch (e) {}
            get("https://downloads.claude.ai/claude-code-releases/" + ch, function (txt) {
                var m = txt && /^\s*(\d+\.\d+\.\d+)/.exec(txt);
                if (m) { verLatest = m[1]; updateWidget(); }
            });
        });
    }

    function updateAvailable() {
        return verLocal !== "" && verLatest !== "" && P.cmpVer(verLatest, verLocal) > 0;
    }

    function startChangelog() {
        if (!updateAvailable()) return;
        if (changes && changes["for"] === verLatest && changes.from === verLocal) return;
        if (Date.now() - changesTry < 600000) return;
        changesTry = Date.now();
        var from = verLocal, to = verLatest;
        get("https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md", function (txt) {
            if (txt === null) return;
            changes = P.parseChangelog(txt, from, to);
            updateWidget();
        });
    }

    function startUpdate() {
        if (updating) return;
        updating = true;
        var cmd = claude + " update; echo; printf 'Press Enter to close'; read x";
        var q = "'" + cmd.replace(/'/g, "'\\''") + "'";
        exec.run("konsole --nofork -e sh -c " + q + " || xterm -e sh -c " + q, function () {
            updating = false;
            verAt = 0;
            startVersion();
            updateWidget();
        });
        updateWidget();
    }

    function place() {
        if (String(cfg.weatherLat) !== "" && String(cfg.weatherLon) !== "") {
            var la = parseFloat(cfg.weatherLat), lo = parseFloat(cfg.weatherLon);
            if (!isNaN(la) && !isNaN(lo)) return { lat: la, lon: lo, city: null };
        }
        return geo;
    }

    function startWeather() {
        var pl = place();
        if (!pl) {
            // No coordinates - first find the location by IP, ask for weather next tick.
            if (Date.now() - geoTry < 600000) return;
            geoTry = Date.now();
            get("https://ipwho.is/?lang=" + lang, function (txt) {
                try {
                    var j = JSON.parse(txt);
                    if (j.success !== false && j.latitude !== undefined && j.latitude !== null) {
                        geo = { lat: +j.latitude, lon: +j.longitude, city: String(j.city || "") };
                        wxTry = 0;
                        updateSkyTip();
                    }
                } catch (e) {}
            });
            return;
        }
        wxTry = Date.now();
        var url;
        if (wxAlt) url = "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + pl.lat.toFixed(4) + "&lon=" + pl.lon.toFixed(4);
        else url = "https://api.open-meteo.com/v1/forecast?latitude=" + pl.lat + "&longitude=" + pl.lon +
                   "&current=weather_code,temperature_2m,wind_speed_10m&daily=sunrise,sunset&timezone=auto&forecast_days=1";
        var alt = wxAlt;
        get(url, function (txt) {
            var j = null;
            try { j = JSON.parse(txt); } catch (e) {}
            if (alt) {
                if (j && j.properties && j.properties.timeseries) { wx = P.parseMetNo(j); updateSkyTip(); }
                return;
            }
            var w = P.parseOpenMeteo(j);
            if (!w) { wxAlt = true; wxTry = 0; return; }   // Open-Meteo unreachable - met.no from now on
            wx = w;
            updateSkyTip();
        });
    }

    function updateSkyTip() { skyTip = Sky.tip(lang, wx, place()); }

    // ---- main tick (lib/update.ps1: Update-Widget) ----
    function periodText(p) {
        if (!p) return [t("noData"), ""];
        return [S.F(t("period"), p.requests, p.sessions),
                p.lines.map(function (l) { return P.formatStatLine(lang, l); }).join("  ·  ")];
    }

    function updateSessions() {
        var ss = sessions;
        if (cfg.showMascot) M.setMood(ss, usage, level);
        var busy = ss.filter(function (s) { return s.busy; }).length;
        var wait = ss.filter(function (s) { return s.waiting; }).length;
        if (!ss.length) lineSessions = t("sess.none");
        else {
            var line = S.count(lang, ss.length, "session");
            if (busy || !wait) line += "  ·  " + S.F(t("sess.busy"), busy);
            if (wait) line += "  ·  " + S.F(t("sess.wait"), wait);
            lineSessions = line;
        }
        sessTip = ss.map(function (s) {
            var mark = s.busy ? "▶" : s.waiting ? "?" : "○";
            var what = s.waiting && s.waitingFor ? " [" + s.waitingFor + "]" : "";
            return mark + " " + s.name + what + " — " + s.cwd;
        }).join("\n");
    }

    function updateWidget() {
        var now = Date.now();
        if (now - usageTry >= cfg.usageIntervalSeconds * 1000) startUsage();
        if (now - verAt >= cfg.versionIntervalSeconds * 1000) startVersion();
        if (cfg.showStatus && now - statusTry >= cfg.statusIntervalSeconds * 1000) startStatus();
        if (cfg.showAccount && now - authTry >= cfg.accountIntervalSeconds * 1000) startAuth();
        startChangelog();
        var pl = cfg.weatherLat + "|" + cfg.weatherLon;
        if (pl !== wxPlace) { wxPlace = pl; wxTry = 0; }
        if (skyOn && now - wxTry >= cfg.weatherIntervalSeconds * 1000) startWeather();

        var real = usage;

        // --- current session (5-hour window) ---
        if (!real || real.session === null) {
            pctText = "--"; pctColor = pal.dead; sessionPct = null;
            lineReset = noClaude ? t("err.noClaude") : usageAt === 0 ? t("loading") : t("noData");
            trayText = "--"; trayColor = pal.dead;
            toolTipSubText = t("tray.noData");
        } else {
            var pct = real.session, lv = level(pct);
            pctText = String(pct); pctColor = pal[lv]; sessionPct = pct;
            var span = real.sessionReset ? P.formatSpan(lang, real.sessionReset) : null;
            lineReset = span ? S.F(t("reset.in"), span) : real.sessionReset ? t("reset.closed") : "";
            trayText = String(pct); trayColor = pal[lv];
            var tip = S.F(t("tray.session"), pct);
            if (span) tip += " · " + span;
            var tip2 = [];
            if (real.week !== null) tip2.push(S.F(t("tray.week"), real.week));
            if (real.fable !== null) tip2.push("Fable " + real.fable + "%");
            if (tip2.length) tip += "\n" + tip2.join(" · ");
            toolTipSubText = tip;
        }

        // --- week ---
        if (!real || real.week === null) { weekPct = null; lineWeek = t("noData"); }
        else {
            weekPct = real.week;
            var w = real.week + "%";
            var ws = real.weekReset ? P.formatSpan(lang, real.weekReset) : null;
            if (ws) w += "  ·  " + ws;
            lineWeek = w;
        }

        // --- Fable: separate weekly limit; hidden if /usage did not report it ---
        if (real && real.fable !== null) {
            fablePct = real.fable;
            var fl = real.fable + "%";
            var fs = real.fableReset ? P.formatSpan(lang, real.fableReset) : null;
            if (fs) fl += "  ·  " + fs;
            lineFable = fl;
        } else fablePct = null;

        // --- sessions ---
        if (cfg.showSessions || cfg.showMascot) startSessions();
        else updateSessions();

        // --- service status ---
        var st = status;
        var stale = (now - statusAt) > (3 * cfg.statusIntervalSeconds + 30) * 1000;
        var extra = "";
        if (!st || stale) {
            statusDot = pal.dead; lineStatus = st ? t("st.offline") : t("st.loading"); statusFg = "#8B8B94";
        } else if (st.indicator === "none" && !st.broken.length && !st.incidents.length) {
            statusDot = pal.ok; lineStatus = t("st.ok"); statusFg = "#8B8B94";
        } else {
            statusDot = (st.indicator === "major" || st.indicator === "critical") ? pal.crit : pal.warn;
            statusFg = "#D4D4D8";
            if (st.incidents.length) lineStatus = st.incidents.join("  ·  ");
            else if (st.indicator === "maintenance") lineStatus = t("st.maint");
            else lineStatus = t("st.issues");
            extra = st.broken.map(function (b) { return b.name + ": " + S.T(lang, "comp." + b.state, b.state); }).join("  ·  ");
        }
        lineStatus2 = extra;

        // --- details ---
        var d = periodText(real ? real.day : null), d7 = periodText(real ? real.week7 : null);
        lineDay = d[0]; lineDay2 = d[1]; lineWeek7 = d7[0]; lineWeek72 = d7[1];

        var has = updateAvailable();
        if (has) {
            var head = S.F(t("chg.head"), verLocal, verLatest), click = t("chg.click");
            if (!changes || changes["for"] !== verLatest) versionTip = head + "\n\n" + t("chg.loading") + "\n\n" + click;
            else {
                var items = changes.items, max = 25;
                var lines = items.slice(0, max).map(function (i) { return "• " + i; });
                if (items.length > max) lines.push(S.F(t("chg.more"), items.length - max));
                if (!items.length) lines.push(t("chg.empty"));
                versionTip = head + "\n\n" + lines.join("\n") + "\n\n" + click;
            }
        } else versionTip = "";
        if (verLocal) {
            if (updating) { lineVersion = "v" + verLocal + "  ·  " + t("ver.updating"); versionColor = pal.warn; }
            else if (has) { lineVersion = "v" + verLocal + "  ·  " + S.F(t("ver.available"), verLatest); versionColor = pal.warn; }
            else if (verLatest) { lineVersion = "v" + verLocal + "  ·  " + t("ver.latest"); versionColor = "#8B8B94"; }
            else { lineVersion = "v" + verLocal; versionColor = "#8B8B94"; }
        } else lineVersion = "";

        // Time of the last /usage reply; if it hasn't come for a while - say so honestly.
        if (usageAt === 0) lineStamp = "";
        else {
            var stamp = Qt.formatTime(new Date(usageAt), "HH:mm:ss");
            if ((now - usageAt) > (3 * cfg.usageIntervalSeconds + 30) * 1000) stamp = t("stale") + " · " + stamp;
            lineStamp = stamp;
        }

        // --- account ---
        var acc = account;
        if (!cfg.showAccount || !acc) lineAccount = "";
        else if (!acc.loggedIn) { lineAccount = t("acc.out"); accountColor = pal.crit; }
        else {
            lineAccount = [acc.plan, acc.email].filter(function (x) { return x; }).join("  ·  ");
            accountColor = "#52525B";
        }
    }

    onLangChanged: { updateSkyTip(); updateWidget(); }

    Timer {
        interval: Math.max(1, root.cfg.refreshSeconds) * 1000
        repeat: true; running: true; triggeredOnStart: true
        onTriggered: {
            try { root.updateWidget(); } catch (e) { root.lineStamp = root.t("error"); console.warn("clawd-usage:", e); }
        }
    }

    Component.onCompleted: updateSkyTip()
}

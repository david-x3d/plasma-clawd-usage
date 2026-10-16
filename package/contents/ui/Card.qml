import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import QtQuick.Effects
import "../code/mascot.js" as M
import "../code/sky.js" as Sky

// The window from widget.xaml, element by element, in the same units; scaled as a whole.
Item {
    id: card
    required property var app
    readonly property real k: Math.max(0.6, Math.min(4.0, app.cfg.scale))
    readonly property real pad: 14     // room for the drop shadow
    implicitWidth: (262 + 2 * pad) * k
    implicitHeight: (border.height + 2 * pad) * k
    opacity: app.cfg.opacity

    property bool hovered: hover.hovered
    property var fr: null                // last mascot frame
    property int mascotTick: 0

    HoverHandler { id: hover }

    Item {
        id: content
        width: 262 + 2 * card.pad
        height: border.height + 2 * card.pad
        transform: Scale { xScale: card.k; yScale: card.k }

        Rectangle {
            id: border
            x: card.pad; y: card.pad
            width: 262
            height: col.implicitHeight + 10 + 11 + 2
            radius: 10
            color: "#1A1A1E"
            border.color: "#33FFFFFF"
            border.width: 1
            layer.enabled: true
            layer.effect: MultiEffect {
                shadowEnabled: true
                shadowColor: Qt.rgba(0, 0, 0, 0.55)
                shadowBlur: 0.45
                shadowVerticalOffset: 2
                shadowHorizontalOffset: 1.4
                autoPaddingEnabled: true
            }
        }

        ColumnLayout {
            id: col
            x: card.pad + 13; y: card.pad + 11
            width: 236
            spacing: 0

            // ---- header ----
            Item {
                Layout.fillWidth: true
                Layout.bottomMargin: 6
                implicitHeight: Math.max(title.implicitHeight, btns.implicitHeight)
                Txt {
                    id: title
                    anchors.verticalCenter: parent.verticalCenter
                    text: "CLAUDE USAGE"; fs: 9.5; font.weight: Font.DemiBold
                }
                Row {
                    id: btns
                    anchors.right: parent.right
                    Canvas {
                        id: hearts
                        width: 3 * 9.8 + 2 * 2.5 + 12; height: 8.4
                        anchors.verticalCenter: parent.verticalCenter
                        visible: card.fr !== null && card.fr.hearts.visible && card.app.cfg.showMascot
                        renderStrategy: Canvas.Cooperative
                        onPaint: {
                            var ctx = getContext("2d");
                            ctx.reset();
                            var h = card.fr ? card.fr.hearts : null;
                            if (!h || !h.visible) return;
                            for (var i = 0; i < 3; i++) {
                                var x0 = i * (9.8 + 2.5);
                                ctx.save();
                                ctx.translate(x0 + 4.9, 4.2); ctx.scale(h.beat, h.beat); ctx.translate(-4.9, -4.2);
                                ctx.fillStyle = "#3F3F46";
                                M.HeartFull.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], r[3]); });
                                var n = h.show - 2 * i;
                                var g = n >= 2 ? M.HeartFull : n === 1 ? M.HeartHalf : [];
                                ctx.fillStyle = "#F87171";
                                g.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], r[3]); });
                                ctx.restore();
                            }
                        }
                        Tip { text: card.fr && card.fr.hearts.visible ? card.fr.hearts.tip : "" }
                    }
                    Txt {
                        text: card.app.cfg.expanded ? "▴" : "▾"; fs: 11
                        rightPadding: 9
                        Tip { text: card.app.t("ui.details"); onClicked: card.app.setDetails(!card.app.cfg.expanded) }
                    }
                    Txt {
                        text: "–"; fs: 13; rightPadding: 9
                        Tip { text: card.app.t("ui.hide"); onClicked: card.app.hideWindow() }
                    }
                    Txt {
                        text: "✕"; fs: 11
                        Tip { text: card.app.t("ui.exit"); onClicked: card.app.hideWindow() }
                    }
                }
            }

            // ---- big number, sky and Clawd ----
            Item {
                id: mainRow
                Layout.fillWidth: true
                Layout.bottomMargin: 4
                implicitHeight: pctText.implicitHeight

                Canvas {
                    id: sky
                    width: parent.width; height: parent.height + 3
                    visible: card.app.skyOn
                    renderStrategy: Canvas.Cooperative
                    onPaint: {
                        var ctx = getContext("2d");
                        Sky.step(ctx, width, height, { lang: card.app.lang, wx: card.app.wx, place: card.app.place() });
                    }
                }
                Row {
                    id: pct
                    Txt {
                        id: pctText
                        text: card.app.pctText; fs: 30; font.weight: Font.Light; color: card.app.pctColor
                    }
                    Txt { text: "%"; fs: 14; leftPadding: 2 }
                }
                Item {
                    id: mascotArea
                    x: pct.width + 10
                    width: parent.width - x
                    height: parent.height + 3
                    visible: card.app.cfg.showMascot

                    Canvas {
                        id: mascotCanvas
                        readonly property real ox: 40
                        readonly property real oy: 70
                        x: -ox; y: -oy
                        width: parent.width + 2 * ox; height: parent.height + oy + 20
                        renderStrategy: Canvas.Cooperative
                        onPaint: {
                            var ctx = getContext("2d");
                            ctx.reset();
                            var R = card.fr;
                            if (!R) return;
                            var H = mascotArea.height;
                            ctx.translate(ox, oy);
                            function rects(list, x0, y0) { list.forEach(function (r) { ctx.fillRect(x0 + r[0], y0 + r[1], r[2], r[3]); }); }
                            var mt = H - R.bottom - M.MascotH;
                            ctx.fillStyle = "#D77757"; rects(R.geo.body, R.left, mt);
                            ctx.fillStyle = "#141416"; rects(R.geo.eyes, R.left, mt);
                            ctx.fillStyle = "#6B7280"; rects(R.geo.fx, R.left, mt);
                            ctx.fillStyle = "#B8955E"; rects(R.geo.sand, R.left, mt);
                            if (R.sweat) {
                                ctx.globalAlpha = R.sweat.op; ctx.fillStyle = "#7DD3FC";
                                ctx.fillRect(R.left + R.sweat.left, mt + R.sweat.top, 3, 4.5);
                                ctx.globalAlpha = 1;
                            }
                            ctx.textBaseline = "top";
                            if (R.z) {
                                ctx.globalAlpha = R.z.op; ctx.fillStyle = "#8B8B94";
                                ctx.font = "600 " + R.z.size.toFixed(2) + "px 'Segoe UI'";
                                ctx.fillText("z", R.z.left, H - R.z.bottom - R.z.size * 1.33 + R.z.size * 0.15);
                                ctx.globalAlpha = 1;
                            }
                            if (R.bubble) {
                                ctx.fillStyle = R.bubble.color;
                                ctx.font = "bold 11px 'Segoe UI'";
                                ctx.textAlign = "center";
                                ctx.fillText(R.bubble.text, R.bubble.left + 6, H - R.bubble.bottom - 14.63 + 1.6);
                                ctx.textAlign = "left";
                            }
                            if (R.love) {
                                ctx.globalAlpha = R.love.op; ctx.fillStyle = "#F87171";
                                rects(M.HeartFull, R.love.left, H - R.love.bottom - 8.4);
                                ctx.globalAlpha = 1;
                            }
                            if (R.soul) {
                                ctx.globalAlpha = R.soul.op; ctx.fillStyle = "#F4F4F5";
                                rects(R.soul.rects, R.soul.left, R.soul.top);
                                ctx.globalAlpha = 1;
                            }
                            if (R.tag) {
                                ctx.fillStyle = "#6B7280"; ctx.font = "8px 'Segoe UI'";
                                ctx.fillText(R.tag, 0, 1);
                            }
                            R.confetti.forEach(function (c) {
                                ctx.fillStyle = c.color; ctx.fillRect(c.left, H - c.bottom - 2.5, c.w, 2.5);
                            });
                            ctx.fillStyle = "#8B8B94";
                            R.dust.forEach(function (d) {
                                ctx.globalAlpha = d.op; ctx.fillRect(d.left, H - d.bottom - 2, 2, 2);
                            });
                            ctx.globalAlpha = 1;
                        }
                    }
                }
                // Clicks and tooltips over the row: the mascot, otherwise the sky behind it.
                MouseArea {
                    id: rowMouse
                    anchors.fill: parent
                    anchors.bottomMargin: -3
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    function onMascot(mx, my) {
                        if (!card.app.cfg.showMascot || !card.fr) return false;
                        var p = mapToItem(mascotArea, mx, my);
                        var top = mascotArea.height - card.fr.bottom - M.MascotH;
                        return p.x >= card.fr.left && p.x <= card.fr.left + M.MascotW && p.y >= top && p.y <= top + M.MascotH;
                    }
                    property bool overMascot: containsMouse && onMascot(mouseX, mouseY)
                    cursorShape: overMascot ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: function (mouse) {
                        var on = onMascot(mouse.x, mouse.y);
                        if (mouse.button === Qt.RightButton) {
                            if (on || card.app.skyOn) devMenu.popup();
                        } else if (on) {
                            M.click();
                        }
                    }
                    QQC2.ToolTip.visible: containsMouse && !overMascot && card.app.skyOn && card.app.skyTip !== ""
                    QQC2.ToolTip.text: card.app.skyTip
                    QQC2.ToolTip.delay: 500
                    QQC2.ToolTip.timeout: 60000
                }
                DevMenu { id: devMenu; app: card.app }
            }

            // ---- session bar ----
            Bar { Layout.bottomMargin: 7; h: 6; r: 3; value: card.app.sessionPct; barColor: card.app.pctColor }

            Txt {
                Layout.fillWidth: true
                Layout.bottomMargin: 9
                text: card.app.lineReset; fs: 11; color: "#D4D4D8"
            }

            // ---- week ----
            Item {
                Layout.fillWidth: true; Layout.bottomMargin: 4
                implicitHeight: 13.3
                Txt { text: card.app.t("ui.week"); fs: 9; font.weight: Font.DemiBold; color: "#6B7280" }
                Txt { anchors.right: parent.right; text: card.app.lineWeek; fs: 10 }
            }
            Bar { Layout.bottomMargin: 7; h: 4; r: 2; value: card.app.weekPct; barColor: "#60A5FA" }

            // ---- Fable ----
            Item {
                Layout.fillWidth: true; Layout.bottomMargin: 4
                implicitHeight: 13.3
                visible: card.app.fablePct !== null
                Txt { text: card.app.t("ui.fable"); fs: 9; font.weight: Font.DemiBold; color: "#6B7280" }
                Txt { anchors.right: parent.right; text: card.app.lineFable; fs: 10 }
            }
            Bar { h: 4; r: 2; value: card.app.fablePct; barColor: "#A78BFA"; visible: card.app.fablePct !== null }

            // ---- sessions ----
            Item {
                Layout.fillWidth: true; Layout.topMargin: 10
                implicitHeight: 13.3
                visible: card.app.cfg.showSessions
                Txt { id: lblSess; text: card.app.t("ui.sessions"); fs: 9; font.weight: Font.DemiBold; color: "#6B7280" }
                Txt {
                    x: lblSess.width + 8; width: parent.width - x
                    horizontalAlignment: Text.AlignRight; elide: Text.ElideRight
                    text: card.app.lineSessions; fs: 10
                }
                Tip { text: card.app.sessTip; pointer: false }
            }

            // ---- service status ----
            Item {
                Layout.fillWidth: true; Layout.topMargin: 10
                implicitHeight: statusCol.implicitHeight
                visible: card.app.cfg.showStatus
                Rectangle { y: 4; width: 7; height: 7; radius: 3.5; color: card.app.statusDot }
                Column {
                    id: statusCol
                    x: 13; width: parent.width - 13
                    Txt { width: parent.width; text: card.app.lineStatus; fs: 10.5; color: card.app.statusFg; wrapMode: Text.Wrap }
                    Txt { width: parent.width; text: card.app.lineStatus2; fs: 10; wrapMode: Text.Wrap; visible: text !== "" }
                }
                Tip { text: card.app.t("ui.openStatus"); onClicked: Qt.openUrlExternally(card.app.statusUrl) }
            }

            // ---- details ----
            ColumnLayout {
                Layout.fillWidth: true; Layout.topMargin: 11
                spacing: 0
                visible: card.app.cfg.expanded
                ColumnLayout {
                    spacing: 0
                    Layout.fillWidth: true
                    visible: card.app.cfg.showStats
                    Rectangle { Layout.fillWidth: true; Layout.bottomMargin: 8; height: 1; color: "#1AFFFFFF" }
                    Txt { Layout.bottomMargin: 3; text: card.app.t("ui.day"); fs: 9; font.weight: Font.DemiBold; color: "#6B7280" }
                    Txt { Layout.fillWidth: true; Layout.bottomMargin: 2; text: card.app.lineDay; fs: 10.5; color: "#D4D4D8"; wrapMode: Text.Wrap }
                    Txt { Layout.fillWidth: true; Layout.bottomMargin: 10; text: card.app.lineDay2; fs: 10; wrapMode: Text.Wrap }
                    Txt { Layout.bottomMargin: 3; text: card.app.t("ui.week7"); fs: 9; font.weight: Font.DemiBold; color: "#6B7280" }
                    Txt { Layout.fillWidth: true; Layout.bottomMargin: 2; text: card.app.lineWeek7; fs: 10.5; color: "#D4D4D8"; wrapMode: Text.Wrap }
                    Txt { Layout.fillWidth: true; Layout.bottomMargin: 10; text: card.app.lineWeek72; fs: 10; wrapMode: Text.Wrap }
                }
                Rectangle { Layout.fillWidth: true; Layout.bottomMargin: 7; height: 1; color: "#1AFFFFFF" }
                Txt {
                    Layout.fillWidth: true
                    text: card.app.lineVersion; fs: 10; color: card.app.versionColor; wrapMode: Text.Wrap
                    Tip {
                        text: card.app.versionTip; pointer: card.app.versionTip !== ""
                        onClicked: if (card.app.versionTip !== "") card.app.startUpdate()
                    }
                }
            }

            // ---- footer ----
            Item {
                Layout.fillWidth: true; Layout.topMargin: 7
                implicitHeight: 12
                Txt {
                    width: parent.width - stamp.width - 8
                    text: card.app.lineAccount; fs: 9; color: card.app.accountColor; elide: Text.ElideRight
                    Tip { text: card.app.lineAccount; pointer: false }
                }
                Txt { id: stamp; anchors.right: parent.right; text: card.app.lineStamp; fs: 9; color: "#52525B" }
            }
        }
    }

    component Bar: Rectangle {
        property real h: 4
        property real r: 2
        property var value: null
        property color barColor
        Layout.fillWidth: true
        implicitHeight: h
        radius: r
        color: "#26FFFFFF"
        Rectangle {
            height: parent.height; radius: parent.r
            color: parent.barColor
            width: parent.value === null ? 0 : Math.max(0, Math.min(100, parent.value) / 100 * parent.width)
        }
    }

    component Tip: MouseArea {
        property string text
        property bool pointer: true
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: pointer ? Qt.PointingHandCursor : Qt.ArrowCursor
        QQC2.ToolTip.visible: containsMouse && text !== ""
        QQC2.ToolTip.text: text
        QQC2.ToolTip.delay: 500
        QQC2.ToolTip.timeout: 60000
    }

    // Mascot and sky frames. Runs only while the card is shown.
    Timer {
        id: mascotTimer
        interval: card.fr ? card.fr.ms : 90
        repeat: true
        running: card.visible && card.app.shown && card.app.cfg.showMascot
        onTriggered: {
            var mx = null;
            if (card.hovered) mx = mascotArea.mapFromItem(card, hover.point.position.x, hover.point.position.y).x;
            card.fr = M.step({ lang: card.app.lang, areaW: mascotArea.width, areaH: mascotArea.height,
                              mouseOver: card.hovered, mouseX: mx });
            mascotCanvas.requestPaint();
            hearts.requestPaint();
            if (card.app.skyOn) sky.requestPaint();
        }
    }

}

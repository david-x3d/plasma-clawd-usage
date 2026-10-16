import QtQuick
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    property alias cfg_language: language.currentValue
    property real cfg_scale
    property real cfg_opacity
    property alias cfg_warnPercent: warn.value
    property alias cfg_critPercent: crit.value
    property alias cfg_showStats: showStats.checked
    property alias cfg_showStatus: showStatus.checked
    property alias cfg_showSessions: showSessions.checked
    property alias cfg_showAccount: showAccount.checked
    property alias cfg_showMascot: showMascot.checked
    property alias cfg_showSky: showSky.checked
    property alias cfg_weatherLat: lat.text
    property alias cfg_weatherLon: lon.text
    property alias cfg_refreshSeconds: refresh.value
    property alias cfg_usageIntervalSeconds: usageI.value
    property alias cfg_versionIntervalSeconds: versionI.value
    property alias cfg_statusIntervalSeconds: statusI.value
    property alias cfg_accountIntervalSeconds: accountI.value
    property alias cfg_weatherIntervalSeconds: weatherI.value
    property bool cfg_expanded

    Kirigami.FormLayout {
        QQC2.ComboBox {
            id: language
            Kirigami.FormData.label: "Language:"
            textRole: "text"; valueRole: "value"
            model: [{ text: "English", value: "en" }, { text: "Русский", value: "ru" }]
        }
        QQC2.SpinBox {
            Kirigami.FormData.label: "Scale (%):"
            from: 60; to: 400; stepSize: 10
            value: Math.round(cfg_scale * 100)
            onValueModified: cfg_scale = value / 100
        }
        QQC2.SpinBox { Kirigami.FormData.label: "Opacity (%):"; from: 10; to: 100; value: Math.round(cfg_opacity * 100); onValueModified: cfg_opacity = value / 100 }
        QQC2.SpinBox { id: warn; Kirigami.FormData.label: "Yellow at %:"; from: 1; to: 100 }
        QQC2.SpinBox { id: crit; Kirigami.FormData.label: "Red at %:"; from: 1; to: 100 }
        QQC2.CheckBox { id: showStats; Kirigami.FormData.label: "Show:"; text: "24h / 7 days stats" }
        QQC2.CheckBox { id: showStatus; text: "Service status" }
        QQC2.CheckBox { id: showSessions; text: "Sessions" }
        QQC2.CheckBox { id: showAccount; text: "Account" }
        QQC2.CheckBox { id: showMascot; text: "Clawd" }
        QQC2.CheckBox { id: showSky; text: "Sky and weather" }
        QQC2.TextField { id: lat; Kirigami.FormData.label: "Weather latitude:"; placeholderText: "by IP" }
        QQC2.TextField { id: lon; Kirigami.FormData.label: "Weather longitude:"; placeholderText: "by IP" }
        QQC2.SpinBox { id: refresh; Kirigami.FormData.label: "Refresh, s:"; from: 1; to: 3600 }
        QQC2.SpinBox { id: usageI; Kirigami.FormData.label: "/usage every, s:"; from: 10; to: 86400 }
        QQC2.SpinBox { id: versionI; Kirigami.FormData.label: "Version check every, s:"; from: 60; to: 86400 }
        QQC2.SpinBox { id: statusI; Kirigami.FormData.label: "Status every, s:"; from: 30; to: 86400 }
        QQC2.SpinBox { id: accountI; Kirigami.FormData.label: "Account every, s:"; from: 30; to: 86400 }
        QQC2.SpinBox { id: weatherI; Kirigami.FormData.label: "Weather every, s:"; from: 60; to: 86400 }
    }
}

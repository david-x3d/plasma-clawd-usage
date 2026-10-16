import QtQuick
import QtQuick.Controls as QQC2
import "../code/mascot.js" as M
import "../code/sky.js" as Sky
import "../code/parse.js" as P

// Right-click on the mascot: developer mode (lib/mascot-menu.ps1). State holds until "Auto".
QQC2.Menu {
    id: menu
    required property var app
    property int rev: 0          // bumped on open: re-evaluates the check marks
    onAboutToShow: rev++

    function t(k) { return app.t(k); }
    function skyChanged() { Sky.Sky.key = ""; app.updateSkyTip(); }

    QQC2.MenuItem { text: menu.t("mm.head"); enabled: false }
    QQC2.MenuSeparator {}
    QQC2.MenuItem {
        text: menu.t("mm.auto"); checkable: true
        checked: menu.rev >= 0 && !M.Mz.force && !M.Mz.forceCrit && M.Mz.demo < 0 && M.Mz.forceHearts === null
        onTriggered: {
            M.stopDemo();
            M.Mz.forceHearts = null;
            Sky.Sky.force = null; Sky.Sky.forceWx = null;
            menu.skyChanged();
        }
    }
    QQC2.Menu {
        id: mStates
        title: menu.t("mm.state")
        Instantiator {
            onObjectAdded: (i, o) => mStates.insertItem(i, o)
            model: M.MascotMoods
            QQC2.MenuItem {
                text: menu.t("mood." + modelData); checkable: true
                checked: menu.rev >= 0 && M.Mz.demo < 0 && M.Mz.force === modelData
                onTriggered: { M.stopDemo(); M.Mz.force = modelData; }
            }
        }
    }
    QQC2.Menu {
        id: mActs
        title: menu.t("mm.anim")
        Instantiator {
            onObjectAdded: (i, o) => mActs.insertItem(i, o)
            model: M.ActOrder
            QQC2.MenuItem { text: menu.t("act." + modelData); onTriggered: M.startAct(modelData) }
        }
    }
    QQC2.MenuItem {
        text: menu.t("mm.sweat"); checkable: true
        checked: menu.rev >= 0 && M.Mz.forceCrit
        onTriggered: M.Mz.forceCrit = checked
    }
    QQC2.Menu {
        id: mHearts
        title: menu.t("mm.hearts")
        Instantiator {
            onObjectAdded: (i, o) => mHearts.insertItem(i, o)
            model: [[-1, ""], [6, "3"], [5, "2½"], [4, "2"], [3, "1½"], [2, "1"], [1, "½"], [0, "0"]]
            QQC2.MenuItem {
                text: modelData[0] < 0 ? menu.t("mm.byLimit") : modelData[1]
                checkable: true
                checked: menu.rev >= 0 && modelData[0] === ((M.Mz.forceHearts === null || M.Mz.drainT >= 0) ? -1 : M.Mz.forceHearts)
                onTriggered: {
                    if (M.Mz.drainT >= 0) M.stopDemo();
                    M.Mz.forceHearts = modelData[0] < 0 ? null : modelData[0];
                }
            }
        }
        QQC2.MenuSeparator {}
        QQC2.MenuItem { text: menu.t("mm.drain"); onTriggered: { M.stopDemo(); M.Mz.drainT = 0; } }
    }
    QQC2.Menu {
        title: menu.t("mm.sky")
        id: mSky
        enabled: menu.app.skyOn
        Instantiator {
            id: phases
            onObjectAdded: (i, o) => mSky.insertItem(i, o)
            model: [""].concat(Sky.SkyPhases)
            QQC2.MenuItem {
                text: modelData === "" ? menu.t("mm.byClock") : menu.t("phase." + modelData)
                checkable: true
                checked: menu.rev >= 0 && (Sky.Sky.force || "") === modelData
                onTriggered: { Sky.Sky.force = modelData === "" ? null : modelData; menu.skyChanged(); }
            }
        }
        QQC2.MenuSeparator {}
        Instantiator {
            onObjectAdded: (i, o) => mSky.insertItem(phases.count + 1 + i, o)
            model: [-1, 0, 2, 3, 45, 53, 63, 82, 95, 73]
            QQC2.MenuItem {
                text: modelData < 0 ? menu.t("mm.wxLive") : P.weatherKind(menu.app.lang, modelData).name
                checkable: true
                checked: menu.rev >= 0 && modelData === (Sky.Sky.forceWx === null ? -1 : Sky.Sky.forceWx)
                onTriggered: { Sky.Sky.forceWx = modelData < 0 ? null : modelData; menu.skyChanged(); }
            }
        }
    }
    QQC2.MenuSeparator {}
    QQC2.MenuItem {
        text: menu.t("mm.demo"); checkable: true
        checked: menu.rev >= 0 && M.Mz.demo >= 0
        onTriggered: { M.stopDemo(); M.Mz.demo = 0; }
    }
}

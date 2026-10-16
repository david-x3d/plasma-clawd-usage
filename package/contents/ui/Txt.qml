import QtQuick

// TextBlock from widget.xaml: Segoe UI, sizes in the same units, the same line height.
Text {
    property real fs: 10
    font.family: "Segoe UI"
    font.pixelSize: fs
    lineHeightMode: Text.FixedHeight
    lineHeight: fs * 1.33
    renderType: Text.QtRendering
    color: "#8B8B94"
}

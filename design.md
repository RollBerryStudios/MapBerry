# RollBerry Suite Design: MapBerry

Status: verbindliche Umsetzungsvorgabe
Geltungsbereich: MapBerry
Datum: 2026-05-06

Diese Datei definiert die konkrete Design- und Abnahmevorgabe für MapBerry. Sie ergänzt die bestehenden RollBerry-Suite-Vorgaben für BardBerry, NoteBerry, CharBerry und BoltBerry und macht MapBerry zu einem konsistenten Mitglied derselben App-Familie.

## Zielbild

MapBerry ist der fokussierte Karten- und Fog-of-War-Arbeitsplatz der RollBerry Suite. Die App bleibt lokal, schnell und spielabendtauglich: Karte importieren, Grid kalibrieren, Räume/Wände/Zeichnungen verwalten, Spielerfenster steuern.

Das UI orientiert sich an Apples Human Interface Guidelines: klare Hierarchie, ruhige Flächen, kompakte Toolbars, eindeutige Controls, sichtbares Feedback, keyboard- und screenreaderfreundliche Beschriftung. MapBerry kopiert macOS nicht blind, sondern nutzt HIG als Qualitätsmaßstab.

## Nicht Verhandelbar

1. Deutsch ist die Standardsprache.
2. Dark Mode ist der Standardmodus.
3. Oben rechts gibt es einen Settings-Button mit Zahnrad-Icon.
4. Settings enthalten Sprache, Theme, GitHub-Link, RollBerry Studios und Kontaktmail `kontakt@rollberry.de`.
5. MapBerry nutzt dasselbe RollBerry-Basisdesign wie BardBerry, NoteBerry, CharBerry und BoltBerry.
6. Unterschiede sind nur Logo, MapBerry-Akzentpalette und kartenspezifische Workflows.
7. Keine dekorativen Gradient-Orbs, Bokeh-Flächen, Marketing-Heroes oder Karten-in-Karten.
8. Alle Iconbuttons haben `aria-label`, `title`, sichtbaren Fokus und stabile quadratische Maße.
9. Keine Texte dürfen bei 390 px, 700 px, 900 px, 1280 px oder 1440 px Breite abgeschnitten oder überlappt werden.
10. Canvas, Tooldock, Fog-Controls und Sidepanels müssen auch bei kleinen Viewports erreichbar bleiben.
11. Bestehende Kartenbibliotheken und Assets dürfen durch Designänderungen nicht migriert oder verändert werden.

## App-Struktur

- Titlebar: Logo, App-Name, aktueller Kartenname, Settings und Datenordner.
- Primary Toolbar: Karte importieren, Spielerfenster, Blackout, Spielerrahmen, Monitorauswahl.
- Linkes Panel: Kartenliste und Grid-/Kartenoptionen.
- Content Area: Canvas als primäre Arbeitsfläche, Tooldock über dem Canvas.
- Rechtes Panel: aktives Werkzeug, Nebelpinsel, Räume, Wände, Zeichnungen.
- Settings Modal: Split-View mit Darstellung links und RollBerry-/Kontaktinfos rechts.
- Player Window: schwarze, störungsfreie Ausgabe für Spielende.

## Tokens Und Palette

MapBerry verwendet `src/renderer/styles/rollberry-tokens.css` und importiert diese Datei am Anfang von `src/renderer/styles.css`.

MapBerry-Palette:

```css
:root {
  --rb-app-accent: #66c26f;
  --rb-app-accent-2: #e0b24a;
  --rb-app-focus: #5bc6c8;
}
```

Die Light-Variante wird nur über `[data-theme="light"]` aktiviert. Dark bleibt Default.

## Layout-Regeln

- Desktop: drei Spalten mit linker Navigation, Canvas, rechtem Inspector.
- 900 bis 1180 px: Sidepanels werden schmaler, Canvas bleibt priorisiert.
- Unter 760 px: Layout stapelt sich vertikal; Canvas bekommt eine feste Mindesthöhe; Tooldock darf horizontal scrollen.
- Topbar darf umbrechen, aber keine Buttons überdecken.
- Floating Fog Controls dürfen umbrechen und müssen innerhalb des Canvas bleiben.
- Tool-Popovers dürfen nicht außerhalb der sichtbaren Fläche abgeschnitten werden.

## Canvas-Linienstärken

- Räume werden wie in BoltBerry polygonal gesetzt: Klick fügt einen gerundeten Punkt hinzu, die Vorschaukante folgt der Maus, der Pfad schließt visuell zum Startpunkt, Enter oder Doppelklick finalisiert, Escape bricht ab.
- Raumkonturen bleiben zoomunabhängig: 1.5 px normal, 2 px ausgewählt, 2 px in der Vorschau, mit sichtbaren Vertex-Markern.
- Wände und Türen bleiben zoomunabhängig bei 4 px; offene Türen verwenden eine fein gestrichelte Linie.
- Fog-, Mess- und Struktur-Vorschauen bleiben zoomunabhängig bei 2 px.
- Grid-Stärke ist ein Screen-Pixel-Wert und darf beim Zoomen nicht sichtbar anwachsen.
- Freie Zeichnungen, Rechtecke und Kreise behalten die vom Nutzer gewählte Stärke, werden aber visuell auf 1.5 bis 12 Screen-Pixel begrenzt, damit hohe Zoomstufen keine Inhalte verdecken.
- Host-Canvas und Player-Window müssen dieselben Strichstärkenregeln verwenden.
- Es darf immer nur eine Canvas-Entität aktiv ausgewählt sein: Raum, Wand oder Zeichnung. Eine neue Auswahl hebt die vorherige Kategorieauswahl auf.

## Settings

Pflichtinhalte:

- Sprache: Deutsch, English
- Design: Dunkel, Hell
- Kontakt: `kontakt@rollberry.de`
- GitHub: `https://github.com/RollBerryStudios/MapBerry`
- RollBerry Studios: `https://github.com/RollBerryStudios`

Settings werden per `localStorage` gespeichert:

- `mapberry-locale`
- `mapberry-theme`

## Abnahmeplan

1. `npm run build` muss ohne TypeScript- oder Vite-Fehler laufen.
2. Playwright muss Settings mit deutschen Dark-Defaults prüfen.
3. Playwright muss Sprache und Theme umschalten und Persistenz über Reload prüfen.
4. Playwright muss Desktop-, Responsive- und Mobile-Screenshots erzeugen.
5. Layout-Assertions müssen horizontales Overflow, abgeschnittene Buttons/Inputs/Selects und unerwartete Überlappungen prüfen.
6. Player-Window-, Canvas-, Fog-, Room-, Wall- und Import-Workflows bleiben unverändert grün.
7. `git diff --check` muss sauber sein.
8. Nach erfolgreicher Abnahme werden Änderungen committed und direkt gepusht.

<p align="center">
  <img src="resources/MapBerry.png" alt="MapBerry Logo" width="220">
</p>

<h1 align="center">MapBerry</h1>

<p align="center">
  <strong>Lokale Karten-App für Pen-&amp;-Paper-Runden</strong><br>
  <em>Local-first map table for tabletop RPG sessions</em>
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-yellow.svg">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue.svg">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white">
  <img alt="Local First" src="https://img.shields.io/badge/local--first-offline-brightgreen.svg">
</p>

<p align="center">
  <a href="#deutsch">Deutsch</a> &nbsp;|&nbsp; <a href="#english">English</a>
</p>

---

## Deutsch

MapBerry ist eine **kostenlose, quelloffene Desktop-App für lokale Battlemap-
und Tabletop-Kartensteuerung**. Sie ist für Spielleiter gebaut, die eine
leichte Alternative zu großen VTTs suchen: Karte laden, Raster einstellen,
Fog of War steuern, Räume markieren und die Spieleransicht auf einen zweiten
Bildschirm schicken.

MapBerry nimmt die Kartenfunktionen aus BoltBerry und macht daraus ein
eigenständiges, fokussiertes Werkzeug. Keine Token, keine Musik, kein Wiki,
keine Charakterbögen, keine Kampagnenverwaltung. Nur Karte.

- **DM-Fenster** - die Arbeitsansicht für Karte, Grid, Nebel, Räume und Notizen
- **Spielerfenster** - synchronisierte Kartenansicht für Beamer oder zweiten Monitor
- **Grid-Werkzeuge** - Quadrat-/Hex-Raster, Größe, Offset, Dicke, Sichtbarkeit und Schwarz/Weiß-Farbe
- **Fog of War** - Pinsel, Rechteck, Polygon, alles aufdecken und alles verdecken
- **Räume, Wände, Türen** - semantische Bereiche und einfache Strukturmarker
- **Malen** - Freihand, Rechteck, Kreis, Text und Radierer mit klassischer Zeichenpalette
- **Live-Spielerinfos** - Text-/Bild-Handouts, Hinweise, Alarme und Countdown-Timer mit frei wählbarer Player-Position
- **Local-first** - Karten und Szenendaten bleiben auf deinem Rechner

Gebaut mit Electron, React, TypeScript, Vite, Konva und Playwright. Läuft auf
macOS, Windows und Linux.

### Aktueller Stand

Aktuelle Version: **0.1.0**

MapBerry ist im initialen Stand als eigenständige Karten-App verfügbar. Die
App enthält ein Demo-Map-Asset, lokale Kartenimporte, DM-/Spielerfenster,
eine unten zentrierte Werkzeugleiste mit Kontextmenüs und eine
Playwright/Electron-Test-Suite für die wichtigsten Karten- und Live-Workflows.

### Features

| Kategorie | Funktion |
|---|---|
| **Kartenimport** | Lokale `.png`, `.jpg`, `.jpeg` und `.webp` Karten importieren |
| **Demo Map** | Beim ersten Start wird eine Demo-Karte aus `resources/demo-map.png` angelegt |
| **DM-Fenster** | Kartenverwaltung, Grid-Grunddaten, Werkzeugleiste und Objektlisten |
| **Spielerfenster** | Separates Fenster für zweiten Monitor, Beamer oder Stream-Layout |
| **Spielerrahmen** | Begrenzte Player-Ansicht mit Größensteuerung, Rotation und Drag auf der Karte |
| **Grid** | Quadrat oder Hex, Größe, Offset X/Y, Dicke, Sichtbarkeit, Schwarz/Weiß-Farbe |
| **Fog of War** | Aufdecken und Verdecken per Pinsel, Rechteck oder Polygon |
| **Räume** | Polygonräume mit Sichtbarkeitsstatus und Notizen |
| **Wände & Türen** | Linienbasierte Strukturmarker für Kartenorganisation |
| **Zeichnungen** | Freihand, Rechteck, Kreis, Text und Radierer; optional für Spieler sichtbar |
| **Toolbar** | Unten zentrierte Werkzeugleiste mit Untermenüs für Ansicht, Nebel, Malen, Räume und Grid |
| **Live-Toolbar** | Text-/Bild-Handouts pro Karte, Nachrichten, Alarme und Timer als Overlays im Spielerfenster |
| **Overlay-Layout** | Positionen in Mitte, Richtung oder Rand sowie beidseitige Spiegelung links/rechts oder oben/unten |
| **Lokale Daten** | JSON-Library und importierte Karten im lokalen Electron-AppData-Verzeichnis |
| **Sicherheit** | Lokale Assets werden über ein eingeschränktes `local-asset` Protokoll ausgeliefert |
| **E2E-Tests** | Playwright/Electron prüft Import, Persistenz, Tools, Spielerfenster, Live-Overlays und Asset-Schutz |

### Schnellstart

**Voraussetzungen:** Node.js 20+ und npm 10+

```bash
git clone https://github.com/RollBerryStudios/MapBerry.git
cd MapBerry
npm install
npm run dev
```

### Builds erstellen

```bash
npm run build      # TypeScript + Preload + Renderer kompilieren
npm run pack       # Entpacktes App-Verzeichnis für die aktuelle Plattform
npm run dist       # Installer/Distributionspakete für die aktuelle Plattform
```

Die Build-Konfiguration liegt in `electron-builder.yml`.

| Plattform | Ziel |
|---|---|
| macOS | `.dmg` und `.zip` für x64/arm64 |
| Windows | NSIS Installer für x64 |
| Linux | `.AppImage` und `.deb` für x64 |

### Qualitätssicherung

```bash
npm run test:e2e          # Build + Playwright/Electron E2E-Suite
npm run test:e2e:headed   # Gleiche Suite mit sichtbarem Fenster
```

Die E2E-Suite startet MapBerry mit isolierten Testdaten und prüft
Kartenimport, Demo-Map, Grid-Persistenz, Werkzeug-Interaktionen,
Fog-of-War-Änderungen, Spielerfenster-Sync, Blackout, Player-Viewport,
Text-/Bild-Handouts, Nachrichten, Alarme, Timer, Overlay-Positionierung,
beidseitige Spiegelung und Asset-Traversal-Schutz.

### Lokale Daten

MapBerry speichert seine Daten im Electron-AppData-Verzeichnis:

```text
data/mapberry-library.json
assets/maps/
```

Die Library wird beim Laden normalisiert, damit ältere oder beschädigte Daten
die Oberfläche nicht brechen. Importierte Karten werden in den lokalen
App-Daten abgelegt und nicht aus ihrem Ursprungsordner referenziert.

### Projektstruktur

```text
src/
  main.ts                 Electron Main-Prozess, Fenster, IPC und lokale Persistenz
  preload/                Sichere Context Bridge für DM- und Player-APIs
  renderer/               React/Konva-App für DM- und Spielerfenster
    App.tsx               DM-Oberfläche, Toolbar, Canvas und Sidepanels
    PlayerApp.tsx         Spielerfenster-Rendering
    lib/                  Fog, Bilder, Geometrie und Karten-Helfer
  shared/                 Gemeinsame Typen und Grid-Helfer
tests/e2e/                Playwright Electron QA-Suite
resources/                Logo und Demo-Karte
```

### Tech-Stack

| Technologie | Verwendung |
|---|---|
| Electron 41 | Desktop-Shell, native Dialoge und zweites Fenster |
| React 18 | Benutzeroberfläche |
| TypeScript 5.9 | Typisierte App-Logik |
| Vite 6 | Renderer-Bundling |
| Konva / react-konva | Canvas-Rendering für Karte, Grid, Fog und Zeichnungen |
| Playwright | Electron E2E-Tests |
| electron-builder | Packaging für macOS, Windows und Linux |

### Beziehung zu BoltBerry

MapBerry ist kein Ersatz für BoltBerry als vollständiges VTT. Es ist die
leichte Karten-Variante für Gruppen, die keine Tokenverwaltung, Musik,
Kompendien oder Charakterbögen brauchen. Wer den kompletten Werkzeugkasten
möchte, nutzt [BoltBerry](https://github.com/RollBerryStudios/BoltBerry).

### Lizenz

App-Code: [MIT](LICENSE) (c) 2026 RollBerry Studios.

---

## English

MapBerry is a **free, open-source desktop app for local battlemap and tabletop
map control**. It is built for game masters who want a lightweight alternative
to large VTTs: load a map, align the grid, control fog of war, mark rooms, and
send the player view to a second screen.

MapBerry takes the map workflow from BoltBerry and turns it into a focused
standalone tool. No tokens, no music, no wiki, no character sheets, no campaign
suite. Just the map.

- **DM window** - the work surface for maps, grid, fog, rooms, and notes
- **Player window** - synced map view for a projector, second monitor, or stream layout
- **Grid tools** - square/hex grid, size, offset, thickness, visibility, and black/white color
- **Fog of War** - brush, rectangle, polygon, reveal all, and cover all
- **Rooms, walls, doors** - semantic map areas and simple structure markers
- **Drawing** - freehand, rectangle, circle, text, and eraser with a classic drawing palette
- **Live player info** - text/image handouts, messages, alerts, and countdown timers with configurable player-window placement
- **Local-first** - maps and scene data stay on your machine

Built with Electron, React, TypeScript, Vite, Konva, and Playwright. Runs on
macOS, Windows, and Linux.

### Current State

Current version: **0.1.0**

MapBerry is available as an initial standalone map app. It ships a demo map
asset, local map imports, DM/player windows, a bottom-centered toolbar with
context menus, and a Playwright/Electron test suite for the core map and live workflows.

### Features

| Category | What you get |
|---|---|
| **Map import** | Import local `.png`, `.jpg`, `.jpeg`, and `.webp` maps |
| **Demo Map** | First launch creates a demo map from `resources/demo-map.png` |
| **DM Window** | Map management, grid basics, toolbar, and object lists |
| **Player Window** | Separate window for a second monitor, projector, or stream layout |
| **Player Viewport** | Bounded player view with size controls, rotation, and drag on the map |
| **Grid** | Square or hex, size, X/Y offset, thickness, visibility, black/white color |
| **Fog of War** | Reveal and cover with brush, rectangle, or polygon tools |
| **Rooms** | Polygon rooms with visibility state and notes |
| **Walls & Doors** | Line-based structure markers for map organization |
| **Drawings** | Freehand, rectangle, circle, text, and eraser; optionally visible to players |
| **Toolbar** | Bottom-centered toolbar with submenus for view, fog, drawing, rooms, and grid |
| **Live Toolbar** | Per-map text/image handouts, messages, alerts, and timers as player-window overlays |
| **Overlay Layout** | Center, directional, edge, and mirrored left/right or top/bottom placement |
| **Local Data** | JSON library and imported maps in the local Electron app data folder |
| **Security** | Local assets are served through a restricted `local-asset` protocol |
| **E2E Tests** | Playwright/Electron covers import, persistence, tools, player window, live overlays, and asset protection |

### Getting Started

**Prerequisites:** Node.js 20+ and npm 10+

```bash
git clone https://github.com/RollBerryStudios/MapBerry.git
cd MapBerry
npm install
npm run dev
```

### Building

```bash
npm run build      # Compile TypeScript, preload, and renderer
npm run pack       # Build an unpacked app directory for the current platform
npm run dist       # Build distributable packages for the current platform
```

Packaging is configured in `electron-builder.yml`.

| Platform | Target |
|---|---|
| macOS | `.dmg` and `.zip` for x64/arm64 |
| Windows | NSIS installer for x64 |
| Linux | `.AppImage` and `.deb` for x64 |

### Quality Assurance

```bash
npm run test:e2e          # Build + Playwright/Electron E2E suite
npm run test:e2e:headed   # Same suite with a visible window
```

The E2E suite launches MapBerry with isolated test data and validates map
import, demo map creation, grid persistence, tool interactions, fog-of-war
changes, player window sync, blackout, player viewport, text/image handouts,
messages, alerts, timers, overlay placement, mirrored layouts, and asset
traversal protection.

### Local Data

MapBerry stores its data in the Electron app data folder:

```text
data/mapberry-library.json
assets/maps/
```

The library is normalized on load so older or damaged data cannot break the UI.
Imported maps are copied into local app data instead of being referenced from
their original folder.

### Project Structure

```text
src/
  main.ts                 Electron main process, windows, IPC, and persistence
  preload/                Safe context bridge for DM and player APIs
  renderer/               React/Konva app for DM and player windows
    App.tsx               DM interface, toolbar, canvas, and side panels
    PlayerApp.tsx         Player window rendering
    lib/                  Fog, images, geometry, and map helpers
  shared/                 Shared types and grid helpers
tests/e2e/                Playwright Electron QA suite
resources/                Logo and demo map
```

### Tech Stack

| Technology | Usage |
|---|---|
| Electron 41 | Desktop shell, native dialogs, and second window |
| React 18 | User interface |
| TypeScript 5.9 | Typed app logic |
| Vite 6 | Renderer bundling |
| Konva / react-konva | Canvas rendering for map, grid, fog, and drawings |
| Playwright | Electron E2E tests |
| electron-builder | Packaging for macOS, Windows, and Linux |

### Relationship to BoltBerry

MapBerry is not a replacement for BoltBerry as a full VTT. It is the lightweight
map-only sibling for groups that do not need token management, music,
compendiums, or character sheets. For the full toolkit, use
[BoltBerry](https://github.com/RollBerryStudios/BoltBerry).

### License

App code: [MIT](LICENSE) (c) 2026 RollBerry Studios.

# ELO AS PDF Import Service

Ein ELO Automation Services (AS) Skript zum automatischen Import von PDF-Dateien aus dem Dateisystem ins ELO Archiv.

## Funktionen

- **Automatischer PDF-Import**: Überwacht ein Verzeichnis und importiert neue PDF-Dateien automatisch
- **Metadaten-Zuordnung**: Weist importierten Dokumenten die Metadaten-Maske "Eingangsrechnung" zu
- **Workflow-Start**: Startet automatisch den Workflow mit Template "dps.invoice.Base" für jedes importierte Dokument
- **Intervall-basierte Ausführung**: Läuft alle 30 Sekunden
- **Fehlerbehandlung**: Verschiebt fehlerhafte Dateien in ein separates Verzeichnis
- **Logging**: Umfassendes Logging für Monitoring und Debugging

## Installation

### Voraussetzungen

- ELO Digital Office Server mit Automation Services
- Berechtigung zum Erstellen von AS-Skripten
- Zugriff auf das ELO Archiv mit entsprechenden Rechten
- Metadaten-Maske "Eingangsrechnung" muss im System vorhanden sein
- Workflow-Template "dps.invoice.Base" muss verfügbar sein

### Setup

1. **Verzeichnisse erstellen**:
   ```
   C:\temp\pdf_import\          (Quellverzeichnis für PDF-Dateien)
   C:\temp\pdf_import\processed\ (Verarbeitete Dateien)
   C:\temp\pdf_import\error\     (Fehlerhafte Dateien)
   ```

2. **ELO AS Skript installieren**:
   - Kopieren Sie `PDFImportService.js` in das ELO AS Skript-Verzeichnis
   - Registrieren Sie das Skript in der ELO Administration

3. **Konfiguration anpassen**:
   - Bearbeiten Sie die Konfigurationsvariablen in `PDFImportService.js` oder nutzen Sie `config.json`
   - Passen Sie Pfade, Masken und Workflow-Templates an Ihre Umgebung an

## Konfiguration

### Hauptkonfiguration (in PDFImportService.js)

```javascript
var CONFIG = {
    SOURCE_DIR: "C:\\temp\\pdf_import",           // Quellverzeichnis
    ARCHIVE_PATH: "¶Eingangsrechnungen",          // ELO Archivpfad
    METADATA_MASK: "Eingangsrechnung",            // Metadaten-Maske
    WORKFLOW_TEMPLATE: "dps.invoice.Base",        // Workflow-Template
    PROCESSED_DIR: "C:\\temp\\pdf_import\\processed", // Verarbeitete Dateien
    ERROR_DIR: "C:\\temp\\pdf_import\\error",       // Fehlerhafte Dateien
    INTERVAL: 30000                               // Intervall in ms (30 Sek.)
};
```

### Erweiterte Konfiguration (config.json)

Die `config.json` Datei bietet zusätzliche Konfigurationsmöglichkeiten:

- **Dateifilter**: Einschränkung auf bestimmte Dateierweiterungen und -größen
- **Logging-Einstellungen**: Anpassung des Log-Levels
- **Verbindungsparameter**: Timeout und Retry-Einstellungen

## Verwendung

1. **PDF-Dateien bereitstellen**:
   - Kopieren Sie PDF-Dateien in das konfigurierte Quellverzeichnis
   - Das Skript erkennt neue Dateien automatisch alle 30 Sekunden

2. **Monitoring**:
   - Überprüfen Sie die ELO AS Logs für Statusmeldungen
   - Verarbeitete Dateien werden in den `processed` Ordner verschoben
   - Fehlerhafte Dateien landen im `error` Ordner

3. **Workflow-Verfolgung**:
   - Gestartete Workflows können in der ELO Workflow-Übersicht verfolgt werden
   - Jedes importierte Dokument erhält automatisch den konfigurierten Workflow

## Funktionsweise

### Import-Prozess

1. **Datei-Erkennung**: Skript scannt das Quellverzeichnis nach PDF-Dateien
2. **ELO-Import**: 
   - Erstellt neuen Sord im konfigurierten Archivpfad
   - Weist Metadaten-Maske "Eingangsrechnung" zu
   - Lädt PDF-Datei als Dokumentversion hoch
3. **Workflow-Start**: Startet Workflow "dps.invoice.Base" für das Dokument
4. **Datei-Verwaltung**: Verschiebt verarbeitete Datei in `processed` Verzeichnis

### Fehlerbehandlung

- **Verbindungsfehler**: Retry-Mechanismus für ELO-Verbindungen
- **Datei-Fehler**: Fehlerhafte Dateien werden in `error` Verzeichnis verschoben
- **Workflow-Fehler**: Werden geloggt, Import wird trotzdem abgeschlossen
- **Umfassendes Logging**: Alle Aktionen und Fehler werden protokolliert

## Troubleshooting

### Häufige Probleme

1. **Dateien werden nicht importiert**:
   - Prüfen Sie Verzeichnisberechtigungen
   - Kontrollieren Sie ELO-Verbindung und Anmeldedaten
   - Überprüfen Sie AS-Skript Status

2. **Metadaten-Maske nicht gefunden**:
   - Stellen Sie sicher, dass "Eingangsrechnung" Maske existiert
   - Prüfen Sie Schreibweise und Berechtigung

3. **Workflow startet nicht**:
   - Kontrollieren Sie Template-Name "dps.invoice.Base"
   - Prüfen Sie Workflow-Berechtigungen
   - Überprüfen Sie Template-Verfügbarkeit

### Log-Analyse

```
INFO: Starting PDF import process...
INFO: Found 3 PDF files to process
INFO: Processing file: rechnung_001.pdf
INFO: Successfully processed file: rechnung_001.pdf (Sord ID: 12345)
INFO: Starting workflow for Sord ID: 12345
INFO: Workflow started successfully for Sord ID: 12345
```

## Wartung

- **Regelmäßige Überwachung**: Kontrollieren Sie Logs und verarbeitete Dateien
- **Verzeichnis-Cleanup**: Leeren Sie regelmäßig `processed` und `error` Verzeichnisse
- **Performance-Monitoring**: Überwachen Sie Systemlast bei hohem Dateiaufkommen

## Anpassungen

Das Skript kann für verschiedene Szenarien angepasst werden:

- **Andere Dateiformate**: Erweitern Sie die Dateifilter
- **Verschiedene Masken**: Implementieren Sie dynamische Maskenzuordnung
- **Mehrere Workflows**: Fügen Sie Logik für verschiedene Workflow-Templates hinzu
- **Erweiterte Metadaten**: Implementieren Sie automatische Metadatenextraktion

## Support

Bei Problemen oder Fragen:

1. Überprüfen Sie die ELO AS Logs
2. Kontrollieren Sie die Konfiguration
3. Testen Sie die ELO-Verbindung
4. Wenden Sie sich an Ihren ELO-Administrator

---

**Version**: 1.0  
**Kompatibilität**: ELO Digital Office 20.x+  
**Lizenz**: Unternehmensintern
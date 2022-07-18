# ioBroker-Script: Adapter Instances Watcher

Ein Script (in JS, also JavaScript) für den ioBroker [JavaScript-Adapter](https://github.com/iobroker/ioBroker.javascript/)) geschrieben. 

## Über dieses Script

### Warum dieses Script, Use Case
Der Auslöser für mich für dieses Script war, dass ich zuverlässig Datenpunkte brauchte, die mir anzeigen, ob eine Adapter-Instanz "läuft".

Nur so einfach ist das ganze nicht:
Es gibt hauptsächlich Daemon-Adapter und Schedule-Adapter ([Link](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/objectsschema.md#instance), aber auch weitere, die ich hier aber nicht neher betrachte. 

Daemon-Adapter sind etwa alexa2, cloud, hue. Schedule-Adapter sind z.B. daswetter, feiertage, ical.

Ob ein Daemon-Adapter läuft, sieht man in den Datenpunkten (Beispiel: **cloud**, Instanz **0**) `system.adapter.cloud.0.alive` und `system.adapter.cloud.0.connected`. Außerdem noch über die Objekteigenschaften von `system.adapter.cloud.0`, dort zeigt `common:enabled` an, ob die Instanz überhaupt ein- oder ausgeschaltet ist. Zudem bauen noch manche Adapter eine Verbindung zu einem Gerät oder Service auf, hier gibt es dann etwa noch den Datenpunkt `cloud.0.info.connection`. Dies machen aber nicht alle Daemon-Adapter.

Schedule-Adapter verhalten sich ganz anders. Diese werden gemäß Zeitplan ("Schedule") regelmäßig neu gestartet und rufen dann z.B. Wetterdaten ab, also etwa im Fall vom Adapter **daswetter**. Um hier zu wissen, ob der Adapter "aktiv und zuverlässig läuft", ist es wichtig, dass der Adapter angeschaltet ist (sichtbar über Objekteigenschaften von `system.adapter.daswetter.0`, `common:enabled` auf `true`), und dass der letzte Zeitplan auch gelaufen ist. Wir wollen schließlich keine alten Wetterdaten am Tablet sehen.

### Was dieses Script macht
Kurz zusammengefasst:
 * Für jede Adapter-Instanz gibt es u.a. einen Datenpunkt wie etwa `0_userdata.0.System.Adapter-Instanzen.cloud_0.isFunctioning`, der auf `true` gesetzt ist, sobald Instanz eingeschaltet und verbunden ist, und auch – falls Verbindung mit Gerät/Service – auch diese Verbindung steht. Dies bei Daemon-Adapter, bei Schedule-Adapter wird geprüft, ob die Instanz eingeschaltet ist und der letzte Zeitplan (Cron, also Schedule) gelaufen ist.
<br>Beispiel für Daemon-Adapter cloud:<br>
![image](https://user-images.githubusercontent.com/95978245/176227298-ad1a7963-a8c8-498c-a2b9-627c11b06f43.png)
* Des weiteren gibt es noch eine Zusammenfassung in Datenpunkten, also Liste aller Instanzen, die zwar eingeschaltet sind, aber nicht "laufen", als auch einen Datenpunkt für die Anzahl dieser eingeschalteten, aber nicht laufenden Instanzen.<br>
![image](https://user-images.githubusercontent.com/95978245/176228951-496a37f8-5af6-4674-95ec-3dfc94ab9cbc.png)

* Weiteres wird nach und nach eingebaut, wie einfaches ein- und ausschalten, etc. (was sich bei Schedule-Adapter wieder anders verhält, als bei Daemon-Adapter).

* Zusätzlich werden pro Instanz noch mehrere Datenpunkte als Info ausgegeben.

## Voraussetzungen
1. Installierte Instanz des Javascript-Adapters
2. Zusätzliches NPM-Modul *cron-parser* in den Javascript-Instanz-Einstellungen aufgenommen (unten unter "Installation" erklärt). Dies ist notwendig, um bei "Schedule-Adaptern" die letzte geplante Laufzeit gemäß der gegebenen Cron-Syntax (z.B. `*/15 * * * *`) zu berechnen.

## Installation und Einrichtung 
### 1. Zusätzliches NPM-Modul in JS-Adapter listen

1. Im ioBroker-Admin links auf "Instanzen" klicken und den Schraubschlüssel bei javascript-Instanz anklicken, um in die Einstellungen zu kommen:
<br>![image](https://user-images.githubusercontent.com/95978245/176222034-d1681f63-f15d-4d99-b760-a394bdffabe8.png)

2. Dort unter "Zusätzliche NPM-Module" `cron-parser` eingeben, dann "Speichern und Schließen".
<br>![image](https://user-images.githubusercontent.com/95978245/176219466-bf38f338-53a0-43ab-b49f-ac5ebd755b04.png)

### 2. Script in Javascript-Adapter hinzufügen

1. Link öffnen und Inhalt kopieren: [adapter-instance-watcher](https://github.com/Acgua/ioBroker-Script-Adapter-Instances-Watcher/blob/main/adapter-instance-watcher.js)<br>Am besten auf "Raw" klicken, dann kann man besser alles auswählen und kopieren:<br>![image](https://user-images.githubusercontent.com/95978245/176229719-354627ec-979f-4136-839a-a6effd71571e.png)


2. Neues Skript im JavaScript-Adapter erstellen, Auswahl "Javascript". Beliebigen Namen vergeben, z.B. "Adapter-Instance-Watcher".

3. Oben kopierten Inhalt einfügen und speichern.

### 3. Einrichtung

Es gibt ein paar Optionen im Script, die angepasst werden können, siehe die Erklärung im Script selbst.

Das war es auch schon. Danach Script im JavaScript nur noch aktivieren. D.h. auf das rote Dreieck klicken:
<br>![image](https://user-images.githubusercontent.com/95978245/176230557-fd5b100d-76af-4c1f-bda7-53e2667ef86e.png)

Nun werden die entsprechenden Datenpunkte erstellt und die Adapterinstanzen automatisch überwacht.

## Fehler, Verbesserungsvorschläge

Zunächst am besten ins Log schauen und auch sicherstellen, dass im Script selbst keine Fehler rot markiert sind, z.B. wenn man in den Optionen ein Hochkomma nicht gesetzt hat o.ä.
Auch nochmals sicherstellen, ob/dass man alle Schritte von oben richtig ausgeführt hat.

Ist dies alles gegeben und es gibt immer noch einen Fehler, dann bitte gerne oben unter "Issues" einen neuen Vorgang öffnen, mit aussagekräftem Betreff, guter Beschreibung, und im Fall auch Auszug des Logs.

Ebenso könnt ihr unter "Issues" gerne Verbesserungsvorschläge machen.

## ioBroker-Forum-Beitrag

Siehe hier: [Javascript: Adapter-Instanzen überwachen](https://forum.iobroker.net/topic/55877/)

## Change Log

### 0.0.2 (18. Juli 2022)
* [Acgua](https://github.com/Acgua/) – Workaround aufgrund [Issue #1](https://github.com/Acgua/ioBroker-Script-Adapter-Instances-Watcher/issues/1) eingebaut. In manchen ioBroker-Umgebungen scheint die Abfrage von `admin.0.info.connection` (sowie bisher identifizierte Adapter mqtt und sonoff) kein Boolean zurückzugeben, sondern ein String wie etwa `[2]admin, javascript`. Ich kann es nicht reproduzieren aber habe ein Workaround eingebaut. Bei Ausgabe eines Strings (Länge > 1) wird angenommen, dass eine Verbindung besteht.

### 0.0.1 (Juli 2022)
* [Acgua](https://github.com/Acgua/) – Neu, zum testen

## Lizenz (License)

[GNU General Public License v3.0](https://github.com/Acgua/ioBroker-Script-Adapter-Instances-Watcher/blob/main/LICENSE)


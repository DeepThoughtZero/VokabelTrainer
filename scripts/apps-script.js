/**
 * Google Apps Script für Bestenlisten (Universal)
 * 
 * ANLEITUNG:
 * 1. Erstelle ein neues Google Sheet
 * 2. Gehe zu Erweiterungen > Apps Script
 * 3. Lösche den Standard-Code und füge diesen ein
 * 4. Klicke auf "Bereitstellen" > "Neue Bereitstellung"
 * 5. Wähle "Web-App" als Typ, "Ich" als Ausführender, "Jeder" als Zugriffsberechtigter
 * 6. Füge die URL in dein Spiel ein
 */

function initSheet(sheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet;

    if (sheetName) {
        sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
            sheet = ss.insertSheet(sheetName);
        }
    } else {
        sheet = ss.getActiveSheet();
    }

    // Header erstellen falls nicht vorhanden
    if (sheet.getLastRow() === 0) {
        const name = sheetName || '';
        if (name.includes('VokabelZombie')) {
            sheet.appendRow(['Name', 'Score', 'Kategorie', 'Trefferquote', 'maxStreak', 'Datum']);
        } else if (name.includes('TierGewinnt') || name.includes('KnightRider')) {
            sheet.appendRow(['Name', 'Score', 'Schwierigkeit', 'Züge', 'Datum']);
        } else if (name.includes('Logik') || name.includes('Logic')) {
            sheet.appendRow(['Name', 'Score', 'Schwierigkeit', 'Fehler', 'Rätsel', 'Thema', 'Datum']);
        } else {
            // Standard-Fallback für unbekannte Spiele (entspricht Logik-Labyrinth)
            sheet.appendRow(['Name', 'Score', 'Schwierigkeit', 'Fehler', 'Rätsel', 'Thema', 'Datum']);
        }
        sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
    }

    return sheet;
}

function doGet(e) {
    try {
        const sheetName = e.parameter.sheet;
        const sheet = initSheet(sheetName);
        const action = e.parameter.action;
        const nameStr = sheetName || '';
        
        const isVokabelZombie = nameStr.includes('VokabelZombie');
        const isTierGewinnt = nameStr.includes('TierGewinnt') || nameStr.includes('KnightRider');
        const isLogikLabyrinth = nameStr.includes('Logik') || nameStr.includes('Logic');

        if (action === 'add') {
            const name = e.parameter.name;
            const score = e.parameter.score;

            if (!name || score === undefined) {
                return jsonResponse({ error: 'Name und Score erforderlich' });
            }

            const now = new Date();
            const dateStr = Utilities.formatDate(now, 'Europe/Berlin', 'dd.MM.yyyy HH:mm');

            if (isVokabelZombie) {
                sheet.appendRow([
                    String(name).substring(0, 20),
                    Math.max(0, Number(score) || 0),
                    String(e.parameter.kategorie || '').substring(0, 100),
                    String(e.parameter.trefferquote || '').substring(0, 20),
                    Number(e.parameter.maxStreak) || 0,
                    dateStr
                ]);
            } else if (isTierGewinnt) {
                sheet.appendRow([
                    String(name).substring(0, 20),
                    Math.max(1, Math.min(500, Number(score) || 0)),
                    e.parameter.difficulty || 0,
                    e.parameter.moves || 0,
                    dateStr
                ]);
            } else if (isLogikLabyrinth) {
                sheet.appendRow([
                    String(name).substring(0, 20),
                    Math.max(1, Math.min(500, Number(score) || 0)),
                    e.parameter.difficulty || 0,
                    e.parameter.errors || 0,
                    e.parameter.puzzleNum || 0,
                    String(e.parameter.theme || '').substring(0, 100),
                    dateStr
                ]);
            } else {
                // Standard-Fallback
                sheet.appendRow([
                    String(name).substring(0, 20),
                    Math.max(1, Math.min(500, Number(score) || 0)),
                    e.parameter.difficulty || 0,
                    e.parameter.errors || 0,
                    e.parameter.puzzleNum || 0,
                    String(e.parameter.theme || '').substring(0, 100),
                    dateStr
                ]);
            }

            return jsonResponse({ success: true });
        }

        // Standard: Bestenliste abrufen
        const data = sheet.getDataRange().getValues();
        const headers = data.shift();

        const entries = data
            .map(row => {
                if (isVokabelZombie) {
                    return {
                        name: row[0],
                        score: row[1],
                        kategorie: row[2],
                        trefferquote: row[3],
                        maxStreak: row[4],
                        date: row[5]
                    };
                } else if (isTierGewinnt) {
                    return {
                        name: row[0],
                        score: row[1],
                        difficulty: row[2],
                        moves: row[3],
                        date: row[4]
                    };
                } else {
                    // isLogikLabyrinth oder Fallback
                    return {
                        name: row[0],
                        score: row[1],
                        difficulty: row[2],
                        errors: row[3],
                        puzzleNum: row[4],
                        theme: row[5],
                        date: row[6]
                    };
                }
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 200);

        return jsonResponse({ entries });

    } catch (error) {
        return jsonResponse({ error: error.message });
    }
}

function jsonResponse(data) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const sheetName = e.parameter.sheet || data.sheet;
        const sheet = initSheet(sheetName);
        
        const nameStr = sheetName || '';
        const isVokabelZombie = nameStr.includes('VokabelZombie');
        const isTierGewinnt = nameStr.includes('TierGewinnt') || nameStr.includes('KnightRider');
        const isLogikLabyrinth = nameStr.includes('Logik') || nameStr.includes('Logic');

        if (!data.name || data.score === undefined) {
            return jsonResponse({ error: 'Name und Score erforderlich' });
        }

        const now = new Date();
        const dateStr = Utilities.formatDate(now, 'Europe/Berlin', 'dd.MM.yyyy HH:mm');

        if (isVokabelZombie) {
            sheet.appendRow([
                String(data.name).substring(0, 20),
                Math.max(0, Number(data.score) || 0),
                String(data.kategorie || '').substring(0, 100),
                String(data.trefferquote || '').substring(0, 20),
                Number(data.maxStreak) || 0,
                dateStr
            ]);
        } else if (isTierGewinnt) {
            sheet.appendRow([
                String(data.name).substring(0, 20),
                Math.max(1, Math.min(500, Number(data.score) || 0)),
                data.difficulty || 0,
                data.moves || 0,
                dateStr
            ]);
        } else if (isLogikLabyrinth) {
            sheet.appendRow([
                String(data.name).substring(0, 20),
                Math.max(1, Math.min(500, Number(data.score) || 0)),
                data.difficulty || 0,
                data.errors || 0,
                data.puzzleNum || 0,
                String(data.theme || '').substring(0, 100),
                dateStr
            ]);
        } else {
            // Standard-Fallback
            sheet.appendRow([
                String(data.name).substring(0, 20),
                Math.max(1, Math.min(500, Number(data.score) || 0)),
                data.difficulty || 0,
                data.errors || 0,
                data.puzzleNum || 0,
                String(data.theme || '').substring(0, 100),
                dateStr
            ]);
        }

        return jsonResponse({ success: true });

    } catch (error) {
        return jsonResponse({ error: error.message });
    }
}

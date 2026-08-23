#!/usr/bin/env node

/**
 * Lokaler Browser-Smoke-Test ohne npm-Abhängigkeiten.
 *
 * Startet Chrome/Chromium headless, liefert das statische Spiel über einen
 * kurzlebigen HTTP-Server aus und steuert den Browser über das Chrome DevTools
 * Protocol. Der Test deckt den wichtigsten Spielablauf sowie die Desktop- und
 * Mobilansicht der Bestenliste ab.
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { accessSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STEP_TIMEOUT_MS = 12_000;
const MIME_TYPES = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.mp3', 'audio/mpeg'],
    ['.mp4', 'video/mp4'],
    ['.webp', 'image/webp'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.svg', 'image/svg+xml'],
    ['.woff', 'font/woff'],
    ['.woff2', 'font/woff2'],
]);

function sleep(milliseconds) {
    return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function findBrowser() {
    const configured = process.env.BROWSER_BIN?.trim();
    if (configured) {
        try {
            accessSync(configured, fsConstants.X_OK);
            return configured;
        } catch {
            throw new Error(`BROWSER_BIN ist nicht ausführbar: ${configured}`);
        }
    }

    const candidates = [
        'google-chrome-stable',
        'google-chrome',
        'chromium',
        'chromium-browser',
    ];
    for (const candidate of candidates) {
        const lookup = spawnSync('sh', ['-c', `command -v "${candidate}"`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (lookup.status === 0 && lookup.stdout.trim()) return lookup.stdout.trim();
    }
    throw new Error(
        'Kein Chrome/Chromium gefunden. Installiere einen Chromium-Browser oder setze '
        + 'BROWSER_BIN=/vollständiger/pfad/zum/browser.'
    );
}

function startStaticServer() {
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
            if (requestUrl.pathname === '/favicon.ico') {
                response.writeHead(204).end();
                return;
            }
            const relativePath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
            const requestedPath = normalize(join(ROOT, relativePath));
            if (requestedPath !== ROOT && !requestedPath.startsWith(`${ROOT}${sep}`)) {
                response.writeHead(403).end('Forbidden');
                return;
            }
            const fileStats = await stat(requestedPath);
            if (!fileStats.isFile()) throw new Error('not a file');
            const contentType = MIME_TYPES.get(extname(requestedPath).toLowerCase()) || 'application/octet-stream';
            const range = request.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileStats.size - 1;
                const chunksize = (end - start) + 1;
                const file = await readFile(requestedPath);
                const chunk = file.subarray(start, end + 1);
                response.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': contentType,
                });
                response.end(chunk);
                return;
            }
            const body = await readFile(requestedPath);
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Accept-Ranges': 'bytes',
                'Content-Length': fileStats.size,
                'Content-Type': contentType,
            });
            response.end(body);
        } catch {
            response.writeHead(404).end('Not found');
        }
    });
    return new Promise((resolvePromise, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolvePromise({ server, port: address.port });
        });
    });
}

class CdpClient {
    constructor(webSocket) {
        this.webSocket = webSocket;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        webSocket.addEventListener('message', event => this.handleMessage(event.data));
    }

    handleMessage(rawMessage) {
        const message = JSON.parse(rawMessage);
        if (message.id) {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
            else pending.resolve(message.result || {});
            return;
        }
        for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolvePromise, reject) => {
            this.pending.set(id, { resolve: resolvePromise, reject });
            this.webSocket.send(JSON.stringify({ id, method, params }));
        });
    }

    on(method, listener) {
        const listeners = this.listeners.get(method) || [];
        listeners.push(listener);
        this.listeners.set(method, listeners);
    }

    waitFor(method, predicate = () => true, timeoutMs = STEP_TIMEOUT_MS) {
        return new Promise((resolvePromise, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Zeitüberschreitung bei ${method}`)), timeoutMs);
            const listener = params => {
                if (!predicate(params)) return;
                clearTimeout(timeout);
                const listeners = this.listeners.get(method) || [];
                this.listeners.set(method, listeners.filter(current => current !== listener));
                resolvePromise(params);
            };
            this.on(method, listener);
        });
    }

    close() {
        this.webSocket.close();
    }
}

async function connectCdp(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolvePromise, reject) => {
        const timeout = setTimeout(() => reject(new Error('DevTools-Verbindung konnte nicht geöffnet werden.')), STEP_TIMEOUT_MS);
        socket.addEventListener('open', () => {
            clearTimeout(timeout);
            resolvePromise();
        }, { once: true });
        socket.addEventListener('error', () => {
            clearTimeout(timeout);
            reject(new Error('DevTools-Verbindung ist fehlgeschlagen.'));
        }, { once: true });
    });
    return new CdpClient(socket);
}

async function waitForDevToolsPort(profileDirectory, browserProcess) {
    const activePortFile = join(profileDirectory, 'DevToolsActivePort');
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (browserProcess.exitCode !== null) {
            throw new Error(`Browser wurde vorzeitig mit Exitcode ${browserProcess.exitCode} beendet.`);
        }
        try {
            const [port] = readFileSync(activePortFile, 'utf8').trim().split(/\s+/);
            if (port) return Number(port);
        } catch {}
        await sleep(50);
    }
    throw new Error('Chrome hat keinen DevTools-Port bereitgestellt.');
}

async function openPage(devToolsPort, targetUrl) {
    const response = await fetch(`http://127.0.0.1:${devToolsPort}/json/new?${encodeURIComponent(targetUrl)}`, {
        method: 'PUT',
    });
    if (!response.ok) throw new Error(`Browser-Tab konnte nicht geöffnet werden: HTTP ${response.status}`);
    return response.json();
}

async function evaluate(client, expression) {
    const response = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
    });
    if (response.exceptionDetails) {
        const description = response.exceptionDetails.exception?.description
            || response.exceptionDetails.text
            || 'Unbekannter JavaScript-Fehler';
        throw new Error(description);
    }
    return response.result?.value;
}

async function waitForCondition(client, expression, description, timeoutMs = STEP_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(client, `Boolean(${expression})`)) return;
        await sleep(50);
    }
    throw new Error(`Nicht erreicht: ${description}`);
}

async function click(client, selector) {
    const serializedSelector = JSON.stringify(selector);
    await waitForCondition(
        client,
        `document.querySelector(${serializedSelector}) && !document.querySelector(${serializedSelector}).disabled`,
        `${selector} ist anklickbar`,
    );
    await evaluate(client, `document.querySelector(${serializedSelector}).click()`);
}

async function assertInsideViewport(client, selector, { allowHorizontalScroll = false } = {}) {
    const layout = await evaluate(client, `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        };
    })()`);
    assert.ok(layout, `${selector} fehlt`);
    assert.ok(layout.width > 0 && layout.height > 0, `${selector} ist nicht sichtbar`);
    assert.ok(layout.left >= -1, `${selector} ragt links aus dem Viewport`);
    assert.ok(layout.top >= -1, `${selector} ragt oben aus dem Viewport`);
    assert.ok(layout.right <= layout.viewportWidth + 1, `${selector} ragt rechts aus dem Viewport`);
    assert.ok(layout.bottom <= layout.viewportHeight + 1, `${selector} ragt unten aus dem Viewport`);
    if (!allowHorizontalScroll) {
        assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${selector} besitzt unerwarteten horizontalen Überlauf`);
    }
}

async function runSmokeTest(client, baseUrl, browserProblems) {
    await Promise.all([
        client.send('Page.enable'),
        client.send('Runtime.enable'),
        client.send('Log.enable'),
        client.send('Network.enable'),
        client.send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            mobile: false,
        }),
    ]);

    client.on('Runtime.exceptionThrown', event => {
        browserProblems.push(`JavaScript-Ausnahme: ${event.exceptionDetails?.exception?.description || event.exceptionDetails?.text}`);
    });
    client.on('Runtime.consoleAPICalled', event => {
        if (event.type !== 'error') return;
        const text = (event.args || []).map(argument => argument.value || argument.description || '').join(' ');
        browserProblems.push(`console.error: ${text}`);
    });
    client.on('Log.entryAdded', event => {
        if (event.entry?.level === 'error') browserProblems.push(`Browser-Log: ${event.entry.text}`);
    });
    client.on('Network.responseReceived', event => {
        const response = event.response || {};
        if (response.url?.startsWith(baseUrl) && response.status >= 400) {
            browserProblems.push(`HTTP ${response.status}: ${response.url}`);
        }
    });

    const mockEntries = [
        { name: 'Nova', score: 900, kategorie: 'Englisch 5: Unit 1, Unit 2', trefferquote: '92%', maxStreak: 12, date: '2026-08-19' },
        { name: 'Fox', score: 880, kategorie: 'Englisch 6: Unit 1, Unit 2, Unit 3, Unit 4, Unit 5, Welcome back to Brighton', trefferquote: '91%', maxStreak: 11, date: '2026-08-19' },
        { name: 'Volt', score: 820, kategorie: 'Englisch 6: Unit 3 - Mix, Unit 4', trefferquote: '89%', maxStreak: 9, date: '2026-08-18' },
        { name: 'Ivy', score: 780, kategorie: 'Englisch: Unit 3', trefferquote: '86%', maxStreak: 8, date: '2026-08-17' },
    ];
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
            const entries = ${JSON.stringify(mockEntries)};
            let randomSeed = 0x5eed1234;
            Math.random = () => {
                randomSeed = (Math.imul(1664525, randomSeed) + 1013904223) >>> 0;
                return randomSeed / 0x100000000;
            };
            const originalFetch = window.fetch.bind(window);
            window.fetch = (input, init) => {
                const url = String(input);
                if (url.startsWith('https://script.google.com/')) {
                    return Promise.resolve(new Response(JSON.stringify({ entries }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }));
                }
                return originalFetch(input, init);
            };
            Object.defineProperty(HTMLMediaElement.prototype, 'play', {
                configurable: true,
                value() {
                    queueMicrotask(() => this.dispatchEvent(new Event('ended')));
                    return Promise.resolve();
                },
            });
        })();`,
    });

    const loaded = client.waitFor('Page.loadEventFired');
    await client.send('Page.navigate', { url: `${baseUrl}/index.html` });
    await loaded;
    await waitForCondition(client, `document.readyState === 'complete'`, 'Dokument vollständig geladen');
    await waitForCondition(client, `document.querySelector('#login-screen.active')`, 'Passwortscreen aktiv');

    await evaluate(client, `document.querySelector('#secret-password').value = 'Zombie'`);
    await click(client, '#login-btn');
    await waitForCondition(client, `document.querySelector('#terms-screen.active')`, 'AGB-Screen aktiv');

    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await waitForCondition(
        client,
        `getComputedStyle(document.querySelector('#orientation-notice')).display === 'none'`,
        'Querformat-Hinweis auf AGB-Screen im Hochformat ausgeblendet',
    );
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        mobile: false,
    });

    await click(client, '#accept-terms-btn');
    await waitForCondition(client, `document.querySelector('#course-selection-screen.active')`, 'Kursauswahl aktiv');

    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await waitForCondition(
        client,
        `getComputedStyle(document.querySelector('#orientation-notice')).display === 'flex'`,
        'Querformat-Hinweis bei Kursauswahl im Hochformat sichtbar',
    );
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await waitForCondition(
        client,
        `getComputedStyle(document.querySelector('#orientation-notice')).display === 'none'`,
        'Querformat-Hinweis bei Kursauswahl im Querformat ausgeblendet',
    );
    await click(client, '[data-grade="6"]');
    await waitForCondition(client, `document.querySelector('[data-course-id="en-6"]:not(:disabled)')`, 'Englisch 6 verfügbar');
    await click(client, '[data-course-id="en-6"]');
    await click(client, '#confirm-course-btn');
    await waitForCondition(client, `document.querySelector('#hunter-selection-screen.active')`, 'Jägerauswahl aktiv');
    await click(client, '#confirm-hunter-btn');
    await waitForCondition(client, `document.querySelector('#city-selection-screen.active')`, 'Stadtauswahl aktiv');
    await click(client, '#confirm-city-btn');
    await waitForCondition(client, `document.querySelector('#mission-selection-screen.active')`, 'Einsatzwahl aktiv');
    const defaultPlayStyleState = await evaluate(client, `({
        activeStyle: document.querySelector('.play-style-card.active')?.dataset.playStyle,
        order: [...document.querySelectorAll('.play-style-card')].map(card => card.dataset.playStyle),
    })`);
    assert.equal(defaultPlayStyleState.activeStyle, 'hunt');
    assert.deepEqual(defaultPlayStyleState.order, ['hunt', 'mission']);

    await click(client, '[data-play-style="mission"]');
    const missionSelectionState = await evaluate(client, `({
        activeStyle: document.querySelector('.play-style-card.active')?.dataset.playStyle,
        routeStops: document.querySelectorAll('.mission-route-stop').length,
        objective: document.querySelector('#mission-briefing h2')?.textContent.trim(),
    })`);
    assert.equal(missionSelectionState.activeStyle, 'mission');
    assert.equal(missionSelectionState.routeStops, 5);
    assert.equal(missionSelectionState.objective, 'Brich durch die Horde – und stürze den Boss!');
    await assertInsideViewport(client, '.mission-command-center');
    await click(client, '#confirm-play-style-btn');
    await waitForCondition(client, `document.querySelector('#halo-screen.active.is-planning')`, 'Stadtkarte zur Zielwahl aktiv');
    const planningState = await evaluate(client, `({
        districts: document.querySelectorAll('.halo-district').length,
        targets: document.querySelectorAll('.halo-district.target').length,
        clickable: [...document.querySelectorAll('.halo-district')].every(tile => !tile.disabled),
        startScreenActive: document.querySelector('#start-screen').classList.contains('active'),
        button: document.querySelector('#halo-deploy-btn').textContent.trim(),
    })`);
    assert.ok(planningState.districts >= 5, 'Buchstadt enthält zu wenige auswählbare Viertel');
    assert.equal(planningState.targets, 1);
    assert.equal(planningState.clickable, true);
    assert.equal(planningState.startScreenActive, false, 'Rettungsmission zeigt noch den alten Lernpfad-Dialog');
    assert.equal(planningState.button, 'Briefing im Flugzeug starten');
    await assertInsideViewport(client, '.halo-city-map');
    const directMapState = await evaluate(client, `({
        mapBackground: getComputedStyle(document.querySelector('.halo-city-map')).backgroundImage,
        mapBorder: getComputedStyle(document.querySelector('.halo-city-map')).borderTopWidth,
        targetBackground: getComputedStyle(document.querySelector('.halo-district.target')).backgroundImage,
        bodyBackground: getComputedStyle(document.body).backgroundImage,
        markerScales: [...document.querySelectorAll('.halo-district')].map(tile => getComputedStyle(tile).getPropertyValue('--map-scale').trim()),
    })`);
    assert.equal(directMapState.mapBackground, 'none', 'Stadtwahl liegt noch auf einem Dialoghintergrund');
    assert.equal(directMapState.mapBorder, '0px', 'Stadtwahl besitzt noch einen Dialograhmen');
    assert.match(directMapState.targetBackground, /radial-gradient/, 'Zielgebiet ist auf der Stadt nicht hervorgehoben');
    assert.match(directMapState.bodyBackground, /(map_[a-z0-9_-]+\.webp|background_halo_city\.webp)/, 'Stadtbild füllt den äußeren Hintergrund nicht');
    assert.ok(new Set(directMapState.markerScales).size >= 6, 'Stadtviertel besitzen keine perspektivische Tiefenstaffelung');

    const selectedDistrictChanged = await evaluate(client, `(() => {
        const previous = document.querySelector('.halo-district.target')?.getAttribute('aria-label');
        const next = [...document.querySelectorAll('.halo-district')].find(tile => !tile.classList.contains('target'));
        next?.click();
        return Boolean(next) && document.querySelector('.halo-district.target')?.getAttribute('aria-label') !== previous;
    })()`);
    assert.equal(selectedDistrictChanged, true, 'Stadtviertel ließ sich nicht direkt in der Karte auswählen');
    await click(client, '#halo-deploy-btn');
    await waitForCondition(client, `document.querySelector('#command-center-screen.active')`, 'Kommandozentrale aktiv');
    const commandCenterState = await evaluate(client, `({
        german: document.querySelector('#command-german-word').textContent.trim(),
        foreign: document.querySelector('#command-foreign-word').textContent.trim(),
        letters: document.querySelectorAll('#command-letter-pool .letter-btn').length,
        audioLabel: document.querySelector('#command-replay-audio-btn').textContent.trim(),
        radioMessage: document.querySelector('#command-radio-message').textContent.trim(),
    })`);
    assert.ok(commandCenterState.german, 'Kommandozentrale zeigt kein deutsches Wort');
    assert.ok(commandCenterState.foreign, 'Kommandozentrale zeigt kein englisches Wort');
    assert.ok(commandCenterState.letters > 0, 'Kommandozentrale enthält keine Buchstabenaufgabe');
    assert.match(commandCenterState.audioLabel, /Funk wiederholen/);
    assert.match(commandCenterState.radioMessage, /^(The next password|Attention|Incoming tactical update|Priority dispatch|Transmission incoming|Airborne update|Critical frequency locked|Stand by for radar jamming)/);
    assert.doesNotMatch(commandCenterState.radioMessage, /Echo One/);
    const radioBeforeReplay = commandCenterState.radioMessage;
    await click(client, '#command-replay-audio-btn');
    const radioAfterReplay = await evaluate(client, `document.querySelector('#command-radio-message').textContent.trim()`);
    assert.equal(radioAfterReplay, radioBeforeReplay, 'Funkspruch-Text hat sich bei Funk-Wiederholung geändert');
    await assertInsideViewport(client, '.command-center-layout');

    for (let briefingStep = 0; briefingStep < 3; briefingStep++) {
        const progressBefore = await evaluate(client, `document.querySelector('#command-word-progress-label').textContent.trim()`);
        const solved = await evaluate(client, `(() => {
            const slots = [...document.querySelectorAll('#command-letter-target .letter-slot')];
            let concealedAfterFirstLetter = false;
            slots.forEach((slot, index) => {
                const character = slot.dataset.expectedChar;
                const button = [...document.querySelectorAll('#command-letter-pool .letter-btn')]
                    .find(candidate => candidate.dataset.char.toLocaleLowerCase() === character.toLocaleLowerCase());
                if (!button) return;
                button.click();
                if (index === 0) concealedAfterFirstLetter = document.querySelector('#command-vocab-card').classList.contains('solution-concealed');
            });
            return {
                secured: document.querySelector('#command-vocab-card').classList.contains('word-secured'),
                concealedAfterFirstLetter,
            };
        })()`);
        assert.equal(solved.secured, true, `Briefing-Wort ${briefingStep + 1} konnte nicht zusammengesetzt werden`);
        assert.equal(solved.concealedAfterFirstLetter, true, 'Englische Lösung blieb beim Schreiben sichtbar');
        if (briefingStep < 2) {
            await waitForCondition(client, `document.querySelector('#command-word-progress-label').textContent.trim() !== ${JSON.stringify(progressBefore)}`, 'automatischer Wortwechsel');
        }
    }

    await waitForCondition(client, `document.querySelector('#halo-screen.active.is-jumping')`, 'HALO-Absprung aktiv');
    const haloState = await evaluate(client, `({
        districts: document.querySelectorAll('.halo-district').length,
        targets: document.querySelectorAll('.halo-district.target').length,
        activeDistrict: document.querySelector('#halo-active-district').textContent.trim(),
        jumping: document.querySelector('#halo-screen').classList.contains('is-jumping'),
        planning: document.querySelector('#halo-screen').classList.contains('is-planning'),
        hasVideo: Boolean(document.querySelector('#halo-jump-video')),
        videoSrc: document.querySelector('#halo-jump-video')?.getAttribute('src') || '',
        videoVisible: getComputedStyle(document.querySelector('#halo-jump-stage')).display !== 'none',
        hasSkipBtn: Boolean(document.querySelector('#skip-halo-video-btn')),
        altitudeRemoved: !document.querySelector('#halo-altitude'),
        mapHidden: getComputedStyle(document.querySelector('.halo-city-map')).display === 'none',
        deployHidden: getComputedStyle(document.querySelector('.halo-deploy-panel')).display === 'none',
    })`);
    assert.ok(haloState.districts >= 5, 'Buchstadt enthält zu wenige Viertel');
    assert.equal(haloState.targets, 1);
    assert.ok(haloState.activeDistrict);
    assert.equal(haloState.jumping, true);
    assert.equal(haloState.planning, false);
    assert.equal(haloState.hasVideo, true, 'HALO-Jump-Video fehlt im DOM');
    assert.match(haloState.videoSrc, /assets\/video\/HaloJump\.mp4/, 'Video-Pfad stimmt nicht');
    assert.equal(haloState.videoVisible, true, 'Video-Stage ist nicht sichtbar');
    assert.equal(haloState.hasSkipBtn, true, 'Skip-Button fehlt im HALO-Screen');
    assert.equal(haloState.altitudeRemoved, true);
    assert.equal(haloState.mapHidden, true, 'Gebäudekarte wird beim Absprung erneut gezeigt');
    assert.equal(haloState.deployHidden, true, 'HALO verlangt noch eine zusätzliche Landebestätigung');
    await click(client, '#skip-halo-video-btn');
    await waitForCondition(client, `document.querySelector('#game-screen.active')`, 'automatische Landung im Zielviertel', 6_000);
    await waitForCondition(client, `!document.querySelector('#mission-hud').classList.contains('hidden')`, 'Missionsfortschritt sichtbar');
    await waitForCondition(client, `document.querySelectorAll('#options-container .option-btn').length >= 4`, 'Antwortmöglichkeiten sichtbar');
    const missionHudState = await evaluate(client, `({
        phase: document.querySelector('#mission-phase-label').textContent.trim(),
        encounter: document.querySelector('#mission-encounter-label').textContent.trim(),
        transition: document.querySelector('#mission-phase-overlay-title').textContent.trim(),
        transitionVisible: !document.querySelector('#mission-phase-overlay').classList.contains('hidden'),
        clipped: ['mission-phase-label', 'mission-encounter-label'].some(id => {
            const element = document.getElementById(id);
            return element && element.scrollWidth > element.clientWidth + 1;
        }),
    })`);
    assert.equal(missionHudState.phase, 'Angriffswelle');
    assert.equal(missionHudState.encounter, '⚔ 1 / 20');
    assert.equal(missionHudState.transition, 'Die Horde ist da!');
    assert.equal(missionHudState.transitionVisible, true);
    assert.equal(missionHudState.clipped, false, 'Missionsstatus in der Titelleiste ist abgeschnitten');
    await assertInsideViewport(client, '#mission-hud');
    await assertInsideViewport(client, '#options-container');

    const phasePositionBefore = await evaluate(client, `Number.parseFloat(document.querySelector('#zombie').style.left)`);
    await sleep(3_000);
    const phaseHoldState = await evaluate(client, `({
        transitionVisible: !document.querySelector('#mission-phase-overlay').classList.contains('hidden'),
        zombiePosition: Number.parseFloat(document.querySelector('#zombie').style.left),
    })`);
    assert.equal(phaseHoldState.transitionVisible, true, 'Phasenhinweis verschwindet zu schnell');
    assert.ok(
        Math.abs(phaseHoldState.zombiePosition - phasePositionBefore) < 1,
        'Zombie bewegt sich während des Phasenhinweises weiter'
    );
    await waitForCondition(
        client,
        `document.querySelector('#mission-phase-overlay').classList.contains('hidden')`,
        'verlängerter Phasenhinweis geschlossen',
        4_000
    );

    const optionOverflow = await evaluate(client, `[...document.querySelectorAll('#options-container .option-btn')].some(button => {
        const rect = button.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1 || button.scrollWidth > button.clientWidth + 1;
    })`);
    assert.equal(optionOverflow, false, 'Antworttext oder Auswahlknopf ist horizontal abgeschnitten');

    const wrongAnswerTriggered = await evaluate(client, `(() => {
        const wrongButton = [...document.querySelectorAll('#options-container .option-btn')]
            .find(button => button.dataset.correct === 'false');
        if (!wrongButton) return false;
        wrongButton.click();
        return true;
    })()`);
    assert.equal(wrongAnswerTriggered, true, 'Keine falsche Testantwort gefunden');
    await waitForCondition(client, `!document.querySelector('#correction-panel').classList.contains('hidden')`, 'aktive Korrektur sichtbar');
    const correctionState = await evaluate(client, `(() => {
        const label = document.querySelector('#correction-return-label').textContent.trim();
        return {
            title: document.querySelector('#correction-title').textContent.trim(),
            answer: document.querySelector('#correction-answer').textContent.trim(),
            returnLabel: label,
            spacerCount: Number(label.match(/\\d+/)?.[0]),
            letterButtons: document.querySelectorAll('#correction-pool .letter-btn').length,
            letterSlots: document.querySelectorAll('#correction-target .letter-slot').length,
            optionsHidden: document.querySelector('#options-container').classList.contains('hidden'),
            fleeing: document.querySelector('#zombie').classList.contains('marked-fleeing'),
        };
    })()`);
    assert.equal(correctionState.title, 'Der Zombie zieht sich zurück');
    assert.ok(correctionState.answer, 'Korrektur zeigt keine Lösung');
    assert.match(correctionState.returnLabel, /^nach [2-4] Wörtern$/);
    assert.equal(correctionState.letterButtons, correctionState.letterSlots);
    assert.equal(correctionState.optionsHidden, true);
    assert.equal(correctionState.fleeing, true);
    await assertInsideViewport(client, '#correction-panel');

    const correctionSolved = await evaluate(client, `(() => {
        const pool = document.querySelector('#correction-pool');
        const slots = [...document.querySelectorAll('#correction-target .letter-slot')];
        let concealedAfterFirstLetter = false;
        for (let index = 0; index < slots.length; index++) {
            const slot = slots[index];
            const expected = slot.dataset.expectedChar.toLocaleLowerCase();
            const button = [...pool.querySelectorAll('.letter-btn')]
                .find(candidate => candidate.dataset.char.toLocaleLowerCase() === expected);
            if (!button) return { solved: false, concealedAfterFirstLetter };
            button.click();
            if (index === 0) concealedAfterFirstLetter = document.querySelector('#correction-panel').classList.contains('solution-concealed');
        }
        return { solved: true, concealedAfterFirstLetter };
    })()`);
    assert.equal(correctionSolved.solved, true, 'Buchstabenbestätigung konnte nicht gelöst werden');
    assert.equal(correctionSolved.concealedAfterFirstLetter, true, 'Fehlerlösung blieb beim Schreiben sichtbar');
    await waitForCondition(client, `document.querySelector('#correction-panel').classList.contains('confirmed')`, 'Korrektur bestätigt');
    await waitForCondition(client, `document.querySelector('#correction-panel').classList.contains('hidden')`, 'Korrektur geschlossen', 5_000);

    for (let spacerIndex = 0; spacerIndex < correctionState.spacerCount; spacerIndex++) {
        await waitForCondition(client, `
            !document.querySelector('#options-container').classList.contains('hidden')
            && !document.querySelector('#zombie').classList.contains('knockback')
            && [...document.querySelectorAll('#options-container .option-btn')].some(button => !button.disabled)
        `, `Zwischenwort ${spacerIndex + 1} spielbereit`, 20_000);
        const previousEncounter = await evaluate(client, `document.querySelector('#mission-encounter-label').textContent.trim()`);
        const correctSpacerClicked = await evaluate(client, `(() => {
            const correctButton = [...document.querySelectorAll('#options-container .option-btn')]
                .find(button => button.dataset.correct === 'true');
            if (!correctButton) return false;
            correctButton.click();
            return true;
        })()`);
        assert.equal(correctSpacerClicked, true, `Zwischenwort ${spacerIndex + 1} konnte nicht beantwortet werden`);
        try {
            await waitForCondition(client, `
                !document.querySelector('#marked-retry-banner').classList.contains('hidden')
                || (
                    document.querySelector('#mission-encounter-label').textContent.trim() !== ${JSON.stringify(previousEncounter)}
                    && [...document.querySelectorAll('#options-container .option-btn')].some(button => !button.disabled)
                )
            `, `Begegnung nach Zwischenwort ${spacerIndex + 1}`, 20_000);
        } catch (error) {
            const state = await evaluate(client, `({
                encounter: document.querySelector('#mission-encounter-label').textContent.trim(),
                phase: document.querySelector('#mission-phase-label').textContent.trim(),
                phaseOverlay: document.querySelector('#mission-phase-overlay-title').textContent.trim(),
                phaseOverlayVisible: !document.querySelector('#mission-phase-overlay').classList.contains('hidden'),
                markedBannerVisible: !document.querySelector('#marked-retry-banner').classList.contains('hidden'),
                correctionVisible: !document.querySelector('#correction-panel').classList.contains('hidden'),
                solutionVisible: !document.querySelector('#solution-dialog').classList.contains('hidden'),
                enabledOptions: [...document.querySelectorAll('#options-container .option-btn')].filter(button => !button.disabled).length,
                zombieClasses: document.querySelector('#zombie').className,
            })`);
            throw new Error(`${error.message}: ${JSON.stringify(state)}`);
        }
    }

    await waitForCondition(client, `!document.querySelector('#marked-retry-banner').classList.contains('hidden')`, 'markierter Zombie zurückgekehrt', 5_000);
    await waitForCondition(client, `
        !document.querySelector('#zombie').classList.contains('knockback')
        && [...document.querySelectorAll('#options-container .option-btn')]
            .some(button => button.dataset.correct === 'true' && !button.disabled)
    `, 'markierter Zombie schussbereit', 5_000);
    const markedReturnState = await evaluate(client, `({
        markedClass: document.querySelector('#zombie').classList.contains('marked-zombie'),
        symbol: document.querySelector('#marked-retry-banner .marked-retry-symbol').textContent.trim(),
        kicker: document.querySelector('#marked-retry-banner .marked-retry-kicker').textContent.trim(),
        banner: document.querySelector('#marked-retry-banner .marked-retry-title').textContent.trim(),
        symbolFits: (() => {
            const symbol = document.querySelector('#marked-retry-banner .marked-retry-symbol');
            const copy = document.querySelector('#marked-retry-banner .marked-retry-copy');
            return symbol.scrollWidth <= symbol.clientWidth
                && symbol.scrollHeight <= symbol.clientHeight
                && symbol.getBoundingClientRect().right <= copy.getBoundingClientRect().left;
        })(),
    })`);
    assert.equal(markedReturnState.markedClass, true);
    assert.equal(markedReturnState.symbol, '⟳');
    assert.equal(markedReturnState.kicker, 'Markierter Zombie');
    assert.equal(markedReturnState.banner, 'Du kennst ihn – hol dir das Wort jetzt zurück!');
    assert.equal(markedReturnState.symbolFits, true, 'Rückkehr-Symbol kollidiert mit dem Bannertext');

    const markedZombieSecured = await evaluate(client, `(() => {
        const correctButton = [...document.querySelectorAll('#options-container .option-btn')]
            .find(button => button.dataset.correct === 'true');
        if (!correctButton || correctButton.disabled) return { clicked: false };
        correctButton.click();
        return {
            clicked: true,
            resolved: document.querySelector('#marked-retry-banner').classList.contains('resolved'),
            kicker: document.querySelector('#marked-retry-banner .marked-retry-kicker').textContent.trim(),
            marked: document.querySelector('#zombie').classList.contains('marked-zombie'),
        };
    })()`);
    assert.equal(markedZombieSecured.clicked, true, 'Markierter Zombie konnte nicht gesichert werden');
    assert.equal(markedZombieSecured.resolved, true, `Rückholstatus wurde beim Treffer nicht gesetzt: ${JSON.stringify(markedZombieSecured)}`);
    await waitForCondition(client, `document.querySelector('#marked-retry-banner').classList.contains('resolved')`, 'Spur gesichert');
    const securedBannerState = await evaluate(client, `({
        symbol: document.querySelector('#marked-retry-banner .marked-retry-symbol').textContent.trim(),
        kicker: document.querySelector('#marked-retry-banner .marked-retry-kicker').textContent.trim(),
        title: document.querySelector('#marked-retry-banner .marked-retry-title').textContent.trim(),
        symbolFits: (() => {
            const symbol = document.querySelector('#marked-retry-banner .marked-retry-symbol');
            const copy = document.querySelector('#marked-retry-banner .marked-retry-copy');
            return symbol.scrollWidth <= symbol.clientWidth
                && symbol.scrollHeight <= symbol.clientHeight
                && symbol.getBoundingClientRect().right <= copy.getBoundingClientRect().left;
        })(),
    })`);
    assert.equal(securedBannerState.symbol, '✓');
    assert.equal(securedBannerState.kicker, 'Spur gesichert');
    assert.equal(securedBannerState.title, 'Stark erinnert – dieser Zombie ist erledigt.');
    assert.equal(securedBannerState.symbolFits, true, 'Gesichert-Symbol kollidiert mit dem Bannertext');

    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await waitForCondition(
        client,
        `getComputedStyle(document.querySelector('#orientation-notice')).display === 'flex'`,
        'Querformat-Hinweis im Hochformat sichtbar',
    );
    await assertInsideViewport(client, '#orientation-notice');
    await assertInsideViewport(client, '.orientation-notice-card');

    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 844,
        height: 390,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await waitForCondition(
        client,
        `getComputedStyle(document.querySelector('#orientation-notice')).display === 'none'`,
        'Querformat-Hinweis nach Drehung ausgeblendet',
    );

    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await waitForCondition(
        client,
        `getComputedStyle(document.querySelector('#orientation-notice')).display === 'flex'`,
        'Querformat-Hinweis nach Rückdrehung sichtbar',
    );
    await click(client, '#dismiss-orientation-notice-btn');
    await waitForCondition(
        client,
        `getComputedStyle(document.querySelector('#orientation-notice')).display === 'none'`,
        'Querformat-Hinweis manuell geschlossen',
    );

    await evaluate(client, `window.openLeaderboardDialog(-1, '', '', 0, 'Englisch 6')`);
    await waitForCondition(client, `!document.querySelector('#leaderboard-dialog').classList.contains('hidden')`, 'mobile Bestenliste geöffnet');
    await waitForCondition(client, `document.querySelectorAll('#leaderboard-body tr').length === 2`, 'mobile Bestenliste gefiltert');
    for (const selector of [
        '#leaderboard-dialog',
        '.leaderboard-filters',
        '.leaderboard-filter-field:nth-child(1)',
        '.leaderboard-filter-field:nth-child(2)',
        '.leaderboard-filter-field:nth-child(3)',
    ]) {
        await assertInsideViewport(client, selector);
    }
    await assertInsideViewport(client, '.leaderboard-table-container', { allowHorizontalScroll: true });

    await sleep(150);
    assert.deepEqual([...new Set(browserProblems)], [], browserProblems.join('\n'));
}

async function main() {
    const browserBinary = findBrowser();
    const profileDirectory = await mkdtemp(join(tmpdir(), 'vokabelzombie-browser-'));
    const { server, port } = await startStaticServer();
    const browserStderr = [];
    const browserProcess = spawn(browserBinary, [
        '--headless=new',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-features=Translate,MediaRouter,OptimizationHints',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    browserProcess.stderr.setEncoding('utf8');
    browserProcess.stderr.on('data', chunk => browserStderr.push(chunk));

    let client;
    try {
        const devToolsPort = await waitForDevToolsPort(profileDirectory, browserProcess);
        const page = await openPage(devToolsPort, 'about:blank');
        client = await connectCdp(page.webSocketDebuggerUrl);
        const problems = [];
        await runSmokeTest(client, `http://127.0.0.1:${port}`, problems);
        console.log(`Browser-Smoke-Test OK: Desktop, Mobil, Missionspfad, Korrekturschleife, Querformat-Hinweis, Englisch 6, Bestenliste und Spielstart (${browserBinary}).`);
    } catch (error) {
        const stderr = browserStderr.join('').trim().split('\n').slice(-8).join('\n');
        if (stderr) console.error(`Letzte Browsermeldungen:\n${stderr}`);
        throw error;
    } finally {
        if (client) client.close();
        server.close();
        if (browserProcess.exitCode === null) browserProcess.kill('SIGTERM');
        await sleep(100);
        if (browserProcess.exitCode === null) browserProcess.kill('SIGKILL');
        await rm(profileDirectory, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(`Browser-Smoke-Test fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
});

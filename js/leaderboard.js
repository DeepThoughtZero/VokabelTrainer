/**
 * VokabelZombie - Leaderboard Logic
 * Handles communication with Google Apps Script backend
 */

const LEADERBOARD_CONFIG = {
    // Ersetze diese URL nach dem Deployment deines eigenen Apps Scripts!
    url: 'https://script.google.com/macros/s/AKfycbwBGTTUW5KV1CAxab0UVP_8pX11pi64mKG-6Xtn_JqBKPiw3wXYvRduE0bQ0db3Bxwf/exec',
    sheet: 'VokabelZombie_Leaderboard'
};

// Cache for leaderboard entries
let allLeaderboardEntries = [];
let lastSavedEntry = null;

document.addEventListener('DOMContentLoaded', () => {
    const filterSelect = document.getElementById('kategorie-filter');
    const sortSelect = document.getElementById('sort-filter');
    
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            filterAndRenderLeaderboard();
        });
    }
    
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            filterAndRenderLeaderboard();
        });
    }
    
    const closeBtn = document.getElementById('close-leaderboard-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('leaderboard-dialog').classList.add('hidden');
        });
    }
});

function updateCategoryDropdown(entries) {
    const filterSelect = document.getElementById('kategorie-filter');
    if (!filterSelect) return;
    
    const categories = new Set(entries.map(e => e.kategorie).filter(k => k));
    
    // Save current value
    const currentVal = filterSelect.value;
    
    filterSelect.innerHTML = '<option value="">Alle Kategorien</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        filterSelect.appendChild(opt);
    });
    
    // Restore value if exists
    if (Array.from(filterSelect.options).some(o => o.value === currentVal)) {
        filterSelect.value = currentVal;
    }
}

function filterAndRenderLeaderboard() {
    const filterSelect = document.getElementById('kategorie-filter');
    const sortSelect = document.getElementById('sort-filter');
    
    const categoryFilter = filterSelect ? filterSelect.value : '';
    const sortBy = sortSelect ? sortSelect.value : 'score';

    let filtered = [...allLeaderboardEntries];
    if (categoryFilter) {
        filtered = filtered.filter(entry => entry.kategorie === categoryFilter);
    }
    
    // Sort
    filtered.sort((a, b) => {
        if (sortBy === 'trefferquote') {
            const valA = parseFloat(a.trefferquote) || 0;
            const valB = parseFloat(b.trefferquote) || 0;
            return valB - valA || b.score - a.score;
        } else if (sortBy === 'maxStreak') {
            const valA = parseInt(a.maxStreak) || 0;
            const valB = parseInt(b.maxStreak) || 0;
            return valB - valA || b.score - a.score;
        } else {
            return b.score - a.score;
        }
    });

    renderLeaderboard(filtered);
}

async function loadLeaderboard() {
    try {
        const url = `${LEADERBOARD_CONFIG.url}?sheet=${LEADERBOARD_CONFIG.sheet}&t=${Date.now()}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        const data = await response.json();
        const entries = data.entries || [];

        allLeaderboardEntries = entries;
        updateCategoryDropdown(entries);
        
        filterAndRenderLeaderboard();

        return entries;
    } catch (error) {
        console.error("Fehler beim Laden der Bestenliste:", error);
        return [];
    }
}

async function saveHighscore(name, score, kategorie, trefferquote, maxStreak) {
    const params = new URLSearchParams({
        action: 'add',
        sheet: LEADERBOARD_CONFIG.sheet,
        name: name,
        score: score,
        kategorie: kategorie,
        trefferquote: trefferquote,
        maxStreak: maxStreak
    });

    try {
        const url = `${LEADERBOARD_CONFIG.url}?${params}`;
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        lastSavedEntry = {
            name: name,
            score: score,
            kategorie: kategorie,
            timestamp: Date.now()
        };

        return true;
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        return false;
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined || text === '') return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderLeaderboard(entries) {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;

    const topEntries = entries.slice(0, 50);
    let alreadyHighlighted = false;

    if (topEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Noch keine Einträge vorhanden.</td></tr>';
        return;
    }

    tbody.innerHTML = topEntries.map((entry, index) => {
        const rank = index + 1;
        let rankDisplay = rank;
        let isHighlighted = false;

        if (!alreadyHighlighted &&
            lastSavedEntry &&
            (Date.now() - lastSavedEntry.timestamp) < 30000 &&
            entry.name === lastSavedEntry.name &&
            Number(entry.score) === Number(lastSavedEntry.score)) {
            isHighlighted = true;
            alreadyHighlighted = true;
        }

        if (rank === 1) rankDisplay = `🥇 ${rank}`;
        else if (rank === 2) rankDisplay = `🥈 ${rank}`;
        else if (rank === 3) rankDisplay = `🥉 ${rank}`;

        const safeName = escapeHtml(entry.name || 'Anonym');
        const safeScore = escapeHtml(entry.score);
        let safeKategorie = escapeHtml(entry.kategorie || '-');
        safeKategorie = safeKategorie.replace('Englisch: ', 'Englisch:<br>');
        safeKategorie = safeKategorie.replace('Englisch - ', 'Englisch<br>- ');
        safeKategorie = safeKategorie.replace(', schreiben', '<br>schreiben');
        let quoteVal = entry.trefferquote;
        if (typeof quoteVal === 'number') {
            // Google Sheets converted 35% to 0.35
            if (quoteVal <= 1 && quoteVal > 0) {
                quoteVal = Math.round(quoteVal * 100) + '%';
            } else {
                quoteVal = quoteVal + '%';
            }
        } else if (typeof quoteVal === 'string' && !quoteVal.includes('%')) {
            const num = parseFloat(quoteVal);
            if (!isNaN(num) && num <= 1 && num > 0) {
                quoteVal = Math.round(num * 100) + '%';
            }
        }
        
        const safeQuote = escapeHtml(quoteVal || '-');
        const safeStreak = escapeHtml(entry.maxStreak || '0');
        
        let safeDate = escapeHtml(entry.date || '');
        let isParsed = false;
        try {
            if (entry.date) {
                const d = new Date(entry.date);
                if (!isNaN(d.getTime())) {
                    safeDate = escapeHtml(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
                    isParsed = true;
                }
            }
        } catch (e) {}
        
        // Fallback replacement if it was just a string from Google Sheets
        if (!isParsed && safeDate) {
            safeDate = safeDate.replace(/,?\s+(\d{2}:\d{2}).*/, '');
        }

        const rowStyle = isHighlighted ? 'background: rgba(0, 255, 136, 0.2); font-weight: bold;' : '';

        return `
            <tr style="${rowStyle}">
                <td style="font-size: 1.1em; white-space: nowrap;">${rankDisplay}</td>
                <td style="font-weight: 500">${safeName}</td>
                <td style="font-weight: bold; color: var(--accent-color);">${safeScore}</td>
                <td style="color: #ccc; font-size: 0.9em;">${safeKategorie}</td>
                <td>${safeQuote}</td>
                <td>${safeStreak}</td>
                <td style="font-size: 0.85em; color: #9ca3af">${safeDate}</td>
            </tr>
        `;
    }).join('');
}

window.openLeaderboardDialog = function(score, kategorie, trefferquote, maxStreak) {
    const dialog = document.getElementById('leaderboard-dialog');
    dialog.classList.remove('hidden');
    
    const formContainer = document.getElementById('leaderboard-entry-form');
    
    // Auto-filter by current category
    const filterSelect = document.getElementById('kategorie-filter');
    if (filterSelect) {
        // Will be applied after loading
        filterSelect.dataset.pendingFilter = kategorie;
    }
    
    if (score >= 0) {
        formContainer.style.display = 'flex';
        const submitBtn = document.getElementById('submit-score-btn');
        
        // Remove old listeners to avoid multiple submissions
        const newSubmitBtn = submitBtn.cloneNode(true);
        newSubmitBtn.disabled = false;
        newSubmitBtn.textContent = 'Eintragen';
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        
        newSubmitBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('player-name');
            const name = nameInput.value.trim();
            if (!name) {
                alert("Bitte gib einen Namen ein!");
                return;
            }
            
            newSubmitBtn.disabled = true;
            newSubmitBtn.textContent = 'Speichere...';
            
            const success = await saveHighscore(name, score, kategorie, trefferquote, maxStreak);
            if (success) {
                formContainer.style.display = 'none';
                
                // Verhindere mehrfaches Eintragen desselben Spiels
                const showLeaderboardBtn = document.getElementById('show-leaderboard-btn');
                if (showLeaderboardBtn) {
                    showLeaderboardBtn.style.display = 'none';
                }

                await loadLeaderboard();
                
                // Set filter to current category to see own rank
                if (filterSelect) {
                    if (Array.from(filterSelect.options).some(o => o.value === kategorie)) {
                        filterSelect.value = kategorie;
                    }
                }
                filterAndRenderLeaderboard();
            } else {
                alert("Fehler beim Speichern. Bitte versuche es erneut.");
                newSubmitBtn.disabled = false;
                newSubmitBtn.textContent = 'Eintragen';
            }
        });
    } else {
        formContainer.style.display = 'none';
    }
    
    document.getElementById('leaderboard-body').innerHTML = '<tr><td colspan="7" style="text-align:center;">Lade Bestenliste...</td></tr>';
    loadLeaderboard().then(() => {
        if (filterSelect && filterSelect.dataset.pendingFilter) {
            const pending = filterSelect.dataset.pendingFilter;
            if (Array.from(filterSelect.options).some(o => o.value === pending)) {
                filterSelect.value = pending;
            }
            delete filterSelect.dataset.pendingFilter;
        }
        filterAndRenderLeaderboard();
    });
};

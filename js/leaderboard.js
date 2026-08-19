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
    const gradeSelect = document.getElementById('klassen-filter');
    const sortSelect = document.getElementById('sort-filter');
    
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            filterAndRenderLeaderboard();
        });
    }
    if (gradeSelect) {
        gradeSelect.addEventListener('change', () => {
            updateLearningPathDropdown(allLeaderboardEntries);
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
    const gradeSelect = document.getElementById('klassen-filter');
    if (!gradeSelect) return;

    const currentGrade = gradeSelect.value;
    const grades = [...new Set(entries.map(entry => getGradeFromCategory(entry.kategorie)).filter(Boolean))]
        .sort((a, b) => Number(a) - Number(b));

    gradeSelect.innerHTML = '<option value="">Alle Klassen</option>';
    grades.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade;
        option.textContent = `Klasse ${grade}`;
        gradeSelect.appendChild(option);
    });

    if ([...gradeSelect.options].some(option => option.value === currentGrade)) {
        gradeSelect.value = currentGrade;
    }
    updateLearningPathDropdown(entries);
}

function updateLearningPathDropdown(entries) {
    const filterSelect = document.getElementById('kategorie-filter');
    const gradeSelect = document.getElementById('klassen-filter');
    if (!filterSelect) return;

    const selectedGrade = gradeSelect ? gradeSelect.value : '';
    const currentCategory = filterSelect.value;
    const categories = [...new Set(entries.map(entry => normalizeCategory(entry.kategorie)).filter(Boolean))]
        .filter(category => !selectedGrade || getGradeFromCategory(category) === selectedGrade)
        .sort(compareLeaderboardCategories);

    filterSelect.innerHTML = '<option value="">Alle Lernpfade</option>';
    const courses = [...new Set(categories.map(getCourseFromCategory).filter(Boolean))];
    const useGroups = !selectedGrade || courses.length > 1;

    if (useGroups) {
        courses.forEach(course => {
            const group = document.createElement('optgroup');
            const grade = getGradeFromCourseLabel(course);
            const subject = course.replace(/\s*\d+\s*$/, '');
            group.label = selectedGrade ? subject : `Klasse ${grade} · ${subject}`;
            categories
                .filter(category => getCourseFromCategory(category) === course)
                .forEach(category => group.appendChild(createLearningPathOption(category)));
            filterSelect.appendChild(group);
        });
    } else {
        categories.forEach(category => filterSelect.appendChild(createLearningPathOption(category)));
    }

    if ([...filterSelect.options].some(option => option.value === currentCategory)) {
        filterSelect.value = currentCategory;
    } else {
        filterSelect.value = '';
    }
}

function createLearningPathOption(category) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = formatLearningPathLabel(category);
    option.title = category;
    return option;
}

function compareLeaderboardCategories(left, right) {
    const gradeDifference = Number(getGradeFromCategory(left) || 999) - Number(getGradeFromCategory(right) || 999);
    if (gradeDifference) return gradeDifference;
    const courseDifference = getCourseFromCategory(left).localeCompare(getCourseFromCategory(right), 'de');
    if (courseDifference) return courseDifference;
    return formatLearningPathLabel(left).localeCompare(formatLearningPathLabel(right), 'de', { numeric: true });
}

function getCourseFromCategory(category) {
    const value = normalizeCategory(category);
    const current = value.match(/^(Englisch|Französisch|Latein)\s*(\d+)\s*:/i);
    if (current) {
        const subject = current[1].charAt(0).toUpperCase() + current[1].slice(1).toLowerCase();
        return `${subject} ${current[2]}`;
    }
    return '';
}

function getGradeFromCourseLabel(courseLabel) {
    const match = String(courseLabel || '').match(/\b(\d+)\s*$/);
    return match ? match[1] : '';
}

function getGradeFromCategory(category) {
    return getGradeFromCourseLabel(getCourseFromCategory(category));
}

function getLearningPathFromCategory(category) {
    return normalizeCategory(category)
        .replace(/^(?:Englisch|Französisch|Latein)\s*\d+\s*:\s*/i, '')
        .trim();
}

function formatLearningPathLabel(category) {
    return getLearningPathFromCategory(category)
        .replace(/Welcome back to Brighton/gi, 'Welcome back')
        .replace(/\bUnit\s*(\d+)\s*-\s*Mix\b/gi, 'U$1 (Mix)')
        .replace(/\bUnit\s*(\d+)\b/gi, 'U$1')
        .replace(/\s*-\s*Mix\b/gi, ' (Mix)')
        .replace(/,\s*/g, ' · ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function normalizeCategory(category) {
    return String(category || '').trim().replace(/^Englisch\s*:/i, 'Englisch 5:');
}

function filterAndRenderLeaderboard() {
    const filterSelect = document.getElementById('kategorie-filter');
    const gradeSelect = document.getElementById('klassen-filter');
    const sortSelect = document.getElementById('sort-filter');
    
    const categoryFilter = filterSelect ? filterSelect.value : '';
    const gradeFilter = gradeSelect ? gradeSelect.value : '';
    const sortBy = sortSelect ? sortSelect.value : 'score';

    let filtered = [...allLeaderboardEntries];
    if (gradeFilter) {
        filtered = filtered.filter(entry => getGradeFromCategory(entry.kategorie) === gradeFilter);
    }
    if (categoryFilter) {
        filtered = filtered.filter(entry => normalizeCategory(entry.kategorie) === categoryFilter);
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
        let safeKategorie = escapeHtml(normalizeCategory(entry.kategorie) || '-');
        safeKategorie = safeKategorie.replace(/^((?:Englisch|Französisch|Latein)\s*\d+):\s*/, '$1:<br>');
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

window.openLeaderboardDialog = function(score, kategorie, trefferquote, maxStreak, courseLabel = '') {
    const dialog = document.getElementById('leaderboard-dialog');
    dialog.classList.remove('hidden');
    
    const formContainer = document.getElementById('leaderboard-entry-form');
    
    // Auto-filter by current category
    const filterSelect = document.getElementById('kategorie-filter');
    const gradeSelect = document.getElementById('klassen-filter');
    if (filterSelect) {
        // Will be applied after loading
        filterSelect.dataset.pendingFilter = normalizeCategory(kategorie);
    }
    if (gradeSelect) {
        gradeSelect.dataset.pendingGrade = getGradeFromCategory(kategorie) || getGradeFromCourseLabel(courseLabel);
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
                    const normalizedCategory = normalizeCategory(kategorie);
                    if (Array.from(filterSelect.options).some(o => o.value === normalizedCategory)) {
                        filterSelect.value = normalizedCategory;
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
        if (gradeSelect && gradeSelect.dataset.pendingGrade) {
            const pendingGrade = gradeSelect.dataset.pendingGrade;
            if (Array.from(gradeSelect.options).some(option => option.value === pendingGrade)) {
                gradeSelect.value = pendingGrade;
            }
            delete gradeSelect.dataset.pendingGrade;
            updateLearningPathDropdown(allLeaderboardEntries);
        }
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

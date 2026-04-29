// --- UTILITAIRES & MODALES ---
function getLogDateString(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    if (date.toDateString() === today.toDateString()) {
        return timeStr;
    } else if (date.toDateString() === yesterday.toDateString()) {
        return `${timeStr}<br>Hier`;
    } else {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${timeStr}<br>${day}/${month}`;
    }
}

function formatLastSeen(dateString) {
    if (!dateString) return "Inconnue";
    const date = new Date(dateString);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    
    if (diffMins < 1) return "à l'instant";
    if (diffMins < 60) return `il y a ${diffMins} min`;
    if (diffMins < 1440) return `il y a ${Math.floor(diffMins/60)} h`;
    return date.toLocaleDateString();
}

function playSoundWithFade(url, totalDuration) {
    const audio = new Audio(url);
    // Les navigateurs bloquent parfois le son s'il n'y a pas eu de clic au préalable. On intercepte l'erreur proprement.
    audio.play().catch(e => console.warn("Audio bloqué en attente d'interaction :", e));

    const fadeDuration = Math.min(1000, totalDuration / 2); // 1 seconde max de fondu, ou la moitié du trajet s'il est très court
    const fadeStartTime = totalDuration - fadeDuration;

    setTimeout(() => {
        let volumeActuel = 1.0;
        const fadeInterval = setInterval(() => {
            volumeActuel -= 0.05;
            if (volumeActuel <= 0) {
                clearInterval(fadeInterval);
                audio.pause();
                audio.currentTime = 0;
            } else {
                audio.volume = volumeActuel;
            }
        }, fadeDuration / 20); // Divise la durée du fondu en 20 paliers fluides
    }, fadeStartTime);
}

function showModal(text, options = []) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-modal');
        const textEl = document.getElementById('modal-text');
        const optionsEl = document.getElementById('modal-options');

        textEl.innerText = text;
        optionsEl.innerHTML = '';

        if (options.length === 0) {
            options = [{ label: "OK", value: true }];
        }

        options.forEach(opt => {
            const btn = document.createElement('div');
            if (opt.type === 'color') {
                btn.className = 'color-btn';
                btn.style.backgroundColor = COLOR_MAP[opt.value] || opt.value;
            } else {
                btn.className = `modal-btn ${opt.class || ''}`;
                btn.innerText = opt.label;
                if (opt.bgColor) {
                    btn.style.backgroundColor = opt.bgColor;
                    btn.style.textShadow = "1px 1px 2px rgba(0,0,0,0.8)";
                }
            }

            btn.onclick = () => {
                modal.classList.add('hidden');
                resolve(opt.value);
            };
            optionsEl.appendChild(btn);
        });
        modal.classList.remove('hidden');
    });
}

function showMultiSelectModal(text, items, minSelect) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-modal');
        const textEl = document.getElementById('modal-text');
        const optionsEl = document.getElementById('modal-options');

        textEl.innerText = text;
        optionsEl.innerHTML = '';

        let selected = new Set();

        items.forEach(item => {
            const btn = document.createElement('div');
            btn.className = `modal-btn ${item.class || ''}`;
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.marginBottom = '8px';
            btn.innerText = item.label;
            btn.style.opacity = "0.6";
            btn.style.background = "#bdc3c7";
            
            btn.onclick = () => {
                if (selected.has(item.value)) {
                    selected.delete(item.value);
                    btn.style.opacity = "0.6"; btn.style.background = "#bdc3c7";
                } else {
                    selected.add(item.value);
                    btn.style.opacity = "1"; btn.style.background = "#2ecc71";
                }
                validateBtn.disabled = selected.size < minSelect;
                validateBtn.className = selected.size < minSelect ? "modal-btn disabled" : "modal-btn";
            };
            optionsEl.appendChild(btn);
        });

        const validateBtn = document.createElement('button');
        validateBtn.className = "modal-btn disabled";
        validateBtn.innerText = "Valider (" + minSelect + " min)";
        validateBtn.disabled = true;
        validateBtn.style.marginTop = "15px";
        validateBtn.onclick = () => {
            if (selected.size >= minSelect) {
                modal.classList.add('hidden');
                resolve(Array.from(selected));
            }
        };
        optionsEl.appendChild(validateBtn);
        modal.classList.remove('hidden');
    });
}

// --- HISTORIQUE UI ---
function toggleHistoryMenu() {
    const sidebar = document.getElementById('history-sidebar');
    if (sidebar.classList.contains('history-open')) {
        sidebar.classList.remove('history-open');
        const storageKey = 'lastViewedHistory_' + currentGameId + '_' + myPlayerId;
        localStorage.setItem(storageKey, new Date().toISOString());
        updateHistoryUI();
    } else {
        sidebar.classList.add('history-open');
        updateHistoryUI();
    }
}

async function showGameOptions() {
    if (gameState.creatorId !== myPlayerId) return;
    const currentRisky = gameState.options?.riskyMove !== false;
    
    const options = [
        { label: (currentRisky ? "✅" : "❌") + " Adrénaline (Risque = Récompense)", value: 'toggle_risky', bgColor: currentRisky ? '#2ecc71' : '#e74c3c' },
        { label: "Fermer", value: 'close', class: 'cancel' }
    ];
    
    const choice = await showModal("🛠 Options de la partie\n\nActivez les règles spéciales ci-dessous :", options);
    if (choice === 'toggle_risky') {
        if (!gameState.options) gameState.options = {};
        gameState.options.riskyMove = !currentRisky;
        await saveGameState();
        updateUI();
        showGameOptions(); // Rouvre le menu instantanément pour voir le changement
    }
}

window.historyActiveFilter = null;

function toggleHistoryFilter(userId) {
    if (window.historyActiveFilter === userId) window.historyActiveFilter = null; // Désactive si on reclique
    else window.historyActiveFilter = userId; // Active le filtre
    updateHistoryUI(); // Rafraîchit l'affichage
}

function updateHistoryUI() {
    const content = document.getElementById('history-content');
    const sidebar = document.getElementById('history-sidebar');
    const badge = document.getElementById('history-badge');
    if (!content || !gameState.history) return;

    const storageKey = 'lastViewedHistory_' + currentGameId + '_' + myPlayerId;
    const lastViewed = localStorage.getItem(storageKey) || "2000-01-01T00:00:00.000Z";

    // Rendu de la barre de filtres
    const filterContainer = document.getElementById('history-filters');
    if (filterContainer && gameState.characters) {
        let filterHtml = `<div class="history-filter-btn ${!window.historyActiveFilter ? 'active' : ''}" onclick="toggleHistoryFilter(null)">Tout</div>`;
        gameState.characters.forEach(c => {
            const u = gameState.users.find(usr => usr.id === c.userId);
            if (!u) return;
            const isActive = window.historyActiveFilter === c.userId;
            const avatarContent = u.avatarUrl ? `<img src="${u.avatarUrl}">` : u.name.substring(0, 2).toUpperCase();
            filterHtml += `
                <div class="history-filter-btn ${isActive ? 'active' : ''}" style="border-color: ${c.color};" onclick="toggleHistoryFilter('${c.userId}')" title="${u.name}">
                    <div class="player-avatar" style="width:18px; height:18px; min-width:18px; font-size:8px; border:none; cursor:pointer;">${avatarContent}</div>
                </div>`;
        });
        filterContainer.innerHTML = filterHtml;
    }

    let lastRound = null;
    let unreadCount = 0;
    
    content.innerHTML = gameState.history.slice().reverse().map(item => {
        const user = gameState.users.find(u => u.id === item.userId);
        if (!user && item.type !== 'system') return ''; 
        
        // Application du filtre : on masque si l'action n'est pas de l'utilisateur filtré (sauf messages système)
        if (window.historyActiveFilter && item.userId !== window.historyActiveFilter && item.type !== 'system') {
            return '';
        }
        
        const isMe = item.userId === myPlayerId;
        const isNew = !isMe && new Date(item.timestamp) > new Date(lastViewed);
        if (isNew) unreadCount++;
        
        const timeStr = getLogDateString(item.timestamp);
        const badgeHtml = isNew ? `<div class="history-badge-new">Nouv.</div>` : '';

        let roundHtml = '';
        if (item.round !== undefined && item.round !== lastRound) {
            // [3, 8, 13, 18, 24] sont les tours de révélation natifs
            const isRevealRound = [3, 8, 13, 18, 24].includes(item.round);
            const revealBadge = isRevealRound ? `<span class="history-round-reveal">👁️ Apparition Fugitif</span>` : '';
            roundHtml = `<div class="history-round-divider"><span>Tour ${item.round}</span>${revealBadge}</div>`;
            lastRound = item.round;
        }

        let actionHtml = '';
        if (item.type === 'adrenaline') {
            if (isMe || (gameState.lastRevealTurn && item.turn <= gameState.lastRevealTurn)) {
                actionHtml = `<div class="history-alert fugitive-win" style="background: rgba(230, 126, 34, 0.2); border-color: #e67e22; color: #e67e22;">${item.text}</div>`;
            } else {
                return ''; // Invisible pour la police tant que ce n'est pas révélé
            }
        } else if (item.type === 'move') {
            const imgMap = { 'BUS': 'Icone_bus.png', 'TAXI': 'Icone_taxi.png', 'UNDERGROUND': 'Icone_métro.png', 'BLACK': 'Icone_secret.png' };
            const imgSrc = imgMap[item.transport] || 'Icone_secret.png';
            let targetDisplay = item.target;
            if (item.target === '?') {
                targetDisplay = (isMe || (gameState.lastRevealTurn && item.turn <= gameState.lastRevealTurn)) ? (item.secretTarget || '❓') : '❓';
            }
            const revealIcon = item.isReveal ? '<span title="Apparition !">👁️</span>' : '';
            actionHtml = `<div class="history-schematic"><img src="Images/${imgSrc}" class="history-transport-icon" /><span class="history-arrow">➔</span><span class="history-node ${targetDisplay === '❓' ? 'node-secret' : ''}">${targetDisplay}</span>${revealIcon}</div>`;
        } else if (item.type === 'skip') {
            let targetDisplay = item.target && item.target !== '?' ? item.target : '';
            if (item.target === '?') {
                targetDisplay = (isMe || (gameState.lastRevealTurn && item.turn <= gameState.lastRevealTurn)) ? (item.secretTarget || '❓') : '❓';
            }
            const revealIcon = item.isReveal ? '<span title="Apparition !">👁️</span>' : '';
            actionHtml = `<div class="history-schematic"><span class="history-skip-icon">💤</span><span class="history-text">Repos</span>${targetDisplay ? `<span class="history-node ${targetDisplay === '❓' ? 'node-secret' : ''}">${targetDisplay}</span>` : ''}${revealIcon}</div>`;
        } else if (item.type === 'spawn') {
            let targetDisplay = item.target;
            if (item.isFugitiveSpawn) {
                targetDisplay = '❓';
                if (gameState.fugitiveMoves && gameState.fugitiveMoves.length > 0) {
                    const startPos = gameState.fugitiveMoves[0].fromPosition;
                    targetDisplay = (isMe || (gameState.lastRevealTurn && gameState.lastRevealTurn > 0)) ? startPos : '❓';
                }
            }
            actionHtml = `<div class="history-schematic"><span title="Déploiement" style="font-size:16px;">📍</span><span class="history-text">Départ</span><span class="history-arrow">➔</span><span class="history-node ${(targetDisplay === '❓') ? 'node-secret' : ''}">${targetDisplay}</span></div>`;
        } else if (item.type === 'catch') {
            actionHtml = `<div class="history-alert police-win">🚨 <b>Fugitif arrêté !</b></div>`;
        } else if (item.type === 'escape') {
            actionHtml = `<div class="history-alert fugitive-win">🚁 <b>Fugitif échappé !</b></div>`;
        } else if (item.type === 'system') {
            actionHtml = `<div class="history-system">${item.text}</div>`;
        } else {
            actionHtml = `<div style="line-height: 1.3;">${item.text}</div>`;
        }

        const char = gameState.characters?.find(c => c.userId === item.userId);
        const borderColor = char ? char.color : 'rgba(255,255,255,0.3)';
        
        const avatarContent = user?.avatarUrl ? `<img src="${user.avatarUrl}">` : (user ? user.name.substring(0, 2).toUpperCase() : '?');
        const avatarHtml = user ? `<div class="player-avatar" style="width: 26px; height: 26px; min-width: 26px; font-size: 10px; border-color: ${borderColor};" title="${user.name}">${avatarContent}</div>` : '';

        return `
            ${roundHtml}
            <div class="history-item ${isNew ? 'new-item' : ''}" style="border-left-color: ${item.type === 'system' ? 'transparent' : '#34495e'};">
                ${badgeHtml}
                ${item.type !== 'system' ? avatarHtml : ''}
                <div style="flex-grow: 1; display:flex; flex-direction:column; justify-content:center;">
                    ${actionHtml}
                </div>
                <div class="history-time">${timeStr}</div>
            </div>
        `;
    }).join(''); 

    if (badge) {
        if (unreadCount > 0 && !sidebar.classList.contains('history-open')) {
            badge.innerText = unreadCount;
            badge.classList.remove('hidden-view');
        } else {
            badge.classList.add('hidden-view');
        }
    }
}

function showToastFromHistory(item) {
    // On ne montre jamais l'adrénaline en popup si elle est encore secrète
    if (item.type === 'adrenaline') {
        const isMe = item.userId === myPlayerId;
        if (!isMe && (!gameState.lastRevealTurn || item.turn > gameState.lastRevealTurn)) return;
    }

    const user = gameState.users.find(u => u.id === item.userId);
    if (!user) return;

    const char = gameState.characters?.find(c => c.userId === item.userId);
    const borderColor = char ? char.color : 'rgba(255,255,255,0.3)';
    const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}">` : user.name.substring(0, 2).toUpperCase();
    const avatarHtml = `<div class="player-avatar" style="border-color: ${borderColor}; box-shadow: 0 0 5px ${borderColor};">${avatarContent}</div>`;

    let actionHtml = '';
    if (item.text) actionHtml = item.text;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.style.borderLeftColor = '#34495e';
    toast.innerHTML = `${avatarHtml}<div style="line-height: 1.3;"><b>${user.name}</b> ${actionHtml}</div>`;

    const container = document.getElementById('toast-container');
    if (container) {
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }
}

// --- CHAT UI ---
function toggleChatMenu() {
    const sidebar = document.getElementById('chat-sidebar');
    if (sidebar.classList.contains('chat-open')) {
        sidebar.classList.remove('chat-open');
        // On marque tout comme lu à la fermeture
        const storageKey = 'lastViewedChat_' + currentGameId + '_' + myPlayerId;
        localStorage.setItem(storageKey, new Date().toISOString());
        updateChatUI();
    } else {
        sidebar.classList.add('chat-open');
        updateChatUI();
        
        // Force l'ascenseur tout en bas à l'ouverture
        const content = document.getElementById('chat-content');
        if (content) setTimeout(() => { content.scrollTop = content.scrollHeight; }, 10);
    }
}

function updateChatUI() {
    const content = document.getElementById('chat-content');
    const sidebar = document.getElementById('chat-sidebar');
    if (!content || !gameState.chat) return;
    
    const storageKey = 'lastViewedChat_' + currentGameId + '_' + myPlayerId;
    const lastViewed = localStorage.getItem(storageKey) || "2000-01-01T00:00:00.000Z";


    let unreadCount = 0;
        let htmlToInject = '';
    
    gameState.chat.forEach(item => {
        const user = gameState.users.find(u => u.id === item.userId);
        if (!user) return; 
        
        const isMe = item.userId === myPlayerId;
        const isNew = !isMe && new Date(item.timestamp) > new Date(lastViewed);
        if (isNew) unreadCount++;
        
        const timeStr = getLogDateString(item.timestamp);
        const badgeHtml = isNew ? `<div style="position: absolute; top: -6px; right: -6px; font-size: 9px; background: #2ecc71; color: white; padding: 2px 4px; border-radius: 4px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 10;">Nouv.</div>` : '';
        
        if (isMe) {
            htmlToInject += `<div class="chat-bubble chat-bubble-own" style="position:relative; margin-bottom: 5px;"><div>${item.text}</div><div style="font-size: 9px; text-align: right; opacity: 0.7; margin-top: 3px;">${timeStr}</div></div>`;
        } else {
            const char = gameState.characters?.find(c => c.userId === item.userId);
            const borderColor = char ? char.color : 'rgba(255,255,255,0.3)';
            const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}">` : user.name.substring(0, 2).toUpperCase();
            const avatarHtml = `<div class="player-avatar" style="width: 24px; height: 24px; min-width: 24px; font-size: 10px; border-color: ${borderColor};" title="${user.name}">${avatarContent}</div>`;
            
            htmlToInject += `<div style="display: flex; gap: 6px; align-items: flex-end; align-self: flex-start; max-width: 90%; margin-bottom: 5px;">
                ${avatarHtml}
                <div class="chat-bubble chat-bubble-other" style="border-left: 3px solid #34495e; align-self: auto; max-width: unset; position:relative;">
                    ${badgeHtml}
                    <div>${item.text}</div>
                    <div style="font-size: 9px; text-align: right; opacity: 0.7; margin-top: 3px;">${timeStr}</div>
                </div>
            </div>`;
        }
    });
    
    content.innerHTML = htmlToInject;
    
    const isSidebarOpen = sidebar && sidebar.classList.contains('chat-open');
    const badgeLobby = document.getElementById('chat-badge-lobby');
    const badgeGame = document.getElementById('chat-badge-game');

    if (unreadCount > 0 && !isSidebarOpen) {
        if (badgeLobby) { badgeLobby.innerText = unreadCount; badgeLobby.classList.remove('hidden-view'); }
        if (badgeGame) { badgeGame.innerText = unreadCount; badgeGame.classList.remove('hidden-view'); }
    } else {
        if (badgeLobby) badgeLobby.classList.add('hidden-view');
        if (badgeGame) badgeGame.classList.add('hidden-view');
    }
    
    if (isSidebarOpen) {
        content.scrollTop = content.scrollHeight;
        setTimeout(() => { if(content) content.scrollTop = content.scrollHeight; }, 50);
    }
}

function showToastFromChat(item) {
    const user = gameState.users.find(u => u.id === item.userId);
    if (!user) return;

    const char = gameState.characters?.find(c => c.userId === item.userId);
    const borderColor = char ? char.color : 'rgba(255,255,255,0.3)';
    const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}">` : user.name.substring(0, 2).toUpperCase();
    const avatarHtml = `<div class="player-avatar" style="border-color: ${borderColor}; box-shadow: 0 0 5px ${borderColor};">${avatarContent}</div>`;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.style.borderLeftColor = '#34495e';
    toast.innerHTML = `${avatarHtml}<div style="line-height: 1.3; flex-grow: 1;"><b>${user.name}</b><br><span style="font-style: italic;">"${item.text}"</span></div>`;

    const container = document.getElementById('toast-container');
    if (container) {
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 5000); // 5 secondes pour lire le texte
    }
}

function triggerRemoteAnimation(action, callback) {
    if (!action.from || !action.to) return callback();

    const link = MAP.links.find(l => 
        l.type === action.transport && 
        ((l.from === action.from && l.to === action.to) || (l.to === action.from && l.from === action.to))
    );
    
    let pathIds = [action.from, action.to];
    if (link) {
        pathIds = [link.from, ...(link.path || []), link.to];
        if (link.to === action.from) pathIds.reverse();
    }

    window.lastArrivalCharId = action.charId;

    animateVehicleMove(pathIds, action.transport, () => {
        callback();
    }, action.charId);
}

// --- CARNET DE ROUTE DU FUGITIF ---
function updateTravelLogUI() {
    const container = document.getElementById('travel-log-content');
    if (!container) return;
    
    const isFugitive = gameState.characters?.find(c => c.role === 'fugitif')?.userId === myPlayerId;
    
    let html = '';
    for (let i = 1; i <= MAX_TURNS; i++) {
        const isReveal = REVEAL_TURNS.includes(i);
        const move = gameState.fugitiveMoves ? gameState.fugitiveMoves[i - 1] : null;
        
        let content = isReveal ? '👁️' : i;
        let bgColor = 'transparent';
        let textColor = 'white';
        
        if (move) {
            const isMoveRevealed = gameState.lastRevealTurn && i <= gameState.lastRevealTurn;
            const showPos = isMoveRevealed || isFugitive;

            if (move.transport === 'SKIP') {
                content = showPos ? (move.secretPosition || 'Zz') : 'Zz';
                bgColor = '#7f8c8d';
            } else {
                const tInfo = TRANSPORT[move.transport];
                bgColor = tInfo ? tInfo.color : '#bdc3c7';
                content = showPos ? (move.secretPosition || '?') : '';
                textColor = (move.transport === 'TAXI') ? '#2c3e50' : 'white'; // Texte sombre sur fond jaune/blanc
            }
        }
        
        const extraClass = isReveal ? 'travel-slot-reveal' : '';
        html += `<div class="travel-slot ${extraClass}" style="background-color: ${bgColor}; color: ${textColor};">${content}</div>`;
    }
    container.innerHTML = html;
    
    // Défilement automatique pour voir le tour actuel
    const currentTurn = gameState.fugitiveMoves ? gameState.fugitiveMoves.length : 0;
    if (currentTurn > 10) {
        container.scrollTop = (currentTurn * 22) - 100;
    }
}

// --- RENDU VISUEL DU PLATEAU ---

function renderRoleSlot(roleType, index, userId) {
    const user = userId ? gameState.users.find(u => u.id === userId) : null;
    if (user) {
        const isMe = userId === myPlayerId;
        const isBot = userId.startsWith('bot_');
        const quitBtn = (isMe || isBot) ? `<button onclick="unclaimRole('${roleType}', ${index})" style="background:#e74c3c; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">${isBot ? 'Retirer' : 'Quitter'}</button>` : '';
        const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : user.name.substring(0, 2).toUpperCase();
        return `<div class="role-slot filled ${roleType === 'fugitif' ? 'fugitif-filled' : ''}">
                    <div style="display:flex; align-items:center; gap:10px;"><div class="player-avatar" style="background:#2c3e50;">${avatarContent}</div><strong>${user.name}</strong></div>${quitBtn}
                </div>`;
    } else {
        const devBtn = window.isDevMode ? `<button onclick="debugAddBotToRole('${roleType}', ${index})" style="background:#8e44ad; color:white; border:none; border-radius:4px; padding:4px 8px; margin-left: 5px; cursor:pointer; font-weight:bold;">+ Bot</button>` : '';
        return `<div class="role-slot empty">
                    <span style="color:#bdc3c7; font-style:italic;">Emplacement libre</span>
                    <div>
                        <button onclick="claimRole('${roleType}', ${index})" style="background:#2ecc71; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:bold;">Incarner</button>
                        ${devBtn}
                    </div>
                </div>`;
    }
}

function renderWaitingRoom() {
    document.getElementById('lobby-container').classList.add('hidden-view');
    document.getElementById('game-container').classList.add('hidden-view');
    document.getElementById('waiting-room-container').classList.remove('hidden-view');
    document.getElementById('waiting-game-id').innerText = gameState.name || `Partie #${currentGameId}`;
    
    // Rendu du menu des rôles
    const optionsContainer = document.getElementById('game-options-container');
    if (gameState.creatorId === myPlayerId) {
        optionsContainer.innerHTML = `<button onclick="showGameOptions()" style="margin-top: 10px; padding: 8px 15px; background: #8e44ad; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">⚙️ Options de la partie</button>`;
    } else {
        optionsContainer.innerHTML = '';
    }

    const listEl = document.getElementById('waiting-players-list');
    listEl.innerHTML = `
        <p style="font-size: 14px; color: #bdc3c7; text-align: center; margin-top: 0;">Cliquez sur 'Incarner' ou ajoutez des Bots pour remplir les rôles.</p>
        <div class="role-container">
            <div class="role-column"><h3 style="margin-top:0; color:#e74c3c;">Le Fugitif (1)</h3>${renderRoleSlot('fugitif', 0, gameState.roles.fugitif)}</div>
            <div class="role-column"><h3 style="margin-top:0; color:#3498db;">Les Policiers (Max 4)</h3>${gameState.roles.policiers.map((userId, i) => renderRoleSlot('policier', i, userId)).join('')}</div>
        </div>
    `;
    
    const startBtn = document.getElementById('start-game-btn');
    const waitMsg = document.getElementById('waiting-msg');
    if (gameState.creatorId === myPlayerId) {
        startBtn.classList.remove('hidden-view'); waitMsg.classList.add('hidden-view');
        const isFugitifTaken = !!gameState.roles.fugitif;
        const isPoliceTaken = gameState.roles.policiers.some(p => p !== null);
        const canStart = isFugitifTaken && isPoliceTaken;
        startBtn.disabled = !canStart;
        startBtn.innerText = canStart ? "Démarrer la Traque !" : "⚠️ Rôles incomplets";
        if (canStart) { startBtn.style.background = "#e74c3c"; }
    } else {
        startBtn.classList.add('hidden-view'); waitMsg.classList.remove('hidden-view');
    }

    // Met à jour le chat en arrière-plan pour afficher les pastilles dans le salon !
    updateHistoryUI();
    updateChatUI();
}

function renderMap(svg) {
    if (window.isAnimatingMove) return; // Bloque le rafraîchissement pendant une animation
    window.currentTransportBubble = null; // Nettoyage de la bulle résiduelle
    
    svg.innerHTML = '';
    
    // 0. Image de Fond du Plateau
    const bgImg = document.createElementNS("http://www.w3.org/2000/svg", "image");
    bgImg.setAttribute("href", "Images/Fond.png");
    bgImg.setAttribute("width", "1448"); // À remplacer par la largeur réelle de ton image !
    bgImg.setAttribute("height", "1086"); // À remplacer par la hauteur réelle de ton image !
    svg.appendChild(bgImg);

    // 1. On dessine les Métros en premier (Large, sous les autres)
    MAP.links?.filter(l => l.type === 'UNDERGROUND').forEach(link => drawLink(svg, link));
    
    // 2. On dessine les Bus par-dessus (Moyen)
    MAP.links?.filter(l => l.type === 'BUS').forEach(link => drawLink(svg, link));
    
    // 3. On dessine les Taxis par-dessus tout (Fin)
    MAP.links?.filter(l => l.type === 'TAXI').forEach(link => drawLink(svg, link));
    
    // 3.5 Trace du Parcours Révélé du Fugitif
    if (gameState.lastRevealTurn > 0 && gameState.fugitiveMoves) {
        const revealedMoves = gameState.fugitiveMoves.filter(m => m.turn <= gameState.lastRevealTurn);
        if (revealedMoves.length > 0) {
            const pathNodes = [];
            revealedMoves.forEach((m, index) => {
                if (index === 0 && m.fromPosition) {
                    const startNode = MAP.nodes.find(n => n.id === m.fromPosition);
                    if (startNode) pathNodes.push(startNode);
                }
                if (m.secretPosition) {
                    const n = MAP.nodes.find(n => n.id === m.secretPosition);
                    if (n) pathNodes.push(n);
                }
            });

            if (pathNodes.length > 1) {
                for (let i = 0; i < pathNodes.length - 1; i++) {
                    const p1 = pathNodes[i];
                    const p2 = pathNodes[i + 1];
                    
                    if (p1.id === p2.id) continue; // Ignore les sauts de tour (repos sur place)

                    // Le segment de ligne en pointillé fluo
                    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
                    line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
                    line.setAttribute("stroke", "#ccff00"); // Jaune fluo
                    line.setAttribute("stroke-width", "4");
                    line.setAttribute("stroke-dasharray", "8, 8");
                    line.setAttribute("style", "filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.8));");
                    svg.appendChild(line);

                    // La flèche directionnelle placée exactement au milieu
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);

                    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                    arrow.setAttribute("points", "-8,-6 8,0 -8,6");
                    arrow.setAttribute("fill", "#ccff00");
                    arrow.setAttribute("transform", `translate(${midX}, ${midY}) rotate(${angle})`);
                    arrow.setAttribute("style", "filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.8));");
                    svg.appendChild(arrow);
                }
            }
        }
    }

    // 4. Détermination des destinations jouables (si c'est notre tour)
    const activeChar = gameState.characters ? gameState.characters[gameState.currentPlayerIndex] : null;
    const isMyTurn = activeChar?.userId === myPlayerId;
    const currentPos = (activeChar?.role === 'fugitif' && isMyTurn) ? activeChar.secretPosition : activeChar?.position;
    
    const policePositions = gameState.characters?.filter(c => c.role === 'policier' && c.position).map(c => c.position) || [];

    const playableDestinations = {};
    if (isMyTurn && currentPos && typeof TRANSPORT !== 'undefined') {
        MAP.links.forEach(l => {
            if (l.from === currentPos || l.to === currentPos) {
                const targetId = l.from === currentPos ? l.to : l.from;
                const transportInfo = TRANSPORT[l.type];
                
                if (activeChar.ap >= transportInfo.cost) {
                    // Règle : Interdiction absolue d'aller sur une case occupée par un Policier !
                    if (policePositions.includes(targetId)) return;

                    if (!playableDestinations[targetId]) playableDestinations[targetId] = [];
                    if (!playableDestinations[targetId].some(t => t.type === l.type)) {
                        playableDestinations[targetId].push({ type: l.type, ...transportInfo });
                    }
                    
                    // NOUVEAU : Identification des stations à haut risque
                    if (activeChar.role === 'fugitif' && gameState.options?.riskyMove !== false && isNodeRisky(targetId)) {
                        playableDestinations[targetId].isRisky = true;
                    }
                }
            }
        });
    }

    // 5. On dessine les stations en tout dernier pour qu'elles couvrent les lignes
    MAP.nodes?.forEach(node => drawNode(svg, node, playableDestinations[node.id]));

    // 6. On dessine les pions des joueurs
    gameState.characters?.forEach(char => {
        let posId = char.position;
        
        // Si c'est notre fugitif, on utilise sa position secrète locale pour l'affichage !
        if (char.role === 'fugitif' && char.userId === myPlayerId && char.secretPosition) {
            posId = char.secretPosition;
        }

        if (posId) {
            const node = MAP.nodes.find(n => n.id === posId);
            if (node) drawPawn(svg, node, char);
        }
    });
}

function animateVehicleMove(pathNodeIds, transportType, callback, charId) {
    const svg = document.getElementById('map-svg');
    if (!pathNodeIds || pathNodeIds.length < 2) return callback();
    
    window.isAnimatingMove = true;
    
    if (charId) {
        const pawn = document.getElementById(`pawn-${charId}`);
        if (pawn) pawn.style.display = 'none';
    }

    const rectGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    let vehicleVisual;
    if (transportType === 'BUS' || transportType === 'TAXI' || transportType === 'UNDERGROUND') {
        const imageMap = {
            'BUS': 'Icone_bus.png',
            'TAXI': 'Icone_taxi.png',
            'UNDERGROUND': 'Icone_métro.png'
        };
        vehicleVisual = document.createElementNS("http://www.w3.org/2000/svg", "image");
        vehicleVisual.setAttribute("href", `Images/${imageMap[transportType]}`);
        vehicleVisual.setAttribute("width", "60"); // Taille de l'image
        vehicleVisual.setAttribute("height", "60");
        vehicleVisual.setAttribute("x", "-30"); // Décalage pour centrer exactement (Moitié de la largeur)
        vehicleVisual.setAttribute("y", "-30"); // Décalage pour centrer (Moitié de la hauteur)
    } else {
        vehicleVisual = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        vehicleVisual.setAttribute("width", "24");
        vehicleVisual.setAttribute("height", "14");
        vehicleVisual.setAttribute("rx", "4");
        vehicleVisual.setAttribute("fill", TRANSPORT[transportType].color);
        vehicleVisual.setAttribute("stroke", "white");
        vehicleVisual.setAttribute("stroke-width", "2");
        vehicleVisual.setAttribute("x", "-12"); // Centrage
        vehicleVisual.setAttribute("y", "-7");
    }
    
    vehicleVisual.setAttribute("class", "vehicle-vibrate"); // Conserve la petite vibration
    
    rectGroup.appendChild(vehicleVisual);
    svg.appendChild(rectGroup);
    
    let durationPerSegment = 1800; // Tous les véhicules avancent désormais à la même vitesse (lente)
    
    const totalDuration = durationPerSegment * (pathNodeIds.length - 1);
    const audioMap = {
        'BUS': 'Audio/Démarrage_bus.mp3',
        'TAXI': 'Audio/Son_taxi.mp3',
        'UNDERGROUND': 'Audio/Son_métro.mp3'
    };
    if (audioMap[transportType]) {
        playSoundWithFade(audioMap[transportType], totalDuration);
    }

    let currentStep = 0;
    
    function moveNext() {
        if (currentStep >= pathNodeIds.length - 1) {
            rectGroup.remove();
            window.isAnimatingMove = false;
            if (callback) callback();
            return;
        }
        const n1Id = pathNodeIds[currentStep];
        const n2Id = pathNodeIds[currentStep + 1];
        const n1 = MAP.nodes.find(n => n.id === n1Id);
        const n2 = MAP.nodes.find(n => n.id === n2Id);

        const link = MAP.links.find(l => 
            l.type === transportType && 
            ((l.from === n1Id && l.to === n2Id) || (l.to === n1Id && l.from === n2Id))
        );

        let isReversed = link && link.to === n1Id;
        let pathElement;
        let pathLength = 0;

        // Création d'un rail invisible temporaire pour calculer la trajectoire
        if (link && link.svgPath) {
            pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathElement.setAttribute("d", link.svgPath);
            pathElement.style.display = "none";
            svg.appendChild(pathElement);
            pathLength = pathElement.getTotalLength();
        }

        const startTime = performance.now();
        const scaleX = (n2.x < n1.x) ? -1 : 1; // Orientation du sprite

        function animateFrame(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationPerSegment, 1);

            let currentX, currentY;

            if (pathElement && pathLength > 0) {
                // Suit la courbe parfaite !
                const currentDist = isReversed ? pathLength * (1 - progress) : pathLength * progress;
                const pt = pathElement.getPointAtLength(currentDist);
                currentX = pt.x;
                currentY = pt.y;
            } else {
                // Sécurité : avance en ligne droite si aucun tracé
                currentX = n1.x + (n2.x - n1.x) * progress;
                currentY = n1.y + (n2.y - n1.y) * progress;
            }

            let transform;
            if (transportType === 'BUS' || transportType === 'TAXI' || transportType === 'UNDERGROUND') {
                transform = `translate(${currentX}, ${currentY}) scale(${scaleX}, 1)`;
            } else {
                let angle = Math.atan2(n2.y - n1.y, n2.x - n1.x) * (180 / Math.PI);
                transform = `translate(${currentX}, ${currentY}) rotate(${angle})`;
            }

            rectGroup.setAttribute("transform", transform);

            if (progress < 1) {
                requestAnimationFrame(animateFrame);
            } else {
                if (pathElement) pathElement.remove(); // Nettoyage
                currentStep++;
                moveNext();
            }
        }
        requestAnimationFrame(animateFrame);
    }
    moveNext();
}

function drawPawn(svg, node, char) {
    const isActive = gameState.characters[gameState.currentPlayerIndex]?.id === char.id;
    
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("id", `pawn-${char.id}`);
    g.setAttribute("style", `transform-origin: ${node.x}px ${node.y}px; pointer-events: none;`);
    
    // Si le pion vient d'arriver de son voyage, on le fait sauter !
    if (char.id === window.lastArrivalCharId) {
        g.setAttribute("class", "pawn-jump");
        setTimeout(() => {
            if (isActive) g.setAttribute("class", "pawn-active");
            else g.removeAttribute("class");
        }, 500); // L'animation dure 0.5s
        window.lastArrivalCharId = null;
    } else if (isActive) {
        g.setAttribute("class", "pawn-active");
    }

        const imgSize = 65; // Plus grand (était 50)
    const offsetY = 20; // Plus haut pour voir le nom de la station (était 12)

    // Fond coloré (Pastille) pour faire ressortir le pion sur la carte
    const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bgCircle.setAttribute("cx", node.x);
    bgCircle.setAttribute("cy", node.y - offsetY);
    bgCircle.setAttribute("r", "22");
    bgCircle.setAttribute("fill", char.color);
    bgCircle.setAttribute("stroke", "white");
    bgCircle.setAttribute("stroke-width", "2");

    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttribute("width", imgSize);
    img.setAttribute("height", imgSize);
    img.setAttribute("x", node.x - (imgSize / 2));
    img.setAttribute("y", node.y - offsetY - (imgSize / 2));
    
    if (char.role === 'policier') {
        img.setAttribute("href", "Images/Icone_policier_jaune.png");
        bgCircle.setAttribute("style", `filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.8)); opacity: 0.9;`);
        img.setAttribute("style", `filter: drop-shadow(0px 0px 5px ${char.color});`);
    } else {
        img.setAttribute("href", "Images/Icone_fugitif.png");
        if (!char.position) {
            // Mode Caché : Légère transparence
            bgCircle.setAttribute("style", `filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.8)); opacity: 0.3;`);
            img.setAttribute("style", `filter: drop-shadow(0px 0px 8px #e74c3c); opacity: 0.6;`);
        } else {
            // Mode Révélé : Opaque
            bgCircle.setAttribute("style", `filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.8)); opacity: 0.9;`);
            img.setAttribute("style", `filter: drop-shadow(0px 0px 6px ${char.color});`);
        }
    }
    
    g.appendChild(bgCircle);
    g.appendChild(img);

    svg.appendChild(g);
}

function drawLink(svg, link) {
    if (!link.svgPath) return; // Si la ligne n'a pas de courbe de Figma, on l'ignore

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", link.svgPath);
    path.setAttribute("fill", "none");
    
    // Rendu TOTALEMENT invisible, l'image de fond fait le travail visuel !
    path.setAttribute("stroke", "transparent");
    path.setAttribute("opacity", "0");
    
    svg.appendChild(path);
}

function drawNode(svg, node, availableTransports) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    if (availableTransports && availableTransports.length > 0) {
        const isRisky = availableTransports.isRisky;
        const pulse = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        pulse.setAttribute("cx", node.x); pulse.setAttribute("cy", node.y); pulse.setAttribute("r", "22");
        pulse.setAttribute("fill", isRisky ? "rgba(231, 76, 60, 0.3)" : "transparent");
        pulse.setAttribute("stroke", isRisky ? "#e74c3c" : "#f1c40f"); 
        pulse.setAttribute("stroke-width", "4");
        pulse.classList.add(isRisky ? "playable-node-risky" : "playable-node");
        g.appendChild(pulse);
        
        if (isRisky) {
            const warn = document.createElementNS("http://www.w3.org/2000/svg", "text");
            warn.setAttribute("x", node.x + 13);
            warn.setAttribute("y", node.y - 13);
            warn.setAttribute("font-size", "14px");
            warn.textContent = "⚡";
            warn.style.pointerEvents = "none";
            g.appendChild(warn);
        }

        g.style.cursor = "pointer";
        g.onclick = (e) => {
            e.stopPropagation(); // Évite de fermer la bulle immédiatement
            if (window.isDraggingMap) return;
            
            if (window.currentTransportBubble) {
                window.currentTransportBubble.remove();
                window.currentTransportBubble = null;
            }
            
            const foWidth = 280;
            const foHeight = 140;
            
            let bubbleY = node.y - foHeight - 5;
            let isBelow = false;
            if (bubbleY < 0) { bubbleY = node.y + 20; isBelow = true; } // Si la station est trop haute, on affiche en dessous

            const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            fo.setAttribute("x", node.x - foWidth / 2);
            fo.setAttribute("y", bubbleY);
            fo.setAttribute("width", foWidth);
            fo.setAttribute("height", foHeight);

            const imageMap = { 'BUS': 'Icone_bus.png', 'TAXI': 'Icone_taxi.png', 'UNDERGROUND': 'Icone_métro.png', 'BLACK': 'Icone_secret.png' };
            
            let html = `<div xmlns="http://www.w3.org/1999/xhtml" class="transport-bubble-wrapper ${isBelow ? 'bubble-below' : ''}">`;
            
            const riskHtml = isRisky ? `<div style="background: rgba(231,76,60,0.95); color: white; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; border: 1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.5); text-shadow: 1px 1px 1px black; margin-bottom: 6px; text-align: center;">⚡ Risque : Jauge restaurée & +1 PA Max</div>` : '';

            if (isBelow) {
                html += `<div class="transport-bubble-arrow arrow-up"></div><div style="display:flex; flex-direction:column; align-items:center;">${riskHtml}<div class="transport-bubble">`;
            } else {
                html += `<div style="display:flex; flex-direction:column; align-items:center;">${riskHtml}<div class="transport-bubble">`;
            }
            
            availableTransports.forEach(t => {
                const imgSrc = imageMap[t.type] ? `<img src="Images/${imageMap[t.type]}" />` : `<span style="font-size:20px">❓</span>`;
                html += `<div class="transport-btn" data-type="${t.type}" style="border-color: ${t.color};" title="${t.name}">
                            ${imgSrc}
                            <span class="transport-cost">-${t.cost} PA</span>
                         </div>`;
            });
            
            if (isBelow) html += `</div></div>`;
            else html += `</div></div><div class="transport-bubble-arrow"></div>`;
            html += `</div>`;
            
            fo.innerHTML = html;
            svg.appendChild(fo);
            window.currentTransportBubble = fo;

            // Écouteurs de clics sur les boutons de la bulle
            fo.querySelectorAll('.transport-btn').forEach(btn => {
                btn.onclick = (ev) => {
                    ev.stopPropagation();
                    const chosenTransport = btn.getAttribute('data-type');
                    const activeChar = gameState.characters[gameState.currentPlayerIndex];
                    const tInfo = TRANSPORT[chosenTransport];
                    
                    if (activeChar.ap < tInfo.cost) return alert("Pas assez de PA pour ce transport !");
                    
                    fo.remove();
                    window.currentTransportBubble = null;

                    const currentPos = (activeChar.role === 'fugitif' && activeChar.userId === myPlayerId) ? activeChar.secretPosition : activeChar.position;
                    const link = MAP.links.find(l => l.type === chosenTransport && ((l.from === currentPos && l.to === node.id) || (l.to === currentPos && l.from === node.id)));
                    
                    let pathIds = [currentPos, node.id];
                    if (link) { pathIds = [link.from, ...(link.path || []), link.to]; if (link.to === currentPos) pathIds.reverse(); }
                    
                    window.lastArrivalCharId = activeChar.id;
                    animateVehicleMove(pathIds, chosenTransport, () => { moveToNode(node.id, chosenTransport); }, activeChar.id);
                };
            });
        };
    }

    const hasUnderground = MAP.links.some(l => l.type === 'UNDERGROUND' && (l.from === node.id || l.to === node.id));
    const hasBus = MAP.links.some(l => l.type === 'BUS' && (l.from === node.id || l.to === node.id));

    // 1. Cercle de base (Gris/Blanc pour Taxi)
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", node.x); c.setAttribute("cy", node.y);
    c.setAttribute("r", "11");
    c.setAttribute("fill", "#D9D9D9");
    c.setAttribute("stroke", "black");
    c.setAttribute("stroke-width", "1");
    g.appendChild(c);

    // 2. Bus (Demi-cercle inférieur Bleu)
    if (hasBus) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        // L'arc SVG remplace l'ancien masque de Figma (beaucoup plus rapide)
        path.setAttribute("d", `M ${node.x - 11} ${node.y} A 11 11 0 0 0 ${node.x + 11} ${node.y} Z`);
        path.setAttribute("fill", "#027EB7");
        path.setAttribute("stroke", "black");
        path.setAttribute("stroke-width", "1");
        g.appendChild(path);
    }

    // 3. Rectangle central (Rouge pour Métro, Blanc sinon)
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", node.x - 8.25);
    rect.setAttribute("y", node.y - 4.25);
    rect.setAttribute("width", "16.5");
    rect.setAttribute("height", "8.5");
    rect.setAttribute("fill", hasUnderground ? "#ED3008" : "#FFFFFF");
    rect.setAttribute("stroke", "black");
    rect.setAttribute("stroke-width", "0.5");
    g.appendChild(rect);

    // 4. Le Numéro de la Station
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", node.x);
    text.setAttribute("y", node.y + 3.5); // Centrage précis
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("style", "font-size: 9px; font-weight: bold; fill: black; font-family: sans-serif; pointer-events: none;");
    text.textContent = node.id;
    
    g.appendChild(text); 
    svg.appendChild(g);
}

function updateUI() {
    if (gameState.status === 'waiting') return renderWaitingRoom();
    document.getElementById('waiting-room-container').classList.add('hidden-view');
    document.getElementById('lobby-container').classList.add('hidden-view');
    document.getElementById('game-container').classList.remove('hidden-view');

    const activeChar = gameState.characters[gameState.currentPlayerIndex];
    const turnBanner = document.getElementById('turn-banner');
    if (turnBanner) {
        if (activeChar?.userId === myPlayerId) {
            turnBanner.innerHTML = `🟢 C'est à vous ! <button onclick="skipTurn()" style="margin-left:10px; padding:4px 8px; border-radius:4px; border:none; background:white; color:#2ecc71; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">Passer <span class="hide-on-mobile">(+2 PA)</span></button>`; turnBanner.className = "turn-active";
        } else {
            turnBanner.innerText = "🔴 En attente de " + (activeChar ? activeChar.name : "...") + "..."; turnBanner.className = "turn-waiting";
        }
    }

    const playersContainer = document.getElementById('players-info-container');
    if (playersContainer) {
        playersContainer.innerHTML = '';
        
        const fugitifContainer = document.createElement('div');
        fugitifContainer.className = 'fugitif-container';
        
        const policeContainer = document.createElement('div');
        policeContainer.className = 'police-container';

        gameState.characters.forEach((char, index) => {
            const isActive = index === gameState.currentPlayerIndex;
            const cardDiv = document.createElement('div');
            cardDiv.className = `player-info-card ${isActive ? 'active' : ''}`;
            cardDiv.style.borderTop = `4px solid ${char.color}`;
            if (isActive) { cardDiv.style.borderColor = char.color; cardDiv.style.boxShadow = `0 0 15px ${char.color}80`; }
            const user = gameState.users.find(u => u.id === char.userId);
            const isOnline = user && onlinePlayers[user.id]; const onlineIcon = isOnline ? "🟢" : "🔴";
            
            const avatarContent = user?.avatarUrl ? `<img src="${user.avatarUrl}">` : (user ? user.name.substring(0, 2).toUpperCase() : '?');
            const avatarImg = `<div class="player-avatar" style="width:22px; height:22px; min-width:22px; font-size:10px; margin-right:4px; border-color: ${char.color};">${avatarContent}</div>`;
            
            // Action au clic : centrer sur le joueur
            cardDiv.onclick = () => {
                const targetPos = (char.role === 'fugitif' && char.userId === myPlayerId && char.secretPosition) ? char.secretPosition : char.position;
                if (targetPos) focusOnNode(targetPos);
            };

            if (char.role === 'fugitif') {
                cardDiv.style.backgroundColor = 'rgba(231, 76, 60, 0.35)'; // Fond rouge translucide pour le Fugitif
                cardDiv.style.border = `1px solid ${char.color}`;
            }

            const isFugitive = char.role === 'fugitif';
            const isMeChar = char.userId === myPlayerId;
            let apHtml = '';
            
            // Cacher les PA du fugitif à la police
            if (isFugitive && !isMeChar) {
                apHtml = `<div class="ap-container" title="Points d'Action (Cachés)"><div class="ap-bar" style="width: 100%; background: repeating-linear-gradient(45deg, #2c3e50, #2c3e50 5px, #34495e 5px, #34495e 10px);"></div><div class="ap-text">⚡ ? / ? PA</div></div>`;
            } else {
                const apPercent = (char.ap / char.maxAp) * 100;
                const apColor = isFugitive ? 'linear-gradient(90deg, #c0392b, #e74c3c)' : 'linear-gradient(90deg, #d35400, #f39c12)';
                apHtml = `<div class="ap-container" title="Points d'Action"><div class="ap-bar" style="width: ${apPercent}%; background: ${apColor};"></div><div class="ap-text">⚡ ${char.ap} / ${char.maxAp} PA</div></div>`;
            }

            cardDiv.innerHTML = `
                <div class="player-name" ${isActive ? `style="color: ${char.color};"` : ''}>${onlineIcon} ${avatarImg}<span class="hide-on-mobile" style="margin-left:4px;">${char.name}</span></div>
                <div class="player-stats">
                    ${apHtml}
                </div>
            `;
            
            if (char.role === 'fugitif') {
                fugitifContainer.appendChild(cardDiv);
            } else {
                policeContainer.appendChild(cardDiv);
            }
        });
        
        playersContainer.appendChild(fugitifContainer);
        playersContainer.appendChild(policeContainer);
    }

    document.getElementById('travel-log-sidebar').classList.remove('hidden-view');
    renderMap(document.getElementById('map-svg'));
    updateHistoryUI();
    updateChatUI();
    updateTravelLogUI();

    if (gameState.status === 'finished' && !window.hasShownEndModal) {
        window.hasShownEndModal = true;
        const title = gameState.winner?.team === 'police' ? "🚨 LA POLICE GAGNE 🚨" : "🚁 LE FUGITIF S'ÉCHAPPE 🚁";
        showModal(`${title}\n\n${gameState.winner?.reason || 'La partie est terminée.'}`);
    }
}
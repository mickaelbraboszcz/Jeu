// --- UTILITAIRES & MODALES ---
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

// --- ANIMATIONS VISUELLES ---
function animateFlyingCard(sourceEl, targetEl, color) {
    if (!sourceEl || !targetEl) return;
    const startRect = sourceEl.getBoundingClientRect();
    const endRect = targetEl.getBoundingClientRect();

    const ghost = document.createElement('div');
    ghost.className = 'card-visual';
    
    if (color === 'deck') {
        ghost.classList.add('deck-card');
        ghost.innerText = 'Pioche';
    } else if (color === 'dest') {
        ghost.classList.add('dest-card');
        ghost.innerText = 'Missions';
    } else if (color === 'locomotive') {
        ghost.classList.add('loco-card');
        ghost.innerText = 'J';
    } else {
        ghost.style.backgroundColor = COLOR_MAP[color] || color;
        ghost.innerText = INITIALS_MAP[color] || color.charAt(0).toUpperCase();
    }

    ghost.style.position = 'fixed';
    ghost.style.left = startRect.left + 'px';
    ghost.style.top = startRect.top + 'px';
    ghost.style.width = startRect.width + 'px';
    ghost.style.height = startRect.height + 'px';
    ghost.style.margin = '0';
    ghost.style.zIndex = '9999';
    ghost.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
    ghost.style.pointerEvents = 'none';
    ghost.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';

    document.body.appendChild(ghost);
    ghost.offsetWidth;

    const destX = endRect.left + (endRect.width / 2) - (startRect.width / 2);
    const destY = endRect.top + (endRect.height / 2) - (startRect.height / 2);

    ghost.style.left = destX + 'px';
    ghost.style.top = destY + 'px';
    ghost.style.transform = 'scale(0.5) rotate(15deg)';
    ghost.style.opacity = '0';

    setTimeout(() => ghost.remove(), 400);
}

// --- HISTORIQUE UI ---
function toggleHistoryMenu() {
    const sidebar = document.getElementById('history-sidebar');
    if (sidebar.classList.contains('history-open')) {
        sidebar.classList.remove('history-open');
        // On marque comme "lu" uniquement quand on FERME le panneau
        const storageKey = 'lastViewedHistory_' + currentGameId + '_' + localPlayerIndex;
        localStorage.setItem(storageKey, new Date().toISOString());
        updateHistoryUI();
    } else {
        sidebar.classList.add('history-open');
        updateHistoryUI();
    }
}

function updateHistoryUI() {
    const content = document.getElementById('history-content');
    const sidebar = document.getElementById('history-sidebar');
    const badge = document.getElementById('history-badge');
    if (!content || !gameState.history) return;

    const storageKey = 'lastViewedHistory_' + currentGameId + '_' + localPlayerIndex;
    const lastViewed = localStorage.getItem(storageKey) || "2000-01-01T00:00:00.000Z";


    let unreadCount = 0;
    content.innerHTML = gameState.history.slice().reverse().map(item => {
        const player = gameState.players[item.player];
        if (!player) return ''; 
        
        const isMe = item.player === localPlayerIndex;
        const isNew = !isMe && new Date(item.timestamp) > new Date(lastViewed);
        if (isNew) unreadCount++;
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const avatarContent = player.avatarUrl ? `<img src="${player.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : player.name.substring(0, 2).toUpperCase();
        const avatarHtml = `<div class="player-avatar" style="width: 22px; height: 22px; min-width: 22px; font-size: 9px; background-color: ${player.color}; flex-shrink: 0;" title="${player.name}">${avatarContent}</div>`;

        let actionHtml = '';
        if (item.text) actionHtml = item.text;
        else if (item.type === 'draw') {
            const cardsHtml = item.cards.map(c => {
                if (c === 'deck') return `<span class="mini-card mini-deck" title="Pioche">?</span>`;
                if (c === 'locomotive') return `<span class="mini-card mini-loco" title="Locomotive">J</span>`;
                return `<span class="mini-card" style="background-color: ${COLOR_MAP[c] || c}" title="${c}">${INITIALS_MAP[c] || c.charAt(0).toUpperCase()}</span>`;
            }).join('');
            actionHtml = `a pioché ${cardsHtml}`;
        } else if (item.type === 'mission') actionHtml = `a gardé <b style="color:#f1c40f">${item.count}</b> carte(s) mission secrète.`;
        else if (item.type === 'route') actionHtml = `a construit la route <b style="color:#3498db">${item.from} - ${item.to}</b> (<span style="color:#2ecc71">+${item.points} pts</span>).`;
        else if (item.type === 'start') actionHtml = `La partie a démarré !`;

        const badgeHtml = isNew ? `<div style="position: absolute; top: -6px; right: -6px; font-size: 9px; background: #2ecc71; color: white; padding: 2px 4px; border-radius: 4px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 10;">Nouv.</div>` : '';

        return `
            <div class="history-item ${isNew ? 'new-item' : ''}" style="border-left-color: ${player.color}">
                ${badgeHtml}
                ${avatarHtml}
                <div style="line-height: 1.3; flex-grow: 1;">${actionHtml}</div>
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
    const player = gameState.players[item.player];
    if (!player) return;

    const avatarContent = player.avatarUrl ? `<img src="${player.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : player.name.substring(0, 2).toUpperCase();
    const avatarHtml = `<div class="player-avatar" style="width: 28px; height: 28px; min-width: 28px; font-size: 11px; background-color: ${player.color}; flex-shrink: 0; box-shadow: 0 0 5px ${player.color};">${avatarContent}</div>`;

    let actionHtml = '';
    if (item.text) actionHtml = item.text;
    else if (item.type === 'draw') {
        const cardsHtml = item.cards.map(c => {
            if (c === 'deck') return `<span class="mini-card mini-deck" title="Pioche">?</span>`;
            if (c === 'locomotive') return `<span class="mini-card mini-loco" title="Locomotive">J</span>`;
            return `<span class="mini-card" style="background-color: ${COLOR_MAP[c] || c}" title="${c}">${INITIALS_MAP[c] || c.charAt(0).toUpperCase()}</span>`;
        }).join('');
        actionHtml = `a pioché ${cardsHtml}`;
    } else if (item.type === 'mission') actionHtml = `a gardé <b style="color:#f1c40f">${item.count}</b> mission(s).`;
    else if (item.type === 'route') actionHtml = `a construit <b style="color:#3498db">${item.from} - ${item.to}</b>.`;
    else if (item.type === 'start') actionHtml = `La partie a démarré !`;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.style.borderLeftColor = player.color;
    toast.innerHTML = `${avatarHtml}<div style="line-height: 1.3;"><b>${player.name}</b> ${actionHtml}</div>`;

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
        const storageKey = 'lastViewedChat_' + currentGameId + '_' + localPlayerIndex;
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
    
    const storageKey = 'lastViewedChat_' + currentGameId + '_' + localPlayerIndex;
    const lastViewed = localStorage.getItem(storageKey) || "2000-01-01T00:00:00.000Z";


    let unreadCount = 0;
        let htmlToInject = '';
    
    gameState.chat.forEach(item => {
        const player = gameState.players[item.player];
        if (!player) return; 
        
        const isMe = item.player === localPlayerIndex;
        const isNew = !isMe && new Date(item.timestamp) > new Date(lastViewed);
        if (isNew) unreadCount++;
        
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const badgeHtml = isNew ? `<div style="position: absolute; top: -6px; right: -6px; font-size: 9px; background: #2ecc71; color: white; padding: 2px 4px; border-radius: 4px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 10;">Nouv.</div>` : '';

        
        
        if (isMe) {
            htmlToInject += `<div class="chat-bubble chat-bubble-own" style="position:relative; margin-bottom: 5px;"><div>${item.text}</div><div style="font-size: 9px; text-align: right; opacity: 0.7; margin-top: 3px;">${timeStr}</div></div>`;
        } else {
            const avatarContent = player.avatarUrl ? `<img src="${player.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : player.name.substring(0, 2).toUpperCase();
            const avatarHtml = `<div class="player-avatar" style="width: 24px; height: 24px; min-width: 24px; font-size: 10px; background-color: ${player.color}; flex-shrink: 0;" title="${player.name}">${avatarContent}</div>`;
            
            htmlToInject += `<div style="display: flex; gap: 6px; align-items: flex-end; align-self: flex-start; max-width: 90%; margin-bottom: 5px;">
                ${avatarHtml}
                <div class="chat-bubble chat-bubble-other" style="border-left: 3px solid ${player.color}; align-self: auto; max-width: unset; position:relative;">
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
    const player = gameState.players[item.player];
    if (!player) return;

    const avatarContent = player.avatarUrl ? `<img src="${player.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : player.name.substring(0, 2).toUpperCase();
    const avatarHtml = `<div class="player-avatar" style="width: 28px; height: 28px; min-width: 28px; font-size: 11px; background-color: ${player.color}; flex-shrink: 0; box-shadow: 0 0 5px ${player.color};">${avatarContent}</div>`;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.style.borderLeftColor = player.color;
    toast.innerHTML = `${avatarHtml}<div style="line-height: 1.3; flex-grow: 1;"><b>${player.name}</b><br><span style="font-style: italic;">"${item.text}"</span></div>`;

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

// --- RENDU VISUEL DU PLATEAU ---
function renderWaitingRoom() {
    document.getElementById('lobby-container').classList.add('hidden-view');
    document.getElementById('game-container').classList.add('hidden-view');
    document.getElementById('waiting-room-container').classList.remove('hidden-view');
    document.getElementById('waiting-game-id').innerText = gameState.name || `Partie #${currentGameId}`;
    
    const listEl = document.getElementById('waiting-players-list');
    listEl.innerHTML = gameState.players.map((p, i) => {
        const isOnline = onlinePlayers[p.id];
        const onlineIcon = isOnline ? "🟢" : "🔴";
        const avatarImg = p.avatarUrl ? `<img src="${p.avatarUrl}" style="width:24px; height:24px; border-radius:50%; vertical-align:middle; margin-right:8px; border:1px solid ${p.color}; object-fit:cover;">` : '';
        const lastSeenText = (!isOnline && p.lastConnection) ? ` <span style="font-size:12px; color:#ccc; font-weight:normal;">(Vu: ${formatLastSeen(p.lastConnection)})</span>` : '';
        return `<div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.2); color: ${p.color}; font-weight: bold;">
                ${onlineIcon} ${avatarImg}${i === 0 ? '👑 ' : '🧑‍🚀 '}${p.name} ${p.id === myPlayerId ? ' <i>(VOUS)</i>' : ''}${lastSeenText}</div>`;
    }).join('');
    
    const startBtn = document.getElementById('start-game-btn');
    const waitMsg = document.getElementById('waiting-msg');
    if (gameState.players[0].id === myPlayerId) {
        startBtn.classList.remove('hidden-view'); waitMsg.classList.add('hidden-view');
        startBtn.disabled = gameState.players.length < 2;
        startBtn.innerText = gameState.players.length < 2 ? "En attente de joueurs... (1/4)" : "Démarrer la partie !";
        startBtn.style.background = gameState.players.length < 2 ? "gray" : "#e67e22";
    } else {
        startBtn.classList.add('hidden-view'); waitMsg.classList.remove('hidden-view');
    }

    // Met à jour le chat en arrière-plan pour afficher les pastilles dans le salon !
    updateHistoryUI();
    updateChatUI();
}

function renderMap(svg) {
    svg.innerHTML = '';
    const myPlayer = gameState.players[localPlayerIndex];
    const activePlayer = gameState.players[gameState.currentPlayer];

    MAP.routes.forEach(route => {
        let isPlayable = localPlayerIndex === gameState.currentPlayer && !gameState.claimedRoutes.some(r => r.id === route.id) && activePlayer.wagons >= route.distance && gameState.cardsDrawnThisTurn === 0;
        if (isPlayable) {
            if (route.color === "gris") isPlayable = COLORS.filter(c => c !== "locomotive").some(c => (myPlayer.cards[c] + myPlayer.cards["locomotive"]) >= route.distance);
            else isPlayable = (myPlayer.cards[route.color] + myPlayer.cards["locomotive"]) >= route.distance;
        }
        drawProfessionalRoute(svg, route, isPlayable);
    });

    myPlayer.destinations.forEach(d => {
        const vFrom = MAP.villes.find(v => v.id === d.from);
        const vTo = MAP.villes.find(v => v.id === d.to);
        if (vFrom && vTo) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", vFrom.x); line.setAttribute("y1", vFrom.y);
            line.setAttribute("x2", vTo.x); line.setAttribute("y2", vTo.y);
            line.classList.add("mission-line"); svg.appendChild(line);
        }
    });
    MAP.villes.forEach(ville => drawCity(svg, ville));
}

function drawCity(svg, ville) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", ville.x); circle.setAttribute("cy", ville.y); circle.setAttribute("r", "14");
    circle.setAttribute("fill", "white"); circle.setAttribute("stroke", "#2c3e50"); circle.setAttribute("stroke-width", "3");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", ville.x); text.setAttribute("y", ville.y + 30);
    text.setAttribute("text-anchor", "middle"); text.setAttribute("style", "font-size: 12px; font-weight: bold; fill: #2c3e50;");
    text.textContent = ville.name;
    g.appendChild(circle); g.appendChild(text); svg.appendChild(g);
}

function drawProfessionalRoute(svg, route, isPlayable) {
    const vFrom = MAP.villes.find(v => v.id === route.from); const vTo = MAP.villes.find(v => v.id === route.to);
    const dx = vTo.x - vFrom.x; const dy = vTo.y - vFrom.y; const distanceTotale = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI); const nbWagons = route.distance;
    const wagonWidth = (distanceTotale / nbWagons) - 4; const wagonHeight = 12;

    const routeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    routeGroup.setAttribute("id", `route-${route.id}`);
    if (isPlayable) routeGroup.classList.add("highlight-route", "playable-pulse");

    const claimData = gameState.claimedRoutes.find(r => r.id === route.id);
    for (let i = 0; i < nbWagons; i++) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const offset = (i * (wagonWidth + 4)) + 2;
        rect.setAttribute("x", vFrom.x + (dx * offset / distanceTotale)); rect.setAttribute("y", vFrom.y + (dy * offset / distanceTotale) - (wagonHeight / 2));
        rect.setAttribute("width", wagonWidth); rect.setAttribute("height", wagonHeight); rect.setAttribute("rx", "2");
        rect.setAttribute("transform", `rotate(${angle}, ${vFrom.x + (dx * offset / distanceTotale)}, ${vFrom.y + (dy * offset / distanceTotale)})`);
        rect.classList.add("wagon-unit");
        if (claimData) {
            const ownerColor = gameState.players[claimData.owner].color;
            rect.setAttribute("fill", "#1a252f"); rect.setAttribute("stroke", ownerColor); rect.setAttribute("stroke-width", "3");
            rect.style.opacity = "1"; rect.style.filter = `drop-shadow(0px 2px 5px ${ownerColor})`;
        } else {
            rect.setAttribute("fill", route.color === "gris" ? "#bdc3c7" : (COLOR_MAP[route.color] || route.color)); rect.style.opacity = "0.25";
        }
        if (route.isTunnel) { rect.classList.add("tunnel-wagon"); if (!claimData) rect.setAttribute("stroke", "#2c3e50"); }
        routeGroup.appendChild(rect);
    }
    routeGroup.onclick = async () => { if (!window.isDraggingMap && await claimRoute(gameState.currentPlayer, route.id)) updateUI(); };
    svg.appendChild(routeGroup);
}

function updateUI() {
    if (gameState.status === 'waiting') return renderWaitingRoom();
    document.getElementById('waiting-room-container').classList.add('hidden-view');
    document.getElementById('lobby-container').classList.add('hidden-view');
    document.getElementById('game-container').classList.remove('hidden-view');

    const myPlayer = gameState.players[localPlayerIndex];
    const turnBanner = document.getElementById('turn-banner');
    if (turnBanner) {
        if (localPlayerIndex === gameState.currentPlayer) {
            turnBanner.innerText = "🟢 C'est à vous de jouer !"; turnBanner.className = "turn-active";
            document.querySelector('.draw-area').classList.remove('disabled-turn');
        } else {
            turnBanner.innerText = "🔴 En attente de " + gameState.players[gameState.currentPlayer].name + "..."; turnBanner.className = "turn-waiting";
            document.querySelector('.draw-area').classList.add('disabled-turn');
        }
    }
    
    const playersContainer = document.getElementById('players-info-container');
    if (playersContainer) {
        playersContainer.innerHTML = '';
                
        // NOUVEAU : Calcul des chemins les plus longs pour déterminer le gagnant actuel
        const longestRoutes = gameState.players.map((_, i) => getLongestRouteForPlayer(i));
        const maxLongestRoute = Math.max(0, ...longestRoutes);
        
        gameState.players.forEach((p, index) => {
            const isActive = index === gameState.currentPlayer;
            const cardDiv = document.createElement('div');
            cardDiv.className = `player-info-card ${isActive ? 'active' : ''}`;
            cardDiv.style.borderTop = `4px solid ${p.color}`;
            if (isActive) { cardDiv.style.borderColor = p.color; cardDiv.style.boxShadow = `0 0 15px ${p.color}80`; }
            const isOnline = onlinePlayers[p.id]; const onlineIcon = isOnline ? "🟢" : "🔴";
            const avatarImg = p.avatarUrl ? `<img src="${p.avatarUrl}" style="width:16px; height:16px; border-radius:50%; vertical-align:middle; margin-right:4px; object-fit:cover;">` : '';
            const lastSeenText = (!isOnline && p.lastConnection) ? `<div style="font-size:9px; color:#bdc3c7; margin-top:-5px; margin-bottom:4px; font-weight:normal; line-height: 1;">Vu: ${formatLastSeen(p.lastConnection)}</div>` : '';
                        
            const pLongest = longestRoutes[index];
            const isLongest = pLongest > 0 && pLongest === maxLongestRoute;
            const longestStyle = isLongest ? 'color: #f1c40f; text-shadow: 0 0 5px rgba(241,196,15,0.8);' : 'color: #bdc3c7; opacity: 0.8;';
            const longestIcon = isLongest ? '🏆' : '🛤️';
            
            
            cardDiv.innerHTML = `
                <div class="player-name" ${isActive ? `style="color: ${p.color};"` : ''}>${onlineIcon} ${avatarImg}${p.name}${index === localPlayerIndex ? " (VOUS)" : ""}${isActive && gameState.cardsDrawnThisTurn > 0 ? " (1 pioche)" : ""}</div>
                ${lastSeenText}
                <div class="player-stats">
                    <div class="stat-item" title="Score"><span class="stat-icon">⭐</span><span class="stat-value">${p.score}</span></div>
                    <div class="stat-item" title="Wagons restants"><span class="stat-icon">🚂</span><span class="stat-value">${p.wagons}</span></div>
                    <div class="stat-item" title="Cartes en main"><span class="stat-icon">🃏</span><span class="stat-value">${Object.values(p.cards).reduce((a, b) => a + b, 0)}</span></div>
                    <div class="stat-item" title="Missions secrètes"><span class="stat-icon">🎯</span><span class="stat-value">${p.destinations.length}</span></div>
                    <div class="stat-item" style="grid-column: span 2; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); ${longestStyle}" title="Chemin le plus long"><span class="stat-icon">${longestIcon}</span><span class="stat-value" style="${longestStyle}">${pLongest}</span></div>
                </div>
            `;
            playersContainer.appendChild(cardDiv);
        });
    }

    const destContainer = document.getElementById('current-destinations');
    if (destContainer) {
        destContainer.innerHTML = '';
        if (myPlayer.destinations.length > 0) myPlayer.destinations.forEach(d => {
            const span = document.createElement('span'); span.className = 'mission-item'; span.innerText = `${MAP.villes.find(v => v.id === d.from).name} - ${MAP.villes.find(v => v.id === d.to).name}`; destContainer.appendChild(span);
        }); else destContainer.innerText = "Aucune";
    }

    renderMap(document.getElementById('map-svg'));

    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = '';
    Object.keys(myPlayer.cards).forEach(color => {
        if (myPlayer.cards[color] > 0) for (let i = 0; i < myPlayer.cards[color]; i++) {
            const cardDiv = document.createElement('div'); cardDiv.className = `card-visual`;
            if (color === "locomotive") { cardDiv.classList.add("loco-card"); cardDiv.innerText = "J"; } 
            else { cardDiv.style.backgroundColor = COLOR_MAP[color] || color; cardDiv.innerText = INITIALS_MAP[color] || color.charAt(0).toUpperCase(); }
            cardDiv.style.transform = `rotate(${(i * 2) - 5}deg)`; handContainer.appendChild(cardDiv);
        }
    });

    const riverContainer = document.getElementById('river');
    if (riverContainer) {
        riverContainer.innerHTML = '';
        gameState.faceUpCards.forEach((color, index) => {
            const cardDiv = document.createElement('div'); cardDiv.className = `card-visual river-card`;
            if (color === "locomotive") {
                cardDiv.classList.add("loco-card"); cardDiv.innerText = "J";
                if (gameState.cardsDrawnThisTurn > 0) cardDiv.classList.add("disabled-card"); else cardDiv.onclick = (e) => drawFromRiver(index, e);
            } else { cardDiv.style.backgroundColor = COLOR_MAP[color] || color; cardDiv.innerText = INITIALS_MAP[color] || color.charAt(0).toUpperCase(); cardDiv.onclick = (e) => drawFromRiver(index, e); }
            riverContainer.appendChild(cardDiv);
        });
    }

    if (document.getElementById('deck')) document.getElementById('deck').innerText = `Pioche\n(${gameState.deck.length})`;
    if (document.getElementById('dest-deck')) document.getElementById('dest-deck').innerText = `Missions\n(${gameState.destinationDeck.length})`;
    if (document.getElementById('discard')) document.getElementById('discard').innerText = `Défausse\n(${gameState.discardPile.length})`;
    updateHistoryUI();
    updateChatUI();
}
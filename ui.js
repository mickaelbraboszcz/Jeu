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

function showGameOptions() {
    if (gameState.creatorId !== myPlayerId) return;
    showModal("🛠 Options de la partie\n\n(Menu en cours de préparation...)", []);
}

function updateHistoryUI() {
    const content = document.getElementById('history-content');
    const sidebar = document.getElementById('history-sidebar');
    const badge = document.getElementById('history-badge');
    if (!content || !gameState.history) return;

    const storageKey = 'lastViewedHistory_' + currentGameId + '_' + myPlayerId;
    const lastViewed = localStorage.getItem(storageKey) || "2000-01-01T00:00:00.000Z";


    let unreadCount = 0;
    content.innerHTML = gameState.history.slice().reverse().map(item => {
        const user = gameState.users.find(u => u.id === item.userId);
        if (!user) return ''; 
        
        const isMe = item.userId === myPlayerId;
        const isNew = !isMe && new Date(item.timestamp) > new Date(lastViewed);
        if (isNew) unreadCount++;
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
         const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : user.name.substring(0, 2).toUpperCase();
        const avatarHtml = `<div class="player-avatar" style="width: 22px; height: 22px; min-width: 22px; font-size: 9px; background-color: #34495e; flex-shrink: 0;" title="${user.name}">${avatarContent}</div>`;
        let actionHtml = '';
        if (item.text) actionHtml = item.text; // On ne garde que le format générique

        const badgeHtml = isNew ? `<div style="position: absolute; top: -6px; right: -6px; font-size: 9px; background: #2ecc71; color: white; padding: 2px 4px; border-radius: 4px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 10;">Nouv.</div>` : '';

        return `
            <div class="history-item ${isNew ? 'new-item' : ''}" style="border-left-color: #34495e">
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
    const user = gameState.users.find(u => u.id === item.userId);
    if (!user) return;

    const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : user.name.substring(0, 2).toUpperCase();
    const avatarHtml = `<div class="player-avatar" style="width: 28px; height: 28px; min-width: 28px; font-size: 11px; background-color: #34495e; flex-shrink: 0; box-shadow: 0 0 5px #34495e;">${avatarContent}</div>`;

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
        
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const badgeHtml = isNew ? `<div style="position: absolute; top: -6px; right: -6px; font-size: 9px; background: #2ecc71; color: white; padding: 2px 4px; border-radius: 4px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 10;">Nouv.</div>` : '';
        
        if (isMe) {
            htmlToInject += `<div class="chat-bubble chat-bubble-own" style="position:relative; margin-bottom: 5px;"><div>${item.text}</div><div style="font-size: 9px; text-align: right; opacity: 0.7; margin-top: 3px;">${timeStr}</div></div>`;
        } else {
            const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : user.name.substring(0, 2).toUpperCase();
            const avatarHtml = `<div class="player-avatar" style="width: 24px; height: 24px; min-width: 24px; font-size: 10px; background-color: #34495e; flex-shrink: 0;" title="${user.name}">${avatarContent}</div>`;
            
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

    const avatarContent = user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : user.name.substring(0, 2).toUpperCase();
    const avatarHtml = `<div class="player-avatar" style="width: 28px; height: 28px; min-width: 28px; font-size: 11px; background-color: #34495e; flex-shrink: 0; box-shadow: 0 0 5px #34495e;">${avatarContent}</div>`;

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
    
    let html = '';
    for (let i = 1; i <= MAX_TURNS; i++) {
        const isReveal = REVEAL_TURNS.includes(i);
        const move = gameState.fugitiveMoves ? gameState.fugitiveMoves[i - 1] : null;
        
        let content = isReveal ? '👁️' : i;
        let bgColor = 'transparent';
        let textColor = 'white';
        
        if (move) {
            if (move.transport === 'SKIP') {
                content = isReveal ? (move.position || 'Zz') : 'Zz';
                bgColor = '#7f8c8d';
            } else {
                const tInfo = TRANSPORT[move.transport];
                bgColor = tInfo ? tInfo.color : '#bdc3c7';
                content = isReveal ? (move.position || '?') : '';
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
        startBtn.innerText = canStart ? "Démarrer la partie !" : "En attente des rôles...";
        startBtn.style.background = canStart ? "#e67e22" : "gray";
    } else {
        startBtn.classList.add('hidden-view'); waitMsg.classList.remove('hidden-view');
    }

    // Met à jour le chat en arrière-plan pour afficher les pastilles dans le salon !
    updateHistoryUI();
    updateChatUI();
}

function renderMap(svg) {
    if (window.isAnimatingMove) return; // Bloque le rafraîchissement pendant une animation
    
    svg.innerHTML = '';
    
    // 1. On dessine les Métros en premier (Large, sous les autres)
    MAP.links?.filter(l => l.type === 'UNDERGROUND').forEach(link => drawLink(svg, link));
    
    // 2. On dessine les Bus par-dessus (Moyen)
    MAP.links?.filter(l => l.type === 'BUS').forEach(link => drawLink(svg, link));
    
    // 3. On dessine les Taxis par-dessus tout (Fin)
    MAP.links?.filter(l => l.type === 'TAXI').forEach(link => drawLink(svg, link));
    
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
    if (transportType === 'BUS') {
        vehicleVisual = document.createElementNS("http://www.w3.org/2000/svg", "image");
        vehicleVisual.setAttribute("href", "Images/Icone_bus.png");
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
    
    // Vitesse selon le transport (RALENTIE pour mieux apprécier l'animation)
    let durationPerSegment = 1000;
    if (transportType === 'TAXI') durationPerSegment = 1800; // Très lent
    else if (transportType === 'BUS') durationPerSegment = 1200; // Moyen
    else if (transportType === 'UNDERGROUND') durationPerSegment = 800; // Rapide
    else if (transportType === 'BLACK') durationPerSegment = 1400;
    
    const totalDuration = durationPerSegment * (pathNodeIds.length - 1);
    if (transportType === 'BUS') {
        playSoundWithFade('Audio/Démarrage_bus.mp3', totalDuration);
    }

    let currentStep = 0;
    
    function moveNext() {
        if (currentStep >= pathNodeIds.length - 1) {
            rectGroup.remove();
            window.isAnimatingMove = false;
            if (callback) callback();
            return;
        }
        const n1 = MAP.nodes.find(n => n.id === pathNodeIds[currentStep]);
        const n2 = MAP.nodes.find(n => n.id === pathNodeIds[currentStep + 1]);
        
        const angle = Math.atan2(n2.y - n1.y, n2.x - n1.x) * (180 / Math.PI);
        
        let transform1, transform2;
        if (transportType === 'BUS') {
            // Le bus reste horizontal, effet miroir s'il va vers la gauche
            const scaleX = n2.x < n1.x ? -1 : 1;
            transform1 = `translate(${n1.x}, ${n1.y}) scale(${scaleX}, 1)`;
            transform2 = `translate(${n2.x}, ${n2.y}) scale(${scaleX}, 1)`;
        } else {
            // Les autres véhicules s'inclinent pour suivre la route
            transform1 = `translate(${n1.x}, ${n1.y}) rotate(${angle})`;
            transform2 = `translate(${n2.x}, ${n2.y}) rotate(${angle})`;
        }

        rectGroup.style.transition = 'none';
        rectGroup.setAttribute("transform", transform1);
        rectGroup.getBoundingClientRect(); // Force le navigateur à enregistrer la position de départ
        
        rectGroup.style.transition = `transform ${durationPerSegment}ms linear`;
        rectGroup.setAttribute("transform", transform2);
        
        setTimeout(() => { currentStep++; moveNext(); }, durationPerSegment);
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

        if (char.role === 'policier') {
            const imgSize = 50;
            const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
            img.setAttribute("href", "Images/Icone_policier_jaune.png");
            img.setAttribute("width", imgSize);
            img.setAttribute("height", imgSize);
            
            img.setAttribute("x", node.x - (imgSize / 2));
            img.setAttribute("y", node.y - 12 - (imgSize / 2));
            
            img.setAttribute("style", `filter: drop-shadow(0px 3px 4px rgba(0,0,0,0.6)) drop-shadow(0px 0px 6px ${char.color});`);
            
            g.appendChild(img);
        } else {
            const imgSize = 50;
            const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
            img.setAttribute("href", "Images/Icone_fugitif.png");
            img.setAttribute("width", imgSize);
            img.setAttribute("height", imgSize);
            
            img.setAttribute("x", node.x - (imgSize / 2));
            img.setAttribute("y", node.y - 12 - (imgSize / 2));
            
            if (!char.position) {
                // Mode Caché : Légère transparence et halo rouge
                img.setAttribute("style", `filter: drop-shadow(0px 3px 4px rgba(0,0,0,0.6)) drop-shadow(0px 0px 8px #e74c3c); opacity: 0.7;`);
            } else {
                // Mode Révélé : Opaque avec le halo classique
                img.setAttribute("style", `filter: drop-shadow(0px 3px 4px rgba(0,0,0,0.6)) drop-shadow(0px 0px 6px ${char.color});`);
            }
            g.appendChild(img);
    }

    svg.appendChild(g);
}

function drawLink(svg, link) {
    const fromNode = MAP.nodes.find(n => n.id === link.from);
    const toNode = MAP.nodes.find(n => n.id === link.to);
    if (!fromNode || !toNode) return;

    const fullPath = [link.from, ...(link.path || []), link.to];
    const points = [];
    fullPath.forEach(nodeId => {
        const n = MAP.nodes.find(n => n.id === nodeId);
        if (n) points.push(`${n.x},${n.y}`);
    });

    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", points.join(" "));
    polyline.setAttribute("fill", "none");

    const transportInfo = TRANSPORT[link.type];
    let color = transportInfo ? transportInfo.color : "white";
    let width = 2;
    let opacity = 1;

    // Différenciation élégante des lignes
    if (link.type === 'UNDERGROUND') {
        width = 8; opacity = 0.6;
    } else if (link.type === 'BUS') {
        width = 5; opacity = 0.8;
    } else if (link.type === 'TAXI') {
        width = 2; opacity = 1;
    }

    polyline.setAttribute("stroke", color);
    polyline.setAttribute("stroke-width", width);
    polyline.setAttribute("opacity", opacity);
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    
    svg.appendChild(polyline);
}

function drawNode(svg, node, availableTransports) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    if (availableTransports && availableTransports.length > 0) {
        const pulse = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        pulse.setAttribute("cx", node.x); pulse.setAttribute("cy", node.y); pulse.setAttribute("r", "22");
        pulse.setAttribute("fill", "transparent");
        pulse.setAttribute("stroke", "#f1c40f"); 
        pulse.setAttribute("stroke-width", "4");
        pulse.classList.add("playable-node");
        g.appendChild(pulse);
        
        g.style.cursor = "pointer";
        g.onclick = async () => {
            if (window.isDraggingMap) return;
            const options = availableTransports.map(t => ({
                label: `${t.name} (-${t.cost} PA)`,
                value: t.type,
                bgColor: t.color
            }));
            options.push({ label: "Annuler", value: null, class: "cancel" });
            
            const chosenTransport = await showModal(`Rejoindre la station ${node.id} ?\nChoisissez votre transport :`, options);
            
            if (chosenTransport) {
                const activeChar = gameState.characters[gameState.currentPlayerIndex];
                const tInfo = TRANSPORT[chosenTransport];
                
                if (activeChar.ap < tInfo.cost) return alert("Pas assez de PA pour ce transport !");
                
                const currentPos = (activeChar.role === 'fugitif' && activeChar.userId === myPlayerId) ? activeChar.secretPosition : activeChar.position;
                
                const link = MAP.links.find(l => 
                    l.type === chosenTransport && 
                    ((l.from === currentPos && l.to === node.id) || (l.to === currentPos && l.from === node.id))
                );
                
                let pathIds = [currentPos, node.id];
                if (link) {
                    pathIds = [link.from, ...(link.path || []), link.to];
                    if (link.to === currentPos) pathIds.reverse(); // Si on parcourt la route à l'envers
                }
                
                window.lastArrivalCharId = activeChar.id;

                animateVehicleMove(pathIds, chosenTransport, () => {
                    moveToNode(node.id, chosenTransport); // Le vrai déplacement logique
                }, activeChar.id);
            }
        };
    }

    const hasUnderground = MAP.links.some(l => l.type === 'UNDERGROUND' && (l.from === node.id || l.to === node.id));
    const hasBus = MAP.links.some(l => l.type === 'BUS' && (l.from === node.id || l.to === node.id));
    const hasTaxi = MAP.links.some(l => l.type === 'TAXI' && (l.from === node.id || l.to === node.id));

    let currentRadius = 18;
    if (hasUnderground) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", node.x); c.setAttribute("cy", node.y); c.setAttribute("r", currentRadius); c.setAttribute("fill", TRANSPORT.UNDERGROUND.color); g.appendChild(c);
        currentRadius -= 3;
    }
    if (hasBus) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", node.x); c.setAttribute("cy", node.y); c.setAttribute("r", currentRadius); c.setAttribute("fill", TRANSPORT.BUS.color); g.appendChild(c);
        currentRadius -= 3;
    }
    if (hasTaxi) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", node.x); c.setAttribute("cy", node.y); c.setAttribute("r", currentRadius); c.setAttribute("fill", TRANSPORT.TAXI.color); g.appendChild(c);
    }

    const center = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    center.setAttribute("cx", node.x); center.setAttribute("cy", node.y); center.setAttribute("r", "11");
    center.setAttribute("fill", "#ecf0f1");
    g.appendChild(center);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", node.x); text.setAttribute("y", node.y + 4); // +4 pour centrer verticalement
    text.setAttribute("text-anchor", "middle"); 
    text.setAttribute("style", "font-size: 12px; font-weight: bold; fill: #2c3e50; font-family: sans-serif; pointer-events: none;");
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
            turnBanner.innerHTML = `🟢 C'est à vous ! <button onclick="skipTurn()" style="margin-left:10px; padding:4px 8px; border-radius:4px; border:none; background:white; color:#2ecc71; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">Passer (+2 PA)</button>`; turnBanner.className = "turn-active";
        } else {
            turnBanner.innerText = "🔴 En attente de " + (activeChar ? activeChar.name : "...") + "..."; turnBanner.className = "turn-waiting";
        }
    }

    const playersContainer = document.getElementById('players-info-container');
    if (playersContainer) {
        playersContainer.innerHTML = '';
        
        const fugitifContainer = document.createElement('div');
        fugitifContainer.style.display = 'flex';
        fugitifContainer.style.marginRight = '10px';
        
        const policeContainer = document.createElement('div');
        policeContainer.style.display = 'flex';
        policeContainer.style.gap = '5px';
        policeContainer.style.flexWrap = 'wrap';
        policeContainer.style.flex = '1';
        policeContainer.style.borderLeft = '2px dashed rgba(255,255,255,0.3)';
        policeContainer.style.paddingLeft = '10px';
        policeContainer.style.alignItems = 'center';

        gameState.characters.forEach((char, index) => {
            const isActive = index === gameState.currentPlayerIndex;
            const cardDiv = document.createElement('div');
            cardDiv.className = `player-info-card ${isActive ? 'active' : ''}`;
            cardDiv.style.borderTop = `4px solid ${char.color}`;
            if (isActive) { cardDiv.style.borderColor = char.color; cardDiv.style.boxShadow = `0 0 15px ${char.color}80`; }
            const user = gameState.users.find(u => u.id === char.userId);
            const isOnline = user && onlinePlayers[user.id]; const onlineIcon = isOnline ? "🟢" : "🔴";
            const avatarImg = user?.avatarUrl ? `<img src="${user.avatarUrl}" style="width:16px; height:16px; border-radius:50%; vertical-align:middle; margin-right:4px; object-fit:cover;">` : '';
            
            if (char.role === 'fugitif') {
                cardDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                cardDiv.style.border = `1px solid ${char.color}`;
            }

            let displayPos = char.position || '?';
            if (char.role === 'fugitif' && char.userId === myPlayerId && char.secretPosition) {
                displayPos = char.secretPosition + ' 🕵️'; // Montre la position avec un emoji pour rappeler le secret
            }

            const apPercent = (char.ap / char.maxAp) * 100;
            const apColor = char.role === 'fugitif' ? 'linear-gradient(90deg, #c0392b, #e74c3c)' : 'linear-gradient(90deg, #d35400, #f39c12)';

            cardDiv.innerHTML = `
                <div class="player-name" ${isActive ? `style="color: ${char.color};"` : ''}>${onlineIcon} ${avatarImg}${char.name}</div>
                <div class="player-stats">
                    <div class="stat-item" style="justify-content: space-between; padding: 0 5px;" title="Position"><span class="stat-icon">📍</span><span class="stat-value">${displayPos}</span></div>
                    <div class="ap-container" title="Points d'Action">
                        <div class="ap-bar" style="width: ${apPercent}%; background: ${apColor};"></div>
                        <div class="ap-text">⚡ ${char.ap} / ${char.maxAp} PA</div>
                    </div>
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
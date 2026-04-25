// --- IDENTIFICATION DU JOUEUR ---
let myPlayerId = null;
let myPlayerName = null;
let myAvatarUrl = null;

let gameState = {
    status: 'waiting', // 'waiting' ou 'playing'
    creatorId: null,
    options: {}, // Configuration de la partie
    turnCount: 1, // Compteur du nombre de tours global
    history: [], // Stocke les logs d'actions
    chat: [], // Stocke les messages textuels
    fugitiveMoves: [], // Carnet de route du Fugitif
    users: [], // Les joueurs humains connectés au salon
    roles: {
        fugitif: null, // userId
        policiers: [null, null, null, null] // array of userIds
    },
    lastAction: null, // Trace le dernier déplacement pour l'animation réseau
    characters: [], // Les pions sur le plateau (Créés au démarrage)
    currentPlayerIndex: 0 // A qui le tour dans le tableau characters
};

let currentGameId = null;

let gameChannel = null;
let onlinePlayers = {}; // Stocke les ID des joueurs actuellement connectés
let mySecretPosition = null; // Stockage RAM ultra-rapide de la position

// --- MULTIJOUEUR SUPABASE ---

async function saveGameState() {
    if (!currentGameId) return;
    const { error } = await supabaseClient
        .from('games')
        .update({ state: gameState })
        .eq('id', currentGameId);
    
    if (error) console.error("Erreur de sauvegarde :", error);
}

function subscribeToGame(id) {
    if (gameChannel) {
        supabaseClient.removeChannel(gameChannel);
    }

    // On crée un canal spécial "Presence" basé sur notre ID de joueur
    gameChannel = supabaseClient.channel('partie-' + id, {
        config: { presence: { key: myPlayerId } }
    });

    gameChannel
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + id }, async payload => {
            console.log("Mise à jour reçue de l'adversaire !");
            
            // On mémorise la date du dernier log AVANT la mise à jour
            const oldHistory = gameState.history || [];
            const lastOldTime = oldHistory.length > 0 ? oldHistory[oldHistory.length - 1].timestamp : "2000-01-01";
            
            const oldChat = gameState.chat || [];
            const lastOldChatTime = oldChat.length > 0 ? oldChat[oldChat.length - 1].timestamp : "2000-01-01";
            
            const oldLastAction = gameState.lastAction;
            gameState = payload.new.state;
            const newLastAction = gameState.lastAction;
            
            const myFugitive = gameState.characters?.find(c => c.userId === myPlayerId && c.role === 'fugitif');
            if (myFugitive && gameState.status === 'playing') {
                await ensureFugitiveSecret();
                myFugitive.secretPosition = mySecretPosition;
            }

            // On cherche toutes les actions plus récentes que notre ancienne date
            const newHistory = gameState.history || [];
            const newItems = newHistory.filter(item => item.timestamp > lastOldTime);
            
            // On affiche un toast pour chaque nouvelle action qui ne vient pas de nous
            newItems.forEach(item => {
                if (item.userId !== myPlayerId) showToastFromHistory(item);
            });

            // Idem pour le chat
            const newChat = gameState.chat || [];
            const newChatItems = newChat.filter(item => item.timestamp > lastOldChatTime);
            newChatItems.forEach(item => {
                if (item.userId !== myPlayerId) showToastFromChat(item);
            });
            
            const isNewAction = newLastAction && (!oldLastAction || newLastAction.timestamp !== oldLastAction.timestamp);
            
            if (isNewAction && newLastAction.userId !== myPlayerId && typeof triggerRemoteAnimation === 'function') {
                triggerRemoteAnimation(newLastAction, async () => { updateUI(); await checkWinConditions(); });
            } else {
                updateUI();
                checkWinConditions();
            }
        })
        .on('presence', { event: 'sync' }, () => {
            // Met à jour la liste des personnes en ligne dès que quelqu'qu'un arrive ou part
            const newState = gameChannel.presenceState();
            onlinePlayers = {};
            for (const userId in newState) onlinePlayers[userId] = true;
            updateUI();
        })
        .subscribe(async (status) => {
            // Quand on est bien connecté, on annonce notre présence aux autres
            if (status === 'SUBSCRIBED') await gameChannel.track({ online: true });
        });
}

function leaveGameToLobby() {
    window.preventAutoReconnect = true; // Empêche l'auto-reconnexion pour cette session si le joueur a volontairement cliqué sur Quitter
    if (gameChannel) supabaseClient.removeChannel(gameChannel);
    gameChannel = null;
    currentGameId = null;
    mySecretPosition = null;
    window.isAnimatingMove = false;
    window.hasShownEndModal = false;
    showLobby();
}

async function ensureFugitiveSecret() {
    if (mySecretPosition) return;
    
    // On essaie de lire la position secrète depuis notre nouvelle table protégée
    const { data } = await supabaseClient.from('game_secrets').select('secret_position').eq('game_id', currentGameId).single();
    if (data) {
        mySecretPosition = data.secret_position;
    } else if (gameState.availableStarts && gameState.availableStarts.length > 0) {
        // S'il n'y a rien en base, on crée la position et on l'insère secrètement !
        mySecretPosition = gameState.availableStarts[Math.floor(Math.random() * gameState.availableStarts.length)];
        await supabaseClient.from('game_secrets').insert({ game_id: currentGameId, fugitive_id: myPlayerId, secret_position: mySecretPosition });
    }
}

// --- HISTORIQUE (LOGS) ---

function addHistory(actionPayload, userId) {
    if (!gameState.history) gameState.history = [];

    if (typeof actionPayload === 'string') {
        actionPayload = { text: actionPayload };
    }

    gameState.history.push({
        ...actionPayload,
        userId: userId,
        timestamp: new Date().toISOString()
    });
    // On limite l'historique aux 50 dernières actions pour éviter de surcharger la base de données
    if (gameState.history.length > 50) gameState.history.shift();
}

function sendChatMessage(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    if (!gameState.chat) gameState.chat = [];
    gameState.chat.push({
        userId: myPlayerId,
        text: text,
        timestamp: new Date().toISOString()
    });
    if (gameState.chat.length > 50) gameState.chat.shift();
    
    input.value = '';
    saveGameState();
    updateUI();
    
    // Remet le focus sur la barre de texte (Pratique pour taper vite)
    setTimeout(() => input.focus(), 50);
}

// --- LOGIQUE ---

async function moveToNode(targetNodeId, transportType) {
    const activeChar = gameState.characters[gameState.currentPlayerIndex];
    if (activeChar.userId !== myPlayerId) return;

    const transport = TRANSPORT[transportType];
    if (activeChar.ap < transport.cost) return alert("Pas assez de PA !");

    activeChar.ap -= transport.cost; // Déduction des PA

    const currentPos = activeChar.position; // Position de départ connue

    if (activeChar.role === 'fugitif') {
        mySecretPosition = targetNodeId;
        await supabaseClient.from('game_secrets').update({ secret_position: mySecretPosition }).eq('game_id', currentGameId).eq('fugitive_id', myPlayerId);
        activeChar.secretPosition = mySecretPosition; // Mise à jour locale
        
        const moveNumber = (gameState.fugitiveMoves?.length || 0) + 1;
        const isReveal = REVEAL_TURNS.includes(moveNumber);
        
        if (isReveal) {
            activeChar.position = mySecretPosition; // Révélation publique !
            addHistory({ text: `est apparu à la station <b>${targetNodeId}</b> en <b>${transport.name}</b> !` }, myPlayerId);
        } else {
            activeChar.position = null; // Reste caché
            addHistory({ text: `s'est déplacé secrètement en <b>${transport.name}</b>.` }, myPlayerId);
        }

        if (!gameState.fugitiveMoves) gameState.fugitiveMoves = [];
        gameState.fugitiveMoves.push({
            turn: moveNumber,
            transport: transportType,
            position: isReveal ? targetNodeId : null
        });
    } else {
        activeChar.position = targetNodeId;
        addHistory({ text: `s'est déplacé à la station <b>${targetNodeId}</b> en <b>${transport.name}</b>.` }, myPlayerId);
        
        // On enregistre l'action pour déclencher l'animation chez les autres
        gameState.lastAction = {
            userId: myPlayerId,
            charId: activeChar.id,
            from: currentPos,
            to: targetNodeId,
            transport: transportType,
            timestamp: Date.now()
        };
    }

    endTurn();
}

function skipTurn() {
    const activeChar = gameState.characters[gameState.currentPlayerIndex];
    if (activeChar.userId !== myPlayerId) return;

    if (activeChar.role === 'fugitif') {
        const moveNumber = (gameState.fugitiveMoves?.length || 0) + 1;
        const isReveal = REVEAL_TURNS.includes(moveNumber);
        
        if (isReveal) {
            activeChar.position = activeChar.secretPosition;
            addHistory({ text: `est resté sur place et a été aperçu à la station <b>${activeChar.position}</b> !` }, myPlayerId);
        } else {
            activeChar.position = null;
            addHistory({ text: `s'est reposé secrètement.` }, myPlayerId);
        }

        if (!gameState.fugitiveMoves) gameState.fugitiveMoves = [];
        gameState.fugitiveMoves.push({ turn: moveNumber, transport: 'SKIP', position: isReveal ? activeChar.secretPosition : null });
    } else {
        addHistory({ text: `a passé son tour pour reprendre son souffle.` }, myPlayerId);
    }
    
    endTurn();
}

async function checkWinConditions() {
    if (gameState.status !== 'playing') return;

    const fugitive = gameState.characters.find(c => c.role === 'fugitif');
    if (!fugitive) return;

    // Seul le client du Fugitif (ou le créateur si le fugitif est un bot) a l'autorité de valider la victoire
    const isFugitiveClient = fugitive.userId === myPlayerId;
    const isBotAndCreatorClient = fugitive.userId.startsWith('bot_') && gameState.creatorId === myPlayerId;

    if (isFugitiveClient || isBotAndCreatorClient) {
        let actualFugitivePos = null;
        if (isFugitiveClient) {
            actualFugitivePos = mySecretPosition;
        } else {
            const { data } = await supabaseClient.from('game_secrets').select('secret_position').eq('game_id', currentGameId).single();
            if (data) actualFugitivePos = data.secret_position;
        }

        if (actualFugitivePos) {
            const catchingPolice = gameState.characters.find(c => c.role === 'policier' && c.position === actualFugitivePos);
            if (catchingPolice) {
                gameState.status = 'finished';
                gameState.winner = { team: 'police', reason: `Le Fugitif a été arrêté par ${catchingPolice.name} à la station ${actualFugitivePos} !` };
                fugitive.position = actualFugitivePos; // Révélation dramatique !
                addHistory({ text: `🚨 ARRÊTÉ par ${catchingPolice.name} ! La Police gagne !` }, fugitive.userId);
                await saveGameState();
                return;
            }
        }
        
        const fugitiveIndex = gameState.characters.findIndex(c => c.role === 'fugitif');
        const fugitiveMovesCount = gameState.fugitiveMoves?.length || 0;
        // Si le Fugitif a joué ses 24 tours et que la boucle revient à lui
        if (fugitiveMovesCount >= 24 && gameState.currentPlayerIndex === fugitiveIndex) {
            gameState.status = 'finished';
            gameState.winner = { team: 'fugitif', reason: `Le Fugitif a survécu 24 tours et s'est échappé dans la nuit !` };
            fugitive.position = actualFugitivePos; 
            addHistory({ text: `🚁 ÉCHAPPÉ ! 24 tours survécus. Le Fugitif gagne !` }, fugitive.userId);
            await saveGameState();
        }
    }
}

async function endTurn() {
    gameState.turnCount = (gameState.turnCount || 1) + 1; // Incrémente le tour
    const activeUserId = gameState.characters[gameState.currentPlayerIndex].userId;
    const user = gameState.users.find(u => u.id === activeUserId);
    if (user) user.lastConnection = new Date().toISOString();

    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.characters.length; // Passe au personnage suivant
    
    // Régénération des Points d'Action (PA) pour le prochain joueur
    const nextChar = gameState.characters[gameState.currentPlayerIndex];
    nextChar.ap = Math.min(nextChar.maxAp, nextChar.ap + 2);
    
    await checkWinConditions(); // Le juge arbitre observe
    
    if (gameState.status !== 'finished') {
        await saveGameState();
    }
    updateUI();
}

let viewBox = { x: 0, y: 0, w: 800, h: 600 };
window.isDraggingMap = false;

function initMapGestures() {
    const svg = document.getElementById('map-svg');
    let pointers = [];
    let prevDiff = -1;
    let totalDragDistance = 0;

    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);

    svg.addEventListener('pointerdown', (e) => {
        pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
        totalDragDistance = 0;
        try { e.target.setPointerCapture(e.pointerId); } catch(err) {}
    });

    svg.addEventListener('pointermove', (e) => {
        if (pointers.length === 0) return;
        e.preventDefault(); // Empêche le comportement mobile natif

        const index = pointers.findIndex(p => p.id === e.pointerId);
        if (index !== -1) {
            if (pointers.length === 1) {
                // Navigation (Glisser)
                const dx = e.clientX - pointers[index].x;
                const dy = e.clientY - pointers[index].y;
                const ratio = viewBox.w / svg.clientWidth;

                totalDragDistance += Math.abs(dx) + Math.abs(dy);
                if (totalDragDistance > 10) {
                    window.isDraggingMap = true;
                }

                viewBox.x -= dx * ratio;
                viewBox.y -= dy * ratio;

                pointers[index].x = e.clientX;
                pointers[index].y = e.clientY;
                updateViewBox();
            } else if (pointers.length === 2) {
                // Zoom (Pincer avec 2 doigts)
                window.isDraggingMap = true;
                pointers[index].x = e.clientX;
                pointers[index].y = e.clientY;

                const p1 = pointers[0];
                const p2 = pointers[1];
                const curDiff = Math.hypot(p1.x - p2.x, p1.y - p2.y);

                if (prevDiff > 0) {
                    const zoomFactor = prevDiff / curDiff;
                    applyZoom(zoomFactor, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, svg);
                }
                prevDiff = curDiff;
            }
        }
    });

    const pointerUpHandler = (e) => {
        pointers = pointers.filter(p => p.id !== e.pointerId);
        if (pointers.length < 2) prevDiff = -1;
        if (pointers.length === 0) {
            setTimeout(() => window.isDraggingMap = false, 50); // Laisse le temps au clic de s'annuler
        }
    };

    svg.addEventListener('pointerup', pointerUpHandler);
    svg.addEventListener('pointercancel', pointerUpHandler);
    svg.addEventListener('pointerout', pointerUpHandler);
    svg.addEventListener('pointerleave', pointerUpHandler);

    // Zoom molette souris
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        applyZoom(zoomFactor, e.clientX, e.clientY, svg);
    }, { passive: false });
}

function applyZoom(zoomFactor, clientX, clientY, svg) {
    const minWidth = 200;  // Zoom maximum
    const maxWidth = 2000; // Dézoom maximum

    let newW = viewBox.w * zoomFactor;
    let newH = viewBox.h * zoomFactor;

    if (newW >= minWidth && newW <= maxWidth) {
        const rect = svg.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const svgMouseX = viewBox.x + (mouseX / rect.width) * viewBox.w;
        const svgMouseY = viewBox.y + (mouseY / rect.height) * viewBox.h;

        viewBox.w = newW;
        viewBox.h = newH;

        viewBox.x = svgMouseX - (mouseX / rect.width) * viewBox.w;
        viewBox.y = svgMouseY - (mouseY / rect.height) * viewBox.h;

        updateViewBox();
    }
}

let isViewBoxUpdatePending = false;

function updateViewBox() {
    if (!isViewBoxUpdatePending) {
        isViewBoxUpdatePending = true;
        requestAnimationFrame(() => {
            const svg = document.getElementById('map-svg');
            svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
            isViewBoxUpdatePending = false;
        });
    }
}

// --- SYSTÈME DE RÔLES ---

async function claimRole(roleType, slotIndex = 0) {
    const isFugitif = gameState.roles.fugitif === myPlayerId;
    const isPolicier = gameState.roles.policiers.includes(myPlayerId);

    if (roleType === 'fugitif') {
        if (gameState.roles.fugitif) return;
        if (isPolicier) return alert("Vous jouez déjà un Policier !");
        gameState.roles.fugitif = myPlayerId;
    } else if (roleType === 'policier') {
        if (gameState.roles.policiers[slotIndex]) return;
        if (isFugitif) return alert("Vous jouez déjà le Fugitif !");
        gameState.roles.policiers[slotIndex] = myPlayerId;
    }
    await saveGameState();
    updateUI();
}

async function unclaimRole(roleType, slotIndex = 0) {
    let removedId = null;
    if (roleType === 'fugitif' && (gameState.roles.fugitif === myPlayerId || (gameState.roles.fugitif && gameState.roles.fugitif.startsWith('bot_')))) {
        removedId = gameState.roles.fugitif;
        gameState.roles.fugitif = null;
    } else if (roleType === 'policier' && (gameState.roles.policiers[slotIndex] === myPlayerId || (gameState.roles.policiers[slotIndex] && gameState.roles.policiers[slotIndex].startsWith('bot_')))) {
        removedId = gameState.roles.policiers[slotIndex];
        gameState.roles.policiers[slotIndex] = null;
    }
    
    // Nettoyage complet : si on retire un bot, on l'efface aussi de la mémoire
    if (removedId && removedId.startsWith('bot_')) {
        gameState.users = gameState.users.filter(u => u.id !== removedId);
    }
    
    await saveGameState();
    updateUI();
}

// --- OUTILS DE DÉVELOPPEMENT (LOCAL UNIQUEMENT) ---

function debugSwitchPlayer() {
    if (gameState && gameState.users && gameState.users.length > 1) {
        const currentIndex = gameState.users.findIndex(u => u.id === myPlayerId);
        const nextIndex = (currentIndex + 1) % gameState.users.length;
        myPlayerId = gameState.users[nextIndex].id;
        myPlayerName = gameState.users[nextIndex].name;
        updateUI(); // Rafraîchit l'interface (rôles, chat, tours) pour le nouveau joueur
    }
}

async function debugAddBotToRole(roleType, slotIndex = 0) {
    const dummyId = 'bot_' + Math.random().toString(36).substring(2, 9);
    const newUser = { 
        id: dummyId, 
        name: "Bot " + dummyId.substring(4, 7), 
        avatarUrl: null,
        lastConnection: new Date().toISOString() 
    };
    gameState.users.push(newUser);
    
    if (roleType === 'fugitif') gameState.roles.fugitif = dummyId;
    else if (roleType === 'policier') gameState.roles.policiers[slotIndex] = dummyId;

    await saveGameState();
    updateUI();
}

// --- AUTHENTIFICATION GOOGLE ---

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        myPlayerId = session.user.id; // L'ID ultra-sécurisé de Supabase
        // Récupère le nom complet Google, ou l'email par défaut
        myPlayerName = session.user.user_metadata.full_name || session.user.email.split('@')[0];
        myAvatarUrl = session.user.user_metadata.avatar_url || null; // Récupère la photo Google
        
        document.getElementById('auth-section').classList.add('hidden-view');
        document.getElementById('lobby-actions').classList.remove('hidden-view');
        document.getElementById('user-name-display').innerText = myPlayerName;
        showLobby();
    } else {
        document.getElementById('auth-section').classList.remove('hidden-view');
        document.getElementById('lobby-actions').classList.add('hidden-view');
    }
}

async function loginWithGoogle() {
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google'
    });
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

async function initGame() {
    initMapGestures();
    
    // Activation du mode Dev si on est sur Live Server
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
        window.isDevMode = true; // Prévient ui.js qu'il peut afficher les boutons de triche
        document.getElementById('dev-switch-btn')?.classList.remove('hidden-view');
    }
    
    checkAuth();
}

async function showLobby() {
    document.getElementById('lobby-container').classList.remove('hidden-view');
    document.getElementById('game-container').classList.add('hidden-view');
    document.getElementById('waiting-room-container').classList.add('hidden-view');
    
    const { data, error } = await supabaseClient
        .from('games')
        .select('id, state, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    const listContainer = document.getElementById('games-list');
    if (error || !data || data.length === 0) {
        listContainer.innerHTML = "<i>Aucune partie en cours trouvée.</i>";
    } else {
        // --- AUTO-RECONNEXION ---
        if (!window.preventAutoReconnect) {
            const activeGame = data.find(g => g.state.users && g.state.users.some(u => u.id === myPlayerId) && g.state.status !== 'finished');
            if (activeGame) {
                return joinGame(activeGame.id); // Reconnecte directement et stop le chargement du lobby
            }
        }
        
        // --- FILTRAGE DES PARTIES ---
        const visibleGames = data.filter(game => {
            const amIInThisGame = game.state.users && game.state.users.some(u => u.id === myPlayerId);
            const isWaiting = game.state.status === 'waiting';
            const isNotFull = game.state.users && game.state.users.length < 5;
            // On affiche si on est dedans, OU (si elle est en attente ET pas pleine)
            return (amIInThisGame && game.state.status !== 'finished') || (isWaiting && isNotFull);
        });
        
        if (visibleGames.length === 0) {
            listContainer.innerHTML = "<i>Aucune partie ouverte pour le moment.</i>";
        } else {
            listContainer.innerHTML = visibleGames.map(game => {
                const amIInThisGame = game.state.users.some(u => u.id === myPlayerId);
                const nbPlayers = game.state.users.length;
                const isPlaying = game.state.status === 'playing';
                
                let btnLabel = amIInThisGame ? 'Reconnecter' : (isPlaying ? 'En cours' : 'Rejoindre');
                
                const gameName = game.state.name || `Partie #${game.id}`;
                const dateStr = new Date(game.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                
                // Calcul du "Tour" (Manche globale)
                const nbChars = game.state.characters ? game.state.characters.length : 5;
                const currentRound = Math.floor(((game.state.turnCount || 1) - 1) / (nbChars || 1)) + 1;
                const isMyTurn = isPlaying && game.state.characters[game.state.currentPlayerIndex]?.userId === myPlayerId;

                // Création des bulles d'initiales pour les joueurs
                const playersHtml = game.state.users.map((u) => {
                    const isMe = (u.id === myPlayerId);
                    const avatarContent = u.avatarUrl ? `<img src="${u.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : u.name.substring(0, 2).toUpperCase();
                    return `<div class="player-avatar" style="background-color: #34495e;" title="${u.name}${isMe ? ' (Vous)' : ''}">${avatarContent}</div>`;
                }).join('');

                return `
                    <div class="game-item ${isMyTurn ? 'my-turn-highlight' : ''}">
                        <div style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; flex-grow: 1;">
                            <div style="display:flex; align-items:center;">
                                <strong>${gameName}</strong>
                                ${isMyTurn ? '<span class="my-turn-badge">C\'est à vous !</span>' : ''}
                            </div>
                            <span style="font-size:12px; color:#bdc3c7; margin-bottom: 8px;">Créée le ${dateStr} ${isPlaying ? `- Tour n°${currentRound}` : `- En attente (${nbPlayers}/4)`}</span>
                            <div class="avatar-container">
                                ${playersHtml}
                            </div>
                        </div>
                        <button onclick="joinGame(${game.id})">${btnLabel}</button>
                    </div>
                `;
            }).join('');
        }
    }
}

async function createNewGame() {
       const gameNameInput = document.getElementById('game-name-input').value.trim();
    const gameName = gameNameInput || `Partie de ${myPlayerName}`;

    gameState = {
        name: gameName, status: 'waiting', creatorId: myPlayerId, options: {},
        turnCount: 1, history: [], chat: [], fugitiveMoves: [],
        lastAction: null,
        users: [{ id: myPlayerId, name: myPlayerName, avatarUrl: myAvatarUrl, lastConnection: new Date().toISOString() }],
        roles: { fugitif: null, policiers: [null, null, null, null] },
        characters: [], currentPlayerIndex: 0
    };

    const { data, error } = await supabaseClient
        .from('games')
        .insert([{ state: gameState }])
        .select();

    if (error) {
        alert("Erreur de connexion à la base de données !");
    } else {

        currentGameId = data[0].id;
        
        subscribeToGame(currentGameId);
        updateUI();
    }
}

async function joinGame(id) {
    const { data, error } = await supabaseClient
        .from('games')
        .select('state')
        .eq('id', id)
        .single();

    if (error || !data) return alert("Partie introuvable !");
    
    gameState = data.state;
    currentGameId = id;

    const userExists = gameState.users.find(u => u.id === myPlayerId);

    if (!userExists) {
        if (gameState.status === 'playing') return alert("La partie a déjà commencé, vous ne pouvez pas la rejoindre !");
        if (gameState.users.length >= 5) return alert("Le salon est complet (5 joueurs max) !");
        
        gameState.users.push({ id: myPlayerId, name: myPlayerName, avatarUrl: myAvatarUrl, lastConnection: new Date().toISOString() });
        
        await supabaseClient.from('games').update({ state: gameState }).eq('id', id);
    }

    subscribeToGame(currentGameId);
    
    const myFugitive = gameState.characters?.find(c => c.userId === myPlayerId && c.role === 'fugitif');
    if (myFugitive && gameState.status === 'playing') {
        await ensureFugitiveSecret();
        myFugitive.secretPosition = mySecretPosition;
    }

    updateUI();
}

async function startActiveGame() {
    if (gameState.creatorId !== myPlayerId) return; 
    
    if (!gameState.roles.fugitif) return alert("Quelqu'un doit incarner le Fugitif !");
    if (gameState.roles.policiers.filter(p => p !== null).length === 0) return alert("Il faut au moins 1 Policier !");
    
    gameState.characters = [];
    
    // Mélanger les positions de départ disponibles
    const positions = [...STARTING_POSITIONS];
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // 1. Création du Fugitif
    const fugUser = gameState.users.find(u => u.id === gameState.roles.fugitif);
    gameState.characters.push({
        id: 'fugitif', userId: fugUser.id, name: fugUser.name + ' (Fugitif)',
        role: 'fugitif', color: '#2c3e50', position: null, // POSITION PUBLIQUE CACHÉE !
        ap: 8, maxAp: 12 // Points d'Action du Fugitif
    });

    // 2. Création des Policiers
    let pIndex = 0;
    gameState.roles.policiers.forEach((userId, i) => {
        if (userId) {
            const polUser = gameState.users.find(u => u.id === userId);
            const multiRole = gameState.roles.policiers.filter(u => u === userId).length > 1;
            gameState.characters.push({
                id: 'policier_' + (i+1), userId: polUser.id,
                name: polUser.name + (multiRole ? ` (Pol. ${pIndex+1})` : ''),
                role: 'policier', color: POLICE_COLORS[pIndex], position: positions.pop(),
                ap: 6, maxAp: 10 // Points d'Action des Policiers
            });
            pIndex++;
        }
    });

    gameState.availableStarts = positions; // On laisse les positions restantes pour que le Fugitif puisse piocher secrètement

    window.hasShownEndModal = false;
    addHistory({ text: "La traque commence dans les rues de Londres !" }, myPlayerId); 
    gameState.status = 'playing'; // On lance la partie !
    gameState.currentPlayerIndex = 0;
    await saveGameState();
    
    const myFugitive = gameState.characters?.find(c => c.userId === myPlayerId && c.role === 'fugitif');
    if (myFugitive) {
        await ensureFugitiveSecret();
        myFugitive.secretPosition = mySecretPosition;
    }

    updateUI();
}

window.onload = initGame;
// --- IDENTIFICATION DU JOUEUR ---
let myPlayerId = null;
let myPlayerName = null;
let myAvatarUrl = null;

let gameState = {
    status: 'waiting', // 'waiting' ou 'playing'
    currentPlayer: 0,
    turnCount: 1, // Compteur du nombre de tours global
    cardsDrawnThisTurn: 0, // Compte les cartes piochées pendant le tour
    history: [], // Stocke les logs d'actions
    chat: [], // Stocke les messages textuels
    players: [], // Rempli dynamiquement
    claimedRoutes: [],
    deck: [],
    destinationDeck: [],
    discardPile: [], // La défausse
    faceUpCards: [] // La rivière de 5 cartes
};

let currentGameId = null;
let localPlayerIndex = 0; // Définit si ce navigateur est le Joueur 1 (0) ou le Joueur 2 (1)

let gameChannel = null;
let onlinePlayers = {}; // Stocke les ID des joueurs actuellement connectés

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
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + id }, payload => {
            console.log("Mise à jour reçue de l'adversaire !");
            
            // On mémorise la date du dernier log AVANT la mise à jour
            const oldHistory = gameState.history || [];
            const lastOldTime = oldHistory.length > 0 ? oldHistory[oldHistory.length - 1].timestamp : "2000-01-01";
            
            const oldChat = gameState.chat || [];
            const lastOldChatTime = oldChat.length > 0 ? oldChat[oldChat.length - 1].timestamp : "2000-01-01";
            
            gameState = payload.new.state;
            
            // On cherche toutes les actions plus récentes que notre ancienne date
            const newHistory = gameState.history || [];
            const newItems = newHistory.filter(item => item.timestamp > lastOldTime);
            
            // On affiche un toast pour chaque nouvelle action qui ne vient pas de nous
            newItems.forEach(item => {
                if (item.player !== localPlayerIndex) showToastFromHistory(item);
            });

            // Idem pour le chat
            const newChat = gameState.chat || [];
            const newChatItems = newChat.filter(item => item.timestamp > lastOldChatTime);
            newChatItems.forEach(item => {
                if (item.player !== localPlayerIndex) showToastFromChat(item);
            });
            
            updateUI();
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
    showLobby();
}

// --- HISTORIQUE (LOGS) ---

function addHistory(actionPayload, playerIndex) {
    if (!gameState.history) gameState.history = [];

    if (typeof actionPayload === 'string') {
        actionPayload = { text: actionPayload };
    }

    // Fusionne avec le dernier log si c'est la 2ème carte piochée du tour
    if (actionPayload.type === 'draw' && gameState.cardsDrawnThisTurn > 0 && gameState.history.length > 0) {
        let lastLog = gameState.history[gameState.history.length - 1];
        if (lastLog.player === playerIndex && lastLog.type === 'draw') {
            lastLog.cards.push(...actionPayload.cards);
            lastLog.timestamp = new Date().toISOString();
            return; // On arrête là : l'action est fusionnée
        }
    }

    gameState.history.push({
        ...actionPayload,
        player: playerIndex,
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
        player: localPlayerIndex,
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

function initDeck() {
    let deck = [];
    gameState.discardPile = [];
    const baseColors = COLORS.filter(c => c !== "locomotive");
    
    // 12 cartes de chaque couleur basique
    baseColors.forEach(color => {
        for (let i = 0; i < 12; i++) deck.push(color);
    });
    // 14 Locomotives (Jokers)
    for (let i = 0; i < 14; i++) deck.push("locomotive");

    // Mélange du paquet (Algorithme Fisher-Yates)
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    gameState.deck = deck;
}

function initDestinations() {
    let deck = [...DESTINATIONS_DATA];
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    gameState.destinationDeck = deck;
}

async function drawDestinationsAction() {
    if (localPlayerIndex !== gameState.currentPlayer) {
        return showModal("Ce n'est pas à ton tour de jouer !");
    }

    if (gameState.cardsDrawnThisTurn > 0) {
        showModal("Vous avez déjà commencé à piocher des wagons, vous ne pouvez pas tirer de missions !");
        return;
    }
    if (gameState.destinationDeck.length === 0) {
        showModal("Plus de cartes destination !");
        return;
    }

    const drawnCards = [];
    // On tire 3 cartes (ou moins s'il n'y en a plus assez)
    for(let i=0; i<3; i++) {
        if (gameState.destinationDeck.length > 0) drawnCards.push(gameState.destinationDeck.pop());
    }

    const items = drawnCards.map(d => {
        const vFrom = MAP.villes.find(v => v.id === d.from).name;
        const vTo = MAP.villes.find(v => v.id === d.to).name;
        return { label: `${vFrom} à ${vTo} (${d.points} pts)`, value: d };
    });

    const minKeep = Math.min(1, drawnCards.length);
    const selectedCards = await showMultiSelectModal(`Choisissez au moins ${minKeep} carte(s) destination :`, items, minKeep);

    const player = gameState.players[gameState.currentPlayer];
    selectedCards.forEach(c => player.destinations.push(c));
    
    addHistory({ type: 'mission', count: selectedCards.length }, gameState.currentPlayer);

    // Les cartes non retenues retournent SOUS la pioche
    drawnCards.forEach(c => {
        if (!selectedCards.includes(c)) gameState.destinationDeck.unshift(c);
    });

    // Animation : Vol du paquet de missions vers le tableau des scores
    animateFlyingCard(document.getElementById('dest-deck'), document.getElementById('missions-display'), 'dest');

    endTurn(); // L'action de piocher des missions termine le tour
}

// Remélange la défausse dans la pioche si celle-ci est vide
function tryReshuffle() {
    if (gameState.deck.length === 0 && gameState.discardPile.length > 0) {
        gameState.deck = gameState.discardPile;
        gameState.discardPile = [];
        // Mélange
        for (let i = gameState.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gameState.deck[i], gameState.deck[j]] = [gameState.deck[j], gameState.deck[i]];
        }
    }
}

function refillRiver() {
    // Remplacer les cartes prises (marquées par null) à leur position exacte
    for (let i = 0; i < gameState.faceUpCards.length; i++) {
        if (gameState.faceUpCards[i] === null) {
            tryReshuffle();
            if (gameState.deck.length > 0) {
                gameState.faceUpCards[i] = gameState.deck.pop();
            } else {
                gameState.faceUpCards.splice(i, 1);
                i--; // Ajuster l'index après suppression
            }
        }
    }

    // Remplir jusqu'à avoir 5 cartes (utile à l'initialisation ou après la défausse des 3 locos)
    while (gameState.faceUpCards.length < 5) {
        tryReshuffle();
        if (gameState.deck.length === 0) break; // S'il n'y a vraiment plus rien
        gameState.faceUpCards.push(gameState.deck.pop());
    }
    
    // Règle spéciale : si 3 Locomotives (ou plus) sont face visible, on défausse tout
    const locos = gameState.faceUpCards.filter(c => c === "locomotive").length;
    if (locos >= 3) {
        gameState.discardPile.push(...gameState.faceUpCards); // Les 5 cartes vont dans la défausse
        gameState.faceUpCards = [];
        refillRiver();
    }
}

function drawFromDeck() {
    if (localPlayerIndex !== gameState.currentPlayer) {
        return showModal("Ce n'est pas à ton tour de jouer !");
    }

    tryReshuffle();
    if (gameState.deck.length === 0) {
        showModal("La pioche ET la défausse sont vides !");
        return;
    }
    
    const card = gameState.deck.pop();
    gameState.players[gameState.currentPlayer].cards[card]++;
    
    addHistory({ type: 'draw', cards: ['deck'] }, gameState.currentPlayer);

    // Animation : Vol de la pioche vers la main du joueur
    animateFlyingCard(document.getElementById('deck'), document.getElementById('player-hand'), 'deck');
    
    gameState.cardsDrawnThisTurn++;
    if (gameState.cardsDrawnThisTurn >= 2) endTurn();
    else {
        refillRiver();
        saveGameState();
        updateUI();
    }
}

function drawFromRiver(index, event) {
    if (localPlayerIndex !== gameState.currentPlayer) {
        return showModal("Ce n'est pas à ton tour de jouer !");
    }

    const card = gameState.faceUpCards[index];
    if (!card) return;

    if (card === "locomotive") {
        if (gameState.cardsDrawnThisTurn > 0) {
            // Cas proactif : avec l'UI, ce code ne devrait plus être atteignable
            return;
        }
    }
    
    addHistory({ type: 'draw', cards: [card] }, gameState.currentPlayer);

    if (card === "locomotive") {
        gameState.cardsDrawnThisTurn += 2; // Le Joker prend les 2 actions du tour
    } else {
        gameState.cardsDrawnThisTurn++;
    }

    gameState.players[gameState.currentPlayer].cards[card]++;
    gameState.faceUpCards[index] = null; // Marque l'emplacement pour le remplacer exactement au même endroit
    
    // Animation : Vol de la rivière vers la main
    if (event) {
        animateFlyingCard(event.currentTarget, document.getElementById('player-hand'), card);
    }

    refillRiver();

    if (gameState.cardsDrawnThisTurn >= 2) endTurn();
    else {
        saveGameState();
        updateUI();
    }
}

function endTurn() {
    gameState.cardsDrawnThisTurn = 0;
    gameState.turnCount = (gameState.turnCount || 1) + 1; // Incrémente le tour
    gameState.players[gameState.currentPlayer].lastConnection = new Date().toISOString(); // Met à jour la dernière action du joueur
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length; // Passe au joueur suivant
    saveGameState(); // Sauvegarde finale à la fin du tour complet
    updateUI();
}

// Fonction pour payer le coût avec ajout possible de Jokers
function payCost(player, color, totalCost) {
    let colorPaid = Math.min(player.cards[color], totalCost);
    let locoPaid = totalCost - colorPaid;
    player.cards[color] -= colorPaid;
    player.cards["locomotive"] -= locoPaid;
    for(let i=0; i<colorPaid; i++) gameState.discardPile.push(color);
    for(let i=0; i<locoPaid; i++) gameState.discardPile.push("locomotive");

    // --- Animation Visuelle ---
    // On fait voler une carte symbolique vers la défausse pour illustrer le paiement
    const handEl = document.getElementById('player-hand');
    const discardEl = document.getElementById('discard');
    if (handEl && discardEl) animateFlyingCard(handEl, discardEl, color);
}

async function claimRoute(playerIndex, routeId) {
    if (localPlayerIndex !== gameState.currentPlayer) {
        return showModal("Ce n'est pas à ton tour de jouer !");
    }

    if (gameState.cardsDrawnThisTurn > 0) {
        return false;
    }

    const player = gameState.players[playerIndex];
    const route = MAP.routes.find(r => r.id === routeId);

    if (gameState.claimedRoutes.some(r => r.id === routeId)) return false;

    if (player.wagons < route.distance) {
        showModal("Pas assez de wagons !");
        return false;
    }

    // Gestion de la couleur choisie (notamment pour les routes grises)
    let chosenColor = route.color;
    if (route.color === "gris") {
        const baseColors = COLORS.filter(c => c !== "locomotive");
        const colorOptions = baseColors.map(c => ({ type: 'color', value: c }));
        colorOptions.push({ label: 'Annuler', value: null, class: 'cancel' });
        
        chosenColor = await showModal("Route grise !\nChoisissez la couleur de base à utiliser pour cette route :", colorOptions);
        if (!chosenColor) return false; // Annulé
    }

    // Vérification des fonds (Couleur choisie + Jokers)
    if ((player.cards[chosenColor] + player.cards["locomotive"]) < route.distance) {
        showModal(`Pas assez de cartes pour le ${chosenColor} (même en utilisant vos jokers) !`);
        return false;
    }

    let finalCost = route.distance;

    // Gestion de la mécanique de Tunnel
    if (route.isTunnel) {
        let extraCost = 0;
        let revealedCards = [];
        for (let i = 0; i < 3; i++) {
            tryReshuffle();
            if (gameState.deck.length > 0) {
                let c = gameState.deck.pop();
                revealedCards.push(c);
                gameState.discardPile.push(c); // Les cartes dévoilées vont à la défausse
                if (c === chosenColor || c === "locomotive") extraCost++;
            }
        }
        
        const revealedText = revealedCards.length > 0 ? revealedCards.join(", ") : "Aucune";
        
        if (extraCost > 0) {
            if ((player.cards[chosenColor] + player.cards["locomotive"]) < finalCost + extraCost) {
                await showModal(`Tunnel ! Cartes dévoilées : ${revealedText}.\n\nSurcoût : ${extraCost} carte(s).\nVous n'avez pas de quoi payer le surcoût. Votre tour est terminé.`);
                endTurn();
                return false;
            }
            
            const payExtra = await showModal(`Tunnel ! Cartes dévoilées : ${revealedText}.\n\nSurcoût : ${extraCost} carte(s). Voulez-vous payer ?`, [
                { label: 'Oui, payer', value: true },
                { label: 'Non (Fin de tour)', value: false, class: 'cancel' }
            ]);
            
            if (!payExtra) {
                endTurn(); // Le joueur refuse de payer, son tour se termine
                return false;
            }
        } else {
            await showModal(`Tunnel !\nCartes dévoilées : ${revealedText}.\n\nAucun surcoût !`);
        }
        finalCost += extraCost;
    }

    // Paiement effectif et validation de la route
    payCost(player, chosenColor, finalCost);
    player.wagons -= route.distance;
    const scoreTable = { 1: 1, 2: 2, 3: 4, 4: 7, 6: 15, 8: 21 };
    const earnedPoints = scoreTable[route.distance] || 0;
    player.score += scoreTable[route.distance] || 0;
    gameState.claimedRoutes.push({ id: routeId, owner: playerIndex });
    
    const vFrom = MAP.villes.find(v => v.id === route.from).name;
    const vTo = MAP.villes.find(v => v.id === route.to).name;
    addHistory({ type: 'route', from: vFrom, to: vTo, points: earnedPoints }, playerIndex);
    
    endTurn(); // Termine le tour et met à jour l'interface
    
    return true;
}

// --- CALCULS AVANCÉS ---

function getLongestRouteForPlayer(playerIndex) {
    const playerRoutes = gameState.claimedRoutes.filter(r => r.owner === playerIndex);
    if (playerRoutes.length === 0) return 0;

    // 1. Construction du "Graphe" (Carte des connexions du joueur)
    const graph = {};
    playerRoutes.forEach(claim => {
        const route = MAP.routes.find(r => r.id === claim.id);
        if (!route) return;
        if (!graph[route.from]) graph[route.from] = [];
        if (!graph[route.to]) graph[route.to] = [];
        
        // Ajoute la route dans les deux sens
        graph[route.from].push({ routeId: route.id, to: route.to, distance: route.distance });
        graph[route.to].push({ routeId: route.id, to: route.from, distance: route.distance });
    });

    let maxLength = 0;

    // 2. Exploration en profondeur (DFS) pour tester tous les chemins
    function dfs(node, currentLength, visitedEdges) {
        maxLength = Math.max(maxLength, currentLength);
        if (!graph[node]) return;

        for (const edge of graph[node]) {
            if (!visitedEdges.has(edge.routeId)) { // Règle d'or : ne pas repasser sur la même route
                visitedEdges.add(edge.routeId);
                dfs(edge.to, currentLength + edge.distance, visitedEdges);
                visitedEdges.delete(edge.routeId);
            }
        }
    }

    // 3. On lance l'exploration depuis chaque ville de départ possible
    for (const startNode in graph) {
        dfs(startNode, 0, new Set());
    }

    return maxLength;
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

// --- OUTILS DE DÉVELOPPEMENT (LOCAL UNIQUEMENT) ---

function debugSwitchPlayer() {
    if (gameState && gameState.players && gameState.players.length > 1) {
        localPlayerIndex = (localPlayerIndex + 1) % gameState.players.length;
        updateUI(); // Rafraîchit l'interface pour montrer les cartes du nouveau joueur
    }
}

async function debugAddPlayer() {
    if (gameState.players.length >= 4) return;
    const dummyId = 'bot_' + Math.random().toString(36).substring(2, 9);
    const newPlayer = { 
        id: dummyId, 
        name: "Testeur " + gameState.players.length, 
        avatarUrl: null,
        wagons: 45, 
        cards: {}, 
        score: 0, 
        destinations: [], 
        color: PLAYER_COLORS[gameState.players.length], 
        lastConnection: new Date().toISOString() 
    };
    COLORS.forEach(c => newPlayer.cards[c] = 0);
    gameState.players.push(newPlayer);
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
        document.getElementById('dev-switch-btn')?.classList.remove('hidden-view');
        document.getElementById('dev-add-player-btn')?.classList.remove('hidden-view');
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
            const activeGame = data.find(g => g.state.players.some(p => p.id === myPlayerId) && g.state.status !== 'finished');
            if (activeGame) {
                return joinGame(activeGame.id); // Reconnecte directement et stop le chargement du lobby
            }
        }
        
        // --- FILTRAGE DES PARTIES ---
        const visibleGames = data.filter(game => {
            const amIInThisGame = game.state.players.some(p => p.id === myPlayerId);
            const isWaiting = game.state.status === 'waiting';
            const isNotFull = game.state.players.length < 4;
            // On affiche si on est dedans, OU (si elle est en attente ET pas pleine)
            return (amIInThisGame && game.state.status !== 'finished') || (isWaiting && isNotFull);
        });
        
        if (visibleGames.length === 0) {
            listContainer.innerHTML = "<i>Aucune partie ouverte pour le moment.</i>";
        } else {
            listContainer.innerHTML = visibleGames.map(game => {
                const amIInThisGame = game.state.players.some(p => p.id === myPlayerId);
                const nbPlayers = game.state.players.length;
                const isPlaying = game.state.status === 'playing';
                
                let btnLabel = amIInThisGame ? 'Reconnecter' : (isPlaying ? 'En cours' : 'Rejoindre');
                
                const gameName = game.state.name || `Partie #${game.id}`;
                const dateStr = new Date(game.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                
                // Calcul du "Tour" (Manche globale)
                const currentRound = Math.floor(((game.state.turnCount || 1) - 1) / nbPlayers) + 1;
                const isMyTurn = isPlaying && game.state.players[game.state.currentPlayer]?.id === myPlayerId;

                // Création des bulles d'initiales pour les joueurs
                const playersHtml = game.state.players.map((p, idx) => {
                    const isCurrentTurn = isPlaying && (idx === game.state.currentPlayer);
                    const isMe = (p.id === myPlayerId);
                    const borderClass = isCurrentTurn ? 'avatar-active' : '';
                    const avatarContent = p.avatarUrl 
                        ? `<img src="${p.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`
                        : p.name.substring(0, 2).toUpperCase();
                    return `<div class="player-avatar ${borderClass}" style="background-color: ${p.color};" title="${p.name}${isMe ? ' (Vous)' : ''}">${avatarContent}</div>`;
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
        name: gameName, status: 'waiting', currentPlayer: 0, turnCount: 1, cardsDrawnThisTurn: 0, history: [], chat: [],
        players: [], claimedRoutes: [], deck: [], destinationDeck: [], discardPile: [], faceUpCards: []
    };

    // Ajoute le créateur à la liste des joueurs
    const creator = { id: myPlayerId, name: myPlayerName, avatarUrl: myAvatarUrl, wagons: 45, cards: {}, score: 0, destinations: [], color: PLAYER_COLORS[0], lastConnection: new Date().toISOString() };
    COLORS.forEach(c => creator.cards[c] = 0);
    gameState.players.push(creator);

    const { data, error } = await supabaseClient
        .from('games')
        .insert([{ state: gameState }])
        .select();

    if (error) {
        alert("Erreur de connexion à la base de données !");
    } else {
        localPlayerIndex = 0; // Le créateur est le Joueur 1
        
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

    // Est-ce que je suis déjà dans cette partie ?
    localPlayerIndex = gameState.players.findIndex(p => p.id === myPlayerId);

    // Si je suis un petit nouveau
    if (localPlayerIndex === -1) {
        if (gameState.status === 'playing') return alert("La partie a déjà commencé, vous ne pouvez pas la rejoindre !");
        if (gameState.players.length >= 4) return alert("La partie est complète (4 joueurs max) !");
        
        const newPlayer = { id: myPlayerId, name: myPlayerName, avatarUrl: myAvatarUrl, wagons: 45, cards: {}, score: 0, destinations: [], color: PLAYER_COLORS[gameState.players.length], lastConnection: new Date().toISOString() };
        COLORS.forEach(c => newPlayer.cards[c] = 0);
        
        gameState.players.push(newPlayer);
        localPlayerIndex = gameState.players.length - 1;
        
        await supabaseClient.from('games').update({ state: gameState }).eq('id', id);
    }

    subscribeToGame(currentGameId);
    updateUI();
}

async function startActiveGame() {
    if (gameState.players[0].id !== myPlayerId) return; // Sécurité : Seul le créateur peut lancer
    
    initDeck();
    refillRiver();
    initDestinations();
    
    // Distribution initiale : 4 wagons et 1 mission
    gameState.players.forEach(p => {
        for (let i = 0; i < 4; i++) p.cards[gameState.deck.pop()]++;
        if(gameState.destinationDeck.length > 0) p.destinations.push(gameState.destinationDeck.pop());
    });

    addHistory({ type: 'start' }, 0); // Log du début
    gameState.status = 'playing'; // On lance la partie !
    await saveGameState();
    updateUI();
}

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
        return `
            <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.2); color: ${p.color}; font-weight: bold;">
                ${onlineIcon} ${avatarImg}${i === 0 ? '👑 ' : '🧑‍🚀 '}${p.name} ${p.id === myPlayerId ? ' <i>(VOUS)</i>' : ''}${lastSeenText}
            </div>
        `;
    }).join('');
    
    const isCreator = (gameState.players[0].id === myPlayerId);
    const startBtn = document.getElementById('start-game-btn');
    const waitMsg = document.getElementById('waiting-msg');
    
    if (isCreator) {
        startBtn.classList.remove('hidden-view');
        waitMsg.classList.add('hidden-view');
        startBtn.disabled = gameState.players.length < 2;
        startBtn.innerText = gameState.players.length < 2 ? "En attente de joueurs... (1/4)" : "Démarrer la partie !";
        startBtn.style.background = gameState.players.length < 2 ? "gray" : "#e67e22";
    } else {
        startBtn.classList.add('hidden-view');
        waitMsg.classList.remove('hidden-view');
    }
}

function renderMap(svg) {
    svg.innerHTML = '';
    const myPlayer = gameState.players[localPlayerIndex]; // On utilise notre propre joueur
    const activePlayer = gameState.players[gameState.currentPlayer];

    MAP.routes.forEach(route => {
        // PROACTIF : Désactiver le surlignage des routes si le joueur a déjà pioché une carte
        let isPlayable = localPlayerIndex === gameState.currentPlayer && !gameState.claimedRoutes.some(r => r.id === route.id) && activePlayer.wagons >= route.distance && gameState.cardsDrawnThisTurn === 0;
        
        if (isPlayable) {
            if (route.color === "gris") {
                const baseColors = COLORS.filter(c => c !== "locomotive");
                // Est-ce qu'au moins UNE couleur (+ jokers) permet de payer ?
                isPlayable = baseColors.some(c => (myPlayer.cards[c] + myPlayer.cards["locomotive"]) >= route.distance);
            } else {
                isPlayable = (myPlayer.cards[route.color] + myPlayer.cards["locomotive"]) >= route.distance;
            }
        }

        drawProfessionalRoute(svg, route, isPlayable);
    });

    // Dessiner MES propres lignes de mission secrètes (et jamais celles de l'adversaire)
    myPlayer.destinations.forEach(d => {
        const vFrom = MAP.villes.find(v => v.id === d.from);
        const vTo = MAP.villes.find(v => v.id === d.to);
        if (vFrom && vTo) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", vFrom.x);
            line.setAttribute("y1", vFrom.y);
            line.setAttribute("x2", vTo.x);
            line.setAttribute("y2", vTo.y);
            line.classList.add("mission-line");
            svg.appendChild(line);
        }
    });

    MAP.villes.forEach(ville => drawCity(svg, ville));
}

function updateUI() {
    // Si la partie n'a pas encore commencé, on reste dans la salle d'attente
    if (gameState.status === 'waiting') {
        renderWaitingRoom();
        return;
    }

    document.getElementById('waiting-room-container').classList.add('hidden-view');
    document.getElementById('lobby-container').classList.add('hidden-view');
    document.getElementById('game-container').classList.remove('hidden-view');

    const myPlayer = gameState.players[localPlayerIndex]; // Affichage spécifique à moi
    const activePlayer = gameState.players[gameState.currentPlayer];
    const isMyTurn = (localPlayerIndex === gameState.currentPlayer);

    // Mise à jour de la bannière de tour et grisage de l'interface
    const turnBanner = document.getElementById('turn-banner');
    if (turnBanner) {
        if (isMyTurn) {
            turnBanner.innerText = "🟢 C'est à vous de jouer !";
            turnBanner.className = "turn-active";
            document.querySelector('.draw-area').classList.remove('disabled-turn');
        } else {
            turnBanner.innerText = "🔴 En attente de " + activePlayer.name + "...";
            turnBanner.className = "turn-waiting";
            document.querySelector('.draw-area').classList.add('disabled-turn');
        }
    }
    
    // Mise à jour des cartes d'informations des joueurs en haut
    const playersContainer = document.getElementById('players-info-container');
    if (playersContainer) {
        playersContainer.innerHTML = '';
        gameState.players.forEach((p, index) => {
            const isActive = index === gameState.currentPlayer;
            // Calcul du nombre total de cartes en main
            const totalCards = Object.values(p.cards).reduce((sum, val) => sum + val, 0);
            
            const cardDiv = document.createElement('div');
            cardDiv.className = `player-info-card ${isActive ? 'active' : ''}`;
            
            // Ajout du liseré aux couleurs du joueur
            cardDiv.style.borderTop = `4px solid ${p.color}`;
            
            if (isActive) {
                cardDiv.style.borderColor = p.color;
                cardDiv.style.boxShadow = `0 0 15px ${p.color}80`; // Halo coloré semi-transparent
            }

            let nameText = p.name + (index === localPlayerIndex ? " (VOUS)" : "");
            if (isActive && gameState.cardsDrawnThisTurn > 0) {
                nameText += " (1 carte piochée)";
            }

            const isOnline = onlinePlayers[p.id];
            const onlineIcon = isOnline ? "🟢" : "🔴";
            const avatarImg = p.avatarUrl ? `<img src="${p.avatarUrl}" style="width:16px; height:16px; border-radius:50%; vertical-align:middle; margin-right:4px; object-fit:cover;">` : '';
            const lastSeenText = (!isOnline && p.lastConnection) ? `<div style="font-size:9px; color:#bdc3c7; margin-top:-5px; margin-bottom:4px; font-weight:normal; line-height: 1;">Vu: ${formatLastSeen(p.lastConnection)}</div>` : '';

            cardDiv.innerHTML = `
                <div class="player-name" ${isActive ? `style="color: ${p.color};"` : ''}>${onlineIcon} ${avatarImg}${nameText}</div>
                ${lastSeenText}
                <div class="player-stats">
                    <div class="stat-item" title="Score"><span class="stat-icon">⭐</span><span class="stat-value">${p.score}</span></div>
                    <div class="stat-item" title="Wagons restants"><span class="stat-icon">🚂</span><span class="stat-value">${p.wagons}</span></div>
                    <div class="stat-item" title="Cartes en main"><span class="stat-icon">🃏</span><span class="stat-value">${totalCards}</span></div>
                    <div class="stat-item" title="Missions secrètes"><span class="stat-icon">🎯</span><span class="stat-value">${p.destinations.length}</span></div>
                </div>
            `;
            playersContainer.appendChild(cardDiv);
        });
    }

    // Mise à jour de l'affichage des missions en haut
    const destContainer = document.getElementById('current-destinations');
    if (destContainer) {
        destContainer.innerHTML = '';
        if (myPlayer.destinations.length > 0) {
            myPlayer.destinations.forEach(d => {
                const vFrom = MAP.villes.find(v => v.id === d.from).name;
                const vTo = MAP.villes.find(v => v.id === d.to).name;
                const span = document.createElement('span');
                span.className = 'mission-item';
                span.innerText = `${vFrom} - ${vTo}`;
                destContainer.appendChild(span);
            });
        } else {
            destContainer.innerText = "Aucune";
        }
    }

    // RE-DESSINER LA CARTE pour mettre à jour les halos
    const svg = document.getElementById('map-svg');
    renderMap(svg);

    // Mise à jour de la main (Les cartes)
    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = '';

    // On crée un visuel pour chaque carte possédée par MOI
    Object.keys(myPlayer.cards).forEach(color => {
        if (myPlayer.cards[color] > 0) {
            for (let i = 0; i < myPlayer.cards[color]; i++) {
                const cardDiv = document.createElement('div');
                cardDiv.className = `card-visual`;
                if (color === "locomotive") {
                    cardDiv.classList.add("loco-card");
                    cardDiv.innerText = "J";
                } else {
                    cardDiv.style.backgroundColor = COLOR_MAP[color] || color;
                    cardDiv.innerText = INITIALS_MAP[color] || color.charAt(0).toUpperCase();
                }
                
                // Petit effet d'éventail mathématique
                const rotation = (i * 2) - 5; 
                cardDiv.style.transform = `rotate(${rotation}deg)`;
                
                handContainer.appendChild(cardDiv);
            }
        }
    });

    // Mise à jour de la rivière (Cartes visibles)
    const riverContainer = document.getElementById('river');
    if (riverContainer) {
        riverContainer.innerHTML = '';
        gameState.faceUpCards.forEach((color, index) => {
            const cardDiv = document.createElement('div');
            cardDiv.className = `card-visual river-card`;
            if (color === "locomotive") {
                cardDiv.classList.add("loco-card");
                cardDiv.innerText = "J";
                
                // PROACTIF : On grise le Joker de la rivière si 1 carte a déjà été piochée
                if (gameState.cardsDrawnThisTurn > 0) {
                    cardDiv.classList.add("disabled-card");
                } else {
                    cardDiv.onclick = (e) => drawFromRiver(index, e); // On passe l'événement 'e'
                }
            } else {
                cardDiv.style.backgroundColor = COLOR_MAP[color] || color;
                cardDiv.innerText = INITIALS_MAP[color] || color.charAt(0).toUpperCase();
                cardDiv.onclick = (e) => drawFromRiver(index, e); // On passe l'événement 'e'
            }
            riverContainer.appendChild(cardDiv);
        });
    }

    // Mise à jour du compteur de la pioche
    const deckElement = document.getElementById('deck');
    if (deckElement) {
        deckElement.innerText = `Pioche\n(${gameState.deck.length})`;
    }

    // Mise à jour du compteur de la pioche destination
    const destDeckElement = document.getElementById('dest-deck');
    if (destDeckElement) {
        destDeckElement.innerText = `Missions\n(${gameState.destinationDeck.length})`;
    }

    // Mise à jour de la défausse
    const discardElement = document.getElementById('discard');
    if (discardElement) {
        discardElement.innerText = `Défausse\n(${gameState.discardPile.length})`;
    }
    
    updateHistoryUI();
}

// (Garder ici tes fonctions drawProfessionalRoute et drawCity que tu as déjà)
// ... [Tes fonctions drawProfessionalRoute et drawCity] ...

function drawCity(svg, ville) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", ville.x);
    circle.setAttribute("cy", ville.y);
    circle.setAttribute("r", "14");
    circle.setAttribute("fill", "white");
    circle.setAttribute("stroke", "#2c3e50");
    circle.setAttribute("stroke-width", "3");
    
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", ville.x);
    text.setAttribute("y", ville.y + 30);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("style", "font-size: 12px; font-weight: bold; fill: #2c3e50;");
    text.textContent = ville.name;

    g.appendChild(circle);
    g.appendChild(text);
    svg.appendChild(g);
}

// Ajoute "isPlayable" ici dans les arguments entre parenthèses
function drawProfessionalRoute(svg, route, isPlayable) {
    const vFrom = MAP.villes.find(v => v.id === route.from);
    const vTo = MAP.villes.find(v => v.id === route.to);
    const dx = vTo.x - vFrom.x;
    const dy = vTo.y - vFrom.y;
    const distanceTotale = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const nbWagons = route.distance;
    const padding = 4;
    const wagonWidth = (distanceTotale / nbWagons) - padding;
    const wagonHeight = 12;

    const routeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    routeGroup.setAttribute("id", `route-${route.id}`);
    
    // Maintenant "isPlayable" est bien défini !
    if (isPlayable) {
        routeGroup.classList.add("highlight-route", "playable-pulse");
    }

    const claimData = gameState.claimedRoutes.find(r => r.id === route.id);
    const isClaimed = !!claimData;

    for (let i = 0; i < nbWagons; i++) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const offset = (i * (wagonWidth + padding)) + (padding / 2);
        rect.setAttribute("x", vFrom.x + (dx * offset / distanceTotale));
        rect.setAttribute("y", vFrom.y + (dy * offset / distanceTotale) - (wagonHeight / 2));
        rect.setAttribute("width", wagonWidth);
        rect.setAttribute("height", wagonHeight);
        rect.setAttribute("rx", "2");
        rect.setAttribute("transform", `rotate(${angle}, ${vFrom.x + (dx * offset / distanceTotale)}, ${vFrom.y + (dy * offset / distanceTotale)})`);
        
        rect.classList.add("wagon-unit");
        
        if (isClaimed) {
            const ownerColor = gameState.players[claimData.owner].color;
            rect.setAttribute("fill", "#1a252f"); // Corps du train gris très sombre
            rect.setAttribute("stroke", ownerColor); // Liseré Néon du joueur
            rect.setAttribute("stroke-width", "3");
            rect.style.opacity = "1";
            rect.style.filter = `drop-shadow(0px 2px 5px ${ownerColor})`; // Aura autour du wagon
        } else {
            rect.setAttribute("fill", route.color === "gris" ? "#bdc3c7" : (COLOR_MAP[route.color] || route.color));
            rect.style.opacity = "0.25";
        }
        
        // Style spécial pour les Tunnels (conserve les pointillés)
        if (route.isTunnel) {
            rect.classList.add("tunnel-wagon");
            if (!isClaimed) rect.setAttribute("stroke", "#2c3e50"); // Bordure sombre classique
        }

        routeGroup.appendChild(rect);
    }

    routeGroup.onclick = async () => {
        if (window.isDraggingMap) return;
        if (await claimRoute(gameState.currentPlayer, route.id)) {
            updateUI();
        }
    };
    svg.appendChild(routeGroup);
}
window.onload = initGame;
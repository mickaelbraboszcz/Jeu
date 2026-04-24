// --- CONFIGURATION SUPABASE ---
// Remplace ces deux valeurs par celles trouvées à l'Étape 1
const SUPABASE_URL = 'https://xzdvjhukkclqbhkutihf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZHZqaHVra2NscWJoa3V0aWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODMzMjUsImV4cCI6MjA5MjM1OTMyNX0.o1DYkGIN4P0YNrrmUbFHJy8smGnXz6eP8DJcL8ZnRzQ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DONNÉES STATIQUES ---
const MAP = {
    villes: [
        { id: "PAR", name: "Paris", x: 150, y: 100 },
        { id: "LYO", name: "Lyon", x: 180, y: 250 },
        { id: "MAR", name: "Marseille", x: 200, y: 400 },
        { id: "LON", name: "Londres", x: 100, y: 30 },
        { id: "FRA", name: "Francfort", x: 280, y: 90 },
        { id: "MAD", name: "Madrid", x: 50, y: 380 },
        { id: "BER", name: "Berlin", x: 380, y: 50 },
        { id: "ROM", name: "Rome", x: 300, y: 450 },
        { id: "VIE", name: "Vienne", x: 420, y: 180 },
        { id: "AMS", name: "Amsterdam", x: 180, y: 30 }
    ],  
    routes: [
        { id: 1, from: "PAR", to: "LYO", distance: 3, color: "rouge" },
        { id: 2, from: "LYO", to: "MAR", distance: 2, color: "bleu" },
        { id: 3, from: "PAR", to: "LON", distance: 2, color: "gris", isTunnel: true },
        { id: 4, from: "PAR", to: "FRA", distance: 3, color: "orange" },
        { id: 5, from: "LYO", to: "FRA", distance: 4, color: "gris" },
        { id: 6, from: "PAR", to: "MAD", distance: 4, color: "rose" },
        { id: 7, from: "MAR", to: "ROM", distance: 4, color: "jaune" },
        { id: 8, from: "FRA", to: "BER", distance: 3, color: "noir" },
        { id: 9, from: "BER", to: "VIE", distance: 3, color: "vert" },
        { id: 10, from: "FRA", to: "VIE", distance: 4, color: "orange" },
        { id: 11, from: "PAR", to: "AMS", distance: 3, color: "gris" },
        { id: 12, from: "AMS", to: "FRA", distance: 2, color: "blanc" }
    ]
};

const DESTINATIONS_DATA = [
    { id: "D1", from: "PAR", to: "ROM", points: 8 },
    { id: "D2", from: "LON", to: "VIE", points: 10 },
    { id: "D3", from: "MAD", to: "BER", points: 15 },
    { id: "D4", from: "AMS", to: "MAR", points: 9 },
    { id: "D5", from: "PAR", to: "MAD", points: 6 }
];

const COLORS = ["rouge", "bleu", "vert", "jaune", "noir", "blanc", "orange", "rose", "locomotive"];

const COLOR_MAP = {
    "rouge": "#e74c3c", "bleu": "#3498db", "vert": "#2ecc71", 
    "jaune": "#f1c40f", "noir": "#2c3e50", "blanc": "#ecf0f1", 
    "orange": "#e67e22", "rose": "#fd79a8"
};

const INITIALS_MAP = {
    "rouge": "R", "bleu": "B", "vert": "V", "jaune": "J", 
    "noir": "N", "blanc": "Bc", "orange": "O", "rose": "Rs"
};

const PLAYER_COLORS = ["#00e5ff", "#ff007a", "#39ff14", "#ffea00"]; // Cyan, Rose, Vert Néon, Jaune Néon
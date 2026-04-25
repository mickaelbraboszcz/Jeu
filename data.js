// --- CONFIGURATION SUPABASE ---
// Remplace ces deux valeurs par celles trouvées à l'Étape 1
const SUPABASE_URL = 'https://xzdvjhukkclqbhkutihf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZHZqaHVra2NscWJoa3V0aWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODMzMjUsImV4cCI6MjA5MjM1OTMyNX0.o1DYkGIN4P0YNrrmUbFHJy8smGnXz6eP8DJcL8ZnRzQ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DONNÉES STATIQUES ---
const STARTING_POSITIONS = [1, 3, 5, 9, 13, 14, 18, 20];
const MAX_TURNS = 24;
const REVEAL_TURNS = [3, 8, 13, 18, 24];

const MAP = {
    nodes: [
        { id: 1, x: 120, y: 100 }, { id: 2, x: 280, y: 80 }, { id: 3, x: 480, y: 100 }, { id: 4, x: 650, y: 80 },
        { id: 5, x: 80, y: 220 }, { id: 6, x: 220, y: 240 }, { id: 7, x: 380, y: 200 }, { id: 8, x: 550, y: 240 }, { id: 9, x: 720, y: 220 },
        { id: 10, x: 150, y: 350 }, { id: 11, x: 320, y: 340 }, { id: 12, x: 480, y: 360 }, { id: 13, x: 650, y: 340 },
        { id: 14, x: 80, y: 480 }, { id: 15, x: 250, y: 460 }, { id: 16, x: 420, y: 480 }, { id: 17, x: 580, y: 460 }, { id: 18, x: 720, y: 480 },
        { id: 19, x: 320, y: 550 }, { id: 20, x: 520, y: 550 }
    ],
    links: [
        // Taxi (Liaisons courtes - Jaune)
        { from: 1, to: 2, type: "TAXI" }, { from: 2, to: 3, type: "TAXI" }, { from: 3, to: 4, type: "TAXI" },
        { from: 1, to: 5, type: "TAXI" }, { from: 2, to: 6, type: "TAXI" }, { from: 3, to: 7, type: "TAXI" }, { from: 4, to: 8, type: "TAXI" }, { from: 8, to: 9, type: "TAXI" },
        { from: 5, to: 6, type: "TAXI" }, { from: 6, to: 7, type: "TAXI" }, { from: 7, to: 8, type: "TAXI" },
        { from: 5, to: 10, type: "TAXI" }, { from: 6, to: 10, type: "TAXI" }, { from: 6, to: 11, type: "TAXI" }, { from: 7, to: 11, type: "TAXI" }, { from: 7, to: 12, type: "TAXI" }, { from: 8, to: 12, type: "TAXI" }, { from: 8, to: 13, type: "TAXI" }, { from: 9, to: 13, type: "TAXI" },
        { from: 10, to: 11, type: "TAXI" }, { from: 11, to: 12, type: "TAXI" }, { from: 12, to: 13, type: "TAXI" },
        { from: 10, to: 14, type: "TAXI" }, { from: 10, to: 15, type: "TAXI" }, { from: 11, to: 15, type: "TAXI" }, { from: 11, to: 16, type: "TAXI" }, { from: 12, to: 16, type: "TAXI" }, { from: 12, to: 17, type: "TAXI" }, { from: 13, to: 17, type: "TAXI" }, { from: 13, to: 18, type: "TAXI" },
        { from: 14, to: 15, type: "TAXI" }, { from: 15, to: 16, type: "TAXI" }, { from: 16, to: 17, type: "TAXI" }, { from: 17, to: 18, type: "TAXI" },
        { from: 15, to: 19, type: "TAXI" }, { from: 16, to: 19, type: "TAXI" }, { from: 16, to: 20, type: "TAXI" }, { from: 17, to: 20, type: "TAXI" },
        { from: 19, to: 20, type: "TAXI" },

        // Bus (Liaisons moyennes - Vert)
        { from: 1, to: 7, path: [2, 6], type: "BUS" },
        { from: 7, to: 13, path: [8], type: "BUS" },
        { from: 5, to: 11, path: [6], type: "BUS" },
        { from: 11, to: 17, path: [12], type: "BUS" },
        { from: 14, to: 16, path: [15], type: "BUS" },
        { from: 16, to: 18, path: [17], type: "BUS" },
        { from: 2, to: 12, path: [3, 7], type: "BUS" },
        { from: 12, to: 20, path: [16], type: "BUS" },
        { from: 10, to: 19, path: [15], type: "BUS" },
        { from: 4, to: 12, path: [8], type: "BUS" },
        { from: 3, to: 11, path: [7], type: "BUS" },

        // Underground (Liaisons longues - Rouge)
        { from: 1, to: 18, path: [5, 10, 15, 16, 17], type: "UNDERGROUND" },
        { from: 4, to: 14, path: [8, 13, 17, 16, 15], type: "UNDERGROUND" },
        { from: 19, to: 9, path: [15, 10, 11, 12, 13], type: "UNDERGROUND" }
    ]
};

const TRANSPORT = {
    TAXI: { color: "#ffffff", cost: 1, name: "Taxi" },
    BUS: { color: "#555FB5", cost: 2, name: "Bus" },
    UNDERGROUND: { color: "#e74c3c", cost: 4, name: "Métro" },
    BLACK: { color: "#2c3e50", cost: 1, name: "Secret" }
};

const POLICE_COLORS = ["#3498db", "#2ecc71", "#f1c40f", "#e67e22"]; // Couleurs des détectives
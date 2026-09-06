// index.js - Main Entry Point
import { initializeGame } from './game/three-game.js';
import { createVueApp } from './vue-app.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Starting Three.js + Rapier Car Game...');

    // Create and mount Vue app
    const vueApp = createVueApp();

    // Initialize Three.js game with Vue app reference
    initializeGame(vueApp);

    console.log('✅ Game initialization complete!');
});

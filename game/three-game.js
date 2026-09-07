// three-game.js - Three.js + Rapier game entry points used by index.js and the Vue app
import * as THREE from 'three';
import { initPhysicsEngine } from './physics-world.js';
import { createRenderer, requestShadowUpdate, GlowComposer } from './rendering.js';
import { GameSession } from './game-session.js';
import { FpsMeter } from './fps-meter.js';

const CANVAS_FOCUS_DELAY_MS = 100;

let canvas;
let renderer;
let glowComposer;
let fpsMeter;
let session = null;
const timer = new THREE.Timer();

/**
 * Initialize renderer, physics engine and the first game session
 * @param {Object} vueApp - Vue application instance
 */
export function initializeGame(vueApp) {
    canvas = document.getElementById('renderCanvas');
    renderer = createRenderer(canvas);
    glowComposer = new GlowComposer(renderer);
    fpsMeter = new FpsMeter(fps => {
        vueApp.fps = fps;
    });

    initPhysicsEngine()
        .then(() => startSession(vueApp))
        .then(() => {
            renderer.setAnimationLoop(renderFrame);
            window.addEventListener('resize', handleResize);
            setupCanvasFocus();
            console.log('🎮 Three.js scene created and render loop started');
        })
        .catch(error => console.error('❌ Game could not be started:', error));
}

/**
 * Reset the entire game scene
 * @param {Object} vueApp - Vue application instance
 */
export async function resetGame(vueApp) {
    console.log('🔄 Resetting game using Three.js + Rapier...');

    renderer.setAnimationLoop(null);
    session?.dispose();
    session = null;

    await startSession(vueApp);
    renderer.setAnimationLoop(renderFrame);

    // Re-focus canvas for immediate input with delay
    setTimeout(() => canvas.focus(), CANVAS_FOCUS_DELAY_MS);
    console.log('✅ Game reset complete!');
}

/**
 * Reset the knockable boxes of the current session
 * @param {Object} vueApp - Vue application instance
 */
export function resetBoxes(vueApp) {
    vueApp.knockedBoxes = 0;
    vueApp.boxesStatus.forEach(box => {
        box.knocked = false;
    });
    session?.environment.resetBoxes();
}

/** Toggles the camera view from outside the render loop (e.g. the mobile View button). */
export function toggleView() {
    const camera = session?.followCamera;
    if (camera) {
        camera.setCockpit(!camera.cockpit);
    }
}

async function startSession(vueApp) {
    session = await GameSession.create(canvas, renderer, vueApp);
    glowComposer.setScene(session.scene, session.camera);
    timer.update(); // discard the loading time so the first frame does not jump ahead
}

function renderFrame() {
    timer.update();
    requestShadowUpdate(renderer);
    session.update(timer.getDelta());
    glowComposer.render();
    fpsMeter.tick();
}

function handleResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    glowComposer.setSize(window.innerWidth, window.innerHeight);
    session?.resize(window.innerWidth / window.innerHeight);
}

function setupCanvasFocus() {
    setTimeout(() => {
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
        canvas.addEventListener('click', () => canvas.focus());
    }, CANVAS_FOCUS_DELAY_MS);
}

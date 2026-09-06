// game-session.js - One playable round: scene, physics world, car, environment and the per-frame update
import * as THREE from 'three';
import { babylonColor } from './color.js';
import { createPhysicsWorld, PhysicsStepper } from './physics-world.js';
import { ReflectionProbe } from './rendering.js';
import { FollowCamera } from './follow-camera.js';
import { createCar } from './car.js';
import { createEnvironment } from './world.js';
import { CarControls } from './controls.js';
import { Telemetry } from './telemetry.js';

const BACKGROUND_COLOR = [0.95, 0.95, 0.95];
// Babylon.js direction (1, 1, 0) with the X axis mirrored for the right-handed world
const HEMISPHERIC_LIGHT = { direction: [-1, 1, 0], intensity: 0.7 };

export class GameSession {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {THREE.WebGLRenderer} renderer
     * @param {Object} vueApp
     * @returns {Promise<GameSession>}
     */
    static async create(canvas, renderer, vueApp) {
        const scene = createScene();
        const world = createPhysicsWorld();
        const car = await createCar(scene, world);
        const environment = createEnvironment(scene, world);
        return new GameSession({ canvas, renderer, vueApp, scene, world, car, environment });
    }

    constructor({ canvas, renderer, vueApp, scene, world, car, environment }) {
        this.renderer = renderer;
        this.scene = scene;
        this.world = world;
        this.car = car;
        this.environment = environment;
        this.stepper = new PhysicsStepper(world);
        this.controls = new CarControls(car, vueApp);
        this.telemetry = new Telemetry({ car, boxes: environment.boxes, vueApp, physicsClock: this.stepper });

        this.followCamera = new FollowCamera(canvas);
        this.followCamera.lockTarget(car.mesh);
        console.log('✅ Camera locked to car:', car.mesh.name);

        this.reflectionProbe = new ReflectionProbe();
        this.reflectionProbe.attachToMesh(car.mesh);
    }

    get camera() {
        return this.followCamera.camera;
    }

    update(deltaSeconds) {
        this.controls.update();
        this.stepper.step(deltaSeconds);
        this.car.syncMeshes();
        this.environment.syncMeshes();
        this.followCamera.update();
        this.telemetry.update();
        this.reflectionProbe.update(this.renderer, this.scene);
    }

    resize(aspect) {
        this.followCamera.setAspect(aspect);
    }

    dispose() {
        this.controls.dispose();
        this.followCamera.dispose();
        this.reflectionProbe.dispose();
        disposeSceneResources(this.scene);
        this.world.free();
    }
}

function createScene() {
    const scene = new THREE.Scene();
    scene.background = babylonColor(...BACKGROUND_COLOR);

    const light = new THREE.HemisphereLight(0xffffff, 0x000000, HEMISPHERIC_LIGHT.intensity);
    light.position.set(...HEMISPHERIC_LIGHT.direction);
    scene.add(light);

    return scene;
}

/** Frees GPU resources created for this session; assets marked as shared stay alive for the next one */
function disposeSceneResources(scene) {
    scene.traverse(object => {
        if (object.isLight) {
            object.dispose();
        }
        if (object.geometry && !object.geometry.userData.shared) {
            object.geometry.dispose();
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (material && !material.userData.shared) {
                material.dispose();
            }
        }
    });
}

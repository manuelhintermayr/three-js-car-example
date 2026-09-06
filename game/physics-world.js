// physics-world.js - Rapier physics world setup and shared physics helpers
import RAPIER from '@dimforge/rapier3d-compat';

const GRAVITY = { x: 0, y: -150, z: 0 };
const PHYSICS_TIMESTEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 8; // keeps the simulation in real time down to 15 fps
const SOLVER_ITERATIONS = 16; // keeps the jointed car straight even on the hard spawn landing
const UNITS_PER_METER = 8; // the car is ~28 units long, so 1 meter is roughly 8 units

// Collision filters: car parts only collide with the environment, never with each other
const MEMBERSHIP = { CarParts: 0x0001, Environment: 0x0002 };
const ALL_GROUPS = 0xffff;
export const COLLISION_GROUPS = {
    CarParts: (MEMBERSHIP.CarParts << 16) | MEMBERSHIP.Environment,
    Environment: (MEMBERSHIP.Environment << 16) | ALL_GROUPS
};

let engineReady = null;

/**
 * Loads the Rapier WASM module once
 * @returns {Promise<void>}
 */
export function initPhysicsEngine() {
    if (!engineReady) {
        engineReady = RAPIER.init();
    }
    return engineReady;
}

/**
 * Creates a physics world with the gravity and solver settings of the original game
 * @returns {RAPIER.World}
 */
export function createPhysicsWorld() {
    const world = new RAPIER.World(GRAVITY);
    world.timestep = PHYSICS_TIMESTEP;
    world.numSolverIterations = SOLVER_ITERATIONS;
    world.lengthUnit = UNITS_PER_METER;
    return world;
}

/**
 * Advances the world with a fixed timestep, catching up on the elapsed frame time
 */
export class PhysicsStepper {
    constructor(world) {
        this.world = world;
        this.accumulator = 0;
        /** Simulated seconds so far, independent of frame rate and tab visibility */
        this.elapsedSeconds = 0;
    }

    step(deltaSeconds) {
        this.accumulator += Math.min(deltaSeconds, PHYSICS_TIMESTEP * MAX_STEPS_PER_FRAME);

        let steps = 0;
        while (this.accumulator >= PHYSICS_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
            this.world.step();
            this.accumulator -= PHYSICS_TIMESTEP;
            this.elapsedSeconds += PHYSICS_TIMESTEP;
            steps++;
        }
    }
}

/**
 * Copies the rigid body transform onto a Three.js object
 * @param {import('three').Object3D} mesh
 * @param {RAPIER.RigidBody} body
 */
export function syncMeshWithBody(mesh, body) {
    const translation = body.translation();
    const rotation = body.rotation();
    mesh.position.set(translation.x, translation.y, translation.z);
    mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

export { RAPIER };

// telemetry.js - Vehicle data, race timer, collision and knocked-box detection for the Vue UI
import * as THREE from 'three';

const SPEED_DEADZONE = 1;
const RACE_START_SPEED = 2;
// Detection timings run on simulated physics seconds, so slow frames or a hidden tab cannot skew them
const COLLISION = { speedDrop: 5, minimumPreviousSpeed: 2, cooldownSeconds: 0.5 };
const BOX = { settleTimeSeconds: 2, knockDistance: 3, cooldownSeconds: 1 };
const FULL_CIRCLE_DEGREES = 360;

export class Telemetry {
    /**
     * @param {Object} options
     * @param {import('./car.js').Car} options.car
     * @param {import('./world.js').KnockableBox[]} options.boxes
     * @param {Object} options.vueApp
     * @param {{ elapsedSeconds: number }} options.physicsClock
     */
    constructor({ car, boxes, vueApp, physicsClock }) {
        this.car = car;
        this.boxes = boxes;
        this.vueApp = vueApp;
        this.physicsClock = physicsClock;
        this.raceStarted = false;
        this.raceStartTime = 0;
        this.lastSpeed = 0;
        this.lastCollisionTime = -Infinity;
        this.lastKnockTimes = new Map();
    }

    update() {
        const velocity = this.car.linearVelocity();
        const rawSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const speed = rawSpeed < SPEED_DEADZONE ? 0 : rawSpeed;

        this.updateVehicleData(speed);
        this.updateRaceTimer(speed);
        this.detectCollision(rawSpeed);
        this.detectKnockedBoxes();
        this.lastSpeed = rawSpeed;
    }

    updateVehicleData(speed) {
        const vueApp = this.vueApp;
        const position = this.car.position;

        vueApp.speed = speed;
        vueApp.position.x = position.x;
        vueApp.position.y = position.y;
        vueApp.position.z = position.z;
        vueApp.rotation = THREE.MathUtils.radToDeg(this.car.yaw()) % FULL_CIRCLE_DEGREES;
        vueApp.maxSpeed = Math.max(vueApp.maxSpeed, speed);
    }

    updateRaceTimer(speed) {
        // Auto-start race when car starts moving
        if (!this.raceStarted && speed > RACE_START_SPEED) {
            console.log('Race started automatically - car is moving!');
            this.raceStarted = true;
            this.raceStartTime = Date.now();
            this.vueApp.isRacing = true;
        }
        if (this.raceStarted && this.vueApp.isRacing) {
            this.vueApp.raceTime = (Date.now() - this.raceStartTime) / 1000;
        }
    }

    /** A sudden speed drop counts as a collision */
    detectCollision(rawSpeed) {
        const speedDrop = this.lastSpeed - rawSpeed;
        if (speedDrop <= COLLISION.speedDrop || this.lastSpeed <= COLLISION.minimumPreviousSpeed) {
            return;
        }
        const now = this.physicsClock.elapsedSeconds;
        if (now - this.lastCollisionTime <= COLLISION.cooldownSeconds) {
            return;
        }
        this.vueApp.collisions++;
        this.lastCollisionTime = now;
        console.log(`Collision detected! Speed change: ${speedDrop.toFixed(2)}, Total collisions: ${this.vueApp.collisions}`);
    }

    /** Boxes are checked after the physics settled, every box can be counted multiple times */
    detectKnockedBoxes() {
        const now = this.physicsClock.elapsedSeconds;
        if (now < BOX.settleTimeSeconds) {
            return;
        }

        for (const box of this.boxes) {
            if (!box.isSettled) {
                box.settle();
                continue;
            }
            const movedDistance = box.distanceFromSettledPosition();
            const lastKnockTime = this.lastKnockTimes.get(box.name) ?? -Infinity;
            if (movedDistance <= BOX.knockDistance || now - lastKnockTime <= BOX.cooldownSeconds) {
                continue;
            }
            this.vueApp.knockedBoxes++;
            this.lastKnockTimes.set(box.name, now);
            box.settle();
            console.log(`Box ${box.name} moved ${movedDistance.toFixed(2)} units from settled position! Total: ${this.vueApp.knockedBoxes}`);
        }
    }
}

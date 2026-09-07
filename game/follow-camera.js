// follow-camera.js - Port of the Babylon.js FollowCamera including the mouse orbit control
import * as THREE from 'three';

const FIELD_OF_VIEW_DEGREES = 45.8; // Babylon.js default camera fov (0.8 rad)
const COCKPIT_FIELD_OF_VIEW_DEGREES = 74; // wide driver-POV: full windshield above, wheel + footwell below
const NEAR_PLANE = 1;
const FAR_PLANE = 5000;
const INITIAL_POSITION = new THREE.Vector3(0, 10, -10);
const FOLLOW = {
    radius: 50,
    heightOffset: 20,
    rotationOffset: 180,
    cameraAcceleration: 0.035,
    maxCameraSpeed: 10
};
const MOUSE_DEGREES_PER_PIXEL = 0.5;

export class FollowCamera {
    constructor(canvas) {
        this.camera = new THREE.PerspectiveCamera(
            FIELD_OF_VIEW_DEGREES, window.innerWidth / window.innerHeight, NEAR_PLANE, FAR_PLANE
        );
        this.camera.position.copy(INITIAL_POSITION);
        this.rotationOffset = FOLLOW.rotationOffset;
        this.lockedTarget = null;
        this.isMouseDown = false;
        this.canvas = canvas;
        this.cockpit = false;
        this.cockpitRig = null;
        // Reused every frame instead of allocating fresh vectors in the update
        this.scratch = { goal: new THREE.Vector3(), forward: new THREE.Vector3(), eye: new THREE.Vector3(), look: new THREE.Vector3() };

        this.onPointerDown = () => { this.isMouseDown = true; };
        this.onPointerUp = () => { this.isMouseDown = false; };
        this.onPointerMove = (event) => {
            if (this.isMouseDown) {
                // Rotate camera around the car using mouse movement
                this.rotationOffset += event.movementX * MOUSE_DEGREES_PER_PIXEL;
            }
        };
        this.onKeyDown = (event) => {
            if ((event.key === 'c' || event.key === 'C') && !event.repeat) {
                this.setCockpit(!this.cockpit);
            }
        };
        canvas.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('keydown', this.onKeyDown);
    }

    lockTarget(object) {
        this.lockedTarget = object;
    }

    /** Interior camera pose in the car's local frame: { eye, look } vectors. */
    setCockpitRig(rig) {
        this.cockpitRig = rig;
    }

    setCockpit(on) {
        this.cockpit = on;
        this.camera.fov = on ? COCKPIT_FIELD_OF_VIEW_DEGREES : FIELD_OF_VIEW_DEGREES;
        this.camera.updateProjectionMatrix();
    }

    setAspect(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    update() {
        if (!this.lockedTarget) {
            return;
        }
        if (this.cockpit && this.cockpitRig) {
            this.updateCockpit();
            return;
        }

        const velocity = this.computeGoalPosition(this.scratch.goal).sub(this.camera.position);
        velocity.x = clampSpeed(velocity.x * FOLLOW.cameraAcceleration * 2);
        velocity.y = clampSpeed(velocity.y * FOLLOW.cameraAcceleration);
        velocity.z = clampSpeed(velocity.z * FOLLOW.cameraAcceleration * 2);

        this.camera.position.add(velocity);
        // The single shared camera keeps the car's roll from the cockpit's up vector; the bird's-eye
        // view must stay world-upright, so reset up before lookAt regardless of how the car is lying.
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(this.lockedTarget.position);
    }

    /** Rigidly places the camera at the driver's eye, looking forward through the windshield. */
    updateCockpit() {
        const car = this.lockedTarget;
        car.updateWorldMatrix(true, false);
        this.camera.position.copy(this.scratch.eye.copy(this.cockpitRig.eye).applyMatrix4(car.matrixWorld));
        this.camera.up.set(0, 1, 0).applyQuaternion(car.quaternion);
        this.camera.lookAt(this.scratch.look.copy(this.cockpitRig.look).applyMatrix4(car.matrixWorld));
    }

    /** The camera's goal position behind the car, written into `goal`. */
    computeGoalPosition(goal) {
        const target = this.lockedTarget.position;
        const forward = this.scratch.forward.set(0, 0, 1).applyQuaternion(this.lockedTarget.quaternion);
        const yaw = Math.atan2(forward.x, forward.z);
        // Babylon.js uses sin/cos(rotationOffset + yaw) in its left-handed system; with the X axis
        // mirrored for Three.js the yaw changes sign, which keeps the orbit direction identical.
        const angle = yaw - THREE.MathUtils.degToRad(this.rotationOffset);

        return goal.set(
            target.x + Math.sin(angle) * FOLLOW.radius,
            target.y + FOLLOW.heightOffset,
            target.z + Math.cos(angle) * FOLLOW.radius
        );
    }

    dispose() {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('keydown', this.onKeyDown);
    }
}

function clampSpeed(value) {
    return THREE.MathUtils.clamp(value, -FOLLOW.maxCameraSpeed, FOLLOW.maxCameraSpeed);
}

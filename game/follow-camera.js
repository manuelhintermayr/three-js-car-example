// follow-camera.js - Port of the Babylon.js FollowCamera including the mouse orbit control
import * as THREE from 'three';

const FIELD_OF_VIEW_DEGREES = 45.8; // Babylon.js default camera fov (0.8 rad)
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

        this.onPointerDown = () => { this.isMouseDown = true; };
        this.onPointerUp = () => { this.isMouseDown = false; };
        this.onPointerMove = (event) => {
            if (this.isMouseDown) {
                // Rotate camera around the car using mouse movement
                this.rotationOffset += event.movementX * MOUSE_DEGREES_PER_PIXEL;
            }
        };
        canvas.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointermove', this.onPointerMove);
    }

    lockTarget(object) {
        this.lockedTarget = object;
    }

    setAspect(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    update() {
        if (!this.lockedTarget) {
            return;
        }

        const goal = this.computeGoalPosition();
        const velocity = goal.sub(this.camera.position);
        velocity.x = clampSpeed(velocity.x * FOLLOW.cameraAcceleration * 2);
        velocity.y = clampSpeed(velocity.y * FOLLOW.cameraAcceleration);
        velocity.z = clampSpeed(velocity.z * FOLLOW.cameraAcceleration * 2);

        this.camera.position.add(velocity);
        this.camera.lookAt(this.lockedTarget.position);
    }

    computeGoalPosition() {
        const target = this.lockedTarget.position;
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.lockedTarget.quaternion);
        const yaw = Math.atan2(forward.x, forward.z);
        // Babylon.js uses sin/cos(rotationOffset + yaw) in its left-handed system; with the X axis
        // mirrored for Three.js the yaw changes sign, which keeps the orbit direction identical.
        const angle = yaw - THREE.MathUtils.degToRad(this.rotationOffset);

        return new THREE.Vector3(
            target.x + Math.sin(angle) * FOLLOW.radius,
            target.y + FOLLOW.heightOffset,
            target.z + Math.cos(angle) * FOLLOW.radius
        );
    }

    dispose() {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointermove', this.onPointerMove);
    }
}

function clampSpeed(value) {
    return THREE.MathUtils.clamp(value, -FOLLOW.maxCameraSpeed, FOLLOW.maxCameraSpeed);
}

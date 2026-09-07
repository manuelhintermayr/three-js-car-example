// controls.js - Keyboard and touch input mapped onto the car's motors every frame

const MAX_SPEED = 80;
const REVERSE_SPEED_LIMIT = MAX_SPEED * 0.5;
const ACCELERATION_PER_FRAME = 1;
const NATURAL_SLOWDOWN = 0.92;
const MAX_STEERING_ANGLE = Math.PI / 4;
const STEERING_STEP = 0.05;
const STEERING_CENTERING = 0.85;
const NO_DIRECTION = '—';

const KEY_ACTIONS = new Map([
    ['w', 'forward'], ['W', 'forward'], ['ArrowUp', 'forward'],
    ['s', 'backward'], ['S', 'backward'], ['ArrowDown', 'backward'],
    ['a', 'left'], ['A', 'left'], ['ArrowLeft', 'left'],
    ['d', 'right'], ['D', 'right'], ['ArrowRight', 'right'],
    ['b', 'brake'], ['B', 'brake'],
    [' ', 'jump']
]);
const RESET_KEY = 'Enter';

const DIRECTION_LABELS = [
    ['forward', '↑ Forward'],
    ['backward', '↓ Backward'],
    ['left', '← Left'],
    ['right', '→ Right'],
    ['brake', '🚗 Brake'],
    ['jump', '🚀 Jump']
];

export class CarControls {
    constructor(car, vueApp) {
        this.car = car;
        this.vueApp = vueApp;
        this.pressed = { forward: false, backward: false, left: false, right: false, brake: false, jump: false };
        this.currentSpeed = 0;
        this.currentSteeringAngle = 0;
        // Reused every frame instead of allocating new input objects
        this.input = { forward: false, backward: false, left: false, right: false, brake: false, jump: false };
        this.visualState = { steerAngle: 0, forward: false, backward: false, brake: false };

        this.onKeyDown = (event) => this.handleKey(event, true);
        this.onKeyUp = (event) => this.handleKey(event, false);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    handleKey(event, isDown) {
        if (event.key === RESET_KEY) {
            if (isDown) {
                this.vueApp.resetGame();
            }
            return;
        }

        const action = KEY_ACTIONS.get(event.key);
        if (!action) {
            return;
        }
        this.pressed[action] = isDown;

        if (action === 'jump' && isDown && !event.repeat) {
            console.log('🚀 Jump button pressed!');
            this.car.jump();
        }
    }

    /** Applies the combined keyboard and touch input to the car, once per rendered frame */
    update() {
        const input = this.combineInputs();

        if (input.jump) {
            this.car.holdJump();
        }
        this.updateSteering(input);
        this.updateSpeed(input);
        this.vueApp.direction = describeDirection(input);

        this.car.setBrake(input.brake);
        this.car.setMotorSpeed(this.currentSpeed);
        this.car.setSteeringAngle(this.currentSteeringAngle);
    }

    /** Cockpit animation state for the steering wheel, pedals and gear lever. */
    getVisualState() {
        const state = this.visualState;
        state.steerAngle = this.currentSteeringAngle;
        state.forward = this.input.forward;
        state.backward = this.input.backward;
        state.brake = this.input.brake;
        return state;
    }

    /** Merges the keyboard and touch input into the reused input object. */
    combineInputs() {
        const touch = this.vueApp.touchControls;
        const input = this.input;
        input.forward = this.pressed.forward || Boolean(touch.forward);
        input.backward = this.pressed.backward || Boolean(touch.backward);
        input.left = this.pressed.left || Boolean(touch.left);
        input.right = this.pressed.right || Boolean(touch.right);
        input.brake = this.pressed.brake || Boolean(touch.brake);
        input.jump = this.pressed.jump || Boolean(touch.jump);
        return input;
    }

    updateSteering({ left, right }) {
        if (left && this.currentSteeringAngle < MAX_STEERING_ANGLE) {
            this.currentSteeringAngle += STEERING_STEP;
        } else if (right && this.currentSteeringAngle > -MAX_STEERING_ANGLE) {
            this.currentSteeringAngle -= STEERING_STEP;
        } else if (!left && !right) {
            this.currentSteeringAngle *= STEERING_CENTERING;
        }
    }

    updateSpeed({ forward, backward, brake }) {
        if (brake) {
            this.currentSpeed = 0;
        } else if (forward && this.currentSpeed < MAX_SPEED) {
            this.currentSpeed += ACCELERATION_PER_FRAME;
        } else if (backward && this.currentSpeed > -REVERSE_SPEED_LIMIT) {
            this.currentSpeed -= ACCELERATION_PER_FRAME;
        } else if (!forward && !backward) {
            this.currentSpeed *= NATURAL_SLOWDOWN;
        }
    }
}

function describeDirection(input) {
    const labels = DIRECTION_LABELS.filter(([action]) => input[action]).map(([, label]) => label);
    return labels.length > 0 ? labels.join(' + ') : NO_DIRECTION;
}

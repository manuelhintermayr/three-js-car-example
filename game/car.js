// car.js - Car assembly: chassis, suspension, steering and wheel joints on top of Rapier
import * as THREE from 'three';
import { RAPIER, COLLISION_GROUPS, syncMeshWithBody } from './physics-world.js';
import { loadCarModel } from './car-model.js';
import { createCarLights } from './car-lights.js';

const SPAWN_POSITION = { x: 0, y: 5, z: 0 };
const CHASSIS = {
    mass: 5000,
    restitution: 0,
    friction: 0.8,
    // Centre of mass just above the wheel contact patch keeps the car planted without rolling over
    centerOfMass: { x: 0, y: -2.5, z: 1 },
    additionalSolverIterations: 4
};
// The car drives towards +Z in Three.js' right-handed world, so +X is the car's left side
const WHEEL_CORNERS = [
    { name: 'frontLeft', signX: 1, signZ: 1, isSteered: true, isPowered: true },
    { name: 'frontRight', signX: -1, signZ: 1, isSteered: true, isPowered: true },
    { name: 'rearLeft', signX: 1, signZ: -1, isSteered: false, isPowered: false },
    { name: 'rearRight', signX: -1, signZ: -1, isSteered: false, isPowered: false }
];
const WHEEL_HEIGHT = 0;
const WHEEL = { mass: 150, restitution: 0, friction: 2.5, width: 1.6 };
const AXLE = { mass: 190, radius: 1.8, width: 1.6, steeringMassShare: 0.5 };
// Soft spring like the original: the chassis sags roughly 2 units under its own weight
const SUSPENSION = { maxTravel: 3, stiffness: 100_000, damping: 1_500 };
// Stiff enough to re-center the wheels against tyre friction while standing still
const STEERING_MOTOR = { stiffness: 20_000_000, damping: 400_000, maxForce: 60_000_000 };
const DRIVE_MOTOR = { damping: 1_000_000, maxForce: 330_000, brakeForce: 1_000_000 };
const JUMP_FORCE = 3000;

// Visual animation of the cockpit
const STEERING_WHEEL_RATIO = 4; // dashboard wheel turns further than the road wheels
const PEDAL_PRESS_ANGLE = 0.5; // radians the pedal rotates when pressed
const PEDAL_SMOOTHING = 0.25;

const ORIGIN = { x: 0, y: 0, z: 0 };
const AXIS_X = { x: 1, y: 0, z: 0 };
const AXIS_Y = { x: 0, y: 1, z: 0 };
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
// Rapier cylinders point along Y; this rotation aligns them with the wheel axis (X)
const CYLINDER_TO_X_AXIS = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 };

export class Car {
    constructor({ mesh, body, wheelAssemblies, cockpit, ackermann }) {
        this.mesh = mesh;
        this.body = body;
        this.wheelAssemblies = wheelAssemblies;
        this.cockpit = cockpit;
        this.ackermann = ackermann;
        this.pedalPress = 0;
        this.driveJoints = wheelAssemblies.filter(wheel => wheel.driveJoint).map(wheel => wheel.driveJoint);
        this.steeringJoints = {
            left: wheelAssemblies.find(wheel => wheel.name === 'frontLeft').steeringJoint,
            right: wheelAssemblies.find(wheel => wheel.name === 'frontRight').steeringJoint
        };
        this._forward = new THREE.Vector3();
    }

    get position() {
        return this.mesh.position;
    }

    linearVelocity() {
        return this.body.linvel();
    }

    /** @returns {number} heading around the Y axis in radians */
    yaw() {
        const forward = this._forward.set(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        return Math.atan2(forward.x, forward.z);
    }

    setMotorSpeed(targetAngularVelocity) {
        for (const joint of this.driveJoints) {
            joint.configureMotorVelocity(targetAngularVelocity, DRIVE_MOTOR.damping);
        }
    }

    setBrake(isBraking) {
        const maxForce = isBraking ? DRIVE_MOTOR.brakeForce : DRIVE_MOTOR.maxForce;
        for (const joint of this.driveJoints) {
            joint.setMotorMaxForce(maxForce);
        }
    }

    setSteeringAngle(averageAngle) {
        const [innerAngle, outerAngle] = this.ackermann(averageAngle);
        this.steeringJoints.left.configureMotorPosition(innerAngle, STEERING_MOTOR.stiffness, STEERING_MOTOR.damping);
        this.steeringJoints.right.configureMotorPosition(outerAngle, STEERING_MOTOR.stiffness, STEERING_MOTOR.damping);
    }

    /** One-shot jump impulse when the jump key is pressed */
    jump() {
        this.body.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true);
        const velocity = this.body.linvel();
        this.body.setLinvel({ x: velocity.x, y: JUMP_FORCE / 100, z: velocity.z }, true);
    }

    /** Continuous upward force for as long as the jump input is held */
    holdJump() {
        this.body.applyImpulse({ x: 0, y: JUMP_FORCE / 2, z: 0 }, true);
        const velocity = this.body.linvel();
        const liftedVelocity = Math.min(velocity.y + JUMP_FORCE / 200, JUMP_FORCE / 50);
        this.body.setLinvel({ x: velocity.x, y: liftedVelocity, z: velocity.z }, true);
    }

    syncMeshes() {
        syncMeshWithBody(this.mesh, this.body);
        for (const wheel of this.wheelAssemblies) {
            wheel.syncMesh();
        }
    }

    /**
     * Turns the dashboard steering wheel and presses the pedal in time with the controls.
     * The road wheels animate on their own because their meshes follow the physics wheel bodies.
     * @param {{ steerAngle: number, isPedalPressed: boolean }} input
     */
    updateVisuals(input) {
        this.cockpit.steeringWheel.rotation.z = -input.steerAngle * STEERING_WHEEL_RATIO;
        const target = input.isPedalPressed ? PEDAL_PRESS_ANGLE : 0;
        this.pedalPress += (target - this.pedalPress) * PEDAL_SMOOTHING;
        this.cockpit.pedal.rotation.x = this.pedalPress;
    }
}

/**
 * Builds the complete car (visuals + physics) at the spawn position
 * @param {THREE.Scene} scene
 * @param {RAPIER.World} world
 * @returns {Promise<Car>}
 */
export async function createCar(scene, world) {
    const model = await loadCarModel();

    const mesh = new THREE.Mesh(model.bodyGeometry, model.bodyMaterial);
    mesh.name = 'CarBody';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z);
    scene.add(mesh);

    const body = createChassisBody(world, model);
    const wheelsByCorner = new Map(model.wheels.map(wheel => [wheel.corner, wheel]));
    const wheelAssemblies = WHEEL_CORNERS.map(corner =>
        createWheelAssembly(scene, world, body, corner, model, wheelsByCorner.get(corner.name))
    );

    const cockpit = buildCockpit(mesh, model);
    createCarLights(mesh, model);

    return new Car({ mesh, body, wheelAssemblies, cockpit, ackermann: makeAckermann(model) });
}

/** Adds the steering wheel and pedal to the body as animatable pivots. */
function buildCockpit(bodyMesh, model) {
    const steeringWheel = createPivotMesh(model.steeringWheel, model.bodyMaterial);
    const pedal = createPivotMesh(model.pedal, model.bodyMaterial);
    bodyMesh.add(steeringWheel, pedal);
    return { steeringWheel, pedal };
}

/** A group placed at the part's pivot, carrying its tilt, with the recentred mesh inside. */
function createPivotMesh(part, material) {
    const group = new THREE.Group();
    group.position.copy(part.pivot);
    group.quaternion.copy(part.orientation);
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.castShadow = true;
    group.add(mesh);
    return group;
}

function createChassisBody(world, model) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z)
        .setCanSleep(false)
        .setAdditionalSolverIterations(CHASSIS.additionalSolverIterations);
    const body = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.convexHull(model.hullPoints);
    if (!colliderDesc) {
        throw new Error('Convex hull for the car body could not be created');
    }
    colliderDesc
        .setMassProperties(CHASSIS.mass, CHASSIS.centerOfMass, boxInertia(CHASSIS.mass, model.size), IDENTITY_ROTATION)
        .setFriction(CHASSIS.friction)
        .setRestitution(CHASSIS.restitution)
        .setCollisionGroups(COLLISION_GROUPS.CarParts);
    world.createCollider(colliderDesc, body);

    return body;
}

/**
 * Front: chassis -[revolute Y: steering]- knuckle -[prismatic Y: suspension]- axle -[revolute X: spin]- wheel
 * Rear:  chassis -[prismatic Y: suspension]- axle -[revolute X: spin]- wheel
 */
function createWheelAssembly(scene, world, chassisBody, corner, model, wheelPart) {
    const position = { x: corner.signX * model.halfTrack, y: WHEEL_HEIGHT, z: corner.signZ * model.halfWheelbase };
    const anchorOnChassis = {
        x: position.x - SPAWN_POSITION.x,
        y: position.y - SPAWN_POSITION.y,
        z: position.z - SPAWN_POSITION.z
    };

    let suspensionParent = chassisBody;
    let anchorOnParent = anchorOnChassis;
    let axleMass = AXLE.mass;
    let steeringJoint = null;
    if (corner.isSteered) {
        const knuckleBody = createMassOnlyBody(world, position, AXLE.mass * AXLE.steeringMassShare);
        steeringJoint = createSteeringJoint(world, chassisBody, knuckleBody, anchorOnChassis);
        suspensionParent = knuckleBody;
        anchorOnParent = ORIGIN;
        axleMass = AXLE.mass * (1 - AXLE.steeringMassShare);
    }

    const axleBody = createMassOnlyBody(world, position, axleMass);
    createSuspensionJoint(world, suspensionParent, axleBody, anchorOnParent);

    const wheelBody = createWheelBody(world, position, model.wheelRadius);
    const spinJoint = world.createImpulseJoint(RAPIER.JointData.revolute(ORIGIN, ORIGIN, AXIS_X), axleBody, wheelBody, true);
    const driveJoint = corner.isPowered ? configureDriveMotor(spinJoint) : null;

    const wheelMesh = new THREE.Mesh(wheelPart.geometry, model.bodyMaterial);
    wheelMesh.name = `Wheel_${corner.name}`;
    wheelMesh.castShadow = true;
    scene.add(wheelMesh);

    return {
        name: corner.name,
        driveJoint,
        steeringJoint,
        syncMesh() {
            syncMeshWithBody(wheelMesh, wheelBody);
        }
    };
}

function createSteeringJoint(world, chassisBody, knuckleBody, anchorOnChassis) {
    const joint = world.createImpulseJoint(
        RAPIER.JointData.revolute(anchorOnChassis, ORIGIN, AXIS_Y), chassisBody, knuckleBody, true
    );
    joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    joint.setMotorMaxForce(STEERING_MOTOR.maxForce);
    joint.configureMotorPosition(0, STEERING_MOTOR.stiffness, STEERING_MOTOR.damping);
    return joint;
}

function createSuspensionJoint(world, parentBody, axleBody, anchorOnParent) {
    const joint = world.createImpulseJoint(
        RAPIER.JointData.prismatic(anchorOnParent, ORIGIN, AXIS_Y), parentBody, axleBody, true
    );
    joint.setLimits(-SUSPENSION.maxTravel, SUSPENSION.maxTravel);
    joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    joint.configureMotorPosition(0, SUSPENSION.stiffness, SUSPENSION.damping);
    return joint;
}

function configureDriveMotor(spinJoint) {
    spinJoint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    spinJoint.setMotorMaxForce(DRIVE_MOTOR.maxForce);
    spinJoint.configureMotorVelocity(0, DRIVE_MOTOR.damping);
    return spinJoint;
}

function createMassOnlyBody(world, position, mass) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCanSleep(false)
        .setAdditionalMassProperties(mass, ORIGIN, cylinderInertia(mass, AXLE.radius, AXLE.width), IDENTITY_ROTATION);
    return world.createRigidBody(bodyDesc);
}

function createWheelBody(world, position, radius) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCanSleep(false);
    const body = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cylinder(WHEEL.width / 2, radius)
        .setRotation(CYLINDER_TO_X_AXIS)
        .setMass(WHEEL.mass)
        .setFriction(WHEEL.friction)
        .setRestitution(WHEEL.restitution)
        .setCollisionGroups(COLLISION_GROUPS.CarParts);
    world.createCollider(colliderDesc, body);

    return body;
}

/** Principal inertia of a solid cylinder whose axis points along X */
function cylinderInertia(mass, radius, length) {
    const aroundAxis = 0.5 * mass * radius * radius;
    const acrossAxis = mass * (3 * radius * radius + length * length) / 12;
    return { x: aroundAxis, y: acrossAxis, z: acrossAxis };
}

/** Principal inertia of a solid box, used as approximation for the car body */
function boxInertia(mass, size) {
    const factor = mass / 12;
    return {
        x: factor * (size.y * size.y + size.z * size.z),
        y: factor * (size.x * size.x + size.z * size.z),
        z: factor * (size.x * size.x + size.y * size.y)
    };
}

/** Ackermann steering derived from the model's wheelbase and track: the inner wheel turns sharper */
function makeAckermann(model) {
    const wheelbase = 2 * model.halfWheelbase;
    const trackWidth = 2 * model.halfTrack;
    return (averageAngle) => {
        const averageRadius = wheelbase / Math.tan(averageAngle);
        const innerRadius = averageRadius - trackWidth / 2;
        const outerRadius = averageRadius + trackWidth / 2;
        return [Math.atan(wheelbase / innerRadius), Math.atan(wheelbase / outerRadius)];
    };
}

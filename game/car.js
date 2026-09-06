// car.js - Car assembly: chassis, suspension, steering and wheel joints on top of Rapier
import * as THREE from 'three';
import { RAPIER, COLLISION_GROUPS, syncMeshWithBody } from './physics-world.js';
import { loadCarAssets } from './car-model.js';
import { createWheelMesh, createAxleMesh } from './wheel-visuals.js';
import { createHeadlights, createTaillights } from './car-lights.js';

const SPAWN_POSITION = { x: 0, y: 5, z: 0 };
const CHASSIS = {
    mass: 5000,
    restitution: 0,
    friction: 0.8,
    centerOfMass: { x: 0, y: -2.5, z: 1 },
    additionalSolverIterations: 4
};
// The car drives towards +Z in Three.js' right-handed world, so +X is the car's left side
const WHEEL_LAYOUT = [
    { name: 'frontLeft', x: 5, z: 8, isSteered: true, isPowered: true },
    { name: 'frontRight', x: -5, z: 8, isSteered: true, isPowered: true },
    { name: 'rearLeft', x: 5, z: -8, isSteered: false, isPowered: false },
    { name: 'rearRight', x: -5, z: -8, isSteered: false, isPowered: false }
];
const WHEEL_HEIGHT = 0;
const WHEEL = { mass: 150, restitution: 0, friction: 2.5, radius: 2, width: 1.6 };
const AXLE = { mass: 190, radius: 1.8, width: 1.6, steeringMassShare: 0.5 };
// Soft spring like the original: the chassis sags roughly 2 units under its own weight
const SUSPENSION = { maxTravel: 3, stiffness: 100_000, damping: 1_500 };
// Stiff enough to re-center the wheels against tyre friction while standing still
const STEERING_MOTOR = { stiffness: 20_000_000, damping: 400_000, maxForce: 60_000_000 };
const DRIVE_MOTOR = { damping: 1_000_000, maxForce: 330_000, brakeForce: 1_000_000 }; // rigid velocity motor, only limited by its force cap
const JUMP_FORCE = 3000;
const ACKERMANN = { wheelbase: 16, trackWidth: 11 };

const ORIGIN = { x: 0, y: 0, z: 0 };
const AXIS_X = { x: 1, y: 0, z: 0 };
const AXIS_Y = { x: 0, y: 1, z: 0 };
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
// Rapier cylinders point along Y; this rotation aligns them with the wheel axis (X)
const CYLINDER_TO_X_AXIS = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 };

export class Car {
    constructor({ mesh, body, wheelAssemblies }) {
        this.mesh = mesh;
        this.body = body;
        this.wheelAssemblies = wheelAssemblies;
        this.driveJoints = wheelAssemblies.filter(wheel => wheel.driveJoint).map(wheel => wheel.driveJoint);
        this.steeringJoints = {
            left: wheelAssemblies.find(wheel => wheel.name === 'frontLeft').steeringJoint,
            right: wheelAssemblies.find(wheel => wheel.name === 'frontRight').steeringJoint
        };
    }

    get position() {
        return this.mesh.position;
    }

    linearVelocity() {
        return this.body.linvel();
    }

    /** @returns {number} heading around the Y axis in radians */
    yaw() {
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
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
        const [innerAngle, outerAngle] = calculateWheelAngles(averageAngle);
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
            wheel.syncMeshes();
        }
    }
}

/**
 * Builds the complete car (visuals + physics) at the spawn position
 * @param {THREE.Scene} scene
 * @param {RAPIER.World} world
 * @returns {Promise<Car>}
 */
export async function createCar(scene, world) {
    const assets = await loadCarAssets();

    const mesh = new THREE.Mesh(assets.geometry, assets.material);
    mesh.name = 'CarBody';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z);
    scene.add(mesh);

    const body = createChassisBody(world, assets);
    const wheelAssemblies = WHEEL_LAYOUT.map(layout => createWheelAssembly(scene, world, body, layout));

    createTaillights(mesh);
    createHeadlights(mesh);

    return new Car({ mesh, body, wheelAssemblies });
}

function createChassisBody(world, assets) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z)
        .setCanSleep(false)
        .setAdditionalSolverIterations(CHASSIS.additionalSolverIterations);
    const body = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.convexHull(assets.hullPoints);
    if (!colliderDesc) {
        throw new Error('Convex hull for the car body could not be created');
    }
    colliderDesc
        .setMassProperties(CHASSIS.mass, CHASSIS.centerOfMass, boxInertia(CHASSIS.mass, assets.size), IDENTITY_ROTATION)
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
function createWheelAssembly(scene, world, chassisBody, layout) {
    const position = { x: layout.x, y: WHEEL_HEIGHT, z: layout.z };
    const anchorOnChassis = {
        x: position.x - SPAWN_POSITION.x,
        y: position.y - SPAWN_POSITION.y,
        z: position.z - SPAWN_POSITION.z
    };

    let suspensionParent = chassisBody;
    let anchorOnParent = anchorOnChassis;
    let axleMass = AXLE.mass;
    let steeringJoint = null;
    if (layout.isSteered) {
        const knuckleBody = createMassOnlyBody(world, position, AXLE.mass * AXLE.steeringMassShare);
        steeringJoint = createSteeringJoint(world, chassisBody, knuckleBody, anchorOnChassis);
        suspensionParent = knuckleBody;
        anchorOnParent = ORIGIN;
        axleMass = AXLE.mass * (1 - AXLE.steeringMassShare);
    }

    const axleBody = createMassOnlyBody(world, position, axleMass);
    createSuspensionJoint(world, suspensionParent, axleBody, anchorOnParent);

    const wheelBody = createWheelBody(world, position);
    const spinJoint = world.createImpulseJoint(RAPIER.JointData.revolute(ORIGIN, ORIGIN, AXIS_X), axleBody, wheelBody, true);
    const driveJoint = layout.isPowered ? configureDriveMotor(spinJoint) : null;

    const wheelMesh = createWheelMesh();
    const axleMesh = createAxleMesh();
    scene.add(wheelMesh, axleMesh);

    return {
        name: layout.name,
        driveJoint,
        steeringJoint,
        syncMeshes() {
            syncMeshWithBody(wheelMesh, wheelBody);
            syncMeshWithBody(axleMesh, axleBody);
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

function createWheelBody(world, position) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCanSleep(false);
    const body = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cylinder(WHEEL.width / 2, WHEEL.radius)
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

/** Ackermann steering: the inner wheel turns sharper than the outer wheel */
function calculateWheelAngles(averageAngle) {
    const { wheelbase, trackWidth } = ACKERMANN;
    const averageRadius = wheelbase / Math.tan(averageAngle);
    const innerRadius = averageRadius - trackWidth / 2;
    const outerRadius = averageRadius + trackWidth / 2;
    return [Math.atan(wheelbase / innerRadius), Math.atan(wheelbase / outerRadius)];
}

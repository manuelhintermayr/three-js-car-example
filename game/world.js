// world.js - Static studio environment: track, walls, towers, bridge and the knockable boxes
import * as THREE from 'three';
import { RAPIER, COLLISION_GROUPS, syncMeshWithBody } from './physics-world.js';
import { GLOW_LAYER } from './rendering.js';
import { babylonColor } from './color.js';

// Babylon.js is left-handed, Three.js right-handed: X positions taken from the original are mirrored
// so the layout looks identical on screen.
const GROUND_LEVEL = -20;
const GROUND_THICKNESS = 2;
const TRACK = { size: 800, friction: 2, color: [0.4, 0.4, 0.4], specular: [0.1, 0.1, 0.1] };
const WALL = { height: 20, thickness: 2, friction: 0.1, color: [0.95, 0.95, 0.95], specular: [0.1, 0.1, 0.1] };
const TOWER = {
    size: { width: 15, height: 25, depth: 15 },
    friction: 0.5,
    color: [0.6, 0.3, 0.1],
    positions: [
        { x: 200, z: 200 },
        { x: -200, z: 200 },
        { x: 200, z: -200 },
        { x: -200, z: -200 },
        { x: 0, z: 300 },
        { x: 300, z: 0 },
        { x: -300, z: 0 },
        { x: 0, z: -300 }
    ]
};
const KNOCKABLE_BOX = {
    size: 8,
    mass: 20,
    friction: 0.4,
    restitution: 0.5,
    color: [1, 0.5, 0],
    emissive: [0.2, 0.1, 0],
    positions: [
        { x: -250, z: 100 },
        { x: 200, z: 100 },
        { x: -250, z: -250 },
        { x: 200, z: -250 },
        { x: -300, z: 0 }
    ]
};
const BRIDGE = {
    centerX: -55,
    z: 0,
    color: [0.9, 0.9, 0.9],
    specular: [0.3, 0.3, 0.3],
    platform: { width: 80, height: 4, depth: 30, centerY: 6, friction: 2 },
    pillar: {
        size: 6,
        height: 25,
        friction: 1,
        offsets: [
            { x: -30, z: -10 },
            { x: -30, z: 10 },
            { x: 0, z: -10 },
            { x: 0, z: 10 },
            { x: 30, z: -10 },
            { x: 30, z: 10 }
        ]
    }
};

/**
 * Orange physics box that counts as "knocked" once it moved away from its settled position
 */
export class KnockableBox {
    constructor(mesh, body, index) {
        this.mesh = mesh;
        this.body = body;
        this.index = index;
        this.originalPosition = mesh.position.clone();
        this.originalRotation = mesh.quaternion.clone();
        this.settledPosition = null;
    }

    get name() {
        return this.mesh.name;
    }

    get isSettled() {
        return this.settledPosition !== null;
    }

    /** Remembers the current position as the reference for movement detection */
    settle() {
        this.settledPosition = this.mesh.position.clone();
    }

    distanceFromSettledPosition() {
        return this.mesh.position.distanceTo(this.settledPosition);
    }

    reset() {
        this.settledPosition = null;
        this.body.setTranslation(this.originalPosition, true);
        this.body.setRotation(this.originalRotation, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.sync();
    }

    sync() {
        syncMeshWithBody(this.mesh, this.body);
    }
}

/**
 * Creates the whole studio environment
 * @returns {{ boxes: KnockableBox[], syncMeshes: () => void, resetBoxes: () => void }}
 */
export function createEnvironment(scene, world) {
    createSquareRaceTrack(scene, world);
    createTrackWalls(scene, world);
    createCollisionTowers(scene, world);
    createBridge(scene, world);
    const boxes = createKnockableBoxes(scene, world);

    return {
        boxes,
        syncMeshes() {
            boxes.forEach(box => box.sync());
        },
        resetBoxes() {
            boxes.forEach(box => box.reset());
        }
    };
}

function createSquareRaceTrack(scene, world) {
    const geometry = new THREE.PlaneGeometry(TRACK.size, TRACK.size);
    geometry.rotateX(-Math.PI / 2);
    const track = new THREE.Mesh(geometry, createStudioMaterial(TRACK.color, TRACK.specular));
    track.name = 'SquareTrack';
    track.position.y = GROUND_LEVEL;
    track.receiveShadow = true;
    scene.add(track);

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_LEVEL - GROUND_THICKNESS / 2, 0));
    const collider = RAPIER.ColliderDesc.cuboid(TRACK.size / 2, GROUND_THICKNESS / 2, TRACK.size / 2)
        .setFriction(TRACK.friction)
        .setCollisionGroups(COLLISION_GROUPS.Environment);
    world.createCollider(collider, body);
}

function createTrackWalls(scene, world) {
    const material = createStudioMaterial(WALL.color, WALL.specular);
    const { height, thickness } = WALL;
    const half = TRACK.size / 2;
    const centerY = height / 2 + GROUND_LEVEL;
    const alongX = { width: TRACK.size + thickness * 2, height, depth: thickness };
    const alongZ = { width: thickness, height, depth: TRACK.size };

    const walls = [
        { name: 'northWall', size: alongX, position: { x: 0, y: centerY, z: half + thickness / 2 } },
        { name: 'southWall', size: alongX, position: { x: 0, y: centerY, z: -half - thickness / 2 } },
        { name: 'eastWall', size: alongZ, position: { x: half + thickness / 2, y: centerY, z: 0 } },
        { name: 'westWall', size: alongZ, position: { x: -half - thickness / 2, y: centerY, z: 0 } }
    ];
    walls.forEach(wall => createStaticBox(scene, world, { ...wall, material, friction: WALL.friction }));
}

function createCollisionTowers(scene, world) {
    const material = new THREE.MeshPhongMaterial({ color: babylonColor(...TOWER.color) });
    TOWER.positions.forEach((position, index) => {
        createStaticBox(scene, world, {
            name: `tower_${index}`,
            size: TOWER.size,
            position: { x: position.x, y: TOWER.size.height / 2 + GROUND_LEVEL, z: position.z },
            material,
            friction: TOWER.friction
        });
    });
}

function createBridge(scene, world) {
    const material = createStudioMaterial(BRIDGE.color, BRIDGE.specular);
    const { platform, pillar } = BRIDGE;

    const bridgePlatform = createStaticBox(scene, world, {
        name: 'bridgePlatform',
        size: platform,
        position: { x: BRIDGE.centerX, y: platform.centerY, z: BRIDGE.z },
        material,
        friction: platform.friction
    });
    bridgePlatform.receiveShadow = true;

    pillar.offsets.forEach((offset, index) => {
        const mesh = createStaticBox(scene, world, {
            name: `bridgePillar${index}`,
            size: { width: pillar.size, height: pillar.height, depth: pillar.size },
            position: { x: BRIDGE.centerX + offset.x, y: pillar.height / 2 + GROUND_LEVEL, z: BRIDGE.z + offset.z },
            material,
            friction: pillar.friction
        });
        mesh.receiveShadow = true;
    });

    console.log(`🌉 Bridge created at X=${BRIDGE.centerX} with ${pillar.offsets.length} pillars`);
}

function createKnockableBoxes(scene, world) {
    const { size, mass, friction, restitution } = KNOCKABLE_BOX;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshPhongMaterial({
        color: babylonColor(...KNOCKABLE_BOX.color),
        emissive: babylonColor(...KNOCKABLE_BOX.emissive)
    });

    const boxes = KNOCKABLE_BOX.positions.map((position, index) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `knockableBox_${index}`;
        mesh.layers.enable(GLOW_LAYER); // orange boxes glow like the Babylon.js glow layer
        mesh.position.set(position.x, size / 2, position.z);
        scene.add(mesh);

        const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        );
        const collider = RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
            .setMass(mass)
            .setFriction(friction)
            .setRestitution(restitution)
            .setCollisionGroups(COLLISION_GROUPS.Environment);
        world.createCollider(collider, body);

        return new KnockableBox(mesh, body, index);
    });

    console.log(`Created ${boxes.length} knockable boxes - position settling in 2 seconds`);
    return boxes;
}

function createStaticBox(scene, world, { name, size, position, material, friction }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.width, size.height, size.depth), material);
    mesh.name = name;
    mesh.position.set(position.x, position.y, position.z);
    scene.add(mesh);

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));
    const collider = RAPIER.ColliderDesc.cuboid(size.width / 2, size.height / 2, size.depth / 2)
        .setFriction(friction)
        .setCollisionGroups(COLLISION_GROUPS.Environment);
    world.createCollider(collider, body);

    return mesh;
}

function createStudioMaterial(color, specular) {
    return new THREE.MeshPhongMaterial({ color: babylonColor(...color), specular: babylonColor(...specular) });
}

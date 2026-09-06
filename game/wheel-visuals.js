// wheel-visuals.js - Wheel cylinder with tyre texture and the colored axle box of the original
import * as THREE from 'three';
import { babylonColor } from './color.js';

const TYRE_TEXTURE_URL = 'game/textures/tire.png';
const TYRE_TEXTURE = { rotation: -Math.PI / 2, repeat: { u: 1, v: 0.4 } };
const TYRE_CAP_COLOR = [0.17, 0.17, 0.17];
const WHEEL_GEOMETRY = { radius: 2, width: 1.6, segments: 32 };
const AXLE_GEOMETRY = { width: 2.5, height: 1, depth: 1 };
const DEBUG_COLOURS = [
    [1, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 1]
];

let sharedAssets = null;

/**
 * @returns {THREE.Mesh} wheel mesh whose axis points along X
 */
export function createWheelMesh() {
    const assets = getSharedAssets();
    const mesh = new THREE.Mesh(assets.wheelGeometry, assets.tyreMaterials);
    mesh.name = 'Wheel';
    mesh.castShadow = true;
    return mesh;
}

/**
 * @returns {THREE.Mesh} small box with debug face colors, visible at the wheel hub
 */
export function createAxleMesh() {
    const assets = getSharedAssets();
    const mesh = new THREE.Mesh(assets.axleGeometry, assets.axleMaterials);
    mesh.name = 'Axle';
    return mesh;
}

function getSharedAssets() {
    if (!sharedAssets) {
        sharedAssets = {
            wheelGeometry: markShared(createWheelGeometry()),
            tyreMaterials: createTyreMaterials().map(markShared),
            axleGeometry: markShared(new THREE.BoxGeometry(AXLE_GEOMETRY.width, AXLE_GEOMETRY.height, AXLE_GEOMETRY.depth)),
            axleMaterials: DEBUG_COLOURS.map(([r, g, b]) => markShared(new THREE.MeshPhongMaterial({ color: babylonColor(r, g, b) })))
        };
    }
    return sharedAssets;
}

function createWheelGeometry() {
    const { radius, width, segments } = WHEEL_GEOMETRY;
    const geometry = new THREE.CylinderGeometry(radius, radius, width, segments);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
}

function createTyreMaterials() {
    const texture = new THREE.TextureLoader().load(TYRE_TEXTURE_URL);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.center.set(0.5, 0.5);
    texture.rotation = TYRE_TEXTURE.rotation;
    texture.repeat.set(TYRE_TEXTURE.repeat.u, TYRE_TEXTURE.repeat.v);

    const tread = new THREE.MeshPhongMaterial({ map: texture });
    const cap = new THREE.MeshPhongMaterial({ color: babylonColor(...TYRE_CAP_COLOR) });
    // CylinderGeometry material order: side, top cap, bottom cap
    return [tread, cap, cap];
}

function markShared(resource) {
    resource.userData.shared = true;
    return resource;
}

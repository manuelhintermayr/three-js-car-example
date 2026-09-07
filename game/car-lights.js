// car-lights.js - Lights the model's own headlight and taillight meshes: emissive glow plus a spot light each
import * as THREE from 'three';
import { babylonColor } from './color.js';
import { GLOW_LAYER } from './rendering.js';

const SPOT_PENUMBRA = 0.5;
const SPOT_DECAY = 1;
const WARM_WHITE = [0.867, 0.773, 0.518]; // #ddc584

const HEADLIGHT = {
    color: WARM_WHITE,
    emissive: 1.8, // strength of the glow-layer bloom on the lamp mesh
    forwardZ: 1,
    droop: 0.3,
    spot: { intensity: 180, range: 60, coneAngle: Math.PI / 2, shadow: true, shadowMapSize: 1024 }
};
const TAILLIGHT = {
    color: [1, 0, 0],
    emissive: 1.1, // red reads as brighter, so it needs less to avoid washing out the car
    forwardZ: -1,
    droop: 0,
    spot: { intensity: 26, range: 22, coneAngle: Math.PI / 1.2, shadow: false }
};

/**
 * Makes the model's headlight and taillight meshes glow and casts light from them.
 * @param {THREE.Object3D} bodyMesh
 * @param {{ headlightGeometry: THREE.BufferGeometry, taillightGeometry: THREE.BufferGeometry }} model
 */
export function createCarLights(bodyMesh, model) {
    addLamp(bodyMesh, model.headlightGeometry, HEADLIGHT);
    addLamp(bodyMesh, model.taillightGeometry, TAILLIGHT);
    console.log('💡 Model headlights and taillights lit');
}

function addLamp(bodyMesh, geometry, config) {
    const color = babylonColor(...config.color);
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: config.emissive });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = config.forwardZ > 0 ? 'Headlights' : 'Taillights';
    mesh.layers.enable(GLOW_LAYER);
    bodyMesh.add(mesh);

    addSpotLight(bodyMesh, geometry, config, color);
}

function addSpotLight(bodyMesh, geometry, config, color) {
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const spot = config.spot;

    const light = new THREE.SpotLight(color, spot.intensity, spot.range, spot.coneAngle / 2, SPOT_PENUMBRA, SPOT_DECAY);
    light.position.copy(center);
    light.target.position.set(center.x, center.y - config.droop * spot.range, center.z + config.forwardZ * spot.range);
    bodyMesh.add(light);
    bodyMesh.add(light.target);

    if (spot.shadow) {
        light.castShadow = true;
        light.shadow.mapSize.set(spot.shadowMapSize, spot.shadowMapSize);
        light.shadow.bias = -0.0005;
    }
}

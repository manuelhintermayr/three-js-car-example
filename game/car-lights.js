// car-lights.js - Emissive headlights and taillights with their spot lights, attached to the car body
import * as THREE from 'three';
import { babylonColor } from './color.js';
import { GLOW_LAYER } from './rendering.js';

const GLOW_INTENSITY = 3; // emissive strength of the lamps, blurred by the glow layer bloom
const SPOT_PENUMBRA = 0.5;
const SPOT_DECAY = 1;
const SPHERE_SEGMENTS = 16;
const CYLINDER_SEGMENTS = 24;
const WARM_WHITE = [0.867, 0.773, 0.518]; // #ddc584

const TAILLIGHT = {
    diameter: 1,
    positions: [[5.2, 1.65, -13.5], [-5.2, 1.65, -13.5]],
    material: { color: [1, 0, 0], emissive: [0.8, 0, 0], specular: [0.2, 0, 0] },
    spot: {
        position: [0, 1.65, -13.5],
        direction: [0, 0, -1],
        coneAngle: Math.PI / 1.2,
        intensity: 60,
        range: 25,
        color: [1, 0, 0]
    }
};

const HEADLIGHT = {
    diameter: 2.1,
    depth: 0.8,
    positions: [[5.1, 1.65, 13.5], [-5.1, 1.65, 13.5]],
    material: { color: WARM_WHITE, emissive: WARM_WHITE, specular: [0.2, 0.2, 0.2] },
    spot: {
        position: [0, 1.65, 13.5],
        direction: [0, -0.3, 1],
        coneAngle: Math.PI / 2,
        intensity: 300,
        range: 60,
        color: WARM_WHITE,
        shadowMapSize: 1024
    }
};

/**
 * Two red glowing spheres at the rear plus one central red spot light
 * @param {THREE.Object3D} carBody
 */
export function createTaillights(carBody) {
    const geometry = new THREE.SphereGeometry(TAILLIGHT.diameter / 2, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
    const material = createLampMaterial(TAILLIGHT.material);
    addLamps(carBody, geometry, material, TAILLIGHT.positions, 'Taillight');
    createSpotLight(carBody, TAILLIGHT.spot);
    console.log('🔴 Red taillights created');
}

/**
 * Two warm white cylinders at the front plus one central shadow-casting spot light
 * @param {THREE.Object3D} carBody
 */
export function createHeadlights(carBody) {
    const radius = HEADLIGHT.diameter / 2;
    const geometry = new THREE.CylinderGeometry(radius, radius, HEADLIGHT.depth, CYLINDER_SEGMENTS);
    geometry.rotateX(Math.PI / 2); // lie flat against the car front
    const material = createLampMaterial(HEADLIGHT.material);
    addLamps(carBody, geometry, material, HEADLIGHT.positions, 'Headlight');

    const spot = createSpotLight(carBody, HEADLIGHT.spot);
    spot.castShadow = true;
    spot.shadow.mapSize.set(HEADLIGHT.spot.shadowMapSize, HEADLIGHT.spot.shadowMapSize);
    spot.shadow.bias = -0.0005;
    console.log('💡 Warm white headlights (#ddc584) with shadows created');
}

function createLampMaterial({ color, emissive, specular }) {
    return new THREE.MeshPhongMaterial({
        color: babylonColor(...color),
        emissive: babylonColor(...emissive),
        emissiveIntensity: GLOW_INTENSITY,
        specular: babylonColor(...specular)
    });
}

function addLamps(carBody, geometry, material, positions, name) {
    positions.forEach((position, index) => {
        const lamp = new THREE.Mesh(geometry, material);
        lamp.name = `${name}${index}`;
        lamp.position.set(...position);
        lamp.layers.enable(GLOW_LAYER);
        carBody.add(lamp);
    });
}

function createSpotLight(carBody, spot) {
    const light = new THREE.SpotLight(
        babylonColor(...spot.color), spot.intensity, spot.range, spot.coneAngle / 2, SPOT_PENUMBRA, SPOT_DECAY
    );
    light.position.set(...spot.position);
    light.target.position.set(
        spot.position[0] + spot.direction[0],
        spot.position[1] + spot.direction[1],
        spot.position[2] + spot.direction[2]
    );
    carBody.add(light);
    carBody.add(light.target);
    return light;
}

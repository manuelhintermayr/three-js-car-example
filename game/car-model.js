// car-model.js - Loads the GLB car model once and bakes the original transform into its geometry
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CAR_MODEL_URL = 'game/models/car.glb';
// Same scale, 90° rotation and lift as the original before baking the transform into the vertices
const MODEL_TRANSFORM = { scale: 14, rotationY: Math.PI / 2, offsetY: 2.3 };

let assetsPromise = null;

/**
 * @typedef {Object} CarAssets
 * @property {THREE.BufferGeometry} geometry - merged car body geometry in car frame coordinates
 * @property {THREE.Material} material - PBR material of the model
 * @property {Float32Array} hullPoints - vertex positions for the convex hull collider
 * @property {THREE.Vector3} size - bounding box size of the car body
 */

/**
 * Loads and bakes the car model exactly once, later calls reuse the cached assets
 * @returns {Promise<CarAssets>}
 */
export function loadCarAssets() {
    if (!assetsPromise) {
        assetsPromise = loadAndBake();
    }
    return assetsPromise;
}

async function loadAndBake() {
    console.log('🚗 Loading custom car model...');
    const gltf = await new GLTFLoader().loadAsync(CAR_MODEL_URL);
    console.log('📦 Car model loaded successfully:', gltf);

    const meshes = collectMeshes(gltf.scene);
    const geometry = mergeGeometries(meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)));
    geometry.applyMatrix4(createBakeMatrix());
    geometry.computeBoundingBox();
    geometry.userData.shared = true;

    const material = meshes[0].material;
    material.userData.shared = true;

    console.log('✅ Car body created: CarBody');
    return {
        geometry,
        material,
        hullPoints: extractPoints(geometry),
        size: geometry.boundingBox.getSize(new THREE.Vector3())
    };
}

function collectMeshes(root) {
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse(object => {
        if (object.isMesh) {
            meshes.push(object);
        }
    });
    if (meshes.length === 0) {
        throw new Error('No mesh found in car model');
    }
    return meshes;
}

function createBakeMatrix() {
    const scale = new THREE.Matrix4().makeScale(MODEL_TRANSFORM.scale, MODEL_TRANSFORM.scale, MODEL_TRANSFORM.scale);
    const rotation = new THREE.Matrix4().makeRotationY(MODEL_TRANSFORM.rotationY);
    const translation = new THREE.Matrix4().makeTranslation(0, MODEL_TRANSFORM.offsetY, 0);
    return translation.multiply(rotation).multiply(scale);
}

function extractPoints(geometry) {
    const position = geometry.attributes.position;
    const points = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
        points[i * 3] = position.getX(i);
        points[i * 3 + 1] = position.getY(i);
        points[i * 3 + 2] = position.getZ(i);
    }
    return points;
}

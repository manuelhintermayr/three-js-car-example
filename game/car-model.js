// car-model.js - Loads the hand-made Ford Anglia model once and splits it into the parts the game drives
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CAR_MODEL_URL = 'game/models/car.glb';
const DRACO_DECODER_PATH = 'https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/libs/draco/';

// Half-track the physics rig is tuned for; the model is scaled uniformly so its wheels span it.
// Matching the track (not the wheelbase) keeps the original roll-over resistance.
const TARGET_HALF_TRACK = 5;
// The chassis rests ~3.2 above the wheels; the body is lowered by a bit less so a small gap remains
const BODY_DROP = 1.8;

// Node names inside the model (stable, preserved through Draco compression). Everything not listed is body.
const PART_NAMES = {
    frontWheels: ['Cylinder.023'],
    rearWheels: ['Cylinder.024'],
    steeringWheel: ['Torus.002', 'Cube.074', 'Cube.075'],
    pedal: ['Cylinder.029', 'Cube.073'],
    headlights: ['Plane.021'],
    taillights: ['Plane.041', 'Plane.042', 'Plane.043'],
    glass: ['Plane.001', 'Plane.029', 'Plane.023']
};

const WHEEL_CORNERS = { front: ['frontLeft', 'frontRight'], rear: ['rearLeft', 'rearRight'] };

let modelPromise = null;

/**
 * Loads and prepares the car model exactly once, later calls reuse the cached parts.
 * @returns {Promise<CarModelData>}
 */
export function loadCarModel() {
    if (!modelPromise) {
        modelPromise = loadAndPrepare();
    }
    return modelPromise;
}

async function loadAndPrepare() {
    console.log('🚗 Loading Ford Anglia car model...');
    const gltf = await createLoader().loadAsync(CAR_MODEL_URL);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const meshes = classifyMeshes(root);
    const material = markShared(pickMaterial(meshes));

    // Measure the model's raw half-track, then scale so it matches the physics rig
    const rawFront = splitWheelPair(meshes.frontWheels, new THREE.Matrix4(), WHEEL_CORNERS.front);
    const scale = TARGET_HALF_TRACK / Math.abs(rawFront[0].position.x);
    const bake = computeBakeMatrix(meshes.frontWheels, meshes.rearWheels, scale);

    const wheels = [
        ...splitWheelPair(meshes.frontWheels, bake, WHEEL_CORNERS.front),
        ...splitWheelPair(meshes.rearWheels, bake, WHEEL_CORNERS.rear)
    ];
    const bodyGeometry = markShared(mergeBaked(meshes.body, bake));
    bodyGeometry.computeBoundingBox();

    console.log('✅ Ford Anglia prepared: body + 4 wheels + steering wheel + pedal + lights');
    return {
        bodyGeometry,
        bodyMaterial: material,
        hullPoints: extractPoints(bodyGeometry),
        size: bodyGeometry.boundingBox.getSize(new THREE.Vector3()),
        wheels,
        wheelRadius: wheels[0].radius,
        halfWheelbase: Math.abs(wheels[0].position.z),
        halfTrack: Math.abs(wheels[0].position.x),
        steeringWheel: buildSteeringWheel(meshes.steeringWheel, bake),
        pedal: buildPedal(meshes.pedal, bake),
        headlightGeometry: markShared(mergeBaked(meshes.headlights, bake)),
        taillightGeometry: markShared(mergeBaked(meshes.taillights, bake)),
        glassGeometry: meshes.glass.length > 0 ? markShared(mergeBaked(meshes.glass, bake)) : null
    };
}

function createLoader() {
    const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    return loader;
}

/** Buckets every mesh of the model into its game part by node name (loaders may drop the dots). */
function classifyMeshes(root) {
    const normalize = (name) => name.replace(/\./g, '');
    const lookup = new Map();
    for (const [part, names] of Object.entries(PART_NAMES)) {
        for (const name of names) {
            lookup.set(normalize(name), part);
        }
    }
    const buckets = { body: [], frontWheels: [], rearWheels: [], steeringWheel: [], pedal: [], headlights: [], taillights: [], glass: [] };
    root.traverse(object => {
        if (object.isMesh) {
            buckets[lookup.get(normalize(object.name)) ?? 'body'].push(object);
        }
    });
    if (buckets.frontWheels.length === 0 || buckets.rearWheels.length === 0) {
        throw new Error('Car model is missing its wheel meshes');
    }
    return buckets;
}

function pickMaterial(meshes) {
    return (meshes.body[0] ?? meshes.frontWheels[0]).material;
}

/**
 * Uniform scale + centering so the wheelbase is centred on Z and the axles sit at y = 0.
 */
function computeBakeMatrix(frontWheels, rearWheels, scale) {
    const front = worldBox(frontWheels).getCenter(new THREE.Vector3());
    const rear = worldBox(rearWheels).getCenter(new THREE.Vector3());
    const midZ = (front.z + rear.z) / 2;
    const axleY = (front.y + rear.y) / 2;
    return new THREE.Matrix4()
        .makeTranslation(0, -BODY_DROP, 0)
        .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .multiply(new THREE.Matrix4().makeTranslation(0, -axleY, -midZ));
}

/** Merges meshes into one geometry, each baked with its own world matrix and the shared bake transform. */
function mergeBaked(meshes, bake) {
    const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(bake));
    return mergeGeometries(geometries, false);
}

/**
 * Splits a wheel-pair mesh into its left (+X) and right (-X) wheel, each recentred on its own hub.
 * @returns {{corner: string, geometry: THREE.BufferGeometry, position: THREE.Vector3, radius: number}[]}
 */
function splitWheelPair(wheelMeshes, bake, [leftCorner, rightCorner]) {
    const pair = mergeBaked(wheelMeshes, bake).toNonIndexed();
    return [
        finishWheel(filterTrianglesByX(pair, side => side > 0), leftCorner),
        finishWheel(filterTrianglesByX(pair, side => side < 0), rightCorner)
    ];
}

function finishWheel(geometry, corner) {
    geometry.computeBoundingBox();
    const position = geometry.boundingBox.getCenter(new THREE.Vector3());
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    geometry.translate(-position.x, -position.y, -position.z);
    return { corner, geometry: markShared(geometry), position, radius: Math.max(size.y, size.z) / 2 };
}

/** Keeps the triangles whose centroid X passes the predicate (the two wheels have a gap at X = 0). */
function filterTrianglesByX(geometry, keep) {
    const src = geometry.attributes;
    const out = { position: [], normal: [], uv: [] };
    const pos = src.position;
    for (let t = 0; t < pos.count; t += 3) {
        const centroidX = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
        if (!keep(centroidX)) {
            continue;
        }
        for (let v = t; v < t + 3; v++) {
            out.position.push(pos.getX(v), pos.getY(v), pos.getZ(v));
            if (src.normal) {
                out.normal.push(src.normal.getX(v), src.normal.getY(v), src.normal.getZ(v));
            }
            if (src.uv) {
                out.uv.push(src.uv.getX(v), src.uv.getY(v));
            }
        }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
    if (src.normal) {
        result.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
    }
    if (src.uv) {
        result.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
    }
    return result;
}

/**
 * @typedef {Object} PivotPart
 * @property {THREE.BufferGeometry} geometry - recentred on its pivot, orientation stripped
 * @property {THREE.Vector3} pivot - pivot position in car-frame coordinates
 * @property {THREE.Quaternion} orientation - world orientation the pivot node re-applies
 */
function buildSteeringWheel(meshes, bake) {
    const ring = meshes.find(mesh => mesh.name.startsWith('Torus')) ?? meshes[0];
    // The steering column axis is the ring's hole axis (its local Y), carried into car-frame coordinates
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(ring.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const geometry = mergeBaked(meshes, bake); // ring plus its spokes and hub, kept in their real orientation
    geometry.computeBoundingBox();
    const pivot = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    return { geometry: markShared(geometry), pivot, axis };
}

function buildPedal(meshes, bake) {
    const geometry = mergeBaked(meshes, bake);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    // Hinge at the top so pressing rotates the pad forward and down around X
    const pivot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    return { geometry: markShared(geometry), pivot, orientation: new THREE.Quaternion() };
}

function worldBox(meshes) {
    const box = new THREE.Box3();
    meshes.forEach(mesh => box.expandByObject(mesh));
    return box;
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

function markShared(resource) {
    resource.userData.shared = true;
    return resource;
}

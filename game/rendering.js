// rendering.js - WebGL renderer, selective glow post-processing and the car reflection probe
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

/** Objects on this layer glow, everything else is rendered black while the bloom is computed */
export const GLOW_LAYER = 1;

// Like the Babylon.js original, which renders at CSS pixel resolution regardless of the device pixel ratio
const MAX_PIXEL_RATIO = 1;
// Multisampled half-float targets are expensive on integrated GPUs, FXAA smooths the edges instead
const MSAA_SAMPLES = 0;
const BLOOM = { strength: 1.5, radius: 0.6, threshold: 0 };
const BLOOM_BACKGROUND = new THREE.Color(0x000000);
const GLOW_RESOLUTION_SCALE = 0.25; // the blurred glow does not need full resolution
const REFLECTION_PROBE_SIZE = 128;
const REFLECTION_LEVEL = 2.2;
const REFLECTION_NEAR = 1;
const REFLECTION_FAR = 2000;
const CUBE_FACES = 6;

const MIX_VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
const MIX_FRAGMENT_SHADER = `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
        gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
    }
`;

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(canvas) {
    // No multisampled canvas: the image arrives through the composer and FXAA smooths it, so a
    // multisampled default framebuffer would only be resolved for nothing on every frame
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // The scene is rendered several times per frame (reflection probe, glow, final image);
    // the shadow map only needs to be rendered once, see requestShadowUpdate
    renderer.shadowMap.autoUpdate = false;
    return renderer;
}

/**
 * Renders the shadow map during the next render pass; call once at the start of every frame
 * @param {THREE.WebGLRenderer} renderer
 */
export function requestShadowUpdate(renderer) {
    renderer.shadowMap.needsUpdate = true;
}

/**
 * Glow layer replacement: blooms only the objects on the glow layer and adds the result to the normal render
 */
export class GlowComposer {
    constructor(renderer) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const glowSize = size.clone().multiplyScalar(GLOW_RESOLUTION_SCALE).floor();
        this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
        this.darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.hiddenMaterials = new Map();

        this.bloomComposer = new EffectComposer(renderer, createHdrTarget(glowSize, 0));
        this.bloomComposer.renderToScreen = false;
        this.bloomComposer.addPass(this.renderPass);
        this.bloomComposer.addPass(new UnrealBloomPass(glowSize, BLOOM.strength, BLOOM.radius, BLOOM.threshold));

        const mixPass = new ShaderPass(new THREE.ShaderMaterial({
            uniforms: {
                baseTexture: { value: null },
                bloomTexture: { value: this.bloomComposer.renderTarget2.texture }
            },
            vertexShader: MIX_VERTEX_SHADER,
            fragmentShader: MIX_FRAGMENT_SHADER
        }), 'baseTexture');
        mixPass.needsSwap = true;

        this.finalComposer = new EffectComposer(renderer, createHdrTarget(size, MSAA_SAMPLES));
        this.finalComposer.addPass(this.renderPass);
        this.finalComposer.addPass(mixPass);
        this.finalComposer.addPass(new OutputPass());
        this.finalComposer.addPass(new FXAAPass());
    }

    setScene(scene, camera) {
        this.renderPass.scene = scene;
        this.renderPass.camera = camera;
    }

    setSize(width, height) {
        this.bloomComposer.setSize(width * GLOW_RESOLUTION_SCALE, height * GLOW_RESOLUTION_SCALE);
        this.finalComposer.setSize(width, height);
    }

    render() {
        const scene = this.renderPass.scene;
        const background = scene.background;

        // A black background is required: the renderer keeps the last background as its clear color
        scene.background = BLOOM_BACKGROUND;
        scene.traverse(object => this.hideUnlessGlowing(object));
        this.bloomComposer.render();
        scene.traverse(object => this.restoreMaterial(object));
        scene.background = background;

        this.finalComposer.render();
    }

    hideUnlessGlowing(object) {
        if (object.isMesh && !object.layers.isEnabled(GLOW_LAYER)) {
            this.hiddenMaterials.set(object, object.material);
            object.material = this.darkMaterial;
        }
    }

    restoreMaterial(object) {
        const material = this.hiddenMaterials.get(object);
        if (material) {
            object.material = material;
            this.hiddenMaterials.delete(object);
        }
    }
}

/**
 * Cube camera that follows the car body and feeds its material with live reflections.
 * After the first full capture only one cube face is refreshed per frame, which keeps the cost flat.
 */
export class ReflectionProbe {
    constructor() {
        this.renderTarget = new THREE.WebGLCubeRenderTarget(REFLECTION_PROBE_SIZE, {
            type: THREE.HalfFloatType,
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter
        });
        this.cubeCamera = new THREE.CubeCamera(REFLECTION_NEAR, REFLECTION_FAR, this.renderTarget);
        this.carBody = null;
        this.nextFace = 0;
        this.hasFullCapture = false;
    }

    attachToMesh(carBody) {
        this.carBody = carBody;
        carBody.material.envMap = this.renderTarget.texture;
        carBody.material.envMapIntensity = REFLECTION_LEVEL;
        carBody.material.needsUpdate = true;
    }

    update(renderer, scene) {
        if (!this.carBody) {
            return;
        }
        // The car must not reflect itself, but its lights should still illuminate the reflection
        this.cubeCamera.position.copy(this.carBody.position);
        this.carBody.material.visible = false;
        if (this.hasFullCapture) {
            this.renderNextFace(renderer, scene);
        } else {
            this.cubeCamera.update(renderer, scene);
            this.hasFullCapture = true;
        }
        this.carBody.material.visible = true;
    }

    renderNextFace(renderer, scene) {
        this.cubeCamera.updateMatrixWorld();
        const faceCamera = this.cubeCamera.children[this.nextFace];
        const isLastFace = this.nextFace === CUBE_FACES - 1;
        const previousTarget = renderer.getRenderTarget();

        // Mipmaps cover all faces, so they are only rebuilt after the last face of a cycle
        this.renderTarget.texture.generateMipmaps = isLastFace;
        renderer.setRenderTarget(this.renderTarget, this.nextFace);
        renderer.render(scene, faceCamera);
        renderer.setRenderTarget(previousTarget);

        this.nextFace = (this.nextFace + 1) % CUBE_FACES;
    }

    dispose() {
        this.renderTarget.dispose();
    }
}

function createHdrTarget(size, samples) {
    return new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
}

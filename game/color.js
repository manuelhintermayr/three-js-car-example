// color.js - Color helper that keeps the original Babylon.js color values readable
import * as THREE from 'three';

/**
 * Babylon.js StandardMaterial colors are displayed without gamma correction, so the
 * original RGB values are interpreted as sRGB here to reproduce the same on-screen look.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {THREE.Color}
 */
export function babylonColor(r, g, b) {
    return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

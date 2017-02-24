import {CGPURT} from "./gpurt";
import {Vector3, Vector4} from "./vector";
import {fillArray, vec4array_to_f32Array} from "./utils";
import {fs} from "./fs";
/**
 * Created by Nidin Vinayakan on 24/02/17.
 */

declare const gl: WebGLRenderingContext;

let shaderDraw, shaderHash, shaderEyeRayTrace, shaderPhotonTrace, shaderProgressiveUpdate, shaderRadianceEstimate,
    vshaderScatter, vshaderCorrection, shaderMax, shaderMin, shaderSum;

let CanonicalCameraPosition: Vector3;
let FieldOfView: number;
let LookAtPosition: Vector3;

let gpurt: CGPURT = new CGPURT();
let numPhotons: number = 0.0;
let numEyeSamples: number = 0;
let frameCount: number = 0;
let focalLength: number = 13.0;
let apertureSize: number = 0.0;
let m_nextUpdate: number = 0;
let startedTime: number = 0;

const maxNumberOfBounces: number = 10;
const imageResolution: number = 512;
const photonBufferSize: number = this.imageResolution;
const hashResolution: number = this.imageResolution;
const InitialFootprint: number = 2.5;

let queryPositionTexture: GLuint;
let queryNormalTexture: GLuint;
let queryEmissionPhotonCountTexture: GLuint;
let queryFluxRadiusTexture: GLuint;
let queryReflectanceTexture: GLuint;
let queryIntersectionTexture: GLuint;

let photonIndexTexture: GLuint;
let photonFluxTexture: GLuint;
let photonPositionTexture: GLuint;
let photonDirectionTexture: GLuint;
let photonHashTexture: GLuint;
let photonCorrectionTexture: GLuint;
let pandomPhotonTexture: GLuint;
let randomEyeRayTexture: GLuint;
let photonIntersectionTexture: GLuint;
let photonEmittedFlagTexture: GLuint;


let eyeRayTraceSurface: WebGLFramebuffer;
let photonRayTraceSurface: WebGLFramebuffer;
let photonIndexSurface: WebGLFramebuffer;
let queryPointSurface: WebGLFramebuffer;
let photonHashSurface: WebGLFramebuffer;
let photonHashDepthBuffer: WebGLRenderbuffer;
let photonCorrectionSurface: WebGLFramebuffer;

let minMaxAveTextureQuery: GLuint;
let minMaxAveSurfaceQuery: WebGLFramebuffer;
let minMaxAveTexturePhoton: GLuint;
let minMaxAveSurfacePhoton: WebGLFramebuffer;

let fragmentsVBO: WebGLBuffer;


class XORShift {
    // XOR shift PRNG
    static m_x = 123456789;
    static m_y = 362436069;
    static m_z = 521288629;
    static m_w = 88675123;

    static m_frand() {
        const t = XORShift.m_x ^ (XORShift.m_x << 11);
        XORShift.m_x = XORShift.m_y;
        XORShift.m_y = XORShift.m_z;
        XORShift.m_z = XORShift.m_w;
        return (XORShift.m_w = (XORShift.m_w ^ (XORShift.m_w >> 19)) ^ (t ^ (t >> 8))) * (1.0 / 4294967295.0);
    }
}


function m_setTexture(textureIndex, texture) {
    gl.activeTexture(gl.TEXTURE0 + textureIndex);
    gl.bindTexture(gl.TEXTURE_2D, texture);
}

function m_setCubeTexture(CubeTextureIndex, CubeTexture) {
    gl.activeTexture(gl.TEXTURE0 + CubeTextureIndex);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, CubeTexture);
}

function m_setVolumeTexture(VolumeTextureIndex, VolumeTexture) {
    gl.activeTexture(gl.TEXTURE0 + VolumeTextureIndex);
    gl.bindTexture(gl.TEXTURE_3D, VolumeTexture);
}


function randomizeTextures() {
    let tempData: Vector4[] = [];
    // for eye rays
    fillArray(tempData, Vector4, imageResolution * imageResolution);


    m_setTexture(0, randomEyeRayTexture);
    for (let j = 0; j < imageResolution; j++) {
        for (let i = 0; i < imageResolution; i++) {
            tempData[i + j * imageResolution] = new Vector4(XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0);
        }
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(tempData));

    // for photons
    tempData = [];
    fillArray(tempData, Vector4, photonBufferSize * photonBufferSize);

    m_setTexture(0, pandomPhotonTexture);
    for (let j = 0; j < photonBufferSize; j++) {
        for (let i = 0; i < photonBufferSize; i++) {
            tempData[i + j * photonBufferSize] = new Vector4(XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0);
        }
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, photonBufferSize, photonBufferSize, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(tempData));
}


function drawQuad(w, h) {

    //TODO: Draw using triangles
    // gl.matrixMode(gl.PROJECTION);
    // glLoadIdentity();
    // gluOrtho2D(0.0, w, 0.0, h);
    // gl.matrixMode(gl.MODELVIEW);
    // glLoadIdentity();
    // gl.viewport(0, 0, w, h);
    //
    // glBegin(gl.QUADS);
    // 	g.texCoord2f(0.0, 0.0); glVertex2f(0.0, 0.0);
    // 	g.texCoord2f(1.0, 0.0); glVertex2f(  w, 0.0);
    // 	g.texCoord2f(1.0, 1.0); glVertex2f(  w,   h);
    // 	g.texCoord2f(0.0, 1.0); glVertex2f(0.0,   h);
    // glEnd();
}

function drawQuadwithTex(w, h, s, t) {
    //TODO: Draw using triangles
    // glBegin(gl.QUADS);
    // g.texCoord2f(0.0, 0.0); glVertex2f(0.0, 0.0);
    // g.texCoord2f(  s, 0.0); glVertex2f(  w, 0.0);
    // g.texCoord2f(  s,   t); glVertex2f(  w,   h);
    // g.texCoord2f(0.0,   t); glVertex2f(0.0,   h);
    // glEnd();
}

function reduceTexture(minMaxAveSurface, minMaxAveTexture, texture, shader, resolution): Float32Array {
    // this function assumes image resolution = 2^t and the image is a square
    gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurface);
    gl.useProgram(shader);

    // gl.matrixMode(gl.PROJECTION);
    // glLoadIdentity();
    // gluOrtho2D(0.0, resolution, 0.0, resolution);
    // gl.matrixMode(gl.MODELVIEW);
    // glLoadIdentity();
    gl.viewport(0, 0, resolution, resolution);

    // first pass reduces and copies texture into minMaxAveTexture
    let level = 1;
    let reducedBufferSize = resolution >> level;
    let textureOffset = 1.0 / (1 << level);

    gl.uniform1i(gl.getUniformLocation(shader, "texture"), 15);
    m_setTexture(15, texture);
    gl.uniform2f(gl.getUniformLocation(shader, "offset"), textureOffset, textureOffset);
    drawQuadwithTex(reducedBufferSize, reducedBufferSize, textureOffset, textureOffset);

    // remaining passes keep reducing minMaxAveTexture
    let numPasses = Math.log((resolution >> level) / Math.log(2.0)) + 1;
    let result: Float32Array = new Float32Array(4);
    for (let i = 0; i < numPasses; i++) {
        level++;
        textureOffset = 1.0 / (1 << level);
        reducedBufferSize = resolution >> level;

        gl.uniform1i(gl.getUniformLocation(shader, "texture"), 15);
        m_setTexture(15, minMaxAveTexture);
        gl.uniform2f(gl.getUniformLocation(shader, "offset"), textureOffset, textureOffset);
        drawQuadwithTex(reducedBufferSize, reducedBufferSize, textureOffset, textureOffset);

        // make sure that the rendering process is done
        gl.readPixels(0, 0, 1, 1, gl.RGBA32F, gl.FLOAT, result);
    }
    return result;
}


let bbMax, bbMin;
let initialRadius, gridScale;

function m_display() {
    let bboxOffsets = new Vector4();
    bboxOffsets.x = (                             0.5) / (gpurt.bboxDataSizeX * 2.0);
    bboxOffsets.y = (gpurt.bboxDataSizeY * 3.0 + 0.5) / (gpurt.bboxDataSizeY * 4.0);
    bboxOffsets.z = (gpurt.bboxDataSizeX + 0.5) / (gpurt.bboxDataSizeX * 2.0);
    bboxOffsets.w = (gpurt.bboxDataSizeY * 3.0 + 0.5) / (gpurt.bboxDataSizeY * 4.0);

    if (frameCount == 0) {
        // emission & local photon count
        let tempData: Vector4[] = [];//
        fillArray(tempData, Vector4, imageResolution * imageResolution);
        m_setTexture(5, queryEmissionPhotonCountTexture);
        for (let j = 0; j < imageResolution; j++) {
            for (let i = 0; i < imageResolution; i++) {
                tempData[i + j * imageResolution] = new Vector4(0.0, 0.0, 0.0, 0.0);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(tempData));
    }

    // balance the cost of eye ray tracing and photon ray tracing
    if ((frameCount % maxNumberOfBounces) == 0) {
        // eye ray tracing
        gl.bindFramebuffer(gl.FRAMEBUFFER, eyeRayTraceSurface);

        gl.useProgram(shaderEyeRayTrace);

        // ray tracing parameters
        gl.uniform4f(gl.getUniformLocation(shaderEyeRayTrace, "offsetToBBoxMinMax"), bboxOffsets.x, bboxOffsets.y, bboxOffsets.z, bboxOffsets.w);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "texturePolygons"), 2);
        m_setTexture(2, gpurt.textureTriangles);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "cubeTextureBBoxRootIndices"), 5);
        m_setCubeTexture(5, gpurt.cubeTextureBBoxRootIndices);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "textureBVH"), 6);
        m_setTexture(6, gpurt.textureBVHs);

        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "volumeTextureTextures"), 11);
        m_setVolumeTexture(11, gpurt.volumeTextureTextures);

        // material data
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "textureMaterials"), 10);
        m_setTexture(10, gpurt.textureMaterials);
        gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "materialStride"), gpurt.materialDataStride);
        gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "materialNumRcp"), 1.0 / (gpurt.mesh.materials.length));
        gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "lightSummedArea"), gpurt.mesh.lightsArea);

        // camera parameters
        let vData = new Vector4();
        vData.x = gpurt.camera.origin.x;
        vData.y = gpurt.camera.origin.y;
        vData.z = gpurt.camera.origin.z;
        gl.uniform3f(gl.getUniformLocation(shaderEyeRayTrace, "cameraPosition"), vData.x, vData.y, vData.z);

        gl.uniform3f(gl.getUniformLocation(shaderEyeRayTrace, "cameraU"), gpurt.camera.u.x, gpurt.camera.u.y, gpurt.camera.u.z);
        gl.uniform3f(gl.getUniformLocation(shaderEyeRayTrace, "cameraV"), gpurt.camera.v.x, gpurt.camera.v.y, gpurt.camera.v.z);
        gl.uniform3f(gl.getUniformLocation(shaderEyeRayTrace, "cameraW"), gpurt.camera.w.x, gpurt.camera.w.y, gpurt.camera.w.z);

        vData.x = gpurt.camera.width * 0.5;
        vData.y = gpurt.camera.height * 0.5;
        vData.z = gpurt.camera.distance;
        gl.uniform3f(gl.getUniformLocation(shaderEyeRayTrace, "cameraParams"), vData.x, vData.y, vData.z);

        // antialiasing offset
        vData.x = (XORShift.m_frand() - 0.5) * 1.25;
        vData.y = (XORShift.m_frand() - 0.5) * 1.25;
        gl.uniform2f(gl.getUniformLocation(shaderEyeRayTrace, "AAOffset"), vData.x, vData.y);

        // some extra parameters
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "randomTexture"), 0);
        m_setTexture(0, randomEyeRayTexture);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "queryEmissionPhotonCountTexture"), 1);
        m_setTexture(1, queryEmissionPhotonCountTexture);
        gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "focalLength"), focalLength);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "maxPathLength"), maxNumberOfBounces);
        gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "apertureSize"), apertureSize);
        gl.uniform2f(gl.getUniformLocation(shaderEyeRayTrace, "polygonDataStride"), gpurt.polygonDataStride.x, gpurt.polygonDataStride.y);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "numEyeSamples"), numEyeSamples + 1);

        numEyeSamples++;
        drawQuad(imageResolution, imageResolution);

        bbMax = reduceTexture(minMaxAveSurfaceQuery, minMaxAveTextureQuery, queryPositionTexture, shaderMax, imageResolution);
        bbMin = reduceTexture(minMaxAveSurfaceQuery, minMaxAveTextureQuery, queryPositionTexture, shaderMin, imageResolution);
        let bbSize = 0.0;
        for (let i = 0; i < 3; i++) {
            bbSize += bbMax[i] - bbMin[i];
        }

        // initial radius estimation
        initialRadius = (bbSize / 3.0) / (imageResolution) * InitialFootprint;

        // expand the bounding box
        for (let i = 0; i < 3; i++) {
            bbMin[i] -= initialRadius;
            bbMax[i] += initialRadius;
        }

        // hashed grid resolution
        gridScale = 0.5 / initialRadius;
    }


    // initialized photons
    if (frameCount == 0) {
        let tempData: Vector4[] = [];
        fillArray(tempData, Vector4, imageResolution * imageResolution);

        for (let j = 0; j < imageResolution; j++) {
            for (let i = 0; i < imageResolution; i++) {
                tempData[i + j * imageResolution] = new Vector4(0.0, 0.0, 0.0, 0.0);
            }
        }

        // accumulated (unnormalized) flux & radius
        m_setTexture(6, queryFluxRadiusTexture);
        for (let j = 0; j < imageResolution; j++) {
            for (let i = 0; i < imageResolution; i++) {
                tempData[i + j * imageResolution] = new Vector4(0.0, 0.0, 0.0, initialRadius);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(tempData));

        // photon intersection
        tempData = [];
        fillArray(tempData, Vector4, photonBufferSize * photonBufferSize);
        m_setTexture(7, photonIntersectionTexture);
        for (let j = 0; j < photonBufferSize; j++) {
            for (let i = 0; i < photonBufferSize; i++) {
                tempData[i + j * photonBufferSize] = new Vector4(-1.0, -1.0, 0.0, 1.0e+30);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, photonBufferSize, photonBufferSize, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(tempData));

        numPhotons = 0.0;
    }


    // photon tracing
    gl.bindFramebuffer(gl.FRAMEBUFFER, photonRayTraceSurface);
    gl.useProgram(shaderPhotonTrace);

    // ray tracing
    gl.uniform4f(gl.getUniformLocation(shaderPhotonTrace, "offsetToBBoxMinMax"), bboxOffsets.x, bboxOffsets.y, bboxOffsets.z, bboxOffsets.w);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "texturePolygons"), 2);
    m_setTexture(2, gpurt.textureTriangles);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "cubeTextureBBoxRootIndices"), 5);
    m_setCubeTexture(5, gpurt.cubeTextureBBoxRootIndices);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "textureBVH"), 6);
    m_setTexture(6, gpurt.textureBVHs);
    gl.uniform2f(gl.getUniformLocation(shaderPhotonTrace, "polygonDataStride"), gpurt.polygonDataStride.x, gpurt.polygonDataStride.y);

    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonIntersectionTexture"), 12);
    m_setTexture(12, photonIntersectionTexture);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonPositionTexture"), 13);
    m_setTexture(13, photonPositionTexture);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonFluxTexture"), 14);
    m_setTexture(14, photonFluxTexture);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonDirectionTexture"), 15);
    m_setTexture(15, photonDirectionTexture);

    // brdfs
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "textureMaterials"), 10);
    m_setTexture(10, gpurt.textureMaterials);
    gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "materialStride"), gpurt.materialDataStride);
    gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "materialNumRcp"), 1.0 / (gpurt.mesh.materials.length));

    // material data
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "volumeTextureTextures"), 9);
    m_setVolumeTexture(9, gpurt.volumeTextureTextures);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "textureLightSources"), 11);
    m_setTexture(11, gpurt.textureLightSources);
    gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "lightSourceStride"), 1.0 / gpurt.mesh.lightsCDF.length);
    gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "lightSummedArea"), gpurt.mesh.lightsArea);

    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "randomTexture"), 0);
    m_setTexture(0, pandomPhotonTexture);
    gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "maxPathLength"), maxNumberOfBounces);

    // for IBL
    let sceneBSphere: Vector4 = new Vector4();
    sceneBSphere.x = (gpurt.mesh.bbox.max.x + gpurt.mesh.bbox.min.x) * 0.5;
    sceneBSphere.y = (gpurt.mesh.bbox.max.y + gpurt.mesh.bbox.min.y) * 0.5;
    sceneBSphere.z = (gpurt.mesh.bbox.max.z + gpurt.mesh.bbox.min.z) * 0.5;
    sceneBSphere.w = gpurt.mesh.bbox.max.sub(gpurt.mesh.bbox.min).length() * 0.5;
    gl.uniform4f(gl.getUniformLocation(shaderPhotonTrace, "sceneBSphere"), sceneBSphere.x, sceneBSphere.y, sceneBSphere.z, sceneBSphere.w);

    drawQuad(photonBufferSize, photonBufferSize);
    let numCurrentEmittedPhotons: Float32Array = reduceTexture(minMaxAveSurfacePhoton, minMaxAveTexturePhoton, photonEmittedFlagTexture, shaderSum, photonBufferSize);
    numPhotons += Math.floor(numCurrentEmittedPhotons[0]);


    // build a stochastic hashed grid

    // compute the hash values of the photons
    gl.bindFramebuffer(gl.FRAMEBUFFER, photonIndexSurface);
    gl.useProgram(shaderHash);

    gl.uniform4f(gl.getUniformLocation(shaderHash, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
    gl.uniform1i(gl.getUniformLocation(shaderHash, "hashNum"), hashResolution * hashResolution);
    gl.uniform1f(gl.getUniformLocation(shaderHash, "gridScale"), gridScale);
    gl.uniform3f(gl.getUniformLocation(shaderHash, "bboxMin"), bbMin.x, bbMin.y, bbMin.z);
    gl.uniform1i(gl.getUniformLocation(shaderHash, "photonPositionTexture"), 10);
    m_setTexture(10, photonPositionTexture);
    gl.uniform1i(gl.getUniformLocation(shaderHash, "photonFluxTexture"), 11);
    m_setTexture(11, photonFluxTexture);
    drawQuad(photonBufferSize, photonBufferSize);


    // random write photons into the hashed buffer
    gl.enable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, photonHashSurface);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(vshaderScatter);

    gl.uniform4f(gl.getUniformLocation(vshaderScatter, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
    gl.uniform1i(gl.getUniformLocation(vshaderScatter, "photonIndexTexture"), 8);
    m_setTexture(8, photonIndexTexture);
    gl.uniform1f(gl.getUniformLocation(vshaderScatter, "photonBufferSize"), photonBufferSize);

    // gl.matrixMode(gl.PROJECTION);
    // glLoadIdentity();
    // gluOrtho2D(0.0, hashResolution, 0.0, hashResolution);
    // gl.matrixMode(gl.MODELVIEW);
    // glLoadIdentity();
    gl.viewport(0, 0, hashResolution, hashResolution);

    gl.bindBuffer(gl.ARRAY_BUFFER, fragmentsVBO);
    // gl.enableClientState(gl.VERTEX_ARRAY);
    // gl.vertexPointer(2, gl.FLOAT, 0, 0);
    gl.drawArrays(gl.POINTS, 0, photonBufferSize * photonBufferSize);
    // glDisableClientState(gl.VERTEX_ARRAY);
    gl.bindBuffer(gl.ARRAY_BUFFER, 0);
    gl.disable(gl.DEPTH_TEST);

    // count the number of overlapped photons in the hashed grid
    // - this is necessary to make the estimation unbiased (essentially the Russian roulette technique)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, photonCorrectionSurface);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(vshaderCorrection);

    gl.uniform4f(gl.getUniformLocation(vshaderCorrection, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
    gl.uniform1i(gl.getUniformLocation(vshaderCorrection, "photonIndexTexture"), 8);
    m_setTexture(8, photonIndexTexture);

    // gl.matrixMode(gl.PROJECTION);
    // glLoadIdentity();
    // gluOrtho2D(0.0, hashResolution, 0.0, hashResolution);
    // gl.matrixMode(gl.MODELVIEW);
    // glLoadIdentity();
    gl.viewport(0, 0, hashResolution, hashResolution);

    gl.bindBuffer(gl.ARRAY_BUFFER, fragmentsVBO);
    // gl.enableClientState(gl.VERTEX_ARRAY);
    // glVertexPointer(2, gl.FLOAT, 0, 0);
    gl.drawArrays(gl.POINTS, 0, photonBufferSize * photonBufferSize);
    // glDisableClientState(gl.VERTEX_ARRAY);
    gl.bindBuffer(gl.ARRAY_BUFFER, 0);
    gl.disable(gl.BLEND);


    // radiance estimation
    gl.bindFramebuffer(gl.FRAMEBUFFER, queryPointSurface);
    gl.useProgram(shaderProgressiveUpdate);

    // the maximum hash index
    let hashMax: Vector3 = new Vector3();
    hashMax.x = Math.abs(bbMax[0] + initialRadius - bbMin[0]) * gridScale;
    hashMax.y = Math.abs(bbMax[1] + initialRadius - bbMin[1]) * gridScale;
    hashMax.z = Math.abs(bbMax[2] + initialRadius - bbMin[2]) * gridScale;
    gl.uniform3f(gl.getUniformLocation(shaderProgressiveUpdate, "hashMax"), hashMax.x, hashMax.y, hashMax.z);

    gl.uniform4f(gl.getUniformLocation(shaderProgressiveUpdate, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
    gl.uniform1f(gl.getUniformLocation(shaderProgressiveUpdate, "hashNum"), hashResolution * hashResolution);
    gl.uniform1f(gl.getUniformLocation(shaderProgressiveUpdate, "gridScale"), gridScale);
    gl.uniform1f(gl.getUniformLocation(shaderProgressiveUpdate, "alpha"), 0.7);
    gl.uniform3f(gl.getUniformLocation(shaderProgressiveUpdate, "bboxMin"), bbMin.x, bbMin.y, bbMin.z);

    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "hashedPhotonTexture"), 0);
    m_setTexture(0, photonHashTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonCorrectionTexture"), 1);
    m_setTexture(1, photonCorrectionTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryNormalTexture"), 2);
    m_setTexture(2, queryNormalTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryPositionTexture"), 3);
    m_setTexture(3, queryPositionTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryEmissionPhotonCountTexture"), 5);
    m_setTexture(5, queryEmissionPhotonCountTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryFluxRadiusTexture"), 6);
    m_setTexture(6, queryFluxRadiusTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryReflectanceTexture"), 7);
    m_setTexture(7, queryReflectanceTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonFluxTexture"), 9);
    m_setTexture(9, photonFluxTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonPositionTexture"), 10);
    m_setTexture(10, photonPositionTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonDirectionTexture"), 11);
    m_setTexture(11, photonDirectionTexture);
    gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryIntersectionTexture"), 14);
    m_setTexture(14, queryIntersectionTexture);
    drawQuad(imageResolution, imageResolution);


    // rendering
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(shaderRadianceEstimate);

    gl.uniform1f(gl.getUniformLocation(shaderRadianceEstimate, "totalPhotonNum"), numPhotons);
    gl.uniform1i(gl.getUniformLocation(shaderRadianceEstimate, "queryEmissionPhotonCountTexture"), 5);
    m_setTexture(5, queryEmissionPhotonCountTexture);
    gl.uniform1i(gl.getUniformLocation(shaderRadianceEstimate, "queryFluxRadiusTexture"), 6);
    m_setTexture(6, queryFluxRadiusTexture);
    drawQuad(imageResolution, imageResolution);

    /*
     // debug output
     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
     gl.clear(gl.COLOR_BUFFER_BIT);
     gl.useProgram(shaderDraw);
     m_setTexture(0, photonHashTexture);
     gl.uniform1i(gl.getUniformLocation(shaderDraw, "input_tex"), 0);
     drawQuad(imageResolution, imageResolution);
     //*/

    // update
    gl.finish();
    frameCount++;
    if ((performance.now() - m_nextUpdate) > 0) {
        let numMPaths = (numPhotons + numEyeSamples * imageResolution * imageResolution) / (1024.0 * 1024.0);
        console.log(`${(performance.now() - startedTime) / 1000} sec,  ${numMPaths / ((performance.now() - startedTime) / 1000)} M paths/sec,  ${numMPaths} M paths`);
        m_nextUpdate = performance.now() + 1000;
    }
}


// error checking for GLSL (from http://www.mathematik.uni-dortmund.de/~goeddeke/gpgpu/tutorial.html)
function m_printInfoLogs(obj, shader) {
    // let infologLength = 0;
    // let charsWritten  = 0;
    // let infoLog:string;
    //
    // gl.getProgramiv(obj, gl.INFO_LOG_LENGTH, &infologLength);
    // if (infologLength > 1)
    // {
    // 	infoLog = (char *)malloc(infologLength);
    // 	glGetProgramInfoLog(obj, infologLength, &charsWritten, infoLog);
    // 	console.log(infoLog << std::endl;
    // 	free(infoLog);
    // }
    // glGetshaderiv(shader, gl.INFO_LOG_LENGTH, &infologLength);
    // if (infologLength > 1)
    // {
    // 	infoLog = (char *)malloc(infologLength);
    // 	glGetshaderInfoLog(shader, infologLength, &charsWritten, infoLog);
    // 	console.log(infoLog << std::endl;
    // 	free(infoLog);
    // }
}


function createFullShader(vertex_shader_path: string, fragment_shader_path: string) {
    // create a fragment shader and a vertex shader
    let p = gl.createProgram();
    console.log(`compiling ${vertex_shader_path}...`);

    let vshader = fs.getTextFile(vertex_shader_path);

    let s = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(s, vshader);
    gl.compileShader(s);
    gl.attachShader(p, s);

    console.log("done.");
    console.log(`compiling ${fragment_shader_path}...`);
    let fshader = fs.getTextFile(fragment_shader_path);

    s = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(s, fshader);
    gl.compileShader(s);
    gl.attachShader(p, s);

    console.log("done.");
    gl.linkProgram(p);

    return p;
}


function createFragmentShader(shader_path: string) {
    //create a fragment shader (the vertex shader is using the fixed-function pipeline)
    let p = gl.createProgram();
    console.log(`compiling ${shader_path}...`);
    let fshader = fs.getTextFile(shader_path);

    let s = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(s, fshader);
    gl.compileShader(s);
    gl.attachShader(p, s);

    console.log("done.");
    gl.linkProgram(p);

    return p;
}


function m_idle() {
    //glutPostRedisplay();
}


function m_CreateTexture(textureIndex, format: GLenum, BufferSize) {
    let texture;

    gl.activeTexture(gl.TEXTURE0 + textureIndex);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, BufferSize, BufferSize, 0, gl.LUMINANCE, gl.FLOAT, null);

    return texture;
}

export class PhotonMapper {

    constructor() {

    }

    run() {
        // glutInit(&argc, argv);
        // glutInitWindowPosition((glutGet(GLUT_SCREEN_WIDTH) - imageResolution) / 2, (glutGet(GLUT_SCREEN_HEIGHT) - imageResolution) / 2);
        // glutInitWindowSize(imageResolution, imageResolution);
        // glutInitDisplayMode(GLUT_RGBA32F | GLUT_DEPTH);
        // glutCreateWindow(argv[0]);
        // glutDisplayFunc(m_display);
        // glutIdleFunc(m_idle);

        // create shaders
        shaderDraw = createFragmentShader("draw.fs");
        shaderHash = createFragmentShader("hash.fs");
        shaderProgressiveUpdate = createFragmentShader("progressive.fs");
        shaderRadianceEstimate = createFragmentShader("re.fs");
        vshaderScatter = createFullShader("scatter.vs", "scatter.fs");
        vshaderCorrection = createFullShader("correction.vs", "correction.fs");
        shaderEyeRayTrace = createFragmentShader("eyeraytrace.fs");
        shaderPhotonTrace = createFragmentShader("photontrace.fs");
        shaderMax = createFragmentShader("max.fs");
        shaderMin = createFragmentShader("min.fs");
        shaderSum = createFragmentShader("sum.fs");

        // create textures
        photonHashTexture = m_CreateTexture(0, gl.RGBA32F, hashResolution);
        photonCorrectionTexture = m_CreateTexture(1, gl.RGBA32F, hashResolution);

        queryNormalTexture = m_CreateTexture(2, gl.RGBA32F, imageResolution);
        queryPositionTexture = m_CreateTexture(3, gl.RGBA32F, imageResolution);
        randomEyeRayTexture = m_CreateTexture(4, gl.RGBA32F, imageResolution);
        pandomPhotonTexture = m_CreateTexture(4, gl.RGBA32F, photonBufferSize);
        queryEmissionPhotonCountTexture = m_CreateTexture(5, gl.RGBA32F, imageResolution);
        queryFluxRadiusTexture = m_CreateTexture(6, gl.RGBA32F, imageResolution);
        queryReflectanceTexture = m_CreateTexture(7, gl.RGBA32F, imageResolution);

        photonIndexTexture = m_CreateTexture(8, gl.RGBA32F, photonBufferSize);
        photonFluxTexture = m_CreateTexture(9, gl.RGBA32F, photonBufferSize);
        photonPositionTexture = m_CreateTexture(10, gl.RGBA32F, photonBufferSize);
        photonDirectionTexture = m_CreateTexture(11, gl.RGBA32F, photonBufferSize);

        photonIntersectionTexture = m_CreateTexture(15, gl.RGBA32F, photonBufferSize);
        photonEmittedFlagTexture = m_CreateTexture(15, gl.RGBA32F, photonBufferSize);
        queryIntersectionTexture = m_CreateTexture(15, gl.RGBA32F, imageResolution);

        // buffer for computing min/max/average
        minMaxAveTextureQuery = m_CreateTexture(12, gl.RGBA32F, imageResolution);
        minMaxAveSurfaceQuery = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurfaceQuery);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTextureQuery, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        minMaxAveTexturePhoton = m_CreateTexture(12, gl.RGBA32F, photonBufferSize);
        minMaxAveSurfacePhoton = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurfacePhoton);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTexturePhoton, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // create FBOs
        // precomputed hash values
        photonIndexSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonIndexSurface);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonIndexTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // hash buffer
        photonHashSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonHashSurface);
        photonHashDepthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, photonHashDepthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT, hashResolution, hashResolution);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonHashTexture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, photonHashDepthBuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // hash-count buffer
        photonCorrectionSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonCorrectionSurface);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonCorrectionSurface, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // eye ray intersection data
        let eyeRayTraceBuffers: GLenum[] = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3, gl.COLOR_ATTACHMENT4, gl.COLOR_ATTACHMENT5];
        eyeRayTraceSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, eyeRayTraceSurface);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, queryPositionTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, queryReflectanceTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, queryNormalTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, randomEyeRayTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, queryIntersectionTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT5, gl.TEXTURE_2D, queryEmissionPhotonCountTexture, 0);
        gl.drawBuffers(eyeRayTraceBuffers);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // photon data
        let photonRayTraceBuffers: GLenum[] = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3, gl.COLOR_ATTACHMENT4, gl.COLOR_ATTACHMENT5];
        photonRayTraceSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonRayTraceSurface);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonPositionTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, photonFluxTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, photonDirectionTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, pandomPhotonTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, photonIntersectionTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT5, gl.TEXTURE_2D, photonEmittedFlagTexture, 0);
        gl.drawBuffers(photonRayTraceBuffers);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // measurement points
        let queryBuffers: GLenum[] = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
        queryPointSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, queryPointSurface);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, queryFluxRadiusTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, queryEmissionPhotonCountTexture, 0);
        gl.drawBuffers(2, queryBuffers);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // create a VBO
        fragmentsVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, fragmentsVBO);
        let vboData = new Float32Array(photonBufferSize * photonBufferSize);
        let k = 0;
        for (let j = 0; j < photonBufferSize; j++) {
            for (let i = 0; i < photonBufferSize; i++) {
                vboData[k++] = (2.0 * ((i + 0.5) / (photonBufferSize)) - 1.0);
                vboData[k++] = (2.0 * ((j + 0.5) / (photonBufferSize)) - 1.0);
            }
        }
        gl.bufferData(gl.ARRAY_BUFFER, /*4 * 2 * photonBufferSize * photonBufferSize, */vboData, gl.STATIC_DRAW);

        // initialize misc data
        frameCount = 0;
        gl.clearColor(0.0, 0.0, 0.0, 0.0);

        CanonicalCameraPosition = new Vector3(0.0, 0.0, 13.0);
        FieldOfView = 45.0;
        LookAtPosition = new Vector3(0.0, 0.0, 0.0);
        gpurt.camera.set(CanonicalCameraPosition, LookAtPosition, imageResolution, imageResolution, FieldOfView);

        // load mesh data
        gpurt.mesh.loadOBJ(fs.getTextFile("cornell_metal.obj"), new Vector3(0.0, 0.0, 0.0), 0.01);

        // precalcuation (BVH construction) for mesh
        console.log("building BVH...");
        gpurt.precalculateMeshData();
        console.log("done");

        if (gpurt.mesh.lightsCDF.length == 0) {
            console.log("no light source is defined, use constant illumination");
        }

        // enter the main loop
        console.log("start rendering...");
        randomizeTextures();
        gl.clear(gl.COLOR_BUFFER_BIT);
        startedTime = performance.now();
        // glutMainLoop();

        // release the resources of gpurt
        gpurt.release();

        // delete things
        gl.deleteBuffer(fragmentsVBO);

        gl.deleteProgram(shaderDraw);
        gl.deleteProgram(shaderHash);
        gl.deleteProgram(shaderProgressiveUpdate);
        gl.deleteProgram(shaderRadianceEstimate);
        gl.deleteProgram(vshaderScatter);
        gl.deleteProgram(vshaderCorrection);
        gl.deleteProgram(shaderEyeRayTrace);
        gl.deleteProgram(shaderPhotonTrace);

        gl.deleteProgram(shaderMax);
        gl.deleteProgram(shaderMin);
        gl.deleteProgram(shaderSum);

        gl.deleteTexture(queryPositionTexture);
        gl.deleteTexture(queryNormalTexture);
        gl.deleteTexture(queryEmissionPhotonCountTexture);
        gl.deleteTexture(queryFluxRadiusTexture);
        gl.deleteTexture(queryReflectanceTexture);
        gl.deleteTexture(queryIntersectionTexture);

        gl.deleteTexture(photonIndexTexture);
        gl.deleteTexture(photonFluxTexture);
        gl.deleteTexture(photonPositionTexture);
        gl.deleteTexture(photonDirectionTexture);
        gl.deleteTexture(pandomPhotonTexture);
        gl.deleteTexture(randomEyeRayTexture);
        gl.deleteTexture(photonHashTexture);
        gl.deleteTexture(photonCorrectionTexture);
        gl.deleteTexture(photonIntersectionTexture);
        gl.deleteTexture(photonEmittedFlagTexture);

        gl.deleteTexture(minMaxAveTextureQuery);
        gl.deleteFramebuffer(minMaxAveSurfaceQuery);
        gl.deleteTexture(minMaxAveTexturePhoton);
        gl.deleteFramebuffer(minMaxAveSurfacePhoton);

        gl.deleteFramebuffer(photonHashSurface);
        gl.deleteFramebuffer(photonCorrectionSurface);
        gl.deleteFramebuffer(photonIndexSurface);
        gl.deleteFramebuffer(queryPointSurface);
        gl.deleteFramebuffer(eyeRayTraceSurface);
        gl.deleteFramebuffer(photonRayTraceSurface);
        gl.deleteFramebuffer(photonHashDepthBuffer);

        return 0;
    }

}
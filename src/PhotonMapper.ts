import {CGPURT} from "./gpurt";
import {Vector3, Vector4} from "./vector";
import {fillArray, vec4array_to_f32Array} from "./utils";
import {fs} from "./fs";
import {loadMTL, mtls} from "./obj";
import {Quad} from "./quad";
import {DebugQuad} from "./debugquad";
/**
 * Created by Nidin Vinayakan on 24/02/17.
 */

declare const gl: WebGLRenderingContext;

let debugDraw, shaderDraw, shaderHash, shaderEyeRayTrace, shaderPhotonTrace, shaderProgressiveUpdate, shaderRadianceEstimate,
    shaderScatter, shaderCorrection, shaderMax, shaderMin, shaderSum;

let canonicalCameraPosition: Vector3;
let fieldOfView: number;
let lookAtPosition: Vector3;

let gpurt: CGPURT = new CGPURT();
let numPhotons: number = 0.0;
let numEyeSamples: number = 0;
let frameCount: number = 0;
let focalLength: number = 13.0;
let apertureSize: number = 0.0;
let m_nextUpdate: number = 0;
let startedTime: number = 0;

const maxNumberOfBounces: number = 5;
const imageResolution: number = 512;
const photonBufferSize: number = imageResolution;
const hashResolution: number = imageResolution;
const initialFootprint: number = 2.5;

let queryPositionTexture: WebGLTexture;
let queryNormalTexture: WebGLTexture;
let queryEmissionPhotonCountTexture: FeedBackTexture; //feedback
let queryFluxRadiusTexture: FeedBackTexture;//feedback
let queryReflectanceTexture: WebGLTexture;
let queryIntersectionTexture: WebGLTexture;

let photonIndexTexture: WebGLTexture;
let photonFluxTexture: FeedBackTexture; //feedback
let photonPositionTexture: FeedBackTexture; //feedback
let photonDirectionTexture: FeedBackTexture; //feedback
let photonHashTexture: WebGLTexture;
let photonCorrectionTexture: WebGLTexture;
let randomPhotonTexture: FeedBackTexture; //feedback
let randomEyeRayTexture: FeedBackTexture; //feedback
let photonIntersectionTexture: FeedBackTexture; //feedback
let photonEmittedFlagTexture: WebGLTexture;

let eyeRayTraceSurface: FeedBackBuffer;
let photonRayTraceSurface: FeedBackBuffer;
let photonIndexSurface: WebGLFramebuffer;
let queryPointSurface: FeedBackBuffer;
let photonHashSurface: WebGLFramebuffer;
let photonHashDepthBuffer: WebGLRenderbuffer;
let photonCorrectionSurface: WebGLFramebuffer;

let minMaxAveSurfaceQuery: FeedBackBuffer;
let minMaxAveTextureQuery: FeedBackTexture; //feedback
let minMaxAveSurfacePhoton: FeedBackBuffer;
let minMaxAveTexturePhoton: FeedBackTexture; //feedback

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

class FeedBackTexture {

    public state: boolean = false;

    constructor(private texture0: WebGLTexture, private texture1: WebGLTexture) {

    }

    get source(): WebGLTexture {
        return this.state ? this.texture0 : this.texture1;
    }

    get target(): WebGLTexture {
        return this.state ? this.texture1 : this.texture0;
    }

    swap() {
        this.state = !this.state;
    }

    distroy() {
        gl.deleteTexture(this.texture0);
        gl.deleteTexture(this.texture1);
    }

}
class FeedBackBuffer {

    textures: {index: number, texture: FeedBackTexture}[];

    constructor(public frameBuffer: WebGLFramebuffer) {
        this.textures = [];
    }

    addTexture(index: number, value: FeedBackTexture) {
        this.textures.push({index: index, texture: value});
    }

    bind() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
        for (let i = 0; i < this.textures.length; i++) {
            let group = this.textures[i];
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + group.index, gl.TEXTURE_2D, group.texture.target, 0);
        }
        checkFrameBuffer();
    }

    swap() {
        for (let i = 0; i < this.textures.length; i++) {
            let group = this.textures[i];
            group.texture.swap();
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + group.index, gl.TEXTURE_2D, group.texture.target, 0);
        }

        checkFrameBuffer();
    }

    distroy() {
        gl.deleteFramebuffer(this.frameBuffer);
    }
}

function checkFrameBuffer(): void {

    let code = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);

    switch (code) {
        case gl.FRAMEBUFFER_COMPLETE:
            return;
        case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
            console.error("FRAMEBUFFER_INCOMPLETE_ATTACHMENT");
            break;
        case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
            console.error("FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT");
            break;
        case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
            console.error("FRAMEBUFFER_INCOMPLETE_DIMENSIONS");
            break;
        case gl.FRAMEBUFFER_UNSUPPORTED:
            console.error("FRAMEBUFFER_UNSUPPORTED");
            break;
        case gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
            console.error("FRAMEBUFFER_INCOMPLETE_MULTISAMPLE");
            break;
        case gl.RENDERBUFFER_SAMPLES:
            return;
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
    let program = gl.createProgram();
    // console.log(`compiling ${vertex_shader_path}...`);

    let vertexShaderSource = fs.getTextFile(vertex_shader_path);

    let shader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(shader, vertexShaderSource);
    gl.compileShader(shader);
    gl.attachShader(program, shader);

    // console.log("done.");

    // console.log(`compiling ${fragment_shader_path}...`);
    let fragmentShaderSource = fs.getTextFile(fragment_shader_path);

    shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(shader, fragmentShaderSource);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        let info = gl.getProgramInfoLog(program);
        console.error('Could not compile WebGL program. \n\n' + info);
    } else {
        // console.log("done.");
    }

    return program;
}

function createFragmentShader(shader_path: string) {
    //create a fragment shader (the vertex shader is using the fixed-function pipeline)
    let program = gl.createProgram();
    console.log(`compiling ${shader_path}...`);
    let fragmentShaderSource = fs.getTextFile(shader_path);

    let shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(shader, fragmentShaderSource);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        let info = gl.getProgramInfoLog(program);
        console.error('Could not compile WebGL program. \n\n' + info);
    } else {
        console.log("done.");
    }

    return program;
}

export class PhotonMapper {

    bbMax;
    bbMin;
    initialRadius;
    gridScale;

    quad: Quad;
    debugQuad: DebugQuad;

    constructor() {
        this.init();
    }

    init() {

        console.log("MAX_COLOR_ATTACHMENTS:" + gl.getParameter(gl.MAX_COLOR_ATTACHMENTS));
        console.log("MAX_DRAW_BUFFERS:" + gl.getParameter(gl.MAX_DRAW_BUFFERS));
        console.log("MAX_TEXTURE_SIZE:" + gl.getParameter(gl.MAX_TEXTURE_SIZE));
        console.log("MAX_TEXTURE_IMAGE_UNITS:" + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
        console.log("MAX_VERTEX_TEXTURE_IMAGE_UNITS:" + gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS));
        console.log("MAX_COMBINED_TEXTURE_IMAGE_UNITS:" + gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));

        //Extensions
        gl.getExtension('EXT_color_buffer_float');

        this.quad = new Quad();

    }

    run() {
        // glutInit(&argc, argv);
        // glutInitWindowPosition((glutGet(GLUT_SCREEN_WIDTH) - imageResolution) / 2, (glutGet(GLUT_SCREEN_HEIGHT) - imageResolution) / 2);
        // glutInitWindowSize(imageResolution, imageResolution);
        // glutInitDisplayMode(GLUT_RGBA | GLUT_DEPTH);
        // glutCreateWindow(argv[0]);
        // glutDisplayFunc(m_display);
        // glutIdleFunc(m_idle);

        // create shaders
        debugDraw = createFullShader("debug.vs", "debug.fs");
        shaderDraw = createFullShader("draw.vs", "draw.fs");
        shaderHash = createFullShader("hash.vs", "hash.fs");
        shaderProgressiveUpdate = createFullShader("progressive.vs", "progressive.fs");
        shaderRadianceEstimate = createFullShader("re.vs", "re.fs");
        shaderScatter = createFullShader("scatter.vs", "scatter.fs");
        shaderCorrection = createFullShader("correction.vs", "correction.fs");
        shaderEyeRayTrace = createFullShader("eyeraytrace.vs", "eyeraytrace.fs");
        shaderPhotonTrace = createFullShader("photontrace.vs", "photontrace.fs");
        shaderMax = createFullShader("max.vs", "max.fs");
        shaderMin = createFullShader("min.vs", "min.fs");
        shaderSum = createFullShader("sum.vs", "sum.fs");

        this.debugQuad = new DebugQuad(debugDraw);

        // create textures
        photonHashTexture = this.createTexture(0, gl.RGBA32F, hashResolution);
        photonCorrectionTexture = this.createTexture(1, gl.RGBA32F, hashResolution);

        queryNormalTexture = this.createTexture(2, gl.RGBA32F, imageResolution);
        queryPositionTexture = this.createTexture(3, gl.RGBA32F, imageResolution);

        randomEyeRayTexture = new FeedBackTexture(
            this.createTexture(4, gl.RGBA32F, imageResolution),
            this.createTexture(4, gl.RGBA32F, imageResolution)
        );

        randomPhotonTexture = new FeedBackTexture(
            this.createTexture(4, gl.RGBA32F, photonBufferSize),
            this.createTexture(4, gl.RGBA32F, photonBufferSize)
        );

        queryEmissionPhotonCountTexture = new FeedBackTexture(
            this.createTexture(5, gl.RGBA32F, imageResolution),
            this.createTexture(5, gl.RGBA32F, imageResolution)
        );

        queryFluxRadiusTexture = new FeedBackTexture(
            this.createTexture(6, gl.RGBA32F, imageResolution),
            this.createTexture(6, gl.RGBA32F, imageResolution)
        );
        queryReflectanceTexture = this.createTexture(7, gl.RGBA32F, imageResolution);

        photonIndexTexture = this.createTexture(8, gl.RGBA32F, photonBufferSize);

        photonFluxTexture = new FeedBackTexture(
            this.createTexture(9, gl.RGBA32F, photonBufferSize),
            this.createTexture(9, gl.RGBA32F, photonBufferSize)
        );

        photonPositionTexture = new FeedBackTexture(
            this.createTexture(10, gl.RGBA32F, photonBufferSize),
            this.createTexture(10, gl.RGBA32F, photonBufferSize)
        );

        photonDirectionTexture = new FeedBackTexture(
            this.createTexture(11, gl.RGBA32F, photonBufferSize),
            this.createTexture(11, gl.RGBA32F, photonBufferSize)
        );

        photonIntersectionTexture = new FeedBackTexture(
            this.createTexture(15, gl.RGBA32F, photonBufferSize),
            this.createTexture(15, gl.RGBA32F, photonBufferSize)
        );

        photonEmittedFlagTexture = this.createTexture(15, gl.RGBA32F, photonBufferSize);
        queryIntersectionTexture = this.createTexture(15, gl.RGBA32F, imageResolution);

        // buffer for computing min/max/average
        minMaxAveTextureQuery = new FeedBackTexture(
            this.createTexture(12, gl.RGBA32F, imageResolution),
            this.createTexture(12, gl.RGBA32F, imageResolution)
        );

        minMaxAveSurfaceQuery = new FeedBackBuffer(gl.createFramebuffer());
        gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurfaceQuery.frameBuffer);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTextureQuery.target, 0);
        minMaxAveSurfaceQuery.addTexture(0, minMaxAveTextureQuery);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        minMaxAveTexturePhoton = new FeedBackTexture(
            this.createTexture(12, gl.RGBA32F, photonBufferSize),
            this.createTexture(12, gl.RGBA32F, photonBufferSize)
        );

        minMaxAveSurfacePhoton = new FeedBackBuffer(gl.createFramebuffer());
        gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurfacePhoton.frameBuffer);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTexturePhoton.target, 0);
        minMaxAveSurfacePhoton.addTexture(0, minMaxAveTexturePhoton);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // create FBOs
        // precomputed hash values
        photonIndexSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonIndexSurface);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonIndexTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // hash buffer
        photonHashSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonHashSurface);
        photonHashDepthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, photonHashDepthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, hashResolution, hashResolution);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonHashTexture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, photonHashDepthBuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // hash-count buffer
        photonCorrectionSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonCorrectionSurface);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonCorrectionTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // eye ray intersection data
        eyeRayTraceSurface = new FeedBackBuffer(gl.createFramebuffer());
        gl.bindFramebuffer(gl.FRAMEBUFFER, eyeRayTraceSurface.frameBuffer);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, queryPositionTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, queryReflectanceTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, queryNormalTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, randomEyeRayTexture.target, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, queryIntersectionTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT5, gl.TEXTURE_2D, queryEmissionPhotonCountTexture.target, 0);
        eyeRayTraceSurface.addTexture(3, randomEyeRayTexture);
        eyeRayTraceSurface.addTexture(5, queryEmissionPhotonCountTexture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // photon data
        photonRayTraceSurface = new FeedBackBuffer(gl.createFramebuffer());
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonRayTraceSurface.frameBuffer);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonPositionTexture.target, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, photonFluxTexture.target, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, photonDirectionTexture.target, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, randomPhotonTexture.target, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, photonIntersectionTexture.target, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT5, gl.TEXTURE_2D, photonEmittedFlagTexture, 0);
        photonRayTraceSurface.addTexture(0, photonPositionTexture);
        photonRayTraceSurface.addTexture(1, photonFluxTexture);
        photonRayTraceSurface.addTexture(2, photonDirectionTexture);
        photonRayTraceSurface.addTexture(3, randomPhotonTexture);
        photonRayTraceSurface.addTexture(4, photonIntersectionTexture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // measurement points
        queryPointSurface = new FeedBackBuffer(gl.createFramebuffer());
        gl.bindFramebuffer(gl.FRAMEBUFFER, queryPointSurface.frameBuffer);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, queryFluxRadiusTexture.target, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, queryEmissionPhotonCountTexture.target, 0);
        queryPointSurface.addTexture(0, queryFluxRadiusTexture);
        queryPointSurface.addTexture(1, queryEmissionPhotonCountTexture);
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
        // gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clearColor(0.5, 0.5, 0.5, 1.0);

        canonicalCameraPosition = new Vector3(0.0, 0.0, 13.0);
        fieldOfView = 45.0;
        lookAtPosition = new Vector3(0.0, 0.0, 0.0);
        gpurt.camera.set(canonicalCameraPosition, lookAtPosition, imageResolution, imageResolution, fieldOfView);

        // load mesh data
        loadMTL(fs.getTextFile("cornell_metal.mtl"));

        console.log(mtls);

        gpurt.mesh.loadOBJ("cornell_metal.obj", new Vector3(0.0, 0.0, 0.0), 0.01);

        // precalcuation (BVH construction) for mesh
        console.log("building BVH...");
        gpurt.precalculateMeshData();
        console.log("done");

        if (gpurt.mesh.lightsCDF.length == 0) {
            console.log("no light source is defined, use constant illumination");
        }

        // enter the main loop
        console.log("start rendering...");
        this.randomizeTextures();
        gl.clear(gl.COLOR_BUFFER_BIT);
        startedTime = performance.now();
        // glutMainLoop();

        requestAnimationFrame(this.render.bind(this));
    }

    iteration = 0;

    render() {

        if (this.iteration++ > 100) {
            return;
        }

        let bboxOffsets = new Vector4();
        bboxOffsets.x = (                             0.5) / (gpurt.bboxDataSizeX * 2.0);
        bboxOffsets.y = (gpurt.bboxDataSizeY * 3.0 + 0.5) / (gpurt.bboxDataSizeY * 4.0);
        bboxOffsets.z = (gpurt.bboxDataSizeX + 0.5) / (gpurt.bboxDataSizeX * 2.0);
        bboxOffsets.w = (gpurt.bboxDataSizeY * 3.0 + 0.5) / (gpurt.bboxDataSizeY * 4.0);

        if (frameCount == 0) {
            // emission & local photon count
            let tempData: Vector4[] = [];//
            fillArray(tempData, Vector4, imageResolution * imageResolution);
            this.setTexture(5, queryEmissionPhotonCountTexture.source);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));
        }

        // balance the cost of eye ray tracing and photon ray tracing
        if ((frameCount % maxNumberOfBounces) == 0) {
            this.eyeRayTracing(bboxOffsets);
        }

        // initialized photons
        if (frameCount == 0) {
            this.initializePhotons();
        }


        this.debugQuad.drawTex(eyeRayTraceSurface.textures[0].texture.source);

        // this.photonTrace(bboxOffsets);
        //
        // this.buildStochasticHashedGrid();
        //
        // this.writeToHashedGrid();
        //
        // this.photonCorrection();
        //
        // this.radianceEstimation();
        //
        // this.finalGathering();

        // this.debugPass();

        // update
        // gl.finish();
        frameCount++;
        if ((performance.now() - m_nextUpdate) > 0) {
            let numMPaths = (numPhotons + numEyeSamples * imageResolution * imageResolution) / (1024.0 * 1024.0);
            console.log(`${(performance.now() - startedTime) / 1000} sec,  ${numMPaths / ((performance.now() - startedTime) / 1000)} M paths/sec,  ${numMPaths} M paths`);
            m_nextUpdate = performance.now() + 1000;
        }

        requestAnimationFrame(this.render.bind(this));
    }

    distroy() {
        // release the resources of gpurt
        gpurt.release();

        // delete things
        gl.deleteBuffer(fragmentsVBO);

        gl.deleteProgram(shaderDraw);
        gl.deleteProgram(shaderHash);
        gl.deleteProgram(shaderProgressiveUpdate);
        gl.deleteProgram(shaderRadianceEstimate);
        gl.deleteProgram(shaderScatter);
        gl.deleteProgram(shaderCorrection);
        gl.deleteProgram(shaderEyeRayTrace);
        gl.deleteProgram(shaderPhotonTrace);

        gl.deleteProgram(shaderMax);
        gl.deleteProgram(shaderMin);
        gl.deleteProgram(shaderSum);

        gl.deleteTexture(queryPositionTexture);
        gl.deleteTexture(queryNormalTexture);
        queryEmissionPhotonCountTexture.distroy();
        queryFluxRadiusTexture.distroy();
        gl.deleteTexture(queryReflectanceTexture);
        gl.deleteTexture(queryIntersectionTexture);

        gl.deleteTexture(photonIndexTexture);
        photonFluxTexture.distroy();
        photonPositionTexture.distroy();
        photonDirectionTexture.distroy();
        randomPhotonTexture.distroy();
        randomEyeRayTexture.distroy();
        gl.deleteTexture(photonHashTexture);
        gl.deleteTexture(photonCorrectionTexture);
        photonIntersectionTexture.distroy();
        gl.deleteTexture(photonEmittedFlagTexture);

        minMaxAveTextureQuery.distroy();
        minMaxAveSurfaceQuery.distroy();
        minMaxAveTexturePhoton.distroy();
        minMaxAveSurfacePhoton.distroy();

        gl.deleteFramebuffer(photonHashSurface);
        gl.deleteFramebuffer(photonCorrectionSurface);
        gl.deleteFramebuffer(photonIndexSurface);
        gl.deleteFramebuffer(queryPointSurface);
        eyeRayTraceSurface.distroy();
        photonRayTraceSurface.distroy();
        gl.deleteRenderbuffer(photonHashDepthBuffer);

        return 0;
    }

    createTexture(textureIndex, format: GLenum, bufferSize): WebGLTexture {
        gl.activeTexture(gl.TEXTURE0 + textureIndex);
        let texture: WebGLTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, format, bufferSize, bufferSize, 0, gl.RGBA, gl.FLOAT, null);

        return texture;
    }

    setTexture(textureIndex: number, texture: WebGLTexture): WebGLTexture {
        gl.activeTexture(gl.TEXTURE0 + textureIndex);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return texture;
    }

    setCubeTexture(cubeTextureIndex, cubeTexture) {
        gl.activeTexture(gl.TEXTURE0 + cubeTextureIndex);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeTexture);
    }

    setVolumeTexture(volumeTextureIndex, volumeTexture) {
        gl.activeTexture(gl.TEXTURE0 + volumeTextureIndex);
        gl.bindTexture(gl.TEXTURE_3D, volumeTexture);
    }

    randomizeTextures() {
        let tempData: Vector4[] = [];
        // for eye rays
        fillArray(tempData, Vector4, imageResolution * imageResolution);


        this.setTexture(0, randomEyeRayTexture.source);
        for (let j = 0; j < imageResolution; j++) {
            for (let i = 0; i < imageResolution; i++) {
                tempData[i + j * imageResolution] = new Vector4(XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));

        // for photons
        tempData = [];
        fillArray(tempData, Vector4, photonBufferSize * photonBufferSize);

        this.setTexture(0, randomPhotonTexture.source);
        for (let j = 0; j < photonBufferSize; j++) {
            for (let i = 0; i < photonBufferSize; i++) {
                tempData[i + j * photonBufferSize] = new Vector4(XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, photonBufferSize, photonBufferSize, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));
    }

    private initializePhotons() {
        let tempData: Vector4[] = [];
        fillArray(tempData, Vector4, imageResolution * imageResolution);
        // accumulated (unnormalized) flux & radius
        this.setTexture(6, queryFluxRadiusTexture.source);
        for (let j = 0; j < imageResolution; j++) {
            for (let i = 0; i < imageResolution; i++) {
                tempData[i + j * imageResolution] = new Vector4(0.0, 0.0, 0.0, this.initialRadius);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));

        // photon intersection
        tempData = [];
        fillArray(tempData, Vector4, photonBufferSize * photonBufferSize);
        this.setTexture(7, photonIntersectionTexture.source);
        for (let j = 0; j < photonBufferSize; j++) {
            for (let i = 0; i < photonBufferSize; i++) {
                tempData[i + j * photonBufferSize] = new Vector4(-1.0, -1.0, 0.0, 1.0e+30);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, photonBufferSize, photonBufferSize, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));

        numPhotons = 0.0;
    }

    private eyeRayTracing(bboxOffsets: Vector4) {
        // eye ray tracing

        //######################################
        //#      PASS 1 - EYE RAY TRACING      #
        //######################################
        eyeRayTraceSurface.bind();

        gl.useProgram(shaderEyeRayTrace);

        // this.positionAttributeLocation = gl.getAttribLocation(shaderEyeRayTrace, "position");

        // ray tracing parameters
        gl.uniform4f(gl.getUniformLocation(shaderEyeRayTrace, "offsetToBBoxMinMax"), bboxOffsets.x, bboxOffsets.y, bboxOffsets.z, bboxOffsets.w);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "texturePolygons"), 2);
        this.setTexture(2, gpurt.textureTriangles);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "cubeTextureBBoxRootIndices"), 5);
        this.setCubeTexture(5, gpurt.cubeTextureBBoxRootIndices);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "textureBVH"), 6);
        this.setTexture(6, gpurt.textureBVHs);

        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "volumeTextureTextures"), 11);
        this.setVolumeTexture(11, gpurt.volumeTextureTextures);

        // material data
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "textureMaterials"), 10);
        this.setTexture(10, gpurt.textureMaterials);
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
        this.setTexture(0, randomEyeRayTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "queryEmissionPhotonCountTexture"), 1);
        this.setTexture(1, queryEmissionPhotonCountTexture.source);
        gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "focalLength"), focalLength);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "maxPathLength"), maxNumberOfBounces);
        gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "apertureSize"), apertureSize);
        gl.uniform2f(gl.getUniformLocation(shaderEyeRayTrace, "polygonDataStride"), gpurt.polygonDataStride.x, gpurt.polygonDataStride.y);
        gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "numEyeSamples"), numEyeSamples + 1);

        numEyeSamples++;
        this.quad.draw(shaderEyeRayTrace, imageResolution, imageResolution);
        //swap feedback textures
        eyeRayTraceSurface.swap();

        //######################################
        //#         REDUCE TEXTURES            #
        //######################################
        this.bbMax = this.reduceTexture(minMaxAveSurfaceQuery, minMaxAveTextureQuery, queryPositionTexture, shaderMax, imageResolution);
        this.bbMin = this.reduceTexture(minMaxAveSurfaceQuery, minMaxAveTextureQuery, queryPositionTexture, shaderMin, imageResolution);
        let bbSize = 0.0;
        for (let i = 0; i < 3; i++) {
            bbSize += this.bbMax[i] - this.bbMin[i];
        }

        // initial radius estimation
        this.initialRadius = (bbSize / 3.0) / (imageResolution) * initialFootprint;

        // expand the bounding box
        for (let i = 0; i < 3; i++) {
            this.bbMin[i] -= this.initialRadius;
            this.bbMax[i] += this.initialRadius;
        }

        // hashed grid resolution
        this.gridScale = 0.5 / this.initialRadius;
    }

    private photonTrace(bboxOffsets: Vector4) {
        // photon tracing
        //gl.bindFramebuffer(gl.FRAMEBUFFER, photonRayTraceSurface);
        //######################################
        //#     PASS 2 - PHOTON TRACING        #
        //######################################
        photonRayTraceSurface.bind();
        gl.useProgram(shaderPhotonTrace);

        // ray tracing
        gl.uniform4f(gl.getUniformLocation(shaderPhotonTrace, "offsetToBBoxMinMax"), bboxOffsets.x, bboxOffsets.y, bboxOffsets.z, bboxOffsets.w);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "texturePolygons"), 2);
        this.setTexture(2, gpurt.textureTriangles);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "cubeTextureBBoxRootIndices"), 5);
        this.setCubeTexture(5, gpurt.cubeTextureBBoxRootIndices);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "textureBVH"), 6);
        this.setTexture(6, gpurt.textureBVHs);
        gl.uniform2f(gl.getUniformLocation(shaderPhotonTrace, "polygonDataStride"), gpurt.polygonDataStride.x, gpurt.polygonDataStride.y);

        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonIntersectionTexture"), 12);
        this.setTexture(12, photonIntersectionTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonPositionTexture"), 13);
        this.setTexture(13, photonPositionTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonFluxTexture"), 14);
        this.setTexture(14, photonFluxTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonDirectionTexture"), 15);
        this.setTexture(15, photonDirectionTexture.source);

        // brdfs
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "textureMaterials"), 10);
        this.setTexture(10, gpurt.textureMaterials);
        gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "materialStride"), gpurt.materialDataStride);
        gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "materialNumRcp"), 1.0 / (gpurt.mesh.materials.length));

        // material data
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "volumeTextureTextures"), 9);
        this.setVolumeTexture(9, gpurt.volumeTextureTextures);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "textureLightSources"), 11);
        this.setTexture(11, gpurt.textureLightSources);
        gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "lightSourceStride"), 1.0 / gpurt.mesh.lightsCDF.length);
        gl.uniform1f(gl.getUniformLocation(shaderPhotonTrace, "lightSummedArea"), gpurt.mesh.lightsArea);

        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "randomTexture"), 0);
        this.setTexture(0, randomPhotonTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "maxPathLength"), maxNumberOfBounces);

        // for IBL
        let sceneBSphere: Vector4 = new Vector4();
        sceneBSphere.x = (gpurt.mesh.bbox.max.x + gpurt.mesh.bbox.min.x) * 0.5;
        sceneBSphere.y = (gpurt.mesh.bbox.max.y + gpurt.mesh.bbox.min.y) * 0.5;
        sceneBSphere.z = (gpurt.mesh.bbox.max.z + gpurt.mesh.bbox.min.z) * 0.5;
        sceneBSphere.w = gpurt.mesh.bbox.max.sub(gpurt.mesh.bbox.min).length() * 0.5;
        gl.uniform4f(gl.getUniformLocation(shaderPhotonTrace, "sceneBSphere"), sceneBSphere.x, sceneBSphere.y, sceneBSphere.z, sceneBSphere.w);

        this.quad.draw(shaderPhotonTrace, photonBufferSize, photonBufferSize);

        //swap feedback textures
        photonRayTraceSurface.swap();

        let numCurrentEmittedPhotons: Float32Array = this.reduceTexture(minMaxAveSurfacePhoton, minMaxAveTexturePhoton, photonEmittedFlagTexture, shaderSum, photonBufferSize);
        numPhotons += Math.floor(numCurrentEmittedPhotons[0]);
    }

    private buildStochasticHashedGrid() {
        //#############################################
        //#      PASS 3 - STOCHASTIC HASHED GRID      #
        //#############################################
        // build a stochastic hashed grid

        // compute the hash values of the photons
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonIndexSurface);
        gl.useProgram(shaderHash);

        gl.uniform4f(gl.getUniformLocation(shaderHash, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
        gl.uniform1i(gl.getUniformLocation(shaderHash, "hashNum"), hashResolution * hashResolution);
        gl.uniform1f(gl.getUniformLocation(shaderHash, "this.gridScale"), this.gridScale);
        gl.uniform3f(gl.getUniformLocation(shaderHash, "bboxMin"), this.bbMin.x, this.bbMin.y, this.bbMin.z);
        gl.uniform1i(gl.getUniformLocation(shaderHash, "photonPositionTexture"), 10);
        this.setTexture(10, photonPositionTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderHash, "photonFluxTexture"), 11);
        this.setTexture(11, photonFluxTexture.source);
        this.quad.draw(shaderHash, photonBufferSize, photonBufferSize);
    }

    private writeToHashedGrid() {
        //#############################################
        //#      PASS 4 - RND WRITE TO HASHED GRID    #
        //#############################################
        // random write photons into the hashed buffer
        gl.enable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonHashSurface);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(shaderScatter);

        gl.uniform4f(gl.getUniformLocation(shaderScatter, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
        gl.uniform1i(gl.getUniformLocation(shaderScatter, "photonIndexTexture"), 8);
        this.setTexture(8, photonIndexTexture);
        gl.uniform1f(gl.getUniformLocation(shaderScatter, "photonBufferSize"), photonBufferSize);

        let projectionMatrixLocation = gl.getUniformLocation(shaderScatter, "projectionMatrix");
        let modelviewMatrixLocation = gl.getUniformLocation(shaderScatter, "modelviewMatrix");

        gl.uniformMatrix4fv(projectionMatrixLocation, false, this.quad.projectionMatrix);
        gl.uniformMatrix4fv(modelviewMatrixLocation, false, this.quad.modelviewMatrix);

        // gl.matrixMode(gl.PROJECTION);
        // glLoadIdentity();
        // gluOrtho2D(0.0, hashResolution, 0.0, hashResolution);
        // gl.matrixMode(gl.MODELVIEW);
        // glLoadIdentity();

        gl.viewport(0, 0, hashResolution, hashResolution);

        gl.bindBuffer(gl.ARRAY_BUFFER, fragmentsVBO);
        // gl.enableClientState(gl.VERTEX_ARRAY);
        // gl.vertexPointer(2, gl.FLOAT, 0, 0);
        //gl.vertexAttribIPointer(0, 2, gl.INT, 0, 0);
        gl.drawArrays(gl.POINTS, 0, photonBufferSize * photonBufferSize);
        // glDisableClientState(gl.VERTEX_ARRAY);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.disable(gl.DEPTH_TEST);

        // count the number of overlapped photons in the hashed grid
        // - this is necessary to make the estimation unbiased (essentially the Russian roulette technique)
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
    }

    private photonCorrection() {
        //#############################################
        //#      PASS 5 - PHOTON CORRECTION           #
        //#############################################
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonCorrectionSurface);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(shaderCorrection);

        gl.uniform4f(gl.getUniformLocation(shaderCorrection, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
        gl.uniform1i(gl.getUniformLocation(shaderCorrection, "photonIndexTexture"), 8);
        this.setTexture(8, photonIndexTexture);

        // gl.matrixMode(gl.PROJECTION);
        // glLoadIdentity();
        // gluOrtho2D(0.0, hashResolution, 0.0, hashResolution);
        // gl.matrixMode(gl.MODELVIEW);
        // glLoadIdentity();
        gl.viewport(0, 0, hashResolution, hashResolution);

        gl.bindBuffer(gl.ARRAY_BUFFER, fragmentsVBO);
        // gl.enableClientState(gl.VERTEX_ARRAY);
        // glVertexPointer(2, gl.FLOAT, 0, 0);
        // gl.vertexAttribIPointer(0, 2, gl.INT, 0, 0);
        gl.drawArrays(gl.POINTS, 0, photonBufferSize * photonBufferSize);
        // glDisableClientState(gl.VERTEX_ARRAY);
        // gl.bindBuffer(gl.ARRAY_BUFFER, 0);
        gl.disable(gl.BLEND);
    }

    private radianceEstimation() {
        //#############################################
        //#      PASS 6 - RADIANCE ESTIMATION         #
        //#############################################
        // radiance estimation
        // gl.bindFramebuffer(gl.FRAMEBUFFER, queryPointSurface);
        queryPointSurface.bind();
        gl.useProgram(shaderProgressiveUpdate);

        // the maximum hash index
        let hashMax: Vector3 = new Vector3();
        hashMax.x = Math.abs(this.bbMax[0] + this.initialRadius - this.bbMin[0]) * this.gridScale;
        hashMax.y = Math.abs(this.bbMax[1] + this.initialRadius - this.bbMin[1]) * this.gridScale;
        hashMax.z = Math.abs(this.bbMax[2] + this.initialRadius - this.bbMin[2]) * this.gridScale;
        gl.uniform3f(gl.getUniformLocation(shaderProgressiveUpdate, "hashMax"), hashMax.x, hashMax.y, hashMax.z);

        gl.uniform4f(gl.getUniformLocation(shaderProgressiveUpdate, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
        gl.uniform1f(gl.getUniformLocation(shaderProgressiveUpdate, "hashNum"), hashResolution * hashResolution);
        gl.uniform1f(gl.getUniformLocation(shaderProgressiveUpdate, "gridScale"), this.gridScale);
        gl.uniform1f(gl.getUniformLocation(shaderProgressiveUpdate, "alpha"), 0.7);
        gl.uniform3f(gl.getUniformLocation(shaderProgressiveUpdate, "bboxMin"), this.bbMin.x, this.bbMin.y, this.bbMin.z);

        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "hashedPhotonTexture"), 0);
        this.setTexture(0, photonHashTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonCorrectionTexture"), 1);
        this.setTexture(1, photonCorrectionTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryNormalTexture"), 2);
        this.setTexture(2, queryNormalTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryPositionTexture"), 3);
        this.setTexture(3, queryPositionTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryEmissionPhotonCountTexture"), 5);
        this.setTexture(5, queryEmissionPhotonCountTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryFluxRadiusTexture"), 6);
        this.setTexture(6, queryFluxRadiusTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryReflectanceTexture"), 7);
        this.setTexture(7, queryReflectanceTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonFluxTexture"), 9);
        this.setTexture(9, photonFluxTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonPositionTexture"), 10);
        this.setTexture(10, photonPositionTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonDirectionTexture"), 11);
        this.setTexture(11, photonDirectionTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryIntersectionTexture"), 14);
        this.setTexture(14, queryIntersectionTexture);
        this.quad.draw(shaderProgressiveUpdate, imageResolution, imageResolution);

        //swap feedback textures
        queryPointSurface.swap();
    }

    private finalGathering() {
        //#############################################
        //#      PASS 7 - FINAL RENDERING             #
        //#############################################
        // rendering
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(shaderRadianceEstimate);

        gl.uniform1f(gl.getUniformLocation(shaderRadianceEstimate, "totalPhotonNum"), numPhotons);
        gl.uniform1i(gl.getUniformLocation(shaderRadianceEstimate, "queryEmissionPhotonCountTexture"), 5);
        this.setTexture(5, queryEmissionPhotonCountTexture.source);
        gl.uniform1i(gl.getUniformLocation(shaderRadianceEstimate, "queryFluxRadiusTexture"), 6);
        this.setTexture(6, queryFluxRadiusTexture.source);
        this.quad.draw(shaderRadianceEstimate, imageResolution, imageResolution);
    }

    private debugPass() {
        //#############################################
        //#      PASS 8 - DEBUG PHOTON TEXTURE        #
        //#############################################
        // debug output
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(shaderDraw);

        this.setTexture(0, photonHashTexture);
        gl.uniform1i(gl.getUniformLocation(shaderDraw, "input_tex"), 0);
        this.quad.draw(shaderDraw, imageResolution, imageResolution);
    }

    reduceTexture(minMaxAveSurface: FeedBackBuffer, minMaxAveTexture: FeedBackTexture, texture: WebGLTexture, shader: WebGLProgram, resolution: number): Float32Array {
        // this function assumes image resolution = 2^t and the image is a square
        // console.log("reduceTexture");
        //gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurface);

        // this.debugQuad.drawTex(texture, imageResolution, imageResolution);
        // this.debugQuad.drawTex(minMaxAveTexture.target, imageResolution, imageResolution);

        minMaxAveSurface.bind();
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

        gl.uniform1i(gl.getUniformLocation(shader, "inputTexture"), 15);
        this.setTexture(15, texture);

        gl.uniform2f(gl.getUniformLocation(shader, "offset"), textureOffset, textureOffset);
        this.quad.drawWithTex(shader, reducedBufferSize, reducedBufferSize, textureOffset, textureOffset);
        minMaxAveSurface.swap();

        // remaining passes keep reducing minMaxAveTexture
        let numPasses = Math.log((resolution >> level) / Math.log(2.0)) + 1;
        let result: Float32Array = new Float32Array(4);
        for (let i = 0; i < numPasses; i++) {
            level++;
            textureOffset = 1.0 / (1 << level);
            reducedBufferSize = resolution >> level;
            gl.uniform1i(gl.getUniformLocation(shader, "inputTexture"), 15);
            this.setTexture(15, minMaxAveTexture.source);
            gl.uniform2f(gl.getUniformLocation(shader, "offset"), textureOffset, textureOffset);
            this.quad.drawWithTex(shader, reducedBufferSize, reducedBufferSize, textureOffset, textureOffset);

            // make sure that the rendering process is done
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, result);
            minMaxAveSurface.swap();
        }
        return result;
    }

}
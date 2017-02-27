import {CGPURT} from "./gpurt";
import {Vector3, Vector4} from "./vector";
import {fillArray, vec4array_to_f32Array} from "./utils";
import {fs} from "./fs";
import {loadMTL, mtls} from "./obj";
/**
 * Created by Nidin Vinayakan on 24/02/17.
 */

declare const gl: WebGLRenderingContext;

let shaderDraw, shaderHash, shaderEyeRayTrace, shaderPhotonTrace, shaderProgressiveUpdate, shaderRadianceEstimate,
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
let queryEmissionPhotonCountTexture: WebGLTexture;
let queryFluxRadiusTexture: WebGLTexture;
let queryReflectanceTexture: WebGLTexture;
let queryIntersectionTexture: WebGLTexture;

let photonIndexTexture: WebGLTexture;
let photonFluxTexture: WebGLTexture;
let photonPositionTexture: WebGLTexture;
let photonDirectionTexture: WebGLTexture;
let photonHashTexture: WebGLTexture;
let photonCorrectionTexture: WebGLTexture;
let randomPhotonTexture: WebGLTexture;
let randomEyeRayTexture: WebGLTexture;
let photonIntersectionTexture: WebGLTexture;
let photonEmittedFlagTexture1: WebGLTexture;
let photonEmittedFlagTexture2: WebGLTexture;


let eyeRayTraceSurface: WebGLFramebuffer;
let photonRayTraceSurface: WebGLFramebuffer;
let photonIndexSurface: WebGLFramebuffer;
let queryPointSurface: WebGLFramebuffer;
let photonHashSurface: WebGLFramebuffer;
let photonHashDepthBuffer: WebGLRenderbuffer;
let photonCorrectionSurface: WebGLFramebuffer;

let minMaxAveSurfaceQuery: WebGLFramebuffer;
let minMaxAveTextureQuery1: WebGLTexture;
let minMaxAveTextureQuery2: WebGLTexture;
let minMaxAveSurfacePhoton: WebGLFramebuffer;
let minMaxAveTexturePhoton1: WebGLTexture;
let minMaxAveTexturePhoton2: WebGLTexture;

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

    positionAttributeLocation: number;
    texcoordAttributeLocation: number;
    projectionMatrixLocaltion;
    modelviewMatrixLocation;
    projectionMatrix;
    modelviewMatrix;
    vao;
    private indexBuffer: WebGLBuffer;
    private vertexBuffer: WebGLBuffer;
    private texCoordBuffer: WebGLBuffer;
    private quadVertices: Float32Array;
    private quadIndices: Uint32Array;
    private quadTexcoord: Float32Array;

    constructor() {
        this.init();
    }

    init() {

        console.log("MAX_COLOR_ATTACHMENTS:" + gl.getParameter(gl.MAX_COLOR_ATTACHMENTS));
        console.log("MAX_DRAW_BUFFERS:" + gl.getParameter(gl.MAX_DRAW_BUFFERS));
        console.log("MAX_TEXTURE_SIZE:" + gl.getParameter(gl.MAX_TEXTURE_SIZE));
        console.log("MAX_TEXTURE_IMAGE_UNITS:" + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
        console.log("MAX_VERTEX_TEXTURE_IMAGE_UNITS:" + gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS));

        //Extensions
        var ext = gl.getExtension('EXT_color_buffer_float');

        this.projectionMatrix = mat4.create();
        this.modelviewMatrix = mat4.create();

        this.vao = gl.createVertexArray();
        this.quadVertices = new Float32Array([
            -0.5, 0.5, 0.0,
            -0.5, -0.5, 0.0,
            0.5, -0.5, 0.0,
            0.5, 0.5, 0.0
        ]);

        this.quadIndices = new Uint32Array([3, 2, 1, 3, 1, 0]);

        this.quadTexcoord = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0]);

        this.vertexBuffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();
        this.texCoordBuffer = gl.createBuffer();

        // -- vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.quadVertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.positionAttributeLocation);
        let size = 3;          // 2 components per iteration
        let type = gl.FLOAT;   // the data is 32bit floats
        let normalize = false; // don't normalize the data
        let stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        let offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.quadIndices, gl.STATIC_DRAW);

    }

    drawQuad(w, h) {
        // console.log("drawQuad");
        //TODO: Draw using triangles
        // gl.matrixMode(gl.PROJECTION);
        // glLoadIdentity();
        // gluOrtho2D(0.0, w, 0.0, h);
        // gl.matrixMode(gl.MODELVIEW);
        // glLoadIdentity();
        // gl.viewport(0, 0, w, h);

        // glBegin(gl.QUADS);
        // 	g.texCoord2f(0.0, 0.0); glVertex2f(0.0, 0.0);
        // 	g.texCoord2f(1.0, 0.0); glVertex2f(  w, 0.0);
        // 	g.texCoord2f(1.0, 1.0); glVertex2f(  w,   h);
        // 	g.texCoord2f(0.0, 1.0); glVertex2f(0.0,   h);
        // glEnd();

        gl.uniformMatrix4fv(this.projectionMatrixLocaltion, false, this.projectionMatrix);
        gl.uniformMatrix4fv(this.modelviewMatrixLocation, false, this.modelviewMatrix);

        gl.bindVertexArray(this.vao);

        // -- texcoord
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.quadTexcoord, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.texcoordAttributeLocation);
        gl.vertexAttribPointer(this.texcoordAttributeLocation, 2, gl.FLOAT, true, 0, 0);

        /*============= Drawing the Quad ================*/
        gl.clearColor(0.5, 0.5, 0.5, 0.9);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    drawQuadwithTex(w, h, s, t) {
        // console.log("drawQuad+tex");
        //TODO: Draw using triangles
        // glBegin(gl.QUADS);
        // g.texCoord2f(0.0, 0.0); glVertex2f(0.0, 0.0);
        // g.texCoord2f(  s, 0.0); glVertex2f(  w, 0.0);
        // g.texCoord2f(  s,   t); glVertex2f(  w,   h);
        // g.texCoord2f(0.0,   t); glVertex2f(0.0,   h);
        // glEnd();

        gl.bindVertexArray(this.vao);

        // -- texcoord
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            s, 0.0,
            0.0, t,
            0.0, t,
            s, 0.0,
            s, t]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.texcoordAttributeLocation);
        gl.vertexAttribPointer(this.texcoordAttributeLocation, 2, gl.FLOAT, true, 0, 0);

        /*============= Drawing the Quad ================*/
        gl.clearColor(0.5, 0.5, 0.5, 0.9);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    reduceTexture(minMaxAveSurface, minMaxAveTexture1, minMaxAveTexture2, texture, shader, resolution): Float32Array {
        // this function assumes image resolution = 2^t and the image is a square
        // console.log("reduceTexture");
        gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurface);
        gl.useProgram(shader);

        this.positionAttributeLocation = gl.getAttribLocation(shader, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shader, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shader, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shader, "modelviewMatrix");

        // gl.matrixMode(gl.PROJECTION);
        // glLoadIdentity();
        // gluOrtho2D(0.0, resolution, 0.0, resolution);
        // gl.matrixMode(gl.MODELVIEW);
        // glLoadIdentity();

        gl.uniformMatrix4fv(this.projectionMatrixLocaltion, false, this.projectionMatrix);
        gl.uniformMatrix4fv(this.modelviewMatrixLocation, false, this.modelviewMatrix);

        gl.viewport(0, 0, resolution, resolution);

        // first pass reduces and copies texture into minMaxAveTexture
        let level = 1;
        let reducedBufferSize = resolution >> level;
        let textureOffset = 1.0 / (1 << level);

        gl.uniform1i(gl.getUniformLocation(shader, "inputTexture"), 15);

        if(texture instanceof Array){
            this.setTexture(15, texture[1]);
           //gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT5, gl.TEXTURE_2D, texture[1], 0);
        }else{
            this.setTexture(15, texture);
        }
        gl.uniform2f(gl.getUniformLocation(shader, "offset"), textureOffset, textureOffset);
        this.drawQuadwithTex(reducedBufferSize, reducedBufferSize, textureOffset, textureOffset);

        // remaining passes keep reducing minMaxAveTexture
        let numPasses = Math.log((resolution >> level) / Math.log(2.0)) + 1;
        let result: Float32Array = new Float32Array(4);
        for (let i = 0; i < numPasses; i++) {
            level++;
            textureOffset = 1.0 / (1 << level);
            reducedBufferSize = resolution >> level;

            gl.uniform1i(gl.getUniformLocation(shader, "inputTexture"), 15);
            if(i % 2 == 0){
                gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTexture1, 0);
                this.setTexture(15, minMaxAveTexture2);
            } else {
                gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTexture2, 0);
                this.setTexture(15, minMaxAveTexture1);
            }

            gl.uniform2f(gl.getUniformLocation(shader, "offset"), textureOffset, textureOffset);
            this.drawQuadwithTex(reducedBufferSize, reducedBufferSize, textureOffset, textureOffset);

            // make sure that the rendering process is done
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, result);
        }
        return result;
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

        // create textures
        photonHashTexture = this.createTexture(0, gl.RGBA32F, hashResolution);
        photonCorrectionTexture = this.createTexture(1, gl.RGBA32F, hashResolution);

        queryNormalTexture = this.createTexture(2, gl.RGBA32F, imageResolution);
        queryPositionTexture = this.createTexture(3, gl.RGBA32F, imageResolution);
        randomEyeRayTexture = this.createTexture(4, gl.RGBA32F, imageResolution);
        randomPhotonTexture = this.createTexture(4, gl.RGBA32F, photonBufferSize);
        queryEmissionPhotonCountTexture = this.createTexture(5, gl.RGBA32F, imageResolution);
        queryFluxRadiusTexture = this.createTexture(6, gl.RGBA32F, imageResolution);
        queryReflectanceTexture = this.createTexture(7, gl.RGBA32F, imageResolution);

        photonIndexTexture = this.createTexture(8, gl.RGBA32F, photonBufferSize);
        photonFluxTexture = this.createTexture(9, gl.RGBA32F, photonBufferSize);
        photonPositionTexture = this.createTexture(10, gl.RGBA32F, photonBufferSize);
        photonDirectionTexture = this.createTexture(11, gl.RGBA32F, photonBufferSize);

        photonIntersectionTexture = this.createTexture(15, gl.RGBA32F, photonBufferSize);
        photonEmittedFlagTexture1 = this.createTexture(15, gl.RGBA32F, photonBufferSize);
        photonEmittedFlagTexture2 = this.createTexture(17, gl.RGBA32F, photonBufferSize);
        queryIntersectionTexture = this.createTexture(15, gl.RGBA32F, imageResolution);

        // buffer for computing min/max/average
        minMaxAveTextureQuery1 = this.createTexture(12, gl.RGBA32F, imageResolution);
        minMaxAveTextureQuery2 = this.createTexture(16, gl.RGBA32F, imageResolution);
        minMaxAveSurfaceQuery = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurfaceQuery);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTextureQuery1, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        minMaxAveTexturePhoton1 = this.createTexture(12, gl.RGBA32F, photonBufferSize);
        minMaxAveTexturePhoton2 = this.createTexture(16, gl.RGBA32F, photonBufferSize);
        minMaxAveSurfacePhoton = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, minMaxAveSurfacePhoton);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minMaxAveTexturePhoton1, 0);
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
        eyeRayTraceSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, eyeRayTraceSurface);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, queryPositionTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, queryReflectanceTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, queryNormalTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, randomEyeRayTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, queryIntersectionTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT5, gl.TEXTURE_2D, queryEmissionPhotonCountTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // photon data
        photonRayTraceSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonRayTraceSurface);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, photonPositionTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, photonFluxTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, photonDirectionTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, randomPhotonTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, photonIntersectionTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT5, gl.TEXTURE_2D, photonEmittedFlagTexture1, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // measurement points
        queryPointSurface = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, queryPointSurface);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, queryFluxRadiusTexture, 0);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, queryEmissionPhotonCountTexture, 0);
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
            this.setTexture(5, queryEmissionPhotonCountTexture);
            // for (let j = 0; j < imageResolution; j++) {
            //     for (let i = 0; i < imageResolution; i++) {
            //         tempData[i + j * imageResolution] = new Vector4(0.0, 0.0, 0.0, 0.0);
            //     }
            // }
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));
        }

        // balance the cost of eye ray tracing and photon ray tracing
        if ((frameCount % maxNumberOfBounces) == 0) {
            // eye ray tracing
            gl.bindFramebuffer(gl.FRAMEBUFFER, eyeRayTraceSurface);

            gl.useProgram(shaderEyeRayTrace);

            this.positionAttributeLocation = gl.getAttribLocation(shaderEyeRayTrace, "position");
            this.texcoordAttributeLocation = gl.getAttribLocation(shaderEyeRayTrace, "texcoord_0");
            this.projectionMatrixLocaltion = gl.getUniformLocation(shaderEyeRayTrace, "projectionMatrix");
            this.modelviewMatrixLocation = gl.getUniformLocation(shaderEyeRayTrace, "modelviewMatrix");

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
            this.setTexture(0, randomEyeRayTexture);
            gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "queryEmissionPhotonCountTexture"), 1);
            this.setTexture(1, queryEmissionPhotonCountTexture);
            gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "focalLength"), focalLength);
            gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "maxPathLength"), maxNumberOfBounces);
            gl.uniform1f(gl.getUniformLocation(shaderEyeRayTrace, "apertureSize"), apertureSize);
            gl.uniform2f(gl.getUniformLocation(shaderEyeRayTrace, "polygonDataStride"), gpurt.polygonDataStride.x, gpurt.polygonDataStride.y);
            gl.uniform1i(gl.getUniformLocation(shaderEyeRayTrace, "numEyeSamples"), numEyeSamples + 1);

            numEyeSamples++;
            this.drawQuad(imageResolution, imageResolution);
            this.bbMax = this.reduceTexture(minMaxAveSurfaceQuery, minMaxAveTextureQuery1, minMaxAveTextureQuery2, queryPositionTexture, shaderMax, imageResolution);
            this.bbMin = this.reduceTexture(minMaxAveSurfaceQuery, minMaxAveTextureQuery1, minMaxAveTextureQuery2, queryPositionTexture, shaderMin, imageResolution);
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


        // initialized photons
        if (frameCount == 0) {
            let tempData: Vector4[] = [];
            fillArray(tempData, Vector4, imageResolution * imageResolution);

            // for (let j = 0; j < imageResolution; j++) {
            //     for (let i = 0; i < imageResolution; i++) {
            //         tempData[i + j * imageResolution] = new Vector4(0.0, 0.0, 0.0, 0.0);
            //     }
            // }

            // accumulated (unnormalized) flux & radius
            this.setTexture(6, queryFluxRadiusTexture);
            for (let j = 0; j < imageResolution; j++) {
                for (let i = 0; i < imageResolution; i++) {
                    tempData[i + j * imageResolution] = new Vector4(0.0, 0.0, 0.0, this.initialRadius);
                }
            }
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));

            // photon intersection
            tempData = [];
            fillArray(tempData, Vector4, photonBufferSize * photonBufferSize);
            this.setTexture(7, photonIntersectionTexture);
            for (let j = 0; j < photonBufferSize; j++) {
                for (let i = 0; i < photonBufferSize; i++) {
                    tempData[i + j * photonBufferSize] = new Vector4(-1.0, -1.0, 0.0, 1.0e+30);
                }
            }
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, photonBufferSize, photonBufferSize, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));

            numPhotons = 0.0;
        }


        // photon tracing
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonRayTraceSurface);
        gl.useProgram(shaderPhotonTrace);

        this.positionAttributeLocation = gl.getAttribLocation(shaderPhotonTrace, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shaderPhotonTrace, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shaderPhotonTrace, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shaderPhotonTrace, "modelviewMatrix");

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
        this.setTexture(12, photonIntersectionTexture);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonPositionTexture"), 13);
        this.setTexture(13, photonPositionTexture);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonFluxTexture"), 14);
        this.setTexture(14, photonFluxTexture);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "photonDirectionTexture"), 15);
        this.setTexture(15, photonDirectionTexture);

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
        this.setTexture(0, randomPhotonTexture);
        gl.uniform1i(gl.getUniformLocation(shaderPhotonTrace, "maxPathLength"), maxNumberOfBounces);

        // for IBL
        let sceneBSphere: Vector4 = new Vector4();
        sceneBSphere.x = (gpurt.mesh.bbox.max.x + gpurt.mesh.bbox.min.x) * 0.5;
        sceneBSphere.y = (gpurt.mesh.bbox.max.y + gpurt.mesh.bbox.min.y) * 0.5;
        sceneBSphere.z = (gpurt.mesh.bbox.max.z + gpurt.mesh.bbox.min.z) * 0.5;
        sceneBSphere.w = gpurt.mesh.bbox.max.sub(gpurt.mesh.bbox.min).length() * 0.5;
        gl.uniform4f(gl.getUniformLocation(shaderPhotonTrace, "sceneBSphere"), sceneBSphere.x, sceneBSphere.y, sceneBSphere.z, sceneBSphere.w);

        this.drawQuad(photonBufferSize, photonBufferSize);
        let numCurrentEmittedPhotons: Float32Array = this.reduceTexture(
            minMaxAveSurfacePhoton, minMaxAveTexturePhoton1, minMaxAveTexturePhoton2,
            [photonEmittedFlagTexture1, photonEmittedFlagTexture2], shaderSum, photonBufferSize
        );
        numPhotons += Math.floor(numCurrentEmittedPhotons[0]);


        // build a stochastic hashed grid

        // compute the hash values of the photons
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonIndexSurface);
        gl.useProgram(shaderHash);

        this.positionAttributeLocation = gl.getAttribLocation(shaderHash, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shaderHash, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shaderHash, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shaderHash, "modelviewMatrix");

        gl.uniform4f(gl.getUniformLocation(shaderHash, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
        gl.uniform1i(gl.getUniformLocation(shaderHash, "hashNum"), hashResolution * hashResolution);
        gl.uniform1f(gl.getUniformLocation(shaderHash, "this.gridScale"), this.gridScale);
        gl.uniform3f(gl.getUniformLocation(shaderHash, "bboxMin"), this.bbMin.x, this.bbMin.y, this.bbMin.z);
        gl.uniform1i(gl.getUniformLocation(shaderHash, "photonPositionTexture"), 10);
        this.setTexture(10, photonPositionTexture);
        gl.uniform1i(gl.getUniformLocation(shaderHash, "photonFluxTexture"), 11);
        this.setTexture(11, photonFluxTexture);
        this.drawQuad(photonBufferSize, photonBufferSize);


        // random write photons into the hashed buffer
        gl.enable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonHashSurface);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(shaderScatter);

        this.positionAttributeLocation = gl.getAttribLocation(shaderScatter, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shaderScatter, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shaderScatter, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shaderScatter, "modelviewMatrix");

        gl.uniform4f(gl.getUniformLocation(shaderScatter, "bufInfo"), hashResolution, hashResolution, 1.0 / (hashResolution), 1.0 / (hashResolution));
        gl.uniform1i(gl.getUniformLocation(shaderScatter, "photonIndexTexture"), 8);
        this.setTexture(8, photonIndexTexture);
        gl.uniform1f(gl.getUniformLocation(shaderScatter, "photonBufferSize"), photonBufferSize);

        // gl.matrixMode(gl.PROJECTION);
        // glLoadIdentity();
        // gluOrtho2D(0.0, hashResolution, 0.0, hashResolution);
        // gl.matrixMode(gl.MODELVIEW);
        // glLoadIdentity();

        gl.uniformMatrix4fv(this.projectionMatrixLocaltion, false, this.projectionMatrix);
        gl.uniformMatrix4fv(this.modelviewMatrixLocation, false, this.modelviewMatrix);

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
        gl.bindFramebuffer(gl.FRAMEBUFFER, photonCorrectionSurface);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(shaderCorrection);

        this.positionAttributeLocation = gl.getAttribLocation(shaderCorrection, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shaderCorrection, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shaderCorrection, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shaderCorrection, "modelviewMatrix");

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


        // radiance estimation
        gl.bindFramebuffer(gl.FRAMEBUFFER, queryPointSurface);
        gl.useProgram(shaderProgressiveUpdate);

        this.positionAttributeLocation = gl.getAttribLocation(shaderProgressiveUpdate, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shaderProgressiveUpdate, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shaderProgressiveUpdate, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shaderProgressiveUpdate, "modelviewMatrix");

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
        this.setTexture(5, queryEmissionPhotonCountTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryFluxRadiusTexture"), 6);
        this.setTexture(6, queryFluxRadiusTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryReflectanceTexture"), 7);
        this.setTexture(7, queryReflectanceTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonFluxTexture"), 9);
        this.setTexture(9, photonFluxTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonPositionTexture"), 10);
        this.setTexture(10, photonPositionTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "photonDirectionTexture"), 11);
        this.setTexture(11, photonDirectionTexture);
        gl.uniform1i(gl.getUniformLocation(shaderProgressiveUpdate, "queryIntersectionTexture"), 14);
        this.setTexture(14, queryIntersectionTexture);
        this.drawQuad(imageResolution, imageResolution);


        // rendering
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(shaderRadianceEstimate);

        this.positionAttributeLocation = gl.getAttribLocation(shaderRadianceEstimate, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shaderRadianceEstimate, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shaderRadianceEstimate, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shaderRadianceEstimate, "modelviewMatrix");

        gl.uniform1f(gl.getUniformLocation(shaderRadianceEstimate, "totalPhotonNum"), numPhotons);
        gl.uniform1i(gl.getUniformLocation(shaderRadianceEstimate, "queryEmissionPhotonCountTexture"), 5);
        this.setTexture(5, queryEmissionPhotonCountTexture);
        gl.uniform1i(gl.getUniformLocation(shaderRadianceEstimate, "queryFluxRadiusTexture"), 6);
        this.setTexture(6, queryFluxRadiusTexture);
        this.drawQuad(imageResolution, imageResolution);

        // debug output
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(shaderDraw);

        this.positionAttributeLocation = gl.getAttribLocation(shaderDraw, "position");
        this.texcoordAttributeLocation = gl.getAttribLocation(shaderDraw, "texcoord_0");
        this.projectionMatrixLocaltion = gl.getUniformLocation(shaderDraw, "projectionMatrix");
        this.modelviewMatrixLocation = gl.getUniformLocation(shaderDraw, "modelviewMatrix");

        this.setTexture(0, photonHashTexture);
        gl.uniform1i(gl.getUniformLocation(shaderDraw, "input_tex"), 0);
        this.drawQuad(imageResolution, imageResolution);

        // update
        gl.finish();
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
        gl.deleteTexture(queryEmissionPhotonCountTexture);
        gl.deleteTexture(queryFluxRadiusTexture);
        gl.deleteTexture(queryReflectanceTexture);
        gl.deleteTexture(queryIntersectionTexture);

        gl.deleteTexture(photonIndexTexture);
        gl.deleteTexture(photonFluxTexture);
        gl.deleteTexture(photonPositionTexture);
        gl.deleteTexture(photonDirectionTexture);
        gl.deleteTexture(randomPhotonTexture);
        gl.deleteTexture(randomEyeRayTexture);
        gl.deleteTexture(photonHashTexture);
        gl.deleteTexture(photonCorrectionTexture);
        gl.deleteTexture(photonIntersectionTexture);
        gl.deleteTexture(photonEmittedFlagTexture1);
        gl.deleteTexture(photonEmittedFlagTexture2);

        gl.deleteTexture(minMaxAveTextureQuery1);
        gl.deleteTexture(minMaxAveTextureQuery2);
        gl.deleteFramebuffer(minMaxAveSurfaceQuery);
        gl.deleteTexture(minMaxAveTexturePhoton1);
        gl.deleteTexture(minMaxAveTexturePhoton2);
        gl.deleteFramebuffer(minMaxAveSurfacePhoton);

        gl.deleteFramebuffer(photonHashSurface);
        gl.deleteFramebuffer(photonCorrectionSurface);
        gl.deleteFramebuffer(photonIndexSurface);
        gl.deleteFramebuffer(queryPointSurface);
        gl.deleteFramebuffer(eyeRayTraceSurface);
        gl.deleteFramebuffer(photonRayTraceSurface);
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


        this.setTexture(0, randomEyeRayTexture);
        for (let j = 0; j < imageResolution; j++) {
            for (let i = 0; i < imageResolution; i++) {
                tempData[i + j * imageResolution] = new Vector4(XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, imageResolution, imageResolution, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));

        // for photons
        tempData = [];
        fillArray(tempData, Vector4, photonBufferSize * photonBufferSize);

        this.setTexture(0, randomPhotonTexture);
        for (let j = 0; j < photonBufferSize; j++) {
            for (let i = 0; i < photonBufferSize; i++) {
                tempData[i + j * photonBufferSize] = new Vector4(XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0, XORShift.m_frand() * 4194304.0);
            }
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, photonBufferSize, photonBufferSize, gl.RGBA, gl.FLOAT, vec4array_to_f32Array(tempData));
    }


}
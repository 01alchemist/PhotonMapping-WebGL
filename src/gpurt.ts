import {Vector3, Vector2, Vector4} from "./vector";
import {Material, Mesh} from "./mesh";
import {Camera} from "./camera";
import {BVH} from "./bvh";
import {fillArray, vec4array_to_f32Array} from "./utils";
/**
 * Created by nidin on 2017-02-24.
 */

declare const gl: WebGLRenderingContext;

export class BBoxGPU {
    constructor(public min: Vector3 = new Vector3(), public max: Vector3 = new Vector3(),
                public  hit: Vector2 = new Vector2(), public miss: Vector2 = new Vector2(),
                public tri: number = 0) {

    }
}


// GPURT class
export class CGPURT {

    // textures
    textureTriangles:WebGLTexture;
    textureBVHs:WebGLTexture;
    volumeTextureTextures:WebGLTexture;

    cubeTextureBBoxRootIndices:WebGLTexture;
    textureMaterials:WebGLTexture;
    materialDataStride:number;
    textureLightSources:WebGLTexture;
    polygonDataStride: Vector2;
    bboxDataSizeX:number;
    bboxDataSizeY:number;

    mesh: Mesh;
    camera: Camera;

    private bvh: BVH;

    constructor() {

        this.camera = new Camera();
        this.mesh = new Mesh();
        this.bvh = new BVH();
        this.textureTriangles = null;
        this.textureBVHs = null;

        this.textureMaterials = null;
        this.textureLightSources = null;
        this.volumeTextureTextures = null;

        this.cubeTextureBBoxRootIndices = null;
    }


    precalculateMeshData() {
        gl.deleteTexture(this.cubeTextureBBoxRootIndices);
        gl.deleteTexture(this.textureBVHs);
        gl.deleteTexture(this.textureTriangles);

        this.buildBVH();
        this.createTextures();
    }


    createTexture(textureIndex, format, width, height):WebGLTexture {
        gl.activeTexture(gl.TEXTURE0 + textureIndex);
        let texture:WebGLTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, gl.LUMINANCE, gl.FLOAT, null);

        return texture;
    }

    createTextures() {
        let k;

        const numTriangles = this.mesh.triangles.length;
        let triangleTexcoord: Vector2[] = []; //(numTriangles);
        fillArray(triangleTexcoord, Vector2, numTriangles);

        let polyDataSizeX = Math.floor(Math.sqrt(numTriangles * 6.0) + 1.0);
        let polyDataSizeY = polyDataSizeX;

        this.polygonDataStride.x = 1.0 / polyDataSizeX;
        this.polygonDataStride.y = 1.0 / polyDataSizeY;


        // --------------- creating textures for positions ---------------
        let polyTexSys:Vector4[] = [];//new Vector4[polyDataSizeX * polyDataSizeY];
        fillArray(polyTexSys, Vector4, polyDataSizeX * polyDataSizeY);

        this.textureTriangles = this.createTexture(0, gl.RGBA32F, polyDataSizeX, polyDataSizeY);


        k = 0;
        while (k < (numTriangles * 6)) {
            let p = k / 6;
            let i = k % polyDataSizeX;
            let j = k / polyDataSizeX;
            triangleTexcoord[p].x = (i + 0.5) / polyDataSizeX;
            triangleTexcoord[p].y = (j + 0.5) / polyDataSizeY;

            for (let v = 0; v <= 2; v++) {
                polyTexSys[k].x = this.mesh.triangles[p].positions[v].x;
                polyTexSys[k].y = this.mesh.triangles[p].positions[v].y;
                polyTexSys[k].z = this.mesh.triangles[p].positions[v].z;
                polyTexSys[k].w = this.mesh.triangles[p].texcoords[v].x;
                k++;
            }

            for (let v = 0; v <= 2; v++) {
                polyTexSys[k].x = this.mesh.triangles[p].normals[v].x;
                polyTexSys[k].y = this.mesh.triangles[p].normals[v].y;
                polyTexSys[k].z = sgn(this.mesh.triangles[p].normals[v].z) * (this.mesh.triangles[p].idMaterial + 1);
                polyTexSys[k].w = this.mesh.triangles[p].texcoords[v].y;
                k++;
            }

        }

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, polyDataSizeX, polyDataSizeY, 0, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(polyTexSys));

        // --------------- material data ---------------
        if (this.mesh.materials.length == 0) {
            // no material data found, use the default
            this.mesh.materials = [new Material()];
            this.mesh.materials[0].color = new Vector3(0.5, 0.5, 0.5);
            this.mesh.materials[0].brdf = 0;
            this.mesh.materials[0].eta = 1.0;
        }

        let materialDataNumVec4s = 2;
        // (vec3(r,g,b), 0.0)
        // (BRDF, eta, vec2(0.0))
        this.materialDataStride = 1.0 / this.mesh.materials.length;
        let materialTexSys:Vector4[] = [];//new Vector4[this.mesh.materials.length * materialDataNumVec4s];
        fillArray(materialTexSys, Vector4, this.mesh.materials.length * materialDataNumVec4s);

        this.textureMaterials = this.createTexture(6, gl.RGBA32F, this.mesh.materials.length * materialDataNumVec4s, 1);
        k = 0;
        for (let i = 0; i <= this.mesh.materials.length - 1; i++) {
            materialTexSys[k].x = this.mesh.materials[i].color.x;
            materialTexSys[k].y = this.mesh.materials[i].color.y;
            materialTexSys[k].z = this.mesh.materials[i].color.z;
            materialTexSys[k].w = this.mesh.materials[i].eta;
            k++;

            materialTexSys[k].x = this.mesh.materials[i].brdf;
            materialTexSys[k].y = this.mesh.materials[i].specularity;
            materialTexSys[k].z = 0.0;
            materialTexSys[k].w = 0.0;
            k++;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.mesh.materials.length * materialDataNumVec4s, 1, 0, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(materialTexSys));

        // --------------- light source data ---------------
        if (this.mesh.lightsCDF.length > 0) {
            let lightSourcesTexSys:Vector4[] = [];//new Vector4[this.mesh.lightsCDF.length];
            fillArray(lightSourcesTexSys,  Vector4, this.mesh.lightsCDF.length);

            this.textureLightSources = this.createTexture(6, gl.RGBA32F, this.mesh.lightsCDF.length, 1);
            k = 0;
            for (let i = 0; i <= this.mesh.lightsCDF.length - 1; i++) {
                lightSourcesTexSys[k].x = triangleTexcoord[this.mesh.lightsIndices[i]].x;
                lightSourcesTexSys[k].y = triangleTexcoord[this.mesh.lightsIndices[i]].y;
                lightSourcesTexSys[k].z = this.mesh.lightsCDF[i];
                lightSourcesTexSys[k].w = 0.0;
                k++;
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.mesh.lightsCDF.length, 1, 0, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(lightSourcesTexSys));
        }

        gl.enable(gl.TEXTURE_3D);
        gl.activeTexture(gl.TEXTURE0);
        this.volumeTextureTextures = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, this.volumeTextureTextures);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);

        // resampling textures into fixed resolution to simplify the implementation (not absolutely necessary)
        const texRes = 512;
        let volumeTextureTexturesSys = new Uint8Array(texRes * texRes * this.mesh.materials.length * 3);

        for (let z = 0; z < this.mesh.materials.length; z++) {
            for (let y = 0; y < texRes; y++) {
                for (let x = 0; x < texRes; x++) {
                    const dst = 3 * (x + y * texRes + z * texRes * texRes);
                    const src = 3 * ((x * this.mesh.materials[z].textureWidth / texRes) + (y * this.mesh.materials[z].textureHeight / texRes) * this.mesh.materials[z].textureWidth);
                    if (this.mesh.materials[z].isTextured) {
                        volumeTextureTexturesSys[dst] = this.mesh.materials[z].texture[src];
                        volumeTextureTexturesSys[dst + 1] = this.mesh.materials[z].texture[src + 1];
                        volumeTextureTexturesSys[dst + 2] = this.mesh.materials[z].texture[src + 2];
                    }
                    else {
                        volumeTextureTexturesSys[dst] = 255;
                        volumeTextureTexturesSys[dst + 1] = 0;
                        volumeTextureTexturesSys[dst + 2] = 255;
                    }
                }
            }
        }

        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, texRes, texRes, this.mesh.materials.length, 0, gl.RGB, gl.UNSIGNED_BYTE, volumeTextureTexturesSys);
        //volumeTextureTexturesSys.clear();

        // --------------- recording texture coordinates for each bounding box data ---------------
        let bboxNum = this.bvh.nodesNum;
        let bbox: Array<BBoxGPU[]> = [];
        let bboxTexCoord: Array<Vector2[]> = [];

        for (let kk = 0; kk <= 5; kk++) {
            bbox[kk] = [];
            fillArray(bbox[kk], BBoxGPU, bboxNum);
            bboxTexCoord[kk] = [];
            fillArray(bboxTexCoord[kk], Vector2, bboxNum);
        }


        this.bboxDataSizeX = Math.floor(Math.sqrt(bboxNum) + 1.0);
        this.bboxDataSizeY = this.bboxDataSizeX;

        // root selector
        gl.enable(gl.TEXTURE_CUBE_MAP);
        gl.activeTexture(gl.TEXTURE0);
        this.cubeTextureBBoxRootIndices = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTextureBBoxRootIndices);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        for (let i = 0; i < 6; i++) {
            let vData = new Vector4();
            if (i == 0) {
                vData.x = ((this.bboxDataSizeX * 0.5) / (this.bboxDataSizeX * 2.0));
                vData.y = ((this.bboxDataSizeY * 0.5) / (this.bboxDataSizeY * 4.0));
                vData.z = (-1.0);
                vData.w = (-1.0);
            }
            else if (i == 1) {
                vData.x = ((this.bboxDataSizeX * 1.5) / (this.bboxDataSizeX * 2.0));
                vData.y = ((this.bboxDataSizeY * 0.5) / (this.bboxDataSizeY * 4.0));
                vData.z = (-1.0);
                vData.w = (-1.0);
            }
            else if (i == 2) {
                vData.x = ((this.bboxDataSizeX * 0.5) / (this.bboxDataSizeX * 2.0));
                vData.y = ((this.bboxDataSizeY * 1.5) / (this.bboxDataSizeY * 4.0));
                vData.z = (-1.0);
                vData.w = (-1.0);
            }
            else if (i == 3) {
                vData.x = ((this.bboxDataSizeX * 1.5) / (this.bboxDataSizeX * 2.0));
                vData.y = ((this.bboxDataSizeY * 1.5) / (this.bboxDataSizeY * 4.0));
                vData.z = (-1.0);
                vData.w = (-1.0);
            }
            else if (i == 4) {
                vData.x = ((this.bboxDataSizeX * 0.5) / (this.bboxDataSizeX * 2.0));
                vData.y = ((this.bboxDataSizeY * 2.5) / (this.bboxDataSizeY * 4.0));
                vData.z = (-1.0);
                vData.w = (-1.0);
            }
            else {
                vData.x = ((this.bboxDataSizeX * 1.5) / (this.bboxDataSizeX * 2.0));
                vData.y = ((this.bboxDataSizeY * 2.5) / (this.bboxDataSizeY * 4.0));
                vData.z = (-1.0);
                vData.w = (-1.0);
            }

            gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA32F, gl.FLOAT, vData.glData);
        }


        // --------------- record min, max, hit, miss and index of triangle ---------------
        // recording 2D texture coordinates
        let cOffSetX, cOffSetY;
        for (let kk = 0; kk <= 5; kk++) {
            if (kk == 0) {
                cOffSetX = 0;
                cOffSetY = 0;
            }
            else if (kk == 1) {
                cOffSetX = this.bboxDataSizeX * 1;
                cOffSetY = 0;
            }
            else if (kk == 2) {
                cOffSetX = 0;
                cOffSetY = this.bboxDataSizeY * 1;
            }
            else if (kk == 3) {
                cOffSetX = this.bboxDataSizeX * 1;
                cOffSetY = this.bboxDataSizeY * 1;
            }
            else if (kk == 4) {
                cOffSetX = 0;
                cOffSetY = this.bboxDataSizeY * 2;
            }
            else {
                cOffSetX = this.bboxDataSizeX * 1;
                cOffSetY = this.bboxDataSizeY * 2;
            }

            // generate bbox texture coordinates
            k = 0;
            for (let j = 0; j <= this.bboxDataSizeY - 1; j++) {
                for (let i = 0; i <= this.bboxDataSizeX - 1; i++) {
                    if (k < bboxNum) {
                        bboxTexCoord[kk][k].x = (i + cOffSetX + 0.5) / (this.bboxDataSizeX * 2.0);
                        bboxTexCoord[kk][k].y = (j + cOffSetY + 0.5) / (this.bboxDataSizeY * 4.0);
                    }
                    k++;
                }
            }

            for (let i = 0; i <= bboxNum - 1; i++) {
                // --------------- the canonical BVH ---------------
                bbox[kk][i].min = this.bvh.nodes[kk][i].bbox.min;
                bbox[kk][i].max = this.bvh.nodes[kk][i].bbox.max;

                if ((i + 1) >= bboxNum) {
                    bbox[kk][i].hit = new Vector2(-1.0, -1.0);
                }
                else {
                    bbox[kk][i].hit = bboxTexCoord[kk][i + 1];
                }

                bbox[kk][i].tri = -1;
                if (this.bvh.nodes[kk][i].isLeaf) {
                    if (this.bvh.nodes[kk][i].idTriangle != -1) {
                        bbox[kk][i].tri = this.bvh.nodes[kk][i].idTriangle;
                    }
                    else {
                        bbox[kk][i].tri = -1;
                    }
                }

                if ((this.bvh.nodes[kk][i].idMiss == -1) || (this.bvh.nodes[kk][i].idMiss >= bboxNum)) {
                    bbox[kk][i].miss = new Vector2(-1.0, -1.0);
                }
                else {
                    bbox[kk][i].miss = bboxTexCoord[kk][this.bvh.nodes[kk][i].idMiss];
                }

                // --------------- other BVHs ---------------
                if (kk != 0) {
                    bbox[kk][i].min = this.bvh.nodes[0][i].bbox.min;
                    bbox[kk][i].max = this.bvh.nodes[0][i].bbox.max;

                    if ((i + 1) >= bboxNum) {
                        bbox[kk][i].hit = new Vector2(-1.0, -1.0);
                    }
                    else {
                        bbox[kk][i].hit = bboxTexCoord[kk][this.bvh.nodes[kk][i + 1].idBase];
                    }

                    bbox[kk][i].tri = -1;
                    if (this.bvh.nodes[0][i].isLeaf) {
                        if (this.bvh.nodes[0][i].idTriangle != -1) {
                            bbox[kk][i].tri = this.bvh.nodes[0][i].idTriangle;
                        }
                        else {
                            bbox[kk][i].tri = -1;
                        }
                    }

                    if ((this.bvh.nodes[kk][i].idMiss == -1) || (this.bvh.nodes[kk][i].idMiss >= bboxNum)) {
                        bbox[kk][i].miss = new Vector2(-1.0, -1.0);
                    }
                    else {
                        bbox[kk][i].miss = bboxTexCoord[kk][this.bvh.nodes[kk][this.bvh.nodes[kk][i].idMiss].idBase];
                    }
                }

            }
        }
        // --------------------------------------------------


        // --------------- write textures for BVH (min and max, hit and miss) ---------------
        // note that the size of the texture is (bboxDataSizeX * 2, bboxDataSizeY * 4)
        let textureBVHSys:Vector4[] = [];//new Vector4[(this.bboxDataSizeX * 2) * (this.bboxDataSizeY * 4)];
        fillArray(textureBVHSys, Vector4, (this.bboxDataSizeX * 2) * (this.bboxDataSizeY * 4));

        this.textureBVHs = this.createTexture(7, gl.RGBA32F, this.bboxDataSizeX * 2, this.bboxDataSizeY * 4);

        let temp_bbox_index:Int32Array = new Int32Array(bboxNum);

        // --------------- for all BVHs ---------------
        for (let kk = 0; kk <= 5; kk++) {
            // calculate index to the canonical BVH data
            for (let i = 0; i <= bboxNum - 1; i++) {
                temp_bbox_index[this.bvh.nodes[kk][i].idBase] = i;
            }

            // --------------- add offset for each BVH data ---------------
            k = 0;
            let bbhitmiss = 0;


            if (kk == 0) {
                bbhitmiss = 0;
            }
            else if (kk == 1) {
                bbhitmiss = this.bboxDataSizeX;
            }
            else if (kk == 2) {
                bbhitmiss = (this.bboxDataSizeX * 2) * this.bboxDataSizeY;
            }
            else if (kk == 3) {
                bbhitmiss = (this.bboxDataSizeX * 2) * this.bboxDataSizeY + this.bboxDataSizeX;
            }
            else if (kk == 4) {
                bbhitmiss = (this.bboxDataSizeX * 2) * this.bboxDataSizeY * 2;
            }
            else if (kk == 5) {
                bbhitmiss = (this.bboxDataSizeX * 2) * this.bboxDataSizeY * 2 + this.bboxDataSizeX;
            }

            // --------------- write hit and miss links ---------------
            for (let j = 0; j <= this.bboxDataSizeY - 1; j++) {
                for (let i = 0; i <= this.bboxDataSizeX - 1; i++) {
                    if (k < bboxNum) {
                        textureBVHSys[bbhitmiss].x = (bbox[kk][temp_bbox_index[k]].hit.x);
                        textureBVHSys[bbhitmiss].y = (bbox[kk][temp_bbox_index[k]].hit.y);
                        textureBVHSys[bbhitmiss].z = (bbox[kk][temp_bbox_index[k]].miss.y);
                        textureBVHSys[bbhitmiss].w = (bbox[kk][temp_bbox_index[k]].miss.x);
                    }

                    bbhitmiss++;
                    k++;
                }
                // skip to the correct next scanline
                bbhitmiss = bbhitmiss + this.bboxDataSizeX;
            }
        }


        // --------------- write bounding box min and x coordinates of triangle index ---------------
        k = 0;
        let bbhitmiss = (this.bboxDataSizeX * 2) * this.bboxDataSizeY * 3;

        for (let j = 0; j <= this.bboxDataSizeY - 1; j++) {
            for (let i = 0; i <= this.bboxDataSizeX - 1; i++) {
                textureBVHSys[bbhitmiss] = new Vector4(-1, -1, -1, 0);
                if (k < bboxNum) {
                    textureBVHSys[bbhitmiss].x = (bbox[0][k].min.x);
                    textureBVHSys[bbhitmiss].y = (bbox[0][k].min.y);
                    textureBVHSys[bbhitmiss].z = (bbox[0][k].min.z);
                    if (bbox[0][k].tri != -1) {
                        textureBVHSys[bbhitmiss].w = (triangleTexcoord[bbox[0][k].tri].x);
                    }
                    else {
                        textureBVHSys[bbhitmiss].w = (-1.0);
                    }
                }
                bbhitmiss++;
                k++;
            }
            bbhitmiss = bbhitmiss + this.bboxDataSizeX * 1;
        }


        // --------------- write bounding box max and y coordinates of triangle index ---------------
        k = 0;
        bbhitmiss = (this.bboxDataSizeX * 2) * this.bboxDataSizeY * 3 + this.bboxDataSizeX;

        for (let j = 0; j <= this.bboxDataSizeY - 1; j++) {
            for (let i = 0; i <= this.bboxDataSizeX - 1; i++) {
                textureBVHSys[bbhitmiss] = new Vector4(1, 1, 1, 0);
                if (k < bboxNum) {
                    textureBVHSys[bbhitmiss].x = (bbox[0][k].max.x);
                    textureBVHSys[bbhitmiss].y = (bbox[0][k].max.y);
                    textureBVHSys[bbhitmiss].z = (bbox[0][k].max.z);
                    if (bbox[0][k].tri != -1) {
                        textureBVHSys[bbhitmiss].w = (triangleTexcoord[bbox[0][k].tri].y);
                    }
                    else {
                        textureBVHSys[bbhitmiss].w = (-1.0);
                    }
                }
                bbhitmiss++;
                k++;
            }
            bbhitmiss = bbhitmiss + this.bboxDataSizeX * 1;
        }

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.bboxDataSizeX * 2, this.bboxDataSizeY * 4, 0, gl.RGBA32F, gl.FLOAT, vec4array_to_f32Array(textureBVHSys));
    }


    buildBVH() {
        this.bvh.build(this.mesh);
    }


    release() {
        gl.deleteTexture(this.textureBVHs);
        gl.deleteTexture(this.volumeTextureTextures);

        this.mesh.release();

        gl.deleteTexture(this.textureTriangles);
        gl.deleteTexture(this.cubeTextureBBoxRootIndices);
        gl.deleteTexture(this.textureMaterials);
        gl.deleteTexture(this.textureLightSources);
    }
}


function sgn(v) {
    if (v > 0.0) {
        return 1.0;
    }
    else {
        return -1.0;
    }
}
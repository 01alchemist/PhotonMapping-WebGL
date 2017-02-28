// import {parseOBJ, Vector3} from "xray";
// import {xray, parseOBJ} from "xray";
// import {mtls, parseOBJ, loadMTL, Mesh, Vector3} from "../src/xray";
import {mtls, loadMTL, parseOBJ} from "../src/obj";
import {Mesh} from "../src/mesh";
import {Vector3} from "../src/vector";
import {fs} from "../src/fs";
import {PhotonMapper} from "../src/PhotonMapper";
/**
 * Created by Nidin Vinayakan on 23/02/17.
 */
export class PhotonMapperTest {

    mapper: PhotonMapper;

    constructor() {

        this.load(() => {
            console.log("done");
            this.mapper = new PhotonMapper();
            this.mapper.run();
        });

    }

    load(callback) {

        let filesToLoad = [
            // {src: "textures/debug_texture.jpg", name:"debug_texture.jpg", type: "image"},
            {src: "models/cornell_metal.obj", name:"cornell_metal.obj", type: "text"},
            {src: "models/cornell_metal.mtl", name:"cornell_metal.mtl", type: "text"},
            {src: "models/stanford-dragon/stanford-dragon.obj", name:"models/stanford-dragon.obj", type: "text"},
            {src: "models/stanford-dragon/stanford-dragon.mtl", name:"models/stanford-dragon.mtl", type: "text"},
            {src: "../src/shaders/correction.fs", name:"correction.fs", type: "text"},
            {src: "../src/shaders/correction.vs", name:"correction.vs", type: "text"},
            {src: "../src/shaders/debug.fs", name:"debug.fs", type: "text"},
            {src: "../src/shaders/debug.vs", name:"debug.vs", type: "text"},
            {src: "../src/shaders/draw.fs", name:"draw.fs", type: "text"},
            {src: "../src/shaders/draw.vs", name:"draw.vs", type: "text"},
            {src: "../src/shaders/eyeraytrace.fs", name:"eyeraytrace.fs", type: "text"},
            {src: "../src/shaders/eyeraytrace.vs", name:"eyeraytrace.vs", type: "text"},
            {src: "../src/shaders/hash.fs", name:"hash.fs", type: "text"},
            {src: "../src/shaders/hash.vs", name:"hash.vs", type: "text"},
            {src: "../src/shaders/max.fs", name:"max.fs", type: "text"},
            {src: "../src/shaders/max.vs", name:"max.vs", type: "text"},
            {src: "../src/shaders/min.fs", name:"min.fs", type: "text"},
            {src: "../src/shaders/min.vs", name:"min.vs", type: "text"},
            {src: "../src/shaders/photontrace.fs", name:"photontrace.fs", type: "text"},
            {src: "../src/shaders/photontrace.vs", name:"photontrace.vs", type: "text"},
            {src: "../src/shaders/progressive.fs", name:"progressive.fs", type: "text"},
            {src: "../src/shaders/progressive.vs", name:"progressive.vs", type: "text"},
            {src: "../src/shaders/re.fs", name:"re.fs", type: "text"},
            {src: "../src/shaders/re.vs", name:"re.vs", type: "text"},
            {src: "../src/shaders/scatter.vs", name:"scatter.vs", type: "text"},
            {src: "../src/shaders/scatter.fs", name:"scatter.fs", type: "text"},
            {src: "../src/shaders/sum.fs", name:"sum.fs", type: "text"},
            {src: "../src/shaders/sum.vs", name:"sum.vs", type: "text"},
        ];

        let numFiles = filesToLoad.length;
        let numFilesLoaded = 0;

        filesToLoad.forEach((file) => {

            if(file.type == "image"){
                let img = new Image();
                img.src = file.src;
                numFilesLoaded++;
                if (numFilesLoaded == numFiles) {
                    callback();
                }
            } else {
                fetch(file.src).then((response) => {
                    return file.type == "text" ? response.text() : response.arrayBuffer();
                }).then((contents) => {
                    file.type == "text" ? fs.addTextFile(file.name, contents) : fs.addBinFile(file.name, contents);
                    numFilesLoaded++;
                    if (numFilesLoaded == numFiles) {
                        callback();
                    }
                })
            }

        });
    }
}
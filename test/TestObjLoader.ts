// import {parseOBJ, Vector3} from "xray";
// import {xray, parseOBJ} from "xray";
// import {mtls, parseOBJ, loadMTL, Mesh, Vector3} from "../src/xray";
import {mtls, loadMTL, parseOBJ} from "../src/obj";
import {Mesh} from "../src/mesh";
import {Vector3} from "../src/vector";
/**
 * Created by Nidin Vinayakan on 23/02/17.
 */
export class TestObjLoader {

    constructor() {

        this.load(function (obj) {
            console.log(obj);
            console.log(mtls);

            var mesh = new Mesh();
            mesh.load(obj, new Vector3(), 1);

        });

    }

    load(callback) {

        let base = "models/stanford-dragon/";
        let model = "models/stanford-dragon/stanford-dragon.obj";
        let mtl = "models/stanford-dragon/stanford-dragon.mtl";


        fetch(mtl).then((response) => {
            return response.text();
        }).then((contents) => {
            loadMTL(contents, base);

            fetch(model).then((response) => {
                return response.text();
            }).then((contents) => {
                parseOBJ(contents, base, callback);
            });

        });


    }
}
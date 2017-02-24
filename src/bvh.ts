import {Mesh} from "./mesh";
import {BBox} from "./bbox";
import {fillArray} from "./utils";

export class BVHNode {
    constructor(public bbox: BBox=new BBox(), public isLeaf: boolean,
                public idLeft: number, public idRight: number,
                public idTriangle: number,
                public idMiss: number, public idBase: number) {

    }
}


export class BVH {
    constructor(public nodes: Array<BVHNode[]>=[], public nodesNum: number=0) {

    }

    build(mesh: Mesh) {
        this.nodes = [];

        // build six BVHs for all the canonical directions
        for (let face = 0; face <= 5; face++) {
            // initialize nodes
            const obj_num = mesh.triangles.length;
            let obj_index: Int32Array = new Int32Array(obj_num);
            for (let i = 0; i <= obj_num - 1; i++) {
                obj_index[i] = i;
            }
            tnodeNum = 0;
            this.nodes[face] = [];//new BVHNode[obj_num * 2];
            fillArray(this.nodes[face], BVHNode, obj_num * 2);

            for (let i = 0; i <= obj_num * 2 - 1; i++) {
                this.nodes[face][i].idMiss = -1;
                this.nodes[face][i].idBase = i;
            }

            if (face == 0) {
                // canonical BVH (optimal BVH for rays go to positive-x directions)
                splitBVH(mesh, obj_index, obj_num, mesh.bbox, 0, face, this.nodes);
                this.nodesNum = tnodeNum;

                // initialize temporary BVH nodes
                this.nodes[6] = [];//new BVHNode[obj_num * 2];
                fillArray(this.nodes[face], BVHNode, obj_num * 2);

                for (let i = 0; i <= obj_num * 2 - 1; i++) {
                    this.nodes[6][i].idMiss = -1;
                }
            }
            else {
                // other BVHs
                for (let i = 0; i <= this.nodesNum - 1; i++) {
                    this.nodes[6][i] = this.nodes[0][i];
                }

                // swap indices if certain conditions are met for each BVH
                for (let i = 0; i <= this.nodesNum - 1; i++) {
                    if (this.nodes[6][i].isLeaf) continue;

                    if ((face == 1) && (this.nodes[6][this.nodes[6][i].idLeft].bbox.max.x > this.nodes[6][this.nodes[6][i].idRight].bbox.max.x)) continue;
                    if ((face == 2) && (this.nodes[6][this.nodes[6][i].idLeft].bbox.min.y < this.nodes[6][this.nodes[6][i].idRight].bbox.min.y)) continue;
                    if ((face == 3) && (this.nodes[6][this.nodes[6][i].idLeft].bbox.max.y > this.nodes[6][this.nodes[6][i].idRight].bbox.max.y)) continue;
                    if ((face == 4) && (this.nodes[6][this.nodes[6][i].idLeft].bbox.min.z < this.nodes[6][this.nodes[6][i].idRight].bbox.min.z)) continue;
                    if ((face == 5) && (this.nodes[6][this.nodes[6][i].idLeft].bbox.max.z > this.nodes[6][this.nodes[6][i].idRight].bbox.max.z)) continue;

                    const temp = this.nodes[6][i].idLeft;
                    this.nodes[6][i].idLeft = this.nodes[6][i].idRight;
                    this.nodes[6][i].idRight = temp;
                }

                // rebuilding BVH
                tnodeNum = 0;
                reorderNodes(mesh, face, 0, this.nodes);
                tnodeNum = 0;
                reorderTree(mesh, face, 0, this.nodes);
            }

            // threading BVH (making miss links)
            this.nodes[face][0].idMiss = -1;
            setLeftMissLinks(0, 0, face, this.nodes);
            this.nodes[face][0].idMiss = -1;
            setRightMissLinks(0, 0, face, this.nodes);
            this.nodes[face][0].idMiss = -1;
        }
    }
}


export var tnodeNum: number = 0;


function sortAxis(mesh: Mesh, obj_index: Int32Array, axis: number, li: number, ri: number) {
    let i: number = li;
    let j: number = ri;

    const pivot: number = mesh.triangles[obj_index[Math.floor((li + ri) / 2)]].centroid[axis];

    for (; ;) {
        while (mesh.triangles[obj_index[i]].centroid.get(axis) < pivot) i++;
        while (mesh.triangles[obj_index[j]].centroid.get(axis) > pivot) j--;
        if (i >= j) break;

        let temp: number = obj_index[i];
        obj_index[i] = obj_index[j];
        obj_index[j] = temp;

        i++;
        j--;
    }

    if (li < (i - 1)) sortAxis(mesh, obj_index, axis, li, i - 1);
    if ((j + 1) < ri) sortAxis(mesh, obj_index, axis, j + 1, ri);
}


function splitBVH(mesh: Mesh, obj_index: Int32Array, obj_num: number, bbox: BBox, Level: number, face: number, mnode: BVHNode[]) {
    let obj_index_L: Int32Array;
    let obj_index_R: Int32Array;

    // --------------- leaf node ---------------
    // subdivision is done until we have one node - this is to simplify the implementation on a GPU, but can be changed of course.
    if (obj_num <= 1) {
        tnodeNum++;
        let temp_id: number = tnodeNum - 1;

        mnode[face][temp_id].bbox = bbox;
        mnode[face][temp_id].isLeaf = true;

        if (obj_num != 0) {
            mnode[face][temp_id].idTriangle = obj_index[0];
        }
        else {
            mnode[face][temp_id].idTriangle = -1;
        }

        return temp_id;
    }


    // --------------- internal node ---------------
    let bestAxis: number = 0;
    let bestIndex: number = 0;
    let bestCost: number = 1e+30;
    let bestBBoxL: BBox, bestBBoxR: BBox;

    // obvious case
    if (obj_num == 2) {
        // divide the node into two nodes
        obj_index_L = new Int32Array(1);
        obj_index_R = new Int32Array(1);

        obj_index_L[0] = obj_index[0];
        obj_index_R[0] = obj_index[1];

        bestBBoxL = mesh.triangles[obj_index[0]].bbox;
        bestBBoxR = mesh.triangles[obj_index[1]].bbox;
    }
    else {
        // --------------- use exact SAH (surface area heuristic) by sorting ---------------
        let sorted_obj_index: Int32Array = new Int32Array(obj_num);
        let leftarea: Float32Array = new Float32Array(obj_num);
        let lbbox: BBox[] = [];//obj_num

        // for all axes
        for (var k = 0; k <= 2; k++) {
            sortAxis(mesh, obj_index, k, 0, obj_num - 1);

            // calculate area of bounding boxes for left sweeping
            let bboxL: BBox = new BBox(), bboxR: BBox = new BBox();
            bboxL.initialize();
            for (let i = 0; i <= obj_num - 1; i++) {
                let ii = obj_index[i];
                bboxL.expand(mesh.triangles[ii].bbox.min);
                bboxL.expand(mesh.triangles[ii].bbox.max);
                leftarea[i] = bboxL.area();
                lbbox[i] = bboxL;
            }

            // calculate SAH by right sweeping
            let triNum = obj_num - 1;
            bboxR.initialize();
            for (let j = (obj_num - 2); j >= 0; j--) {
                let ii = obj_index[j + 1];

                bboxR.expand(mesh.triangles[ii].bbox.min);
                bboxR.expand(mesh.triangles[ii].bbox.max);

                let tempCost = triNum * leftarea[j] + (obj_num - triNum) * bboxR.area();
                if (tempCost < bestCost) {
                    bestCost = tempCost;
                    bestAxis = k;
                    bestIndex = j;
                    bestBBoxL = lbbox[bestIndex];
                    bestBBoxR = bboxR;
                }

                triNum--;
            }

            // use the best axis
            if (bestAxis == k) {
                for (let i = 0; i <= obj_num - 1; i++) {
                    sorted_obj_index[i] = obj_index[i];
                }
            }
        }

        // divide the node into two nodes
        obj_index_L = new Int32Array(bestIndex + 1);
        obj_index_R = new Int32Array(obj_num - (bestIndex + 1));

        for (let i = 0; i <= bestIndex; i++) {
            obj_index_L[i] = sorted_obj_index[i];
        }
        for (let i = bestIndex + 1; i <= obj_num - 1; i++) {
            obj_index_R[i - (bestIndex + 1)] = sorted_obj_index[i];
        }

        sorted_obj_index = null;
        // delete sorted_obj_index;
    }

    // it is not a leaf node
    tnodeNum++;
    let temp_id = tnodeNum - 1;
    mnode[face][temp_id].bbox = bbox;
    mnode[face][temp_id].isLeaf = false;

    // follow canonical condition to make BVH
    if (bestBBoxL.min.x < bestBBoxR.min.x) {
        mnode[face][temp_id].idLeft = splitBVH(mesh, obj_index_L, bestIndex + 1, bestBBoxL, Level + 1, face, mnode);
        mnode[face][temp_id].idRight = splitBVH(mesh, obj_index_R, obj_num - (bestIndex + 1), bestBBoxR, Level + 1, face, mnode);
    }
    else {
        mnode[face][temp_id].idLeft = splitBVH(mesh, obj_index_R, obj_num - (bestIndex + 1), bestBBoxR, Level + 1, face, mnode);
        mnode[face][temp_id].idRight = splitBVH(mesh, obj_index_L, bestIndex + 1, bestBBoxL, Level + 1, face, mnode);
    }

    obj_index_L = null;
    obj_index_R = null;

    return temp_id;
}

function reorderNodes(mesh: Mesh, face: number, index: number, mnode: Array<BVHNode[]>) {
    if (index < 0) return;
    if (tnodeNum == (mesh.triangles.length * 2)) return;

    tnodeNum++;
    let temp_id = tnodeNum - 1;
    mnode[face][temp_id] = mnode[6][index];
    mnode[face][temp_id].idBase = index;

    if (mnode[6][index].isLeaf) return;

    reorderNodes(mesh, face, mnode[6][index].idLeft, mnode);
    reorderNodes(mesh, face, mnode[6][index].idRight, mnode);
}


function reorderTree(mesh: Mesh, face: number, index: number, mnode: BVHNode[]): number {
    if (mnode[6][index].isLeaf) {
        tnodeNum++;
        return tnodeNum - 1;
    }

    tnodeNum++;
    let temp_id = tnodeNum - 1;
    mnode[face][temp_id].idLeft = reorderTree(mesh, face, mnode[6][index].idLeft, mnode);
    mnode[face][temp_id].idRight = reorderTree(mesh, face, mnode[6][index].idRight, mnode);
    return temp_id;
}


function setLeftMissLinks(id: number, idParent: number, face: number, mnode: BVHNode[]): void {
    if (mnode[face][id].isLeaf) {
        mnode[face][id].idMiss = id + 1;
        return;
    }

    mnode[face][id].idMiss = mnode[face][idParent].idRight;

    setLeftMissLinks(mnode[face][id].idLeft, id, face, mnode);
    setLeftMissLinks(mnode[face][id].idRight, id, face, mnode);
}


function setRightMissLinks(id: number, idParent: number, face: number, mnode: BVHNode[]): void {
    if (mnode[face][id].isLeaf) {
        mnode[face][id].idMiss = id + 1;
        return;
    }

    if (mnode[face][idParent].idRight == id) {
        mnode[face][id].idMiss = mnode[face][idParent].idMiss;
    }

    setRightMissLinks(mnode[face][id].idLeft, id, face, mnode);
    setRightMissLinks(mnode[face][id].idRight, id, face, mnode);
}
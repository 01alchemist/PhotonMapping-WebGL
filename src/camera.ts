import {Vector3} from "./vector";

export class Camera {

    constructor(public origin: Vector3 = new Vector3(), public lookat: Vector3 = new Vector3(),
                public width?: number, public height?: number,
                public distance?: number,
                public u?: Vector3, public v?: Vector3, public w?: Vector3) {

    }

    set(origin: Vector3, lookat: Vector3, width: number, height: number, fov: number) {
        this.origin = origin;
        this.lookat = lookat;

        this.width = width;
        this.height = height;
        this.distance = height / (2.0 * Math.tan((fov / 2.0) * (3.141592 / 180.0)));

        const tv: Vector3 = new Vector3(0.0, 1.0, 0.0);

        this.w = this.lookat.sub(this.origin).normalize();
        this.u = tv.op_remainder(this.w).normalize();
        this.v = this.w.op_remainder(this.u).normalize();
    }
}

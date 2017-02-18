class BBox {

    constructor(public min: Vector3 = new Vector3(), public max: Vector3 = new Vector3()){

    }

    longestAxis(): number {
        var length: Vector3 = this.max.sub(this.min);

        if ((length.x > length.y) && (length.x > length.z)) {
            return 0;
        }
        else if (length.y > length.z) {
            return 1;
        }
        else {
            return 2;
        }
    }

    area(): number {
        var length: Vector3 = this.max.sub(this.min);
        return 2.0 * (length.x * length.y + length.y * length.z + length.z * length.x);
    }

    expand(p: Vector3) {
        this.max = this.max.maximize(p);
        this.min = this.min.minimize(p);
    }

    initialize() {
        this.min = new Vector3(1e+38, 1e+38, 1e+38);
        this.max = new Vector3(-1e+38, -1e+38, -1e+38);
    }
}

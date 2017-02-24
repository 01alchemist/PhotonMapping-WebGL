export class Vector2 {
    constructor(public x: number = 0.0, public y: number = 0.0) {

    }

    get(axis: number): number {
        switch (axis) {
            case 1:
                return this.x;
            case 2:
                return this.y;
        }
    }

    get glData(): Float32Array {
        return new Float32Array([this.x, this.y]);
    }

}

export class Vector4 {
    constructor(public x: number = 0.0, public y: number = 0.0, public z: number = 0.0, public w: number = 0.0) {

    }

    get(axis: number): number {
        switch (axis) {
            case 1:
                return this.x;
            case 2:
                return this.y;
            case 3:
                return this.z;
            case 4:
                return this.w;
        }
    }

    get glData(): Float32Array {
        return new Float32Array([this.x, this.y, this.z, this.w]);
    }
}

export class Vector3 {
    constructor(public x: number = 0.0, public y: number = 0.0, public z: number = 0.0) {

    }

    get glData(): Float32Array {
        return new Float32Array([this.x, this.y, this.z]);
    }

    add(b: Vector3): Vector3 {
        return new Vector3(this.x + b.x, this.y + b.y, this.z + b.z);
    }

    addScalar(f: number): Vector3 {
        return new Vector3(this.x + f, this.y + f, this.z + f);
    }

    sub(b: Vector3): Vector3 {
        return new Vector3(this.x - b.x, this.y - b.y, this.z - b.z);
    }

    subScalar(f: number): Vector3 {
        return new Vector3(this.x - f, this.y - f, this.z - f);
    }

    mul(b: Vector3): Vector3 {
        return new Vector3(this.x * b.x, this.y * b.y, this.z * b.z);
    }

    mulScalar(f: number): Vector3 {
        return new Vector3(this.x * f, this.y * f, this.z * f);
    }

    div(b: Vector3): Vector3 {
        return new Vector3(this.x / b.x, this.y / b.y, this.z / b.z);
    }

    divScalar(f: number): Vector3 {
        return new Vector3(this.x / f, this.y / f, this.z / f);
    }

    dot(b: Vector3): number {
        return (this.x * b.x) + (this.y * b.y) + (this.z * b.z);
    }

    length(): number {
        return Math.sqrt((this.x * this.x) + (this.y * this.y) + (this.z * this.z));
    }

    normalize(): Vector3 {
        let d: number = this.length();
        return new Vector3(this.x / d, this.y / d, this.z / d);
    }

    op_remainder(b: Vector3): Vector3 {
        return new Vector3(this.y * b.z - this.z * b.y, this.z * b.x - this.x * b.z, this.x * b.y - this.y * b.x);
    }

    maximize(b: Vector3): Vector3 {
        return new Vector3(this.x > b.x ? this.x : b.x, this.y > b.y ? this.y : b.y, this.z > b.z ? this.z : b.z);
    }

    minimize(b: Vector3): Vector3 {
        return new Vector3(this.x < b.x ? this.x : b.x, this.y < b.y ? this.y : b.y, this.z < b.z ? this.z : b.z);
    }

    get(axis: number): number {
        switch (axis) {
            case 1:
                return this.x;
            case 2:
                return this.y;
            case 3:
                return this.z;
        }
    }
}
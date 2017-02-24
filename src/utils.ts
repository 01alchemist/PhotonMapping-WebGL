import {Vector4, Vector3, Vector2} from "./vector";
/**
 * Created by Nidin Vinayakan on 24/02/17.
 */
export function fillArray(array: any[], type: any, num: number) {
    for (let i = 0; i < num; i++) {
        array[i] = new type();
    }
    return array;
}

export function vec4array_to_f32Array(array: Vector4[]): Float32Array {
    let i = 0;
    let j = 0;
    let f32 = new Float32Array(array.length * 4);
    while (i < array.length) {
        let v = array[i];
        f32[j] = v.x;
        f32[j + 1] = v.y;
        f32[j + 2] = v.z;
        f32[j + 3] = v.w;
        i = i + 1;
        j = j + 4;
    }

    return f32;
}

export function vec3array_to_f32Array(array: Vector3[]): Float32Array {
    let i = 0;
    let j = 0;
    let f32 = new Float32Array(array.length * 3);
    while (i < array.length) {
        let v = array[i];
        f32[j] = v.x;
        f32[j + 1] = v.y;
        f32[j + 2] = v.z;
        i = i + 1;
        j = j + 3;
    }

    return f32;
}

export function vec2array_to_f32Array(array: Vector2[]): Float32Array {
    let i = 0;
    let j = 0;
    let f32 = new Float32Array(array.length * 2);
    while (i < array.length) {
        let v = array[i];
        f32[j] = v.x;
        f32[j + 1] = v.y;
        i = i + 1;
        j = j + 2;
    }

    return f32;
}
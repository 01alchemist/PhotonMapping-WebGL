declare var fetch: Function;
interface Window {
    gl: WebGLRenderingContext;
}

declare const gl:WebGLRenderingContext;

interface WebGLRenderingContext{
    readonly TEXTURE_3D:number;
    readonly TEXTURE_WRAP_R: number;
    readonly RGB8: number;
    readonly RGBA32F: number;
    texImage3D:gl.texImage3D;
}
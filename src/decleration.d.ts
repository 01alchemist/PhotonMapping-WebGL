declare var fetch: Function;
interface Window {
    gl: WebGLRenderingContext;
}

declare const gl: WebGLRenderingContext;

interface WebGLRenderingContext {
    readonly TEXTURE_3D: number;
    readonly TEXTURE_WRAP_R: number;
    readonly RGB8: number;
    readonly RGBA32F: number;
    texImage3D: gl.texImage3D;
    DRAW_FRAMEBUFFER: number;
    COLOR_ATTACHMENT1: number;
    COLOR_ATTACHMENT2: number;
    COLOR_ATTACHMENT3: number;
    COLOR_ATTACHMENT4: number;
    COLOR_ATTACHMENT5: number;
    COLOR_ATTACHMENT6: number;
    COLOR_ATTACHMENT7: number;
    drawBuffers(buffers: GLenum[]): void;
}
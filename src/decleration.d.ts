interface Window {
    gl: WebGLRenderingContext;
}
declare var mat4:any;
declare var gl: WebGLRenderingContext;

interface WebGLRenderingContext {
    readonly TEXTURE_3D: number;
    readonly TEXTURE_WRAP_R: number;
    readonly RGB8: number;
    readonly RGBA32F: number;
    DRAW_FRAMEBUFFER: number;
    MAX_COLOR_ATTACHMENTS: number;
    MAX_DRAW_BUFFERS: number;
    COLOR_ATTACHMENT1: number;
    COLOR_ATTACHMENT2: number;
    COLOR_ATTACHMENT3: number;
    COLOR_ATTACHMENT4: number;
    COLOR_ATTACHMENT5: number;
    COLOR_ATTACHMENT6: number;
    COLOR_ATTACHMENT7: number;
    drawBuffers(buffers: GLenum[]): void;
    createVertexArray():WebGLBuffer;
    bindVertexArray(vbo:WebGLBuffer):void;
    texImage3D():void;
}

declare function fetch(...v:any[]);
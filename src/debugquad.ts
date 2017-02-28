import {fs} from "./fs";
/**
 * Created by Nidin Vinayakan on 28/02/17.
 */
export class DebugQuad {

    projectionMatrix;
    modelviewMatrix;
    vertexArray;
    debugTexture: WebGLTexture;

    private vertexPosLocation = 0;
    private vertexTexCoordLocation = 1;
    private vertexPosBuffer;
    private vertexTexCoordBuffer;
    private vertexElementBuffer;
    private ready = false;

    constructor(public shader: WebGLProgram) {


        let image = new Image(1024, 1024);
        image.src = "textures/debug_texture_512x512.jpg";
        image.onload = () => {
            gl.activeTexture(gl.TEXTURE0);
            this.debugTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.debugTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 512, 512, 0, gl.RGB, gl.UNSIGNED_BYTE, image);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
            this.ready = true;
        };

        this.projectionMatrix = mat4.create();
        this.modelviewMatrix = mat4.create();


        // -- Init Vertex Array
        this.vertexArray = gl.createVertexArray();
        gl.bindVertexArray(this.vertexArray);

        // -- Init Buffer
        this.vertexPosBuffer = gl.createBuffer();
        gl.enableVertexAttribArray(this.vertexPosLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexPosBuffer);
        gl.vertexAttribPointer(this.vertexPosLocation, 2, gl.FLOAT, false, 0, 0);

        // -- texcoords
        let texcoords = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0
        ]);
        this.vertexTexCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexTexCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.vertexTexCoordLocation);
        gl.vertexAttribPointer(this.vertexTexCoordLocation, 2, gl.FLOAT, true, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

    }

    drawTex(texture?: WebGLTexture, w:number=512, h:number=512) {

        // if (this.ready == false) {
        //     return;
        // }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        let resolutionLocation = gl.getUniformLocation(this.shader, "resolution");
        let projectionMatrixLocation = gl.getUniformLocation(this.shader, "projectionMatrix");
        let modelviewMatrixLocation = gl.getUniformLocation(this.shader, "modelviewMatrix");

        gl.useProgram(this.shader);

        //bind vertex array
        gl.bindVertexArray(this.vertexArray);

        gl.uniform2f(resolutionLocation, w, h);
        gl.uniformMatrix4fv(projectionMatrixLocation, false, this.projectionMatrix);
        gl.uniformMatrix4fv(modelviewMatrixLocation, false, this.modelviewMatrix);

        //activate texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // gl.bindTexture(gl.TEXTURE_2D, this.debugTexture);
        gl.uniform1i(gl.getUniformLocation(this.shader, "input_tex"), 0);

        //bind vertex pos buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexPosBuffer);

        this.setRectangle(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    setRectangle(x, y, width, height) {
        let x1 = x;
        let x2 = x + width;
        let y1 = y;
        let y2 = y + height;
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            x1, y1,
            x2, y1,
            x1, y2,
            x1, y2,
            x2, y1,
            x2, y2,
        ]), gl.STATIC_DRAW);
    }
}
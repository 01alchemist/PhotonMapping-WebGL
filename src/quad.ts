/**
 * Created by Nidin Vinayakan on 28/02/17.
 */
export class Quad {

    projectionMatrix;
    modelviewMatrix;
    vertexArray;

    private vertexPosLocation = 0;
    private vertexTexCoordLocation = 1;
    private vertexPosBuffer;
    private vertexTexCoordBuffer;

    constructor() {
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

    draw(shader: WebGLProgram, w, h) {

        //gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        let resolutionLocation = gl.getUniformLocation(shader, "resolution");
        let projectionMatrixLocation = gl.getUniformLocation(shader, "projectionMatrix");
        let modelviewMatrixLocation = gl.getUniformLocation(shader, "modelviewMatrix");

        //gl.useProgram(shader);

        //bind vertex array
        gl.bindVertexArray(this.vertexArray);

        gl.uniform2f(resolutionLocation, w, h);
        gl.uniformMatrix4fv(projectionMatrixLocation, false, this.projectionMatrix);
        gl.uniformMatrix4fv(modelviewMatrixLocation, false, this.modelviewMatrix);

        //activate texture
        // gl.activeTexture(gl.TEXTURE0);
        // gl.bindTexture(gl.TEXTURE_2D, texture);
        // gl.uniform1i(gl.getUniformLocation(shader, "input_tex"), 0);


        //bind vertex pos buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexPosBuffer);
        this.setRectangle(0, 0, w, h);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexTexCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0
        ]), gl.STATIC_DRAW);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    drawWithTex(shader: WebGLProgram, w, h, s, t) {
        //gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        let resolutionLocation = gl.getUniformLocation(shader, "resolution");
        let projectionMatrixLocation = gl.getUniformLocation(shader, "projectionMatrix");
        let modelviewMatrixLocation = gl.getUniformLocation(shader, "modelviewMatrix");

        //gl.useProgram(shader);

        //bind vertex array
        gl.bindVertexArray(this.vertexArray);

        gl.uniform2f(resolutionLocation, w, h);
        gl.uniformMatrix4fv(projectionMatrixLocation, false, this.projectionMatrix);
        gl.uniformMatrix4fv(modelviewMatrixLocation, false, this.modelviewMatrix);

        //activate texture
        // gl.activeTexture(gl.TEXTURE0);
        // gl.bindTexture(gl.TEXTURE_2D, texture);
        // gl.uniform1i(gl.getUniformLocation(shader, "input_tex"), 0);


        //bind vertex pos buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexPosBuffer);
        this.setRectangle(0, 0, w, h);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexTexCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            s, 0.0,
            0.0, t,
            0.0, t,
            s, 0.0,
            s, t
        ]), gl.STATIC_DRAW);

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
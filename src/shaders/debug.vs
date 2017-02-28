#version 300 es

precision mediump float;

layout(location = 0) in vec2 position;
layout(location = 1) in vec2 texcoord_0;

uniform vec2 resolution;
uniform mat4 projectionMatrix;
uniform mat4 modelviewMatrix;

out vec2 v_texcoord_0;

void main()
{
    vec2 clipspace = (((position/resolution) * 2.0) - 1.0) * vec2(1.0, -1.0);
    gl_Position = vec4(clipspace, 0.0, 1.0);

	v_texcoord_0 = texcoord_0;
}

#version 300 es

in vec3 position;
in vec2 texcoord_0;

out vec2 v_texcoord_0;

uniform mat4 projectionMatrix;
uniform mat4 modelviewMatrix;

void main()
{
    gl_Position = projectionMatrix * modelviewMatrix * vec4(position, 1.0);
	v_texcoord_0 = texcoord_0;
}

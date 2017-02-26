#version 300 es

precision mediump float;

in vec2 v_texcoord_0;
uniform sampler2D input_tex;

out vec4 fragmentColor;

void main()
{
	fragmentColor = texture(input_tex, v_texcoord_0.st) / 1.0;
}

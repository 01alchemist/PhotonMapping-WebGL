#version 300 es

precision mediump float;

in vec2 v_texcoord_0;
uniform sampler2D input_tex;

out vec4 fragmentColor;

void main()
{
	fragmentColor = vec4(texture(input_tex, v_texcoord_0.st).rgb, 1.0);
//	fragmentColor = vec4(1.0,0.0,0.0, 1.0);
}

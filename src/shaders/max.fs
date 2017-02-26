#version 300 es

precision mediump float;

in vec2 v_texcoord_0;

uniform sampler2D inputTexture;
uniform vec2 offset;

out vec4 fragmentColor;

void main()
{
	vec2 t0 = v_texcoord_0.st; 
	vec2 t1 = v_texcoord_0.st + vec2(offset.x, 0.0);
	vec2 t2 = v_texcoord_0.st + vec2(0.0, offset.y);
	vec2 t3 = v_texcoord_0.st + offset;

	vec4 v0 = texture(inputTexture, t0);
	vec4 v1 = texture(inputTexture, t1);
	vec4 v2 = texture(inputTexture, t2);
	vec4 v3 = texture(inputTexture, t3);

	fragmentColor = max(max(v0, v1), max(v2, v3));
}

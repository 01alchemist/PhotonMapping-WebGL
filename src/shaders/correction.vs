#version 300 es

in vec3 position;
uniform sampler2D photonIndexTexture;
uniform vec4 bufInfo;

uniform mat4 projectionMatrix;
uniform mat4 modelviewMatrix;

void main()
{
    vec4 t_position = projectionMatrix * modelviewMatrix * vec4(position, 1.0);
	vec2 TexCoord = (t_position.xy + vec2(1.0)) * 0.5;
	vec2 PhotonListIndex = texture(photonIndexTexture, TexCoord).zw;
	gl_Position = vec4(PhotonListIndex * bufInfo.zw * 2.0 - vec2(1.0), 0.5, 1.0);
}

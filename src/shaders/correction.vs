#version 300 es

layout(location = 0) in vec2 position;
uniform sampler2D photonIndexTexture;
uniform vec4 bufInfo;

uniform vec2 resolution;
uniform mat4 projectionMatrix;
uniform mat4 modelviewMatrix;

void main()
{
    vec2 clipspace = (((position/resolution) * 2.0) - 1.0) * vec2(1.0, -1.0);
    vec4 t_position = projectionMatrix * modelviewMatrix * vec4(clipspace, 0.0, 1.0);
	vec2 texCoord = (t_position.xy + vec2(1.0)) * 0.5;
	vec2 PhotonListIndex = texture(photonIndexTexture, texCoord).zw;
	gl_Position = vec4(PhotonListIndex * bufInfo.zw * 2.0 - vec2(1.0), 0.5, 1.0);
}

#version 300 es

layout(location = 0) in vec2 position;
uniform sampler2D photonIndexTexture;
uniform vec4 bufInfo;

uniform float photonBufferSize;
uniform vec2 resolution;
uniform mat4 projectionMatrix;
uniform mat4 modelviewMatrix;

//out vec2 v_texcoord_0;
out vec4 p;

void main()
{
    vec2 clipspace = (((position/resolution) * 2.0) - 1.0) * vec2(1.0, -1.0);
    vec4 t_position = projectionMatrix * modelviewMatrix * vec4(clipspace, 0.0, 1.0);
	// read hashed photon index
	vec2 TexCoord = (t_position.xy + vec2(1.0)) * 0.5;
	vec4 PhotonIndex = texture(photonIndexTexture, TexCoord);
	vec2 PhotonListIndex = PhotonIndex.zw;

	// global 1d index in the photon buffer (i.e., photon id)
	float z = (PhotonIndex.x / photonBufferSize) + PhotonIndex.y;

	gl_Position = vec4(PhotonListIndex * bufInfo.zw * 2.0 - vec2(1.0), z, 1.0);
	p = PhotonIndex;
//	v_texcoord_0 = texcoord_0;
}


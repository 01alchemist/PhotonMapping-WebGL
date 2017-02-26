#version 300 es

precision mediump float;

in vec2 v_texcoord_0;

uniform sampler2D photonPositionTexture;
uniform sampler2D photonFluxTexture;

uniform int hashNum;
uniform float gridScale; 
uniform vec3 bboxMin;

uniform vec4 bufInfo;

out vec4 fragmentColor;

vec2 convert1Dto2D(const float t)
{
	return vec2(mod(t, bufInfo.x) + 0.5,  floor(t * bufInfo.z) + 0.5);
}


float hash(const vec3 idx)
{
	// use the same procedure as GPURnd
	vec4 n = vec4(idx, gridScale * 0.5) * 4194304.0 / gridScale;

	const vec4 q = vec4(   1225.0,    1585.0,    2457.0,    2098.0);
	const vec4 r = vec4(   1112.0,     367.0,      92.0,     265.0);
	const vec4 a = vec4(   3423.0,    2646.0,    1707.0,    1999.0);
	const vec4 m = vec4(4194287.0, 4194277.0, 4194191.0, 4194167.0);

	vec4 beta = floor(n / q);
	vec4 p = a * (n - beta * q) - beta * r;
	beta = (sign(-p) + vec4(1.0)) * vec4(0.5) * m;
	n = (p + beta);
    float f_hashNum = float(hashNum);
	return floor(fract(dot(n / m, vec4(1.0, -1.0, 1.0, -1.0))) * f_hashNum);
}


void main()
{
	vec2 PixelIndex = v_texcoord_0.st;
	vec3 PhotonPosition = texture(photonPositionTexture, PixelIndex).xyz;
	vec3 HashIndex = floor((PhotonPosition - bboxMin) * gridScale);

	// vec4(original 2d index, hashed 2d index)
	vec4 PhotonIndex = vec4(PixelIndex.xy, convert1Dto2D(hash(HashIndex)));

	// ignore invalid photons (move them outside the buffer)
	float PhotonFlux = texture(photonFluxTexture, PixelIndex).x;
	if (PhotonFlux < 0.0)
	{
		PhotonIndex.zw = vec2(-1.0);
	}

	fragmentColor = PhotonIndex;
}

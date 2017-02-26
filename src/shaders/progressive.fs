#version 300 es

precision highp float;

in vec2 v_texcoord_0;

uniform sampler2D queryPositionTexture;
uniform sampler2D queryEmissionPhotonCountTexture;
uniform sampler2D queryFluxRadiusTexture;
uniform sampler2D queryReflectanceTexture;
uniform sampler2D queryNormalTexture;
uniform sampler2D queryIntersectionTexture;

uniform sampler2D hashedPhotonTexture;
uniform sampler2D photonFluxTexture;
uniform sampler2D photonPositionTexture;
uniform sampler2D photonDirectionTexture;
uniform sampler2D photonCorrectionTexture;

uniform vec4 bufInfo;

uniform float hashNum;
uniform float gridScale;
uniform vec3 bboxMin;
uniform vec3 hashMax;

uniform float alpha;

out vec4 [2] fragData;

float hash(const vec3 idx)
{
	// use the same procedure as GPURnd
	// it is the same as the one in hash.fs
	vec4 n = vec4(idx, gridScale * 0.5) * 4194304.0 / gridScale;

	const vec4 q = vec4(   1225.0,    1585.0,    2457.0,    2098.0);
	const vec4 r = vec4(   1112.0,     367.0,      92.0,     265.0);
	const vec4 a = vec4(   3423.0,    2646.0,    1707.0,    1999.0);
	const vec4 m = vec4(4194287.0, 4194277.0, 4194191.0, 4194167.0);

	vec4 beta = floor(n / q);
	vec4 p = a * (n - beta * q) - beta * r;
	beta = (sign(-p) + vec4(1.0)) * vec4(0.5) * m;
	n = (p + beta);

	return floor(fract(dot(n / m, vec4(1.0, -1.0, 1.0, -1.0))) * hashNum);
}


vec2 convert1Dto2D(const float t)
{
	return vec2(mod(t, bufInfo.x) + 0.5, floor(t * bufInfo.z) + 0.5);
}


vec3 Flux = vec3(0.0);
float PhotonCount = 0.0;
void AccumulatePhotons(const vec3 QueryPosition, const vec3 QueryNormal, const float QueryRadius, const vec3 HashIndex)
{
	// get the photon from the hash buffer
	vec2 HashedPhotonIndex = convert1Dto2D(hash(HashIndex)) * bufInfo.zw;
	vec2 PhotonIndex = texture(hashedPhotonTexture, HashedPhotonIndex).xy;

	vec4 PhotonFlux = texture(photonFluxTexture, PhotonIndex);
	vec4 PhotonPosition = texture(photonPositionTexture, PhotonIndex);
	vec4 PhotonDirection = texture(photonDirectionTexture, PhotonIndex);
	vec3 PhotonNormal = vec3(PhotonPosition.w, PhotonFlux.w, PhotonDirection.w);

	// make sure that the photon is actually in the given grid cell
	vec3 RangeMin = HashIndex / gridScale + bboxMin;
	vec3 RangeMax = (HashIndex + vec3(1.0)) / gridScale + bboxMin;
	if (all(greaterThan(PhotonPosition.xyz, RangeMin)) && all(lessThan(PhotonPosition.xyz, RangeMax)))
	{
		// photon projection as in "Diffusion-Based Photon Mapping" by L. Schjoeth.
		vec3 PositionDifference = PhotonPosition.xyz - QueryPosition;
		float t = dot(QueryNormal, PositionDifference) / dot(QueryNormal, PhotonDirection.xyz);
		PhotonPosition.xyz = PhotonPosition.xyz + t * PhotonDirection.xyz;

		if ((length(PositionDifference) < QueryRadius) && (dot(QueryNormal, -PhotonDirection.xyz) > 0.0)) 
		{
			float PhotonCorrection = texture(photonCorrectionTexture, HashedPhotonIndex).x;
			Flux += PhotonFlux.rgb * PhotonCorrection;
			PhotonCount += PhotonCorrection;
		}
	}
}


void main()
{
	vec2 PixelIndex = v_texcoord_0.st;

	vec4 QueryPosition = texture(queryPositionTexture, PixelIndex);
	vec4 QueryNormal = texture(queryNormalTexture, PixelIndex);
	vec4 QueryFluxRadius = texture(queryFluxRadiusTexture, PixelIndex);
	vec4 QueryEmissionPhotonCount = texture(queryEmissionPhotonCountTexture, PixelIndex);
	vec3 QueryFlux = QueryFluxRadius.xyz;
	vec4 QueryReflectance = texture(queryReflectanceTexture, PixelIndex);
	float QueryPhotonCount = QueryEmissionPhotonCount.w;
	float QueryRadius = QueryFluxRadius.w;

	vec3 RangeMin = max((QueryPosition.xyz - vec3(QueryRadius) - bboxMin) * gridScale, vec3(0.0));
	vec3 RangeMax = min((QueryPosition.xyz + vec3(QueryRadius) - bboxMin) * gridScale, hashMax);

	vec4 QueryIntersection = texture(queryIntersectionTexture, PixelIndex);
	if (QueryIntersection.x >= 0.0)
	{
		vec3 ii = floor(abs(QueryPosition.xyz - bboxMin) * gridScale - 0.5); 
		for (int iz = 0; iz <= 1; iz++)
		{
			for (int iy = 0; iy <= 1; iy++)
			{
				for (int ix = 0; ix <= 1; ix++)
				{
					AccumulatePhotons(QueryPosition.xyz, QueryNormal.xyz, QueryRadius, ii + vec3(ix, iy, iz));
				}
			}
		}

		// BRDF (assumes that we stop at Lambertian - we should use the BRDF there in general.)
		Flux *= (QueryReflectance.rgb / 3.141592);

		// progressive density estimation
		float g = min((QueryPhotonCount + alpha * PhotonCount) / (QueryPhotonCount + PhotonCount), 1.0);
		QueryRadius = QueryRadius * sqrt(g);
		QueryPhotonCount = QueryPhotonCount + PhotonCount * alpha;
		QueryFlux = (QueryFlux + Flux) * g;
	}

	fragData[0] = vec4(QueryFlux, QueryRadius);
	fragData[1] = vec4(QueryEmissionPhotonCount.rgb, QueryPhotonCount);
}

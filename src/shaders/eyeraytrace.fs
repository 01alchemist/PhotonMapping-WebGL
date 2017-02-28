#version 300 es

precision mediump float;
precision mediump sampler3D;

const int MAX_LOOP = 7;

in vec2 v_texcoord_0;

uniform sampler2D queryEmissionPhotonCountTexture;
uniform sampler2D randomTexture;
uniform sampler3D volumeTextureTextures;

uniform float focalLength;
uniform int maxPathLength;
uniform float apertureSize;
uniform float lightSummedArea;

uniform int numEyeSamples;

uniform vec3 cameraU;
uniform vec3 cameraV;
uniform vec3 cameraW;
uniform vec3 cameraParams;
uniform vec2 AAOffset;
uniform vec3 cameraPosition;

uniform sampler2D rayDirectionTexture;
uniform sampler2D rayOriginTexture;
uniform sampler2D texturePolygons;
uniform vec2 polygonDataStride;

uniform sampler2D textureBVH;
uniform samplerCube cubeTextureBBoxRootIndices;

uniform sampler2D textureMaterials;

uniform float materialStride;
uniform float materialNumRcp;

uniform vec4 offsetToBBoxMinMax;

//out vec4 [6] fragData;
layout(location = 0) out vec4 fragData0;
layout(location = 1) out vec4 fragData1;
layout(location = 2) out vec4 fragData2;
layout(location = 3) out vec4 fragData3;
layout(location = 4) out vec4 fragData4;
layout(location = 5) out vec4 fragData5;

struct Ray
{
	vec3 org;
	vec3 dir;
};


struct Intersection
{
	float t;
	vec3 pos;
	vec3 nrm;
	int brdf;
	vec3 col;
	float eta;
	vec3 gnrm;
	vec2 tex;
	float matid;
	float g;
};


void next(inout vec2 triangleIndex, const float offset)
{
	triangleIndex.y = triangleIndex.y + polygonDataStride.y * floor(triangleIndex.x + polygonDataStride.x * offset);
	triangleIndex.x = fract(triangleIndex.x + polygonDataStride.x * offset);
}


vec4 lastIntersection;
Intersection raytrace(const Ray ray, const bool cullBackface)
{
	Intersection result;

	result.t = 1.0e+30;
	result.nrm = vec3(0.0);
	result.pos = vec3(0.0);
	result.col = vec3(0.0);

	vec3 rayDirection = ray.dir;
	vec3 rayOrigin = ray.org;

	vec4 isect = vec4(-1.0, -1.0, -1.0, 1.0e20);
	vec3 barycentric;

	// RootIndex is the offset to the root
	vec4 rootIndex = texture(cubeTextureBBoxRootIndices, rayDirection);
	vec4 bboxIndex = rootIndex;

	vec3 rayDirectionRcp = vec3(1.0) / rayDirection;
	vec3 t0 = -rayDirectionRcp * rayOrigin;

    int count = 0;

	while (count < MAX_LOOP)
//	while (true)
	{
	    count++;
		vec4 bboxMinMaxIndex = offsetToBBoxMinMax + (bboxIndex.xyxy - rootIndex.xyxy);
		vec4 bboxMinTriangleX = texture(textureBVH, bboxMinMaxIndex.xy);
		vec4 bboxMaxTriangleY = texture(textureBVH, bboxMinMaxIndex.zw);

		vec4 bboxNextIndex = texture(textureBVH, bboxIndex.xy);

		vec3 bbMinInterval = rayDirectionRcp * bboxMinTriangleX.xyz + t0;
		vec3 bbMaxInterval = rayDirectionRcp * bboxMaxTriangleY.xyz + t0;
		vec3 a = min(bbMinInterval, bbMaxInterval);
		vec3 b = max(bbMinInterval, bbMaxInterval);
		float tmin = max(max(a.x, a.y), a.z);
		float tmax = min(min(b.x, b.y), b.z);

		bool bbHit = (tmin <= tmax) && (tmin <= isect.w) && (tmax >= 0.0);

		// read triangle vertices
		vec2 triangleStartIndex = vec2(bboxMinTriangleX.w, bboxMaxTriangleY.w);
		vec2 triangleIndex = triangleStartIndex;

		// (px, py, pz, tx)
		// (nx, ny, sgn(nz) * (matid + 1), ty)
		vec3 V0 = texture(texturePolygons, triangleIndex).xyz; next(triangleIndex, 1.0);
		vec3 V1 = texture(texturePolygons, triangleIndex).xyz; next(triangleIndex, 1.0);
		vec3 V2 = texture(texturePolygons, triangleIndex).xyz; next(triangleIndex, 1.0);
		float materialIndex = abs(texture(texturePolygons, triangleIndex).z) - 1.0;

		// perform ray-triangle intersection if it is a leaf node
		if ((bboxMinTriangleX.w >= 0.0) && bbHit)
		{
			// ray triangle intersection
			vec3 p0 = V0;
			vec3 e0 = V1 - V0;
			vec3 e1 = V2 - V0;
			vec3 pv = cross(rayDirection, e1);

			float det = dot(e0, pv);
			if ((cullBackface && (det > 1e-10)) || !cullBackface)
			{
				vec3 tv = rayOrigin - p0;
				vec3 qv = cross(tv, e0);

				vec4 uvt;
				uvt.x = dot(tv, pv);
				uvt.y = dot(rayDirection, qv);
				uvt.z = dot(e1, qv);
				uvt.xyz = uvt.xyz / det;
				uvt.w = 1.0 - uvt.x - uvt.y;

				if (all(greaterThanEqual(uvt, vec4(0.0))) && (uvt.z < isect.a)) 
				{
					barycentric = uvt.ywx;
					isect = vec4(triangleStartIndex, materialIndex, uvt.z);
				}
			}
		}

		if (bbHit)
		{
			// hit
			bboxIndex.xy = bboxNextIndex.xy;
		}
		else
		{
			// miss
			bboxIndex.xy = bboxNextIndex.wz;
		}

		if (bboxIndex.x < 0.0) break;
	}

	if (isect.x > 0.0)
	{
		vec2 triangleIndex = isect.xy;

		vec4 V0 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 V1 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 V2 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);

		vec4 N0 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 N1 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 N2 = texture(texturePolygons, triangleIndex);

		N0.z = sign(N0.z) * sqrt(abs(1.0 - N0.x * N0.x - N0.y * N0.y)); 
		N1.z = sign(N1.z) * sqrt(abs(1.0 - N1.x * N1.x - N1.y * N1.y)); 
		N2.z = sign(N2.z) * sqrt(abs(1.0 - N2.x * N2.x - N2.y * N2.y)); 

		result.t = isect.w;
		result.pos = V2.xyz * barycentric.x + V0.xyz * barycentric.y + V1.xyz * barycentric.z;
		result.nrm = normalize(N2.xyz * barycentric.x + N0.xyz * barycentric.y + N1.xyz * barycentric.z);
		result.gnrm = normalize(cross(V1.xyz - V0.xyz, V2.xyz - V0.xyz));

		vec2 T0 = vec2(V0.w, N0.w);
		vec2 T1 = vec2(V1.w, N1.w);
		vec2 T2 = vec2(V2.w, N2.w);
		result.tex = T2 * barycentric.x + T0 * barycentric.y + T1 * barycentric.z;

		result.col = texture(textureMaterials, vec2((isect.z + 0.0 + 0.25) * materialStride, 0.0)).xyz;
		result.brdf = int(texture(textureMaterials, vec2((isect.z + 0.5 + 0.25) * materialStride, 0.0)).x);
		result.g = texture(textureMaterials, vec2((isect.z + 0.5 + 0.25) * materialStride, 0.0)).y;
		result.eta = texture(textureMaterials, vec2((isect.z + 0.0 + 0.25) * materialStride, 0.0)).w;
		result.matid = isect.z;
	}
	lastIntersection = isect;
	return result;
}


vec3 onb(const vec3 x, const vec3 n)
{
	vec3 u, w, v;
	v = n;
	 
	if (n.z < -0.9999999)
	{
		u = vec3(0.0, -1.0, 0.0); 
		w = vec3(-1.0, 0.0, 0.0);
	}
	else
	{
		float a = 1.0 / (1.0 + n.z); 
		float b = -n.x * n.y * a;
		u = vec3(1.0 - n.x * n.x * a, b, -n.x); 
		w = vec3(b, 1.0 - n.y * n.y * a, -n.y);
	}
	return (x.x * u + x.y * v + x.z * w);
}


float GPURnd(inout vec4 n)
{
	// Based on the post http://gpgpu.org/forums/viewtopic.php?t=2591&sid=17051481b9f78fb49fba5b98a5e0f1f3
	// (The page no longer exists as of March 17th, 2015. Please let me know if you see why this code works.)
	const vec4 q = vec4(   1225.0,    1585.0,    2457.0,    2098.0);
	const vec4 r = vec4(   1112.0,     367.0,      92.0,     265.0);
	const vec4 a = vec4(   3423.0,    2646.0,    1707.0,    1999.0);
	const vec4 m = vec4(4194287.0, 4194277.0, 4194191.0, 4194167.0);

	vec4 beta = floor(n / q);
	vec4 p = a * (n - beta * q) - beta * r;
	beta = (sign(-p) + vec4(1.0)) * vec4(0.5) * m;
	n = (p + beta);

	return fract(dot(n / m, vec4(1.0, -1.0, 1.0, -1.0)));
}


float fresnel(in vec3 incom, in vec3 normal, in float index_internal, in float index_external)
{
	float eta = index_internal / index_external;
	float cos_theta1 = dot(incom, normal);
	float cos_theta2 = 1.0 - (eta * eta) * (1.0 - cos_theta1 * cos_theta1);

	if (cos_theta2 < 0.0)
	{
		return 1.0;
	}
	else
	{
		cos_theta2 = sqrt(cos_theta2);
		float fresnel_rs = (index_internal * cos_theta1 - index_external * cos_theta2) / (index_internal * cos_theta1 + index_external * cos_theta2);
		float fresnel_rp = (index_internal * cos_theta2 - index_external * cos_theta1) / (index_internal * cos_theta2 + index_external * cos_theta1);
		return (fresnel_rs * fresnel_rs + fresnel_rp * fresnel_rp) * 0.5;
	}
}


vec3 glossy_reflect(const vec3 d, const vec3 n, const float g, inout vec4 rndv)
{
	float a = 2.0 / (g + 1.0);
	vec3 r = normalize((1.0 - a) * reflect(d, n) + a * n);

	float rnd1 = GPURnd(rndv);
	float rnd2 = GPURnd(rndv);

	float temp1 = 2.0 * 3.141592 * rnd1;
	float temp2 = sqrt(1.0 - pow(rnd2, 2.0 / (g + 1.0)));
	vec3 v = vec3(sin(temp1) * temp2, pow(rnd2, 1.0 / (g + 1.0)), cos(temp1) * temp2);

	vec3 result = normalize(onb(v, r));
	if (dot(result, n) < 0.0)
	{
		result = reflect(result, n);
	}

	return result;
}



void main()
{
	vec2 pixelIndex = v_texcoord_0.st;

	vec4 rnd = texture(randomTexture, pixelIndex);
	vec4 rndv = rnd;

	// generate eye ray
	Ray r;
	float filterResponse;
	{
		// look-at camera
		vec2 pixelPosition = gl_FragCoord.xy + AAOffset - cameraParams.xy;
		vec3 relativeTargetPosition = pixelPosition.x * cameraU + pixelPosition.y * cameraV + cameraParams.z * cameraW;
		r.dir = normalize(relativeTargetPosition);
		r.org = cameraPosition;
		filterResponse = (1.0 - abs(AAOffset.x) / 1.5) * (1.0 - abs(AAOffset.y) / 1.5);

		// thin-lens
		vec3 fp = cameraPosition + r.dir * focalLength;
		float radius = sqrt(GPURnd(rndv)) * apertureSize;
		float theta = 2.0 * 3.141592 * GPURnd(rndv);
		vec3 lens = cameraPosition + radius * (cameraU * cos(theta) + cameraV * sin(theta));
		r.dir = normalize(fp - lens);
		r.org = lens;
	}

	vec3 col = vec3(1.0, 1.0, 1.0) * filterResponse;
	vec3 nrm = vec3(0.0, 0.0, 0.0);
	vec3 pos = vec3(0.0, 0.0, 0.0);
	vec3 emi = vec3(0.0, 0.0, 0.0);
	const float eps = 1e-5;

    int maxLen = maxPathLength > MAX_LOOP ? MAX_LOOP : maxPathLength;

	for (int j = 0; j < MAX_LOOP; j++)
	{
		Intersection i;
		i = raytrace(r, j == 0);
		if (i.t == 1.0e+30)
		{
			nrm = vec3(0.0);
			if (lightSummedArea == 0.0) emi = vec3(0.7, 0.7, 1.0) * col;
			break;
		}

		pos = i.pos;
		nrm = i.nrm;

		if (abs(i.tex.x) < 1e+10) 
		{
			i.col *= texture(volumeTextureTextures, vec3(i.tex, materialNumRcp * (i.matid + 0.5))).rgb;
		}

		if (i.brdf == -1)
		{
			nrm = vec3(0.0);
			emi = col * i.col;
			break;
		}
		else if (i.brdf == 0)
		{
			col = col * i.col;
			break;
		}
		else if ((i.brdf == 1) || (i.brdf == 4))
		{
			r.org = pos + eps * i.gnrm;
			if (i.brdf == 4) nrm = glossy_reflect(nrm, nrm, 1.0 / pow((1.0 - i.g) * 0.5, 2.71828), rndv);
			r.dir = reflect(r.dir, nrm);

			if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
			col = col * i.col;
		}
		else if ((i.brdf == 2) || (i.brdf == 5))
		{
			if (i.brdf == 5) nrm = glossy_reflect(nrm, nrm, 1.0 / pow((1.0 - i.g) * 0.5, 2.71828), rndv);

			// specular refraction
			float ln = dot(nrm, r.dir);
			float eta = i.eta;
			if (ln < 0.0)
			{
				// in
				float Re = fresnel(-r.dir, nrm, 1.0, eta);
				if (GPURnd(rndv) < Re)
				{
					r.org = pos + eps * i.gnrm;
					r.dir = reflect(r.dir, nrm);
					if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
				}
				else
				{
					col = col * i.col;
					r.org = pos - eps * i.gnrm;
					r.dir = refract(r.dir, nrm, 1.0 / eta);
					if (dot(r.dir, i.gnrm) > 0.0) r.dir = -r.dir;
				}
			}
			else
			{
				// out
				float Re = fresnel(-r.dir, -nrm, eta, 1.0);
				col = col * i.col;
				if (GPURnd(rndv) < Re)
				{
					r.org = pos - eps * i.gnrm;
					r.dir = reflect(r.dir, -nrm);
					if (dot(r.dir, -i.gnrm) < 0.0) r.dir = -r.dir;
				}
				else
				{
					r.org = pos + eps * i.gnrm;
					r.dir = refract(r.dir, -nrm, eta);
					if (dot(r.dir, -i.gnrm) > 0.0) r.dir = -r.dir;
				}
			}
		}
		else if ((i.brdf == 3) || (i.brdf == 6))
		{
			if (i.brdf == 6) nrm = glossy_reflect(nrm, nrm, 1.0 / pow((1.0 - i.g) * 0.5, 2.71828), rndv);

			// specular reflection
			float ln = -abs(dot(nrm, r.dir));
			float eta = i.eta;
			float Re = fresnel(-r.dir, nrm, 1.0, eta);
			if (GPURnd(rndv) < Re)
			{
				r.org = pos + eps * i.gnrm;
				r.dir = reflect(r.dir, nrm);
				if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
			}
			else
			{
				col = col * i.col;
				break;
			}
		}
	}

	// emission
	vec4 queryEmissionPhotonCount = texture(queryEmissionPhotonCountTexture, pixelIndex);
	float a = 1.0 / float(numEyeSamples);
	queryEmissionPhotonCount.rgb = queryEmissionPhotonCount.rgb * (1.0 - a) + emi * a;
	 
	// eye ray tracing
	fragData0 = vec4(pos, r.dir.r);
	fragData1 = vec4(col, r.dir.g);
	fragData2 = vec4(nrm, r.dir.b);
	fragData3 = rndv;
	fragData4 = lastIntersection;
	fragData5 = queryEmissionPhotonCount;
}

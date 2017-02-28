#version 300 es

precision mediump float;
precision mediump sampler3D;

const int MAX_LOOP = 1023;

in vec2 v_texcoord_0;

uniform sampler2D randomTexture;

uniform int maxPathLength;

uniform sampler2D textureLightSources;
uniform float lightSourceStride;
uniform float lightSummedArea;
uniform sampler3D volumeTextureTextures;

uniform sampler2D rayDirectionTexture;
uniform sampler2D rayOriginTexture;
uniform sampler2D texturePolygons;
uniform vec2 polygonDataStride;

uniform sampler2D textureBVH;
uniform samplerCube cubeTextureBBoxRootIndices;

uniform sampler2D textureMaterials;

uniform sampler2D photonIntersectionTexture;
uniform sampler2D photonPositionTexture;
uniform sampler2D photonFluxTexture;
uniform sampler2D photonDirectionTexture;

uniform vec4 sceneBSphere;

uniform float materialStride;
uniform float materialNumRcp;

uniform vec4 offsetToBBoxMinMax;


const float eps = 1e-6;

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


void next(inout vec2 triangleIndex, const float offset)
{
	triangleIndex.y = triangleIndex.y + polygonDataStride.y * floor(triangleIndex.x + polygonDataStride.x * offset);
	triangleIndex.x = fract(triangleIndex.x + polygonDataStride.x * offset);
}


vec4 lastIntersection;
Intersection raytrace(const Ray ray)
{
	Intersection result;

	result.t = 1.0e+30;
	result.nrm = vec3(0.0);
	result.pos = vec3(0.0);
	result.col = vec3(0.0);

	vec3 rayDirection = ray.dir;
	vec3 RayOrigin = ray.org;

	vec4 isect = vec4(-1.0, -1.0, -1.0, 1.0e30);
	vec3 barycentric;

	// RootIndex is the offset to the root
	vec4 RootIndex = texture(cubeTextureBBoxRootIndices, rayDirection);
	vec4 bboxIndex = RootIndex;

	vec3 rayDirectionRcp = vec3(1.0) / rayDirection;
	vec3 t0 = -rayDirectionRcp * RayOrigin;

	int count = 0;

//	while (true)
	while (count < MAX_LOOP)
	{
	    count++;
		vec4 bboxMinMaxIndex = offsetToBBoxMinMax + (bboxIndex.xyxy - RootIndex.xyxy);
		vec4 bboxMinTriangleX = texture(textureBVH, bboxMinMaxIndex.xy);
		vec4 bboxMaxTriangleY = texture(textureBVH, bboxMinMaxIndex.zw);

		vec4 bboxNextIndex = texture(textureBVH, bboxIndex.xy);

		vec3 bbMinInterval = rayDirectionRcp * bboxMinTriangleX.xyz + t0;
		vec3 bbMaxInterval = rayDirectionRcp * bboxMaxTriangleY.xyz + t0;
		vec3 a = min(bbMinInterval, bbMaxInterval);
		vec3 b = max(bbMinInterval, bbMaxInterval);
		float tmin = max(max(a.x, a.y), a.z);
		float tmax = min(min(b.x, b.y), b.z);

		bool BBHit = (tmin <= tmax) && (tmin <= isect.w) && (tmax >= 0.0);

		// texture fetches outside seems to be better...
		// read triangle vertices
		vec2 triangleStartIndex = vec2(bboxMinTriangleX.w, bboxMaxTriangleY.w);
		vec2 triangleIndex = triangleStartIndex;

		// (px, py, pz, tx)
		// (nx, ny, sgn(nz) * (matid + 1), ty)
		vec3 V0 = texture(texturePolygons, triangleIndex).xyz; next(triangleIndex, 1.0);
		vec3 V1 = texture(texturePolygons, triangleIndex).xyz; next(triangleIndex, 1.0);
		vec3 V2 = texture(texturePolygons, triangleIndex).xyz; next(triangleIndex, 1.0);
		float materialIndex = abs(texture(texturePolygons, triangleIndex).z) - 1.0;
		//int BRDF = BRDFs[int(materialIndex)];
		int BRDF =  int(texture(textureMaterials, vec2((materialIndex + 0.5 + 0.25) * materialStride, 0.0)).x);

		// perform ray-triangle intersection if it is a leaf node
		if ((bboxMinTriangleX.w >= 0.0) && BBHit)
		{
			// ray triangle intersection
			vec3 p0 = V0;
			vec3 e0 = V1 - V0;
			vec3 e1 = V2 - V0;
			vec3 pv = cross(rayDirection, e1);

			float det = dot(e0, pv);
			{
				vec3 tv = RayOrigin - p0;
				vec3 qv = cross(tv, e0);

				vec4 uvt;
				uvt.x = dot(tv, pv);
				uvt.y = dot(rayDirection, qv);
				uvt.z = dot(e1, qv);
				uvt.xyz = uvt.xyz / det;
				uvt.w = 1.0 - uvt.x - uvt.y;

				if (all(greaterThanEqual(uvt, vec4(0.0))) && (uvt.z < isect.a) && (BRDF != -1))
				{
					barycentric = uvt.ywx;
					isect = vec4(triangleStartIndex, materialIndex, uvt.z);
				}
			}
		}

		if (BBHit)
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
	};

	if (isect.x >= 0.0)
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


void generateIBLSample(inout vec4 rndv, out vec3 flux, out vec3 dir, out vec3 org)
{
	float sceneProjectedArea = 4.0 * 3.141592 * sceneBSphere.w * sceneBSphere.w;

	float temp1 = 2.0 * acos(sqrt(1.0 - GPURnd(rndv)));
	float temp2 = 2.0 * 3.141592 * GPURnd(rndv);
	dir.x = sin(temp1) * cos(temp2);
	dir.y = cos(temp1);
	dir.z = sin(temp1) * sin(temp2);

	if (GPURnd(rndv) > 0.5)
	{
		dir = vec3(1.0);
		dir.y = 2.0 * dir.y;
		dir.z = -dir.z;
		dir = normalize(dir);
		flux = vec3(1.0, 1.0, 0.7) * sceneProjectedArea;
	}
	else
	{
		flux = vec3(0.7, 0.7, 1.0) * sceneProjectedArea;
	}

	float radius = sqrt(GPURnd(rndv));
	float theta = 2.0 * 3.141592 * GPURnd(rndv);
	vec3 temp = vec3(radius * cos(theta), 0.0, radius * sin(theta));
	org = onb(temp * sceneBSphere.w, dir) + dir * sceneBSphere.w + sceneBSphere.xyz;
	dir = -dir;
}



void generateLightSourceSample(inout vec4 rndv, out vec3 flux, out vec3 dir, out vec3 org)
{
	// generate uniform random values
	float Rnd = GPURnd(rndv);
	float rndv1 = Rnd;

	// binary search
	int low = 0;
	int high = int(1.0 / lightSourceStride + 0.5);
	vec2 lightIndex;

    int itr = 0;
	while (itr < MAX_LOOP)
//	while (low < high)
	{
	    itr = itr + 1;
		int mid = low + ((high - low) / int(2));
		vec2 midv = vec2((float(mid) - 0.5) * lightSourceStride, 0.0);
		vec3 tmpv = texture(textureLightSources, midv).xyz;
		lightIndex = tmpv.xy;

		if (tmpv.z < Rnd)
		{
			low = mid + 1;
		}
		else
		{
			high = mid;
		}

		if(low >= high) break;
	}
	{
		vec2 midv = vec2((float(high) - 0.5) * lightSourceStride, 0.0);
		vec3 tmpv = texture(textureLightSources, midv).xyz;
		lightIndex = tmpv.xy;
	}

	// calculate paramters
	float rndv2 = GPURnd(rndv);
	float t = sqrt(1.0 - rndv2);
	float s = GPURnd(rndv);
	float rndv3 = s;

	float a = 1.0 - t;
	float b = (1.0 - s) * t;
	float c = s * t;

	// interpolate the position and the normal
	vec2 triangleIndex = lightIndex;

	vec4 V0 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
	vec4 V1 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
	vec4 V2 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);

	vec4 N0 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
	vec4 N1 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
	vec4 N2 = texture(texturePolygons, triangleIndex);
	float materialIndex = abs(N0.z) - 1.0;

	N0.z = sign(N0.z) * sqrt(abs(1.0 - N0.x * N0.x - N0.y * N0.y)); 
	N1.z = sign(N1.z) * sqrt(abs(1.0 - N1.x * N1.x - N1.y * N1.y)); 
	N2.z = sign(N2.z) * sqrt(abs(1.0 - N2.x * N2.x - N2.y * N2.y)); 

	flux = texture(textureMaterials, vec2((materialIndex + 0.0 + 0.25) * materialStride, 0.0)).xyz;

	flux *= vec3(lightSummedArea * 3.141592);

	vec2 T0 = vec2(V0.w, N0.w);
	vec2 T1 = vec2(V1.w, N1.w);
	vec2 T2 = vec2(V2.w, N2.w);
	vec2 T = T2 * c + T0 * a + T1 * b;

	if (abs(T.x) < 1e+10) 
	{
		flux *= texture(volumeTextureTextures, vec3(T, materialNumRcp * (materialIndex + 0.5 + 0.25))).rgb;
	}

	org = V0.xyz * a + V1.xyz * b + V2.xyz * c;

	// uniform light
	vec3 nrm = normalize(N0.xyz * a + N1.xyz * b + N2.xyz * c);
	vec3 gnrm = normalize(cross(V1.xyz - V0.xyz, V2.xyz - V0.xyz));

	org = org + gnrm * 1.0e-5;

	vec2 rnd;
	rnd.x = GPURnd(rndv);
	rnd.y = GPURnd(rndv);
	rnd.x = 2.0 * 3.141592 * rnd.x;
	rnd.y = sqrt(rnd.y);
	dir = onb(vec3(sin(rnd.x) * rnd.y, sqrt(1.0 - rnd.y * rnd.y), cos(rnd.x) * rnd.y), nrm);
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


void main()
{
	vec2 pixelIndex = v_texcoord_0.st;

	// state of the random number generator
	vec4 rndv = texture(randomTexture, pixelIndex);

	// read previous intersection
	vec4 photonPosition = texture(photonPositionTexture, pixelIndex);
	vec4 PhotonFlux = texture(photonFluxTexture, pixelIndex);
	vec4 photonDirection = texture(photonDirectionTexture, pixelIndex);
	vec3 photonNrm = vec3(photonPosition.w, PhotonFlux.w, photonDirection.w);

	vec3 flux = abs(PhotonFlux.rgb);
	Ray r;


	bool continueTrace;
	float emittedFlag;

	vec4 photonIntersection = texture(photonIntersectionTexture, pixelIndex);
	photonIntersection.z += 1.0;

	if ((photonIntersection.x < 0.0) || (photonIntersection.z >= float(maxPathLength)))
	{
		// the last photon trace was terminated, generate a new photon 
		if (lightSummedArea != 0.0)
		{
			generateLightSourceSample(rndv, flux, r.dir, r.org);
		}
		else
		{
			generateIBLSample(rndv, flux, r.dir, r.org);
		}

		emittedFlag = 1.0;

		// reset the trace level
		photonIntersection.z = 0.0;
		continueTrace = true;
	}
	else
	{
		// extra bounce
		Intersection i;
		vec2 triangleIndex = photonIntersection.xy;

		vec4 V0 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 V1 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 V2 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);

		vec4 N0 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 N1 = texture(texturePolygons, triangleIndex); next(triangleIndex, 1.0);
		vec4 N2 = texture(texturePolygons, triangleIndex);

		i.gnrm = normalize(cross(V1.xyz - V0.xyz, V2.xyz - V0.xyz));


		vec4 barycentric;
		vec3 t0, t1, t2;

		t0 = V1.xyz - V1.xyz;
		t1 = photonPosition.xyz - V0.xyz;
		t2 = cross(t0, t1);
		barycentric.x = length(t2);

		t0 = V2.xyz - V1.xyz;
		t1 = photonPosition.xyz - V1.xyz;
		t2 = cross(t0, t1);
		barycentric.y = length(t2);

		t0 = V0.xyz - V2.xyz;
		t1 = photonPosition.xyz - V2.xyz;
		t2 = cross(t0, t1);
		barycentric.z = length(t2);

		barycentric.w = barycentric.x + barycentric.y + barycentric.z;
		barycentric = barycentric / barycentric.w;

		vec2 T0 = vec2(V0.w, N0.w);
		vec2 T1 = vec2(V1.w, N1.w);
		vec2 T2 = vec2(V2.w, N2.w);
		i.tex = T2 * barycentric.x + T0 * barycentric.y + T1 * barycentric.z;


		// last intersection
		i.t = photonIntersection.w; // later it will be used for distance based attenuation
		i.pos = photonPosition.xyz;
		i.nrm = photonNrm;
		float materialIndex = abs(N0.z) - 1.0;
		i.col = texture(textureMaterials, vec2((materialIndex + 0.25) * materialStride, 0.0)).xyz;
		//i.brdf = BRDFs[int(materialIndex + 0.25)];
		i.brdf = int(texture(textureMaterials, vec2((materialIndex + 0.5 + 0.25) * materialStride, 0.0)).x);
		i.eta = texture(textureMaterials, vec2((materialIndex + 0.25) * materialStride, 0.0)).w;
		i.g = texture(textureMaterials, vec2((materialIndex + 0.5 + 0.25) * materialStride, 0.0)).y;

		if (abs(i.tex.x) < 1e+10) 
		{
			i.col *= texture(volumeTextureTextures, vec3(i.tex, materialNumRcp * (materialIndex + 0.5 + 0.25))).rgb;
		}

		if (i.brdf == 0)
		{
			// matte
			float r0 = 2.0 * 3.141592 * GPURnd(rndv);
			float r1 = sqrt(GPURnd(rndv));
			vec3 v = vec3(sin(r0) * r1, sqrt(1.0 - r1 * r1), cos(r0) * r1);

			r.org = i.pos + eps * i.gnrm;
			r.dir = onb(v, i.nrm);
			if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
		}
		else if ((i.brdf == 1) || (i.brdf == 4))
		{
			// metal
			r.org = i.pos + eps * i.gnrm;
			if (i.brdf == 4) i.nrm = glossy_reflect(i.nrm, i.nrm, 1.0 / pow((1.0 - i.g) * 0.5, 2.71828), rndv);
			r.dir = reflect(photonDirection.xyz, i.nrm);

			if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
		}
		else if ((i.brdf == 2) || (i.brdf == 5))
		{
			if (i.brdf == 5) i.nrm = glossy_reflect(i.nrm, i.nrm, 1.0 / pow((1.0 - i.g) * 0.5, 2.71828), rndv);

			// dielectric
			float ln = dot(i.nrm, photonDirection.xyz);
			float eta = i.eta;

			if (ln < 0.0)
			{
				// ray is going in
				float Re = fresnel(-photonDirection.xyz, i.nrm, 1.0, eta);
				if (GPURnd(rndv) < Re)
				{
					// specular reflection
					r.org = i.pos + eps * i.gnrm;
					r.dir = reflect(photonDirection.xyz, i.nrm);
					i.col = vec3(1.0);
					if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
				}
				else
				{
					// specular refraction
					r.org = i.pos - eps * i.gnrm;
					r.dir = refract(photonDirection.xyz, i.nrm, 1.0 / eta);
					if (dot(r.dir, i.gnrm) > 0.0) r.dir = -r.dir;
				}
			}
			else
			{
				float Re = fresnel(-photonDirection.xyz, -i.nrm, eta, 1.0);
				if (GPURnd(rndv) < Re)
				{
					// specular reflection
					r.org = i.pos - eps * i.gnrm;
					r.dir = reflect(photonDirection.xyz, -i.nrm);
					if (dot(r.dir, -i.gnrm) < 0.0) r.dir = -r.dir;
				}
				else
				{
					// specular refraction
					r.org = i.pos + eps * i.gnrm;
					r.dir = refract(photonDirection.xyz, -i.nrm, eta);
					if (dot(r.dir, -i.gnrm) > 0.0) r.dir = -r.dir;
				}
			}
		}
		else if ((i.brdf == 3) || (i.brdf == 6))
		{
			if (i.brdf == 6) i.nrm = glossy_reflect(i.nrm, i.nrm, 1.0 / pow((1.0 - i.g) * 0.5, 2.71828), rndv);

			// plastic
			float ln = -abs(dot(i.nrm, photonDirection.xyz));
			float eta = i.eta;
			float Re = fresnel(-photonDirection.xyz, i.nrm, 1.0, eta);
			if (GPURnd(rndv) < Re)
			{
				// specular reflection (assume that the color of the coating is 1.0)
				r.org = i.pos + eps * i.gnrm;
				r.dir = reflect(photonDirection.xyz, i.nrm);
				i.col = vec3(1.0);
				if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
			}
			else
			{
				// matte
				float r0 = 2.0 * 3.141592 * GPURnd(rndv);
				float r1 = sqrt(GPURnd(rndv));
				vec3 v = vec3(sin(r0) * r1, sqrt(1.0 - r1 * r1), cos(r0) * r1);

				r.org = i.pos + eps * i.gnrm;
				r.dir = onb(v, i.nrm);
				if (dot(r.dir, i.gnrm) < 0.0) r.dir = -r.dir;
			}
		}

		// Russian roulette
		float p = max(max(i.col.r, i.col.g), i.col.b);
		if (p < GPURnd(rndv))
		{
			// photon is terminated
			continueTrace = false;
		}
		else
		{
			// continue tracing
			continueTrace = true;
			i.col = i.col / p;
			flux = flux * i.col;
		}
		emittedFlag = 0.0;
	}



	if (continueTrace)
	{
		Intersection i = raytrace(r);

		if ((i.t == 1.0e+30) || ((i.brdf != 0) && (i.brdf != 6) && (i.brdf != 3)))
		{
			// no intersection, invalidate the photon
			flux = -flux;
		}

		float gfactor = min(abs(dot(r.dir, i.nrm) / dot(r.dir, i.gnrm)), sqrt(5.0));
		flux *= gfactor;

		lastIntersection.z = photonIntersection.z;
		fragData0 = vec4(i.pos, i.nrm.x);
		fragData1 = vec4( flux, i.nrm.y);
		fragData2 = vec4(r.dir, i.nrm.z);
		fragData3 = rndv;
		fragData4 = lastIntersection;
		fragData5 = vec4(emittedFlag);
	}
	else
	{
		fragData0 = vec4(0.0);
		fragData1 = vec4(vec3(-1.0), 0.0);
		fragData2 = vec4(0.0);
		fragData3 = rndv;
		fragData4 = vec4(-1.0, -1.0, 0.0, 1e+30);
		fragData5 = vec4(emittedFlag);
	}
}

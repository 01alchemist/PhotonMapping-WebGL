#version 300 es

precision mediump float;

in vec2 v_texcoord_0;

uniform sampler2D queryFluxRadiusTexture;
uniform sampler2D queryEmissionPhotonCountTexture;
uniform float totalPhotonNum;

out vec4 fragmentColor;

float sRGB(const float c)
{
	if (c < 0.0031308)
	{
		return 12.92 * c;
	}
	else
	{
		const float a = 0.055;
		return (1.0 + a) * pow(c, 1.0 / 2.4) - a;
	}
}


void main()
{
	vec2 PixelIndex = v_texcoord_0.st;

	// fetch various data of the measurement point
	vec4 QueryFluxRadius = texture(queryFluxRadiusTexture, PixelIndex);
	float QueryRadius = QueryFluxRadius.w;
	vec3 QueryFlux = QueryFluxRadius.xyz;
	vec3 QueryEmission = texture(queryEmissionPhotonCountTexture, PixelIndex).rgb;

	// perform progressive density estimation
//	fragmentColor = vec4(QueryFlux / (QueryRadius * QueryRadius * 3.141592 * totalPhotonNum), 1.0);

	// add emission
//	fragmentColor = fragmentColor + vec4(QueryEmission, 0.0);

	// tone mapping
	const float Exposure = 60000.0;
//	fragmentColor = vec4(1.0) - exp(-fragmentColor * Exposure);

	// sRGB conversion
//	fragmentColor.r = sRGB(fragmentColor.r);
//	fragmentColor.g = sRGB(fragmentColor.g);
//	fragmentColor.b = sRGB(fragmentColor.b);

	fragmentColor = vec4(1.0, 0.5, 0.0, 1.0);
}

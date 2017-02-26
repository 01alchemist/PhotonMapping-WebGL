#version 300 es

precision mediump float;

in vec4 p;

out vec4 fragmentColor;

void main()
{
	fragmentColor = p;
}

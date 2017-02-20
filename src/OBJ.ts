// import {Material} from "./Mesh";
// /**
//  * Created by nidin on 2017-02-18.
//  */
// export function get_indices(char *word, int *vindex, int *tindex, int *nindex) {
// 	char *null = " ";
// 	char *ptr;
// 	char *tp;
// 	char *np;
//
// 	tp = null;
// 	np = null;
//
// 	for (ptr = word; *ptr != '\0'; ptr++)
// 	{
// 		if (*ptr == '/') {
// 			if (tp == null)
// 			{
// 				tp = ptr + 1;
// 			}
// 			else
// 			{
// 				np = ptr + 1;
// 			}
//
// 			*ptr = '\0';
// 		}
// 	}
//
// 	*vindex = atoi(word);
// 	*tindex = atoi(tp);
// 	*nindex = atoi(np);
// }
//
//
// var mtls:Material[];
// export function loadPPM(fname:string, i:number)
// {
// 	FILE *fp;
//
// 	fp = fopen(fname, "rb");
//
// 	fscanf(fp, "P6\n");
// 	fscanf(fp, "%d %d\n", &mtls[i].textureWidth, &mtls[i].textureHeight);
// 	fscanf(fp, "255\n");
// 	mtls[i].texture.resize(mtls[i].textureWidth * mtls[i].textureHeight * 3);
// 	size_t s = fread(&mtls[i].texture[0], 1, mtls[i].textureWidth * mtls[i].textureHeight * 3, fp);
// 	if (s != mtls[i].texture.size())
// 	{
// 		return;
// 	}
// 	fclose(fp);
// }
//
//
// export function loadMTL(fileName:string)
// {
// 	FILE * fp = fopen(fileName.c_str(),"r");
//
// 	TMaterial mtl;
// 	mtl.texture.clear();
// 	char line[81];
// 	while (fgets(line, 80, fp) != NULL)
// 	{
// 		float r, g, b, s;
// 		std::string lineStr;
// 		lineStr = line;
// 		int i = mtls.size();
//
// 		if (lineStr.compare(0, 6, "newmtl", 0, 6) == 0)
// 		{
// 			lineStr.erase(0, 7);
// 			mtl.name = lineStr;
// 			mtl.isTextured = false;
// 		}
// 		else if (lineStr.compare(0, 2, "Ka", 0, 2) == 0)
// 		{
// 			lineStr.erase(0, 3);
// 			sscanf(lineStr.c_str(), "%f %f %f\n", &r, &g, &b);
// 			mtl.Ka = TVector3(r, g, b);
// 		}
// 		else if (lineStr.compare(0, 2, "Kd", 0, 2) == 0)
// 		{
// 			lineStr.erase(0, 3);
// 			sscanf(lineStr.c_str(), "%f %f %f\n", &r, &g, &b);
// 			mtl.Kd = TVector3(r, g, b);
// 		}
// 		else if (lineStr.compare(0, 2, "Ks", 0, 2) == 0)
// 		{
// 			lineStr.erase(0, 3);
// 			sscanf(lineStr.c_str(), "%f %f %f\n", &r, &g, &b);
// 			mtl.Ks = TVector3(r, g, b);
// 		}
// 		else if (lineStr.compare(0, 2, "Ns", 0, 2) == 0)
// 		{
// 			lineStr.erase(0, 3);
// 			sscanf(lineStr.c_str(), "%f\n", &s);
// 			mtl.Ns = s;
// 			mtls.push_back(mtl);
// 			mtls[i].texture.clear();
// 		}
// 		else if (lineStr.compare(0, 6, "map_Kd", 0, 6) == 0)
// 		{
// 			lineStr.erase(0, 7);
// 			lineStr.erase(lineStr.size() - 1, 1);
// 			mtls[i - 1].isTextured = true;
// 			LoadPPM(lineStr.c_str(), i - 1);
// 		}
// 	}
//
// 	fclose(fp);
// }
//
//
// export async function parseOBJ(fileName:string)
// {
//
//     let nVertices:number;
// 	let vertices:Float32Array;
// 	let normals:Float32Array;
// 	let texcoords:Float32Array;
// 	let nIndices:Int32Array;
// 	let indices:Int32Array;
// 	let matid:Int32Array;
//
// 	let response = await fetch(fileName);
//     let contents = await response.text();
// 	let nv:number = 0, nn:number = 0, nf:number = 0, nt:number = 0;
// 	let line:string = contents.substr(0, 80);
//     let limit = contents.length;
//     let i = 0;
//
// 	while (i < limit)
// 	{
// 		std::string lineStr;
// 		lineStr = line;
//
// 		if (lineStr.compare(0, 6, "mtllib", 0, 6) == 0)
// 		{
// 			lineStr.erase(0, 7);
// 			lineStr.erase(lineStr.size() - 1, 1);
// 			LoadMTL(lineStr);
// 		}
//
// 		if (line[0] == 'v')
// 		{
// 			if (line[1] == 'n')
// 			{
// 				nn++;
// 			}
// 			else if (line[1] == 't')
// 			{
// 				nt++;
// 			}
// 			else
// 			{
// 				nv++;
// 			}
// 		}
// 		else if (line[0] == 'f')
// 		{
// 			nf++;
// 		}
//
// 		line = contents.substr(0, 80);
// 	}
// 	fseek(fp, 0, 0);
//
// 	float *n = new float[3 * (nn > nf ? nn : nf)];
// 	float *v = new float[3 * nv];
// 	float *t = new float[2 * nt];
//
// 	int *vInd = new int[3 * nf];
// 	int *nInd = new int[3 * nf];
// 	int *tInd = new int[3 * nf];
// 	int *mInd = new int[nf];
//
// 	int nvertices = 0;
// 	int nnormals = 0;
// 	int ntexcoords = 0;
// 	int nindices  = 0;
// 	int ntriangles = 0;
// 	bool noNormals = false;
// 	bool noTexCoords = false;
// 	bool noMaterials = true;
// 	int cmaterial = 0;
//
// 	while (fgets( line, 80, fp ) != NULL)
// 	{
// 		std::string lineStr;
// 		lineStr = line;
//
// 		if (line[0] == 'v')
// 		{
// 			if (line[1] == 'n')
// 			{
// 				float x, y, z;
// 				sscanf(&line[2], "%f %f %f\n", &x, &y, &z);
// 				float l = sqrt(x * x + y * y + z * z);
// 				x = x / l;
// 				y = y / l;
// 				z = z / l;
// 				n[nnormals] = x;
// 				nnormals++;
// 				n[nnormals] = y;
// 				nnormals++;
// 				n[nnormals] = z;
// 				nnormals++;
// 			}
// 			else if (line[1] == 't')
// 			{
// 				float u, v;
// 				sscanf(&line[2], "%f %f\n", &u, &v);
// 				t[ntexcoords] = u;
// 				ntexcoords++;
// 				t[ntexcoords] = v;
// 				ntexcoords++;
// 			}
// 			else
// 			{
// 				float x, y, z;
// 				sscanf( &line[1], "%f %f %f\n", &x, &y, &z);
// 				v[nvertices] = x;
// 				nvertices++;
// 				v[nvertices] = y;
// 				nvertices++;
// 				v[nvertices] = z;
// 				nvertices++;
// 			}
// 		}
// 		if (lineStr.compare(0, 6, "usemtl", 0, 6) == 0)
// 		{
// 			lineStr.erase(0, 7);
//
// 			if (mtls.size() != 0)
// 			{
// 				for (unsigned int i = 0; i < mtls.size(); i++)
// 				{
// 					if (lineStr.compare(mtls[i].name) == 0)
// 					{
// 						cmaterial = i;
// 						noMaterials = false;
// 						break;
// 					}
// 				}
// 			}
//
// 		}
// 		else if (line[0] == 'f')
// 		{
// 			char s1[32], s2[32], s3[32];
// 			int vI, tI, nI;
// 			sscanf(&line[1], "%s %s %s\n", s1, s2, s3);
//
// 			mInd[ntriangles] = cmaterial;
//
// 			// indices for first vertex
// 			get_indices(s1, &vI, &tI, &nI);
// 			vInd[nindices] = vI - 1;
// 			if (nI)
// 			{
// 				nInd[nindices] = nI - 1;
// 			}
// 			else
// 			{
// 				noNormals = true;
// 			}
//
// 			if (tI)
// 			{
// 				tInd[nindices] = tI - 1;
// 			}
// 			else
// 			{
// 				noTexCoords = true;
// 			}
// 			nindices++;
//
// 			// indices for second vertex
// 			get_indices(s2, &vI, &tI, &nI);
// 			vInd[nindices] = vI - 1;
// 			if (nI)
// 			{
// 				nInd[nindices] = nI - 1;
// 			}
// 			else
// 			{
// 				noNormals = true;
// 			}
//
// 			if (tI)
// 			{
// 				tInd[nindices] = tI - 1;
// 			}
// 			else
// 			{
// 				noTexCoords = true;
// 			}
// 			nindices++;
//
// 			// indices for third vertex
// 			get_indices(s3, &vI, &tI, &nI);
// 			vInd[nindices] = vI - 1;
// 			if (nI)
// 			{
// 				nInd[nindices] = nI - 1;
// 			}
// 			else
// 			{
// 				noNormals = true;
// 			}
//
// 			if (tI)
// 			{
// 				tInd[nindices] = tI - 1;
// 			}
// 			else
// 			{
// 				noTexCoords = true;
// 			}
// 			nindices++;
//
// 			ntriangles++;
// 		}
// 	}
//
// 	// we don't support separate indices for normals, vertices, and texture coordinates.
// 	*vertices = new float[ntriangles*9];
// 	if (!noNormals)
// 	{
// 		*normals = new float[ntriangles*9];
// 	}
// 	else
// 	{
// 		*normals = 0;
// 	}
//
// 	if (!noTexCoords)
// 	{
// 		*texcoords = new float[ntriangles*6];
// 	}
// 	else
// 	{
// 		*texcoords = 0;
// 	}
//
// 	if (!noMaterials)
// 	{
// 		*materials = new int[ntriangles];
// 	}
// 	else
// 	{
// 		*materials = 0;
// 	}
//
// 	*indices = new int[ntriangles*3];
// 	nVertices = ntriangles*3;
// 	nIndices = ntriangles*3;
//
// 	for (int i = 0; i < ntriangles; i++)
// 	{
// 		if (!noMaterials)
// 		{
// 			(*materials)[i] = mInd[i];
// 		}
//
// 		(*indices)[3 * i] = 3 * i;
// 		(*indices)[3 * i + 1] = 3 * i + 1;
// 		(*indices)[3 * i + 2] = 3 * i + 2;
//
// 		(*vertices)[9 * i] = v[3 * vInd[3 * i]];
// 		(*vertices)[9 * i + 1] = v[3 * vInd[3 * i] + 1];
// 		(*vertices)[9 * i + 2] = v[3 * vInd[3 * i] + 2];
//
// 		(*vertices)[9 * i + 3] = v[3 * vInd[3 * i + 1]];
// 		(*vertices)[9 * i + 4] = v[3 * vInd[3 * i + 1] + 1];
// 		(*vertices)[9 * i + 5] = v[3 * vInd[3 * i + 1] + 2];
//
// 		(*vertices)[9 * i + 6] = v[3 * vInd[3 * i + 2]];
// 		(*vertices)[9 * i + 7] = v[3 * vInd[3 * i + 2] + 1];
// 		(*vertices)[9 * i + 8] = v[3 * vInd[3 * i + 2] + 2];
//
// 		if(!noNormals)
// 		{
// 			(*normals)[9 * i] = n[3 * nInd[3 * i]];
// 			(*normals)[9 * i + 1] = n[3 * nInd[3 * i]+1];
// 			(*normals)[9 * i + 2] = n[3 * nInd[3 * i]+2];
//
// 			(*normals)[9 * i + 3] = n[3*nInd[3 * i + 1]];
// 			(*normals)[9 * i + 4] = n[3*nInd[3 * i + 1] + 1];
// 			(*normals)[9 * i + 5] = n[3*nInd[3 * i + 1] + 2];
//
// 			(*normals)[9 * i + 6] = n[3*nInd[3 * i + 2]];
// 			(*normals)[9 * i + 7] = n[3*nInd[3 * i + 2] + 1];
// 			(*normals)[9 * i + 8] = n[3*nInd[3 * i + 2] + 2];
// 		}
//
// 		if(!noTexCoords)
// 		{
// 			(*texcoords)[6 * i ] = t[2*tInd[3 * i]];
// 			(*texcoords)[6 * i + 1] = t[2*tInd[3 * i] + 1];
//
// 			(*texcoords)[6 * i + 2] = t[2*tInd[3 * i + 1]];
// 			(*texcoords)[6 * i + 3] = t[2*tInd[3 * i + 1] + 1];
//
// 			(*texcoords)[6 * i + 4] = t[2*tInd[3 * i + 2]];
// 			(*texcoords)[6 * i + 5] = t[2*tInd[3 * i + 2] + 1];
// 		}
//
// 	}
//
// 	fclose(fp);
//
// 	delete[] n;
// 	delete[] v;
// 	delete[] t;
// 	delete[] nInd;
// 	delete[] vInd;
// 	delete[] tInd;
// 	delete[] mInd;
// }
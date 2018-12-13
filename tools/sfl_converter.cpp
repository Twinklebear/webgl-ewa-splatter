#define NOMINMAX
#include <iostream>
#include <algorithm>
#include <string>
#include <vector>
#include <fstream>
#include <sfl.h>

#define RMASK 0xff000000
#define GMASK 0x00ff0000
#define BMASK 0x0000ff00

#define SET_RED(P, C) (P = ((P & ~RMASK) | (C << 24)))
#define SET_GREEN(P, C) (P = ((P & ~GMASK) | (C << 16)))
#define SET_BLUE(P, C) (P = ((P & ~BMASK) | (C << 8)))
#define GET_RED(P) ((P & RMASK) >> 24)
#define GET_GREEN(P) ((P & GMASK) >> 16)
#define GET_BLUE(P) ((P & BMASK) >> 8)

// The RAW surfel file format (.rsf) is simply a list of
// surfels, where each surfel is specified by 8 floats (32 bytes):
// x, y, z, radius, nx, ny, nz, color (rgba8)
// The number of surfels in the file is: file_size / 32
// The alpha component of the color is unused

template<typename T>
T clamp(const T &x, const T &lo, const T &hi) {
	if (x < lo) {
		return lo;
	} else if (x > hi) {
		return hi;
	}
	return x;
}


#pragma pack
struct Surfel {
	float x, y, z, radius, nx, ny, nz;
	int color;
};

int main(int argc, char **argv) {
	if (argc == 1) {
		std::cout << "Usage: " << argv[0] << " <input.sfl> <output.rsf>\n";
		return 0;
	}
	sfl::InStream *in = sfl::InStream::open(argv[1]);
	if (!in) {
		std::cout << "Error opening surfel file " << argv[1] << "\n";
	}
	if (in->queryOverAllBoundingBox()) {
		double x1, y1, z1;
		double x2, y2, z2;
		in->getOverAllBoundingBox(x1, y1, z1, x2, y2, z2);
		std::cout << "Overall bounding box: ["
			<<  x1 << ", " << y1 << ", " << z1 << "] to ["
			<< x2 << ", " << y2 << ", " << z2 << "]\n";
	} else {
		std::cout << "No bounding box given\n";
	}

	std::vector<Surfel> surfels;

	in->setReadAsWorldCoordinates(false);
	const int num_surfel_sets = in->getNumSurfelSets();
	std::cout << argv[1] << " contains " << num_surfel_sets << " surfel sets\n";
	for (int i = 0; i < num_surfel_sets; ++i) {
		if (!in->seekSurfelSet(i)) {
			std::cout << "Error reading surfel set " << i << "\n";
			continue;
		}

		char *set_ident = in->getSurfelSetIdentifier();
		std::cout << "Surfel Set " << i << " identifier: "
			<< set_ident << "\n";
		sfl::memFree(set_ident);
		// We want to read positions, radii, normals and RGB colors for the surfels
		in->setSurfelSetPropertyHints(SFLPROP_POSITION
				| SFLPROP_RADIUS
				| SFLPROP_NORMAL
				| SFLPROP_DIFFUSE_COLOR
				| SFLPROP_COLOR_MODEL_RGB);

		if (!in->seekResolution(in->getSurfelSetRes0Index())) {
			std::cout << "Error seeking to res 0 for surfel set\n";
			continue;
		}

		std::cout << "Num surfels: " << in->getResolutionNumSurfels() << "\n";
		surfels.reserve(in->getResolutionNumSurfels());
		for (int j = 0; j < in->getResolutionNumSurfels(); ++j) {
			if (in->beginSurfel()) {
				std::cout << "Error reading surfel\n";
				break;
			}
			Surfel surf;
			float r, g, b;
			in->readSurfelPosition3(surf.x, surf.y, surf.z);
			in->readSurfelNormal3(surf.nx, surf.ny, surf.nz);
			in->readSurfelRadius(surf.radius);
			in->readSurfelColorRGBf(sfl::DIFFUSE, r, g, b);
			in->endSurfel();

			surf.color = 0;
			SET_RED(surf.color, static_cast<int>(clamp(r * 255.f, 0.f, 255.f)));
			SET_GREEN(surf.color, static_cast<int>(clamp(g * 255.f, 0.f, 255.f)));
			SET_BLUE(surf.color, static_cast<int>(clamp(b * 255.f, 0.f, 255.f)));

			surfels.push_back(surf);
		}
	}
	sfl::InStream::close(in);

	std::ofstream fout(argv[2], std::ios::binary);
	fout.write(reinterpret_cast<char*>(surfels.data()), sizeof(Surfel) * surfels.size());

	return 0;
}


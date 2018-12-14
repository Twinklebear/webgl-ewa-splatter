#define NOMINMAX
#include <iostream>
#include <algorithm>
#include <string>
#include <vector>
#include <fstream>
#include <sfl.h>

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

float srgb_to_linear(const float x) {
	if (x <= 0.04045) {
		return x / 12.92;
	} else {
		return std::pow((x + 0.055f) / 1.055f, 2.4f);
	}
}

#pragma pack
struct Surfel {
	float x, y, z, radius;
	float nx, ny, nz, pad;
	float r, g, b, pad2;
};

int main(int argc, char **argv) {
	if (argc == 1) {
		std::cout << "Usage: " << argv[0] << " <input.sfl> <output.rsf>\n";
		return 0;
	}
	const bool srgb_convert = (argc >= 3 && std::strcmp(argv[2], "-srgb") == 0);
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
			in->readSurfelPosition3(surf.x, surf.y, surf.z);
			in->readSurfelNormal3(surf.nx, surf.ny, surf.nz);
			in->readSurfelRadius(surf.radius);
			in->readSurfelColorRGBf(sfl::DIFFUSE, surf.r, surf.g, surf.b);
			in->endSurfel();

			if (srgb_convert) {
				surf.r = srgb_to_linear(surf.r);
				surf.g = srgb_to_linear(surf.g);
				surf.b = srgb_to_linear(surf.b);
			}
			surfels.push_back(surf);
		}
	}
	sfl::InStream::close(in);

	std::ofstream fout(argv[2], std::ios::binary);
	fout.write(reinterpret_cast<char*>(surfels.data()), sizeof(Surfel) * surfels.size());

	return 0;
}


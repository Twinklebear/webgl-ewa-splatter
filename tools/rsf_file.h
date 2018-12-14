#pragma once

#include <string>
#include <vector>

// The RAW surfel file format (.rsf) is simply a list of
// surfels, where each surfel is specified by 8 floats (32 bytes):
// x, y, z, radius, nx, ny, nz, color (rgba8)
// The number of surfels in the file is: file_size / 32
// The alpha component of the color is unused

template<typename T>
inline T clamp(const T &x, const T &lo, const T &hi) {
	if (x < lo) {
		return lo;
	} else if (x > hi) {
		return hi;
	}
	return x;
}

inline float srgb_to_linear(const float x) {
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

void write_raw_surfels(const std::string &fname, const std::vector<Surfel> &surfels);


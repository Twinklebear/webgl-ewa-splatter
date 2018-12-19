#pragma once

#include <string>
#include <vector>

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
	if (x <= 0.04045f) {
		return x / 12.92f;
	} else {
		return std::pow((x + 0.055f) / 1.055f, 2.4f);
	}
}

#pragma pack(1)
struct Surfel {
	float x, y, z, radius;
	float nx, ny, nz, pad;
	float r, g, b, pad2;

	Surfel();
};

/* The RAW surfel file V2 (.rsf) is a list of surfel positions, radii, and normals
 * followed by a list of rgba colors for the surfels.
 *
 * There are two uint64's, specifying the number of surfels, and the offset to the color values
 * The positions are stored as single-precision vec4's with the radius as the w component
 * The normals are stored as half-precision vec4's
 * The colors are stored as RGBA8, the offset to the start of the colors is nsurfels * 24
 *
 * uint32 nsurfels
 * [vec3f position, float radius, vec4h normal, ...]
 * [rgba8, ...]
 */
void write_raw_surfels_v2(const std::string &fname, const std::vector<Surfel> &surfels);
void read_raw_surfels_v2(const std::string &fname, std::vector<Surfel> &surfels);


/* The RAW surfel file format V1 (.rsf) is simply a list of
 * surfels, where each surfel is specified by 8 floats (32 bytes):
 * x, y, z, radius, nx, ny, nz, color (rgba8)
 * The number of surfels in the file is: file_size / 32
 * The alpha component of the color is unused
 */
void write_raw_surfels_v1(const std::string &fname, const std::vector<Surfel> &surfels);
void read_raw_surfels_v1(const std::string &fname, std::vector<Surfel> &surfels);

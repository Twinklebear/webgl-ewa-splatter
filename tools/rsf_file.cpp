#include <fstream>
#include <iostream>
#include <array>
#include <glm/glm.hpp>
#include <glm/gtc/packing.hpp>
#include "rsf_file.h"

Surfel::Surfel() : x(0), y(0), z(0), radius(1),
	nx(0), ny(0), nz(1), pad(0), r(1), g(1), b(1), pad2(0)
{}

#pragma pack(1)
struct PackedSurfel {
	float x, y, z, radius;
	float nx, ny, nz, pad;

	PackedSurfel()
		: x(0), y(0), z(0), radius(0),
		nx(0), ny(0), nz(0), pad(0)
	{}
};

void write_raw_surfels_v2(const std::string &fname, const std::vector<Surfel> &surfels) {
	std::ofstream fout(fname.c_str(), std::ios::binary);
	std::vector<PackedSurfel> packed_surfs;
	std::vector<uint8_t> colors;

	packed_surfs.reserve(surfels.size());
	colors.reserve(surfels.size());
	for (const auto &s : surfels) {
		PackedSurfel p;
		p.x = s.x;
		p.y = s.y;
		p.z = s.z;
		p.radius = s.radius;
		p.nx = s.nx;
		p.ny = s.ny;
		p.nz = s.nz;
		packed_surfs.push_back(p);

		colors.push_back(static_cast<uint8_t>(clamp(s.r * 255.f, 0.f, 255.f)));
		colors.push_back(static_cast<uint8_t>(clamp(s.g * 255.f, 0.f, 255.f)));
		colors.push_back(static_cast<uint8_t>(clamp(s.b * 255.f, 0.f, 255.f)));
		colors.push_back(255);
	}
	const uint32_t header = surfels.size();
	fout.write(reinterpret_cast<const char*>(&header), sizeof(uint32_t));
	fout.write(reinterpret_cast<const char*>(packed_surfs.data()),
			sizeof(PackedSurfel) * packed_surfs.size());
	fout.write(reinterpret_cast<const char*>(colors.data()), colors.size());
}
void read_raw_surfels_v2(const std::string &fname, std::vector<Surfel> &surfels) {
}

void write_raw_surfels_v1(const std::string &fname, const std::vector<Surfel> &surfels) {
	std::ofstream fout(fname.c_str(), std::ios::binary);
	fout.write(reinterpret_cast<const char*>(surfels.data()), sizeof(Surfel) * surfels.size());
}
void read_raw_surfels_v1(const std::string &fname, std::vector<Surfel> &surfels) {
	std::ifstream fin(fname.c_str(), std::ios::binary | std::ios::ate);
	const size_t size = fin.tellg();
	fin.seekg(std::ios::beg, 0);
	assert(size % sizeof(Surfel) == 0);
	surfels.resize(size / sizeof(Surfel));
	fin.read(reinterpret_cast<char*>(surfels.data()), size);
}


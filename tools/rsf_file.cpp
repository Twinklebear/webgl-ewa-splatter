#include <fstream>
#include "rsf_file.h"

Surfel::Surfel() : x(0), y(0), z(0), radius(1),
	nx(0), ny(0), nz(1), pad(0), r(1), g(1), b(1), pad2(0)
{}

void write_raw_surfels(const std::string &fname, const std::vector<Surfel> &surfels) {
	std::ofstream fout(fname.c_str(), std::ios::binary);
	fout.write(reinterpret_cast<const char*>(surfels.data()), sizeof(Surfel) * surfels.size());
}


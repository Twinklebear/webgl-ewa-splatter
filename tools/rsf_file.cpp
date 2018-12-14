#include <fstream>
#include "rsf_file.h"

void write_raw_surfels(const std::string &fname, const std::vector<Surfel> &surfels) {
	std::ofstream fout(fname.c_str(), std::ios::binary);
	fout.write(reinterpret_cast<const char*>(surfels.data()), sizeof(Surfel) * surfels.size());
}


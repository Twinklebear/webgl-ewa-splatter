#include <iostream>
#include <string>
#include <vector>
#include <fstream>
#include "rsf_file.h"
#include "streaming_rsf_file.h"

int main(int argc, char **argv) {
	if (argc == 1) {
		std::cout << "Usage: " << argv[0] << " <input.rsf v1> <output dir>\n";
		return 0;
	}
	float scale_factor = -1.0;
	if (argc == 4) {
		scale_factor = std::stof(argv[3]);
	}

	std::vector<Surfel> surfels;
	read_raw_surfels_v1(argv[1], surfels);
	if (scale_factor > 0.0) {
		for (auto &s : surfels) {
			s.x *= scale_factor;
			s.y *= scale_factor;
			s.z *= scale_factor;
			s.radius *= scale_factor;
		}
	}
	surfels.resize(128);
	write_streaming_surfels(argv[2], surfels);
	return 1;
}



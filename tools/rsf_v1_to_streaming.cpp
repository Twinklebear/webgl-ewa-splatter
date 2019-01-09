#include <iostream>
#include <algorithm>
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
	auto end = std::remove_if(surfels.begin(), surfels.end(),
		[](const Surfel &s) {
			return !std::isnormal(s.x)
				|| !std::isnormal(s.y)
				|| !std::isnormal(s.z)
				|| !std::isnormal(s.nx)
				|| !std::isnormal(s.ny)
				|| !std::isnormal(s.nz);
		});
	surfels.erase(end, surfels.end());
	if (scale_factor > 0.0) {
		for (auto &s : surfels) {
			s.x *= scale_factor;
			s.y *= scale_factor;
			s.z *= scale_factor;
			s.radius *= scale_factor;
		}
	}
	write_streaming_surfels(argv[2], surfels);
	return 1;
}



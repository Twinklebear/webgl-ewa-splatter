#include <iostream>
#include <string>
#include <vector>
#include <fstream>
#include "rsf_file.h"

int main(int argc, char **argv) {
	if (argc == 1) {
		std::cout << "Usage: " << argv[0] << " <input.rsf v1> <output.rsf v2>\n";
		return 0;
	}

	std::vector<Surfel> surfels;
	read_raw_surfels_v1(argv[1], surfels);
	write_raw_surfels_v2(argv[2], surfels);
	return 1;
}


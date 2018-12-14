#define NOMINMAX
#include <iostream>
#include <algorithm>
#include <string>
#include <vector>
#include <fstream>
#include "rsf_file.h"

/* TODO: This is unfinished, the QSplat format has a lot of quantization
 * that we'd have to unpack, which is not bad since we can just take their
 * source code to do it, but it's a bit of a pain
 */

#if 0
// Please see the QSplat source code http://graphics.stanford.edu/software/qsplat/
// for more details on the file loading and format

// QSplat files look to be big endian? Assume we're little endian now
#define SWAP_SHORT(x) ( (((x) & 0xff) << 8) | ((unsigned short)(x) >> 8) )
#define SWAP_LONG(x) ( ((x) << 24) | \
                       (((x) << 8) & 0x00ff0000) | \
		       (((x) >> 8) & 0x0000ff00) | \
		       ((x) >> 24) )

#define FIX_SHORT(x) (*(unsigned short *)&(x) = \
			SWAP_SHORT(*(unsigned short *)&(x)))
#define FIX_LONG(x) (*(unsigned *)&(x) = \
			SWAP_LONG(*(unsigned *)&(x)))
#define FIX_FLOAT(x) FIX_LONG(x)

#define QSPLAT_MAGIC "QSplat"
#define QSPLAT_FILE_VERSION 11
#define MINSIZE_MIN 1.0f
#define MINSIZE_MAX 50.0f
#define MINSIZE_REFINE_MULTIPLIER 0.7f

int main(int argc, char **argv) {
	if (argc == 1) {
		std::cout << "Usage: " << argv[0] << " <input.qs> <output.rsf>\n";
		return 0;
	}
	const bool srgb_convert = (argc >= 3 && std::strcmp(argv[2], "-srgb") == 0);

	std::ifstream fin(argv[1], std::ios::binary);
	fin.seekg(0, std::ios::end);
	const size_t len = fin.tellg();
	fin.seekg(0);

	if (len < 40 ) {
		std::cout << "Error reading header of file\n";
		return 1;
	}

	// Header info 9 bytes: a string to 6 chars ID the file, and a version as 2 chars,
	// followed by null-terminator
	char header_str[9];
	fin.read(header_str, 9);
	if (strncmp(header_str, QSPLAT_MAGIC, 6) != 0) {
		std::cout << "Error: " << argv[1] << " is not a QSplat file\n";
		return 1;
	}

	char version_buf[3] = {0};
	sprintf(buf, "%02d", QSPLAT_FILE_VERSION);
	if (version_buf[0] != header[6] || version_buf[1] != header[7]) {
		std::cout << "Error: " << argv[1] << " is for a different version of QSplat\n";
		return 1;
	}

	// A QSplat file consists of multiple "fragments", though I'm not
	// sure what this means. The Lion and Bunny are just a single one

		int fraglen = * (int *)(here+8);
		FIX_LONG(fraglen);
		if (here+fraglen > map_start+len) {
			Error(filename, " is truncated");
			return false;
		}

		if ((*(unsigned char *)(here+19)) & 2) {
			comments.append((const char *)(here+20), fraglen-20);
			here += fraglen;
			continue;
		}

		int points = * (int *)(here+12);
		FIX_LONG(points);
		leaf_points += points;

		// Most likely this is the center of the object's bounding sphere
		float x = * (float *)(here+20); FIX_FLOAT(x);
		float y = * (float *)(here+24); FIX_FLOAT(y);
		float z = * (float *)(here+28); FIX_FLOAT(z);
		// Radius of the objects bounding sphere?
		float r = * (float *)(here+32); FIX_FLOAT(r);
		xmin = min(xmin, x-r);  xmax = max(xmax, x+r);
		ymin = min(ymin, y-r);  ymax = max(ymax, y+r);
		zmin = min(zmin, z-r);  zmax = max(zmax, z+r);

		// At here+32 we have all the point data, quantized a ton.
		// We can unpack this using their code, but it's a bit of a pain.
		// Everything is also big-endian in the file.
		fragments.push_back(here);
		here += fraglen;

	}

	center[0] = 0.5f * (xmin + xmax);
	center[1] = 0.5f * (ymin + ymax);
	center[2] = 0.5f * (zmin + zmax);
	radius = 0.5f*sqrtf(sqr(xmax-xmin) + sqr(ymax-ymin) + sqr(zmax-zmin));

	char buf[255];
	sprintf(buf, "%d leaf points\n", leaf_points);
	comments += buf;
#ifndef WIN32
	fprintf(stderr, buf);
#endif
	return true;
}

	return 0;
}
#endif


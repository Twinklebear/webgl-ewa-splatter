#include <fstream>
#include <iostream>
#include <array>
#ifndef _WIN32
#include <sys/stat.h>
#include <sys/types.h>
#include <stdio.h>
#else
#include <direct.h>
#endif
#include <glm/glm.hpp>
#include <glm/ext.hpp>
#include <glm/packing.hpp>
#include "streaming_kd_tree.h"

void make_dir(const std::string &dir) {
	// The dir may already exist which would cause us to fail,
	// but that's a case we don't really consider a "failure",
	// since the user already made the directory.
#ifndef _WIN32
	mkdir(dir.c_str(), S_IRWXU | S_IRWXG);
#else
	_mkdir(dir.c_str());
#endif
}

#pragma pack(1)
struct StreamingSurfel {
	uint16_t x, y, z, radius;
	uint16_t nx, ny, nz, pad;
};

void write_kdsubtree(const std::string &dirname, const KdSubTree &tree) {
	const std::string fname = dirname + "/" + std::to_string(tree.root_id) + ".srsf";
	std::ofstream fout(fname.c_str(), std::ios::binary);
	std::vector<StreamingSurfel> surfs;
	std::vector<uint8_t> colors;

	// TODO: Quantize surfel positions to the parent box bounds
	surfs.reserve(tree.surfels.size());
	colors.reserve(tree.surfels.size());
	for (const auto &s : tree.surfels) {
		StreamingSurfel p;
		p.x = glm::packHalf1x16(s.x);
		p.y = glm::packHalf1x16(s.y);
		p.z = glm::packHalf1x16(s.z);
		p.radius = glm::packHalf1x16(s.radius);
		const glm::vec3 n = glm::normalize(glm::vec3(s.nx, s.ny, s.nz));
		p.nx = glm::packHalf1x16(n.x);
		p.ny = glm::packHalf1x16(n.y);
		p.nz = glm::packHalf1x16(n.z);
		p.pad = std::numeric_limits<uint16_t>::max();
		surfs.push_back(p);

		colors.push_back(static_cast<uint8_t>(clamp(s.r * 255.f, 0.f, 255.f)));
		colors.push_back(static_cast<uint8_t>(clamp(s.g * 255.f, 0.f, 255.f)));
		colors.push_back(static_cast<uint8_t>(clamp(s.b * 255.f, 0.f, 255.f)));
		colors.push_back(255);
	}

	std::array<uint32_t, 5> header = {
		static_cast<uint32_t>(surfs.size()),
		static_cast<uint32_t>(tree.nodes.size() * sizeof(StreamingKdNode)
			+ (5 + tree.primitive_indices.size()) * sizeof(uint32_t)
			+ sizeof(Box)),
		static_cast<uint32_t>(tree.nodes.size()),
		static_cast<uint32_t>(tree.primitive_indices.size()),
		tree.root_id
	};
	fout.write(reinterpret_cast<const char*>(header.data()), sizeof(uint32_t) * header.size());
	fout.write(reinterpret_cast<const char*>(&tree.subtree_bounds), sizeof(Box));

	fout.write(reinterpret_cast<const char*>(tree.nodes.data()),
			sizeof(StreamingKdNode) * tree.nodes.size());
	fout.write(reinterpret_cast<const char*>(tree.primitive_indices.data()),
			sizeof(uint32_t) * tree.primitive_indices.size());

	fout.write(reinterpret_cast<const char*>(surfs.data()), sizeof(StreamingSurfel) * surfs.size());
	fout.write(reinterpret_cast<const char*>(colors.data()), colors.size());
}

void write_streaming_surfels(const std::string &dirname, const std::vector<Surfel> &surfels) {
	make_dir(dirname);
	std::cout << "Input surfels: " << surfels.size() << "\n";
	//const size_t subtree_size = 1024;// * 1024;

	StreamingSplatKdTree forest(surfels);
	auto subtrees = forest.build_subtrees(forest.tree_depth / 5);
	std::cout << "Number of subtrees to write: " << subtrees.size() << "\n";
	for (const auto &st : subtrees) {
		write_kdsubtree(dirname, st);
	}
}


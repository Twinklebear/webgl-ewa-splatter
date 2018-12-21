#pragma once

#include <vector>
#include <ostream>
#include <glm/glm.hpp>

enum AXIS {X, Y, Z};

struct Box {
	glm::vec3 lower, upper;

	Box();
	void extend(const glm::vec3 &p);
	void box_union(const Box &b);
	bool overlaps(const Box &b);
	AXIS longest_axis() const;
	glm::vec3 center() const;
};
std::ostream& operator<<(std::ostream &os, const Box &b);

Box surfel_bounds(const glm::vec3 &center, const glm::vec3 &normal, const float radius);

#pragma pack(1)
struct KdNode {
	union {
		// Interior node, splitting position along the axis
		float split_pos;
		// Leaf node, offset in 'primitive_indices' to its contained prims
		uint32_t prim_indices_offset;
	};
	// Used by inner and leaf, lower 2 bits used by both inner and leaf
	// nodes, for inner nodes the lower bits track the split axis,
	// for leaf nodes they indicate it's a leaf
	union {
		// Interior node, offset to its right child (with elements above
		// the splitting plane)
		uint32_t right_child;
		// Leaf node, number of primitives in the leaf
		uint32_t num_prims;
	};

	// Interior node
	KdNode(float split_pos, AXIS split_axis);
	// Leaf node
	KdNode(uint32_t nprims, uint32_t prim_offset);

	void set_right_child(uint32_t right_child);
	uint32_t get_num_prims() const;
	uint32_t right_child_offset() const;
	AXIS split_axis() const;
	bool is_leaf() const;
};

/* A very simple median-split kd tree
 */
struct SplatKdTree {
	std::vector<Box> bounds;
	std::vector<KdNode> nodes;
	std::vector<uint32_t> primitive_indices;

	int max_depth;
	int min_prims;

	SplatKdTree(std::vector<Box> bounds);

private:
	// Recursively build the tree, returns this node's index in the
	// nodes vector when it's written in
	uint32_t build_tree(const Box &node_bounds,
			const std::vector<uint32_t> &contained_prims,
			const int depth);
};


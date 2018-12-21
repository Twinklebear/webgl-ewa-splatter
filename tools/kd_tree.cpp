#include <iostream>
#include <algorithm>
#include <numeric>
#include <cmath>
#include <glm/glm.hpp>
#include <glm/ext.hpp>
#include "kd_tree.h"

Box::Box() : lower(std::numeric_limits<float>::infinity()),
	upper(-std::numeric_limits<float>::infinity())
{}
void Box::extend(const glm::vec3 &p) {
	lower = glm::min(lower, p);
	upper = glm::max(upper, p);
}
void Box::box_union(const Box &b) {
	extend(b.lower);
	extend(b.upper);
}
bool Box::overlaps(const Box &b) {
	if (lower.x > b.upper.x || b.lower.x > upper.x) {
		return false;
	}
	if (lower.y > b.upper.y || b.lower.y > upper.y) {
		return false;
	}
	if (lower.z > b.upper.z || b.lower.z > upper.z) {
		return false;
	}
	return true;
}
AXIS Box::longest_axis() const {
	const glm::vec3 diag = upper - lower;
	if (diag.x >= diag.y && diag.x >= diag.z) {
		return X;
	}
	if (diag.y >= diag.z) {
		return Y;
	}
	return Z;
}
glm::vec3 Box::center() const {
	return lower + glm::vec3(upper - lower) * 0.5;
}
std::ostream& operator<<(std::ostream &os, const Box &b) {
	os << "Box [" << glm::to_string(b.lower) << ", "
		<< glm::to_string(b.upper) << "]";
	return os;
}

Box surfel_bounds(const glm::vec3 &center, const glm::vec3 &normal, const float radius) {
	glm::vec3 ax0 = glm::normalize(glm::cross(normal, glm::vec3(1, 0, 0)));
	glm::vec3 ax1 = glm::normalize(glm::cross(normal, ax0));
	ax0 = glm::normalize(glm::cross(normal, ax1));
	Box b;
	b.extend(center + radius * ax0);
	b.extend(center - radius * ax0);
	b.extend(center + radius * ax1);
	b.extend(center - radius * ax1);
	b.extend(center + normal * 0.0001);
	b.extend(center - normal * 0.0001);
	return b;
}

KdNode::KdNode(float split_pos, AXIS split_axis)
	: split_pos(split_pos),
	right_child(static_cast<uint32_t>(split_axis))
{}
KdNode::KdNode(uint32_t nprims, uint32_t prim_offset)
	: prim_indices_offset(prim_offset),
	num_prims(3 | (nprims << 2))
{}
void KdNode::set_right_child(uint32_t r) {
	right_child |= (r << 2);
}
uint32_t KdNode::get_num_prims() const {
	return num_prims >> 2;
}
uint32_t KdNode::right_child_offset() const {
	return right_child >> 2;
}
AXIS KdNode::split_axis() const {
	return static_cast<AXIS>(num_prims & 3);
}
bool KdNode::is_leaf() const {
	return num_prims & 3 == 3;
}

SplatKdTree::SplatKdTree(std::vector<Box> inbounds)
	: bounds(inbounds), max_depth(8 + 1.3 * std::log2(bounds.size())), min_prims(64)
{
	std::vector<uint32_t> contained_prims(bounds.size(), 0);
	std::iota(contained_prims.begin(), contained_prims.end(), 0);

	Box tree_bounds;
	for (const auto &b : bounds) { 
		tree_bounds.box_union(b);
	}
	build_tree(tree_bounds, contained_prims, 0);
}
uint32_t SplatKdTree::build_tree(const Box &node_bounds,
		const std::vector<uint32_t> &contained_prims,
		const int depth)
{
	// We've hit max depth or the prim threshold, so make a leaf
	if (depth >= max_depth || contained_prims.size() <= min_prims) {
		KdNode node(contained_prims.size(), primitive_indices.size());
		std::copy(contained_prims.begin(), contained_prims.end(),
				std::back_inserter(primitive_indices));
		const uint32_t node_index = nodes.size();
		nodes.push_back(node);
		return node_index;
	}

	// We're making an interior node, find the median point and
	// split the objects
	Box centroid_bounds;
	std::vector<glm::vec3> centroids;
	for (const auto &p : contained_prims) {
		centroids.push_back(bounds[p].center());
		centroid_bounds.extend(centroids.back());
	}

	const AXIS split_axis = centroid_bounds.longest_axis();
	std::sort(centroids.begin(), centroids.end(),
		[&](const glm::vec3 &a, const glm::vec3 &b) {
			return a[split_axis] < b[split_axis];
		});
	const float split_pos = centroids[centroids.size() / 2][split_axis];

	// Boxes for left/right child nodes
	Box left_box = node_bounds;
	left_box.upper[split_axis] = split_pos;
	Box right_box = node_bounds;
	right_box.lower[split_axis] = split_pos;
	// Collect primitives for the left/right children
	std::vector<uint32_t> left_prims, right_prims;
	for (const auto &p : contained_prims) {
		if (bounds[p].lower[split_axis] <= split_pos) {
			left_prims.push_back(p);
		}
		if (bounds[p].upper[split_axis] >= split_pos) {
			right_prims.push_back(p);
		}
	}

	KdNode inner(split_pos, split_axis);
	const uint32_t inner_idx = nodes.size();
	nodes.push_back(inner);

	// Build left child, will be placed after this inner node
	build_tree(left_box, left_prims, depth + 1);
	// Build right child
	const uint32_t right_child = build_tree(right_box, right_prims, depth + 1);
	nodes[inner_idx].set_right_child(right_child);
	return inner_idx;
}


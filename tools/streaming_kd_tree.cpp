#include <iostream>
#include <stack>
#include <algorithm>
#include <numeric>
#include <cmath>
#include <glm/glm.hpp>
#include <glm/ext.hpp>
#define GLM_ENABLE_EXPERIMENTAL
#include <glm/gtx/string_cast.hpp>
#include <glm/gtx/component_wise.hpp>
#include "kd_tree.h"
#include "streaming_kd_tree.h"

StreamingKdNode::StreamingKdNode(float split_pos, uint32_t lod_prim, AXIS split_axis)
	: split_pos(split_pos),
	prim_indices_offset(lod_prim),
	right_child(0),
	num_prims(static_cast<uint32_t>(split_axis))
{}
StreamingKdNode::StreamingKdNode(uint32_t nprims, uint32_t prim_offset)
	: split_pos(0.f),
	prim_indices_offset(prim_offset),
	right_child(0),
	num_prims(3 | (nprims << 2))
{}
void StreamingKdNode::set_left_child(uint32_t left_child, bool external) {
	// Keep just the low bits tagging what our split axis is
	num_prims = num_prims & 3;

	num_prims |= (left_child << 3);
	if (external) {
		num_prims |= 4;
	}
}
void StreamingKdNode::set_right_child(uint32_t r, bool external) {
	right_child = 0;
	right_child |= (r << 1);
	if (external) {
		right_child |= 1;
	}
}
uint32_t StreamingKdNode::get_num_prims() const {
	return num_prims >> 2;
}
uint32_t StreamingKdNode::left_child_index() const {
	return num_prims >> 3;
}
uint32_t StreamingKdNode::right_child_index() const {
	return right_child >> 1;
}
AXIS StreamingKdNode::split_axis() const {
	return static_cast<AXIS>(num_prims & 3);
}
bool StreamingKdNode::is_leaf() const {
	return (num_prims & 3) == 3;
}

// The LOD surfel right now is just the average of the contained primitives
Surfel compute_lod_surfel(const std::vector<uint32_t> &contained_prims,
		const std::vector<Surfel> &surfels)
{
	Surfel lod;
	std::memset(reinterpret_cast<char*>(&lod), 0, sizeof(Surfel));

	for (const auto &p : contained_prims) {
		const Surfel &s = surfels[p];
		lod.x += s.x;
		lod.y += s.y;
		lod.z += s.z;

		lod.nx += s.nx;
		lod.ny += s.ny;
		lod.nz += s.nz;

		lod.r += s.r;
		lod.g += s.g;
		lod.b += s.b;
	}
	lod.x /= contained_prims.size();
	lod.y /= contained_prims.size();
	lod.z /= contained_prims.size();

	lod.nx /= contained_prims.size();
	lod.ny /= contained_prims.size();
	lod.nz /= contained_prims.size();

	lod.r /= contained_prims.size();
	lod.g /= contained_prims.size();
	lod.b /= contained_prims.size();
	return lod;
}


KdSubTree::KdSubTree(const Box &bounds,
		std::vector<uint32_t> subtree_nodes,
		const std::vector<StreamingKdNode> &all_nodes,
		const std::vector<uint32_t> &prim_indices,
		const std::vector<Surfel> &all_surfels)
	: subtree_bounds(bounds),
	root_id(subtree_nodes[0])
{
	// TODO: We also need to re-map the node child indices to the new subtree,
	// while leaving child indices that go beyond this subtree intact,
	// since they reference other subtree's root nodes.
	// To do this we need to traverse and essentially reconstruct this subtree
	nodes.reserve(subtree_nodes.size());
	rebuild_subtree(subtree_nodes[0], subtree_nodes, all_nodes,
			prim_indices, all_surfels);
}
uint32_t KdSubTree::rebuild_subtree(const uint32_t current_node,
		const std::vector<uint32_t> &subtree_nodes,
		const std::vector<StreamingKdNode> &all_nodes,
		const std::vector<uint32_t> &prim_indices,
		const std::vector<Surfel> &all_surfels)
{
	StreamingKdNode n = all_nodes[current_node];
	if (n.is_leaf()) {
		// Copy over the leaf node surfels to rebuild the primitive indices
		const size_t prim = primitive_indices.size();
		for (size_t i = 0; i < n.get_num_prims(); ++i) {
			const size_t s_idx = prim_indices[n.prim_indices_offset + i];
			primitive_indices.push_back(surfels.size());
			surfels.push_back(all_surfels[s_idx]);
		}
		n.prim_indices_offset = prim;

		const uint32_t node_index = nodes.size();
		nodes.push_back(n);
		return node_index;
	}

	const size_t prim = surfels.size();
	surfels.push_back(all_surfels[n.prim_indices_offset]);
	n.prim_indices_offset = prim;

	const uint32_t inner_idx = nodes.size();
	nodes.push_back(n);

	// Is the left child part of this subtree?
	auto fnd = std::find(subtree_nodes.begin(), subtree_nodes.end(), n.left_child_index());
	if (fnd != subtree_nodes.end()) {
		rebuild_subtree(n.left_child_index(), subtree_nodes,
				all_nodes, prim_indices, all_surfels);
		nodes[inner_idx].set_left_child(inner_idx + 1, false);
	} else {
		nodes[inner_idx].set_left_child(n.left_child_index(), true);
	}

	// Is the right child part of this subtree?
	fnd = std::find(subtree_nodes.begin(), subtree_nodes.end(), n.right_child_index());
	if (fnd != subtree_nodes.end()) {
		const uint32_t right_child = rebuild_subtree(n.right_child_index(),
				subtree_nodes, all_nodes, prim_indices, all_surfels);
		nodes[inner_idx].set_right_child(right_child, false);
	} else {
		nodes[inner_idx].set_right_child(n.right_child_index(), true);
	}
	return inner_idx;
}

StreamingSplatKdTree::StreamingSplatKdTree(const std::vector<Surfel> &insurfels)
	: surfels(insurfels),
	max_depth(8 + 1.3 * std::log2(insurfels.size())),
	tree_depth(0),
	min_prims(128)
{
	if (surfels.size() > std::pow(2, 30)) {
		std::cout << "Too many surfels in one streaming kd tree!\n";
		throw std::runtime_error("Too many surfels for one streaming tree");
	}

	std::vector<uint32_t> contained_prims(surfels.size(), 0);
	std::iota(contained_prims.begin(), contained_prims.end(), 0);

	Box tree_bounds;
	for (const auto &s : surfels) { 
		const Box b = surfel_bounds(glm::vec3(s.x, s.y, s.z),
				glm::vec3(s.nx, s.ny, s.nz), s.radius);
		bounds.push_back(b);
		tree_bounds.box_union(b);
	}
	build_tree(tree_bounds, contained_prims, 0);
}
uint32_t StreamingSplatKdTree::build_tree(const Box &node_bounds,
		const std::vector<uint32_t> &contained_prims,
		const int depth)
{
	tree_depth = std::max(tree_depth, depth);

	if (depth >= max_depth) {
		std::cout << "Depth limit hit\n";
	}
	// We've hit max depth or the prim threshold, so make a leaf
	if (depth >= max_depth || contained_prims.size() <= min_prims) {
		StreamingKdNode node(contained_prims.size(), primitive_indices.size());
		std::copy(contained_prims.begin(), contained_prims.end(),
				std::back_inserter(primitive_indices));
		const uint32_t node_index = nodes.size();
		nodes.push_back(node);
		all_node_bounds.push_back(node_bounds);
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
		// Since we're not going to ray trace against this data, it may
		// be ok to uniquely assign surfels into bins. We can just assign
		// it to the one its centroid is inside.
		if (bounds[p].center()[split_axis] <= split_pos) {
			left_prims.push_back(p);
		} else {
			right_prims.push_back(p);
		}
	}

	StreamingKdNode inner(split_pos, surfels.size(), split_axis);
	Surfel lod_surfel = compute_lod_surfel(contained_prims, surfels);
	lod_surfel.radius =  glm::compMax(node_bounds.center() - node_bounds.lower) / 2.0;
	surfels.push_back(lod_surfel);

	const uint32_t inner_idx = nodes.size();
	nodes.push_back(inner);
	all_node_bounds.push_back(node_bounds);

	// Build left child, will be placed after this inner node
	build_tree(left_box, left_prims, depth + 1);
	nodes[inner_idx].set_left_child(inner_idx + 1, false);

	// Build right child
	const uint32_t right_child = build_tree(right_box, right_prims, depth + 1);
	nodes[inner_idx].set_right_child(right_child, false);
	return inner_idx;
}
std::vector<KdSubTree> StreamingSplatKdTree::build_subtrees(size_t subtree_depth) const {
	std::cout << "Tree depth: " << tree_depth
		<< ", max subtree depth: " << subtree_depth
		<< "\n";
	std::vector<KdSubTree> subtrees;

	/* Actually, is it such a big deal if we don't group the files?
	 * The shared surfels between each subtree are not that many,
	 * so it's not like we'd cut down the file size much and would
	 * increase the complexity of the file format by quite a bit.
	 */

	std::stack<uint32_t> todo;
	todo.push(0);
	while (!todo.empty()) {
		std::vector<uint32_t> subtree_nodes, current_level, next_level;
		next_level.push_back(todo.top());
		const Box subtree_bounds = all_node_bounds[todo.top()];
		todo.pop();

		// Traverse the node's children and add them to the subtree
		// until we hit the depth limit
		for (size_t depth = 0; depth < subtree_depth && !next_level.empty(); ++depth) {
			current_level = next_level;
			next_level.clear();
			for (const auto &id : current_level) {
				subtree_nodes.push_back(id);
				const StreamingKdNode &node = nodes[id];
				if (!node.is_leaf()) {
					next_level.push_back(id + 1);
					next_level.push_back(node.right_child_index());
				}
			}
		}

		// The next level have to go into other subtrees, they didn't fit here
		for (const auto &id : next_level) {
			todo.push(id);
		}

		subtrees.emplace_back(subtree_bounds, subtree_nodes, nodes,
				primitive_indices, surfels);
	}

	return subtrees;
}


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
	right_child(static_cast<uint32_t>(split_axis))
{}
StreamingKdNode::StreamingKdNode(uint32_t nprims, uint32_t prim_offset)
	: prim_indices_offset(prim_offset),
	num_prims(3 | (nprims << 2))
{}
void StreamingKdNode::set_right_child(uint32_t r) {
	right_child |= (r << 2);
}
uint32_t StreamingKdNode::get_num_prims() const {
	return num_prims >> 2;
}
uint32_t StreamingKdNode::right_child_index() const {
	return right_child >> 2;
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
	std::cout << "LOD surfel for " << contained_prims.size() << " prims:"
		<< "\tpos = {" << lod.x << ", " << lod.y << ", " << lod.z << "}\n"
		<< "\tnormal = {" << lod.nx << ", " << lod.ny << ", " << lod.nz << "}\n"
		<< "\tcolor = {" << lod.r << ", " << lod.g << ", " << lod.b << "}\n";
	return lod;
}


KdSubTree::KdSubTree(const Box &bounds, uint32_t root_id,
		std::vector<StreamingKdNode> subtree_nodes,
		const std::vector<uint32_t> &prim_indices,
		const std::vector<Surfel> &all_surfels)
	: subtree_bounds(bounds),
	root_id(root_id),
	nodes(std::move(subtree_nodes))
{
	// TODO: Qu
	// We need to build a new primitive list and primitive indices array
	// specific to this subtree.
	std::cout << "Making new subtree, root id: " << root_id << "\n";
	for (auto &n : nodes) {
		if (!n.is_leaf()) {
			// Copy over the LOD surfel for interior nodes
			const size_t prim = surfels.size();
			surfels.push_back(all_surfels[n.prim_indices_offset]);
			n.prim_indices_offset = prim;
		} else {
			std::cout << "Leaf has " << n.get_num_prims() << " prims\n";
			// Copy over the leaf node surfels
			const size_t prim = primitive_indices.size();
			for (size_t i = 0; i < n.get_num_prims(); ++i) {
				const size_t s_idx = prim_indices[n.prim_indices_offset + i];
				primitive_indices.push_back(surfels.size());
				surfels.push_back(all_surfels[s_idx]);
			}
			n.prim_indices_offset = prim;
		}
	}
	std::cout << "surfels in subtree " << root_id << ": " << surfels.size() << "\n";
}

StreamingSplatKdTree::StreamingSplatKdTree(const std::vector<Surfel> &insurfels)
	: surfels(insurfels),
	max_depth(8 + 1.3 * std::log2(insurfels.size())),
	tree_depth(0),
	min_prims(32)

{
	if (surfels.size() > std::pow(2, 30)) {
		std::cout << "Too many surfels in one streaming kd tree!\n";
		throw std::runtime_error("Too many surfels for one streaming tree");
	}

	std::cout << "nsurfels: " << surfels.size() << "\n";
	std::vector<uint32_t> contained_prims(surfels.size(), 0);
	std::iota(contained_prims.begin(), contained_prims.end(), 0);

	Box tree_bounds;
	for (const auto &s : surfels) { 
		const Box b = surfel_bounds(glm::vec3(s.x, s.y, s.z),
				glm::vec3(s.nx, s.ny, s.nz), s.radius);
		bounds.push_back(b);
		tree_bounds.box_union(b);
	}
	std::cout << "Tree bounds: " << tree_bounds << "\n";
	build_tree(tree_bounds, contained_prims, 0);
}
uint32_t StreamingSplatKdTree::build_tree(const Box &node_bounds,
		const std::vector<uint32_t> &contained_prims,
		const int depth)
{
	tree_depth = std::max(tree_depth, depth);

	// We've hit max depth or the prim threshold, so make a leaf
	if (depth >= max_depth || contained_prims.size() <= min_prims) {
		std::cout << "Making leaf w/ " << contained_prims.size() << " prims, "
			<< " node id " << nodes.size() << "\n";
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
		if (bounds[p].lower[split_axis] <= split_pos) {
			left_prims.push_back(p);
		}
		if (bounds[p].upper[split_axis] >= split_pos) {
			right_prims.push_back(p);
		}
	}

	StreamingKdNode inner(split_pos, surfels.size(), split_axis);
	// TODO: I think this is ok, since we put the LOD surfels at the end after
	// the real surfels, they won't show up accidentally as a "real" surfel
	Surfel lod_surfel = compute_lod_surfel(contained_prims, surfels);
	lod_surfel.radius = glm::compMin(node_bounds.center() - node_bounds.lower) / 2.0;
	surfels.push_back(lod_surfel);

	std::cout << "Inner node at index " << nodes.size() << "\n";
	const uint32_t inner_idx = nodes.size();
	nodes.push_back(inner);
	all_node_bounds.push_back(node_bounds);

	// Build left child, will be placed after this inner node
	build_tree(left_box, left_prims, depth + 1);
	// Build right child
	const uint32_t right_child = build_tree(right_box, right_prims, depth + 1);
	nodes[inner_idx].set_right_child(right_child);
	return inner_idx;
}
std::vector<KdSubTree> StreamingSplatKdTree::build_subtrees(size_t subtree_depth) const {
	std::cout << "Tree depth: " << tree_depth << ", max subtree depth: " << subtree_depth
		<< ", expecting ~" << tree_depth / subtree_depth << " subtrees\n";
	std::vector<KdSubTree> subtrees;
	// Here we want to do a breadth-first traversal down the tree, to try and group
	// files by their level
	std::stack<size_t> todo;
	todo.push(0);
	while (!todo.empty()) {
		std::vector<size_t> subtree_nodes, current_level, next_level;
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
					std::cout << "Interior node " << id << "\n";
					next_level.push_back(id + 1);
					next_level.push_back(node.right_child_index());
				} else {
					std::cout << "Leaf node " << id << "\n";
				}
			}
		}

		// The next level have to go into other subtrees, they didn't fit here
		std::cout << "Remaining for next level: {";
		for (const auto &id : next_level) {
			std::cout << id << ", ";
			todo.push(id);
		}
		std::cout << "}\n";

		std::vector<StreamingKdNode> subtree_node_list;
		subtree_node_list.reserve(subtree_nodes.size());
		std::cout << "Nodes in subtree: {";
		for (const auto &i : subtree_nodes) {
			std::cout << i << ", ";
			subtree_node_list.push_back(nodes[i]);
		}
		std::cout << "}\n";
		subtrees.emplace_back(subtree_bounds, subtree_nodes[0],
				subtree_node_list, primitive_indices, surfels);
	}

	return subtrees;
}


#define NOMINMAX
#include <iostream>
#include <algorithm>
#include <string>
#include <vector>
#include <fstream>
#include <glm/glm.hpp>
#include <glm/ext.hpp>
#include <pcl/point_types.h>
#include <pcl/io/pcd_io.h>
#include <pcl/surface/mls.h>
#include <pcl/features/normal_3d.h>
#include <pcl/kdtree/kdtree.h>
#include "rsf_file.h"

int main(int argc, char **argv) {
	if (argc == 1) {
		std::cout << "Usage: " << argv[0] << " <input.pcd> <output.rsf>\n";
		return 0;
	}
	const bool srgb_convert = (argc >= 3 && std::strcmp(argv[2], "-srgb") == 0);

	// TODO: How to know if the input has RGB as well?
	pcl::PointCloud<pcl::PointXYZ>::Ptr cloud(new pcl::PointCloud<pcl::PointXYZ>());
	pcl::io::loadPCDFile(argv[1], *cloud);
	std::cout << "Read " << cloud->size() << " points from " << argv[1] << "\n";

	glm::vec3 box_min(std::numeric_limits<float>::max());
	glm::vec3 box_max(-std::numeric_limits<float>::max());
	for (size_t i = 0; i < cloud->size(); ++i) {
		glm::vec3 p((*cloud)[i].x, (*cloud)[i].y, (*cloud)[i].z);
		box_min = glm::min(box_min, p);
		box_max = glm::max(box_max, p);
	}
	std::cout << "Bounding box of " << argv[1] << ": ["
		<< glm::to_string(box_min) << " to " << glm::to_string(box_max) << "\n";

	const glm::vec3 center = (box_max - box_min) / 2.0 + box_min;

	// Compute the average distance between neighboring points
	float avg_neighbor_dist = 0.0;
	float max_neighbor_dist = 0.0;
	{
		pcl::KdTreeFLANN<pcl::PointXYZ> tree;
		tree.setInputCloud(cloud);
		// We query 2 points, because the first point will be the point
		// we're querying neighbors for, since it has 0 distance from itself.
		tree.setMinPts(2);
		std::vector<float> k_sqr_dists;
		std::vector<int> neighbors;
		for (size_t i = 0; i < cloud->size(); ++i) {
			if (tree.nearestKSearch((*cloud)[i], 2, neighbors, k_sqr_dists) > 0) {
				const float dist = std::sqrt(k_sqr_dists[1]);
				avg_neighbor_dist += dist;
				max_neighbor_dist = std::max(dist, max_neighbor_dist);
			}
		}
	}
	avg_neighbor_dist /= cloud->size();
	std::cout << "Average neighbor distance: " << avg_neighbor_dist << "\n";

	pcl::PointCloud<pcl::PointNormal>::Ptr mls_points(new pcl::PointCloud<pcl::PointNormal>());
	pcl::search::KdTree<pcl::PointXYZ>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZ>());
	pcl::MovingLeastSquares<pcl::PointXYZ, pcl::PointNormal> mls;
	mls.setInputCloud(cloud);
	mls.setComputeNormals(true);
	mls.setSearchMethod(tree);
	mls.setPolynomialOrder(2);
	mls.setSearchRadius(avg_neighbor_dist * 2.0);
	mls.setUpsamplingMethod(
			pcl::MovingLeastSquares<pcl::PointXYZ, pcl::PointNormal>::RANDOM_UNIFORM_DENSITY);
	mls.setPointDensity(32);
	mls.setProjectionMethod(pcl::MLSResult::SIMPLE);

	mls.process(*mls_points);

	std::cout << "Translating center point " << glm::to_string(center)
		<< " to origin\n";
	std::cout << "Computed: " << mls_points->size() << " MLS points\n";


	pcl::KdTreeFLANN<pcl::PointNormal> upsampled_tree;
	upsampled_tree.setInputCloud(mls_points);
	upsampled_tree.setMinPts(16);
	std::vector<float> k_sqr_dists;
	std::vector<int> neighbors;
	std::vector<Surfel> surfels;
	surfels.reserve(mls_points->size());
	for (size_t i = 0; i < mls_points->size(); ++i) {
		Surfel s;
		s.x = (*mls_points)[i].x - center.x;
		s.y = (*mls_points)[i].y - center.y;
		s.z = (*mls_points)[i].z - center.z;

		s.nx = (*mls_points)[i].normal_x;
		s.ny = (*mls_points)[i].normal_y;
		s.nz = (*mls_points)[i].normal_z;

		// Re-estimate the radius we should be using for splats
		upsampled_tree.nearestKSearch((*mls_points)[i], 16, neighbors, k_sqr_dists);
		float avg_dists = 0;
		for (size_t j = 1; j < k_sqr_dists.size(); ++j) {
			avg_dists += std::sqrt(k_sqr_dists[j]);
		}
		avg_dists /= k_sqr_dists.size() - 1;
		s.radius = avg_dists * 2.0;
		surfels.push_back(s);
	}
	write_raw_surfels(argv[2], surfels);

	return 0;
}


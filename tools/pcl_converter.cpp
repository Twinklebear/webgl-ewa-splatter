#define NOMINMAX
#include <iostream>
#include <algorithm>
#include <string>
#include <vector>
#include <fstream>
#include <glm/glm.hpp>
#include <glm/ext.hpp>
#include <lasreader.hpp>
#include <pcl/point_types.h>
#include <pcl/io/pcd_io.h>
#include <pcl/surface/mls.h>
#include <pcl/features/normal_3d.h>
#include <pcl/kdtree/kdtree.h>
#include "rsf_file.h"

enum LIDAR_CLASSIFICATION {
	CREATED = 0,
	UNCLASSIFIED,
	GROUND,
	LOW_VEGETATION,
	MEDIUM_VEGETATION,
	HIGH_VEGETATION,
	BUILDING,
	NOISE,
	MODEL_KEY_POINT,
	WATER,
	OVERLAP_POINT,
	RESERVED
};
LIDAR_CLASSIFICATION classify_point(uint8_t class_attrib);

int main(int argc, char **argv) {
	if (argc == 1) {
		std::cout << "Usage: " << argv[0] << " <input.las/laz> <output.rsf>\n";
		return 0;
	}

	LASreadOpener read_opener;
	read_opener.set_file_name(argv[1]);
	LASreader *reader = read_opener.open();
	if (!reader){
		std::cout << "Failed to open: " << argv[1] << "\n";
		return 1;
	}

	const bool has_color = reader->header.point_data_format == 2
		|| reader->header.point_data_format == 3
		|| reader->header.point_data_format == 5;

	std::cout << "LiDAR file '" << argv[1]
		<< "' contains " << reader->npoints << " points "
		<< (has_color ? "with" : "without") << " color attributes\n"
		<< "min: ( " << reader->get_min_x()
		<< ", " << reader->get_min_y()
		<< ", " << reader->get_min_z() << " )\n"
		<< "max: ( " << reader->get_max_x()
		<< ", " << reader->get_max_y()
		<< ", " << reader->get_max_z() << " )\n";

	const glm::vec3 min_pt(reader->get_min_x(), reader->get_min_y(), reader->get_min_z());
	const glm::vec3 max_pt(reader->get_max_x(), reader->get_max_y(), reader->get_max_z());
	const glm::vec3 diagonal = max_pt - min_pt;

	pcl::PointCloud<pcl::PointXYZRGB>::Ptr cloud(new pcl::PointCloud<pcl::PointXYZRGB>());
	cloud->reserve(reader->npoints);
	int num_noise = 0;
	const float inv_max_color = 1.0f / std::numeric_limits<uint16_t>::max();
	while (reader->read_point()){
		// Points classified as low point are noise and should be discarded
		if (classify_point(reader->point.get_classification()) == NOISE){
			++num_noise;
			continue;
		}
		reader->point.compute_coordinates();
		// Re-scale points to a better precision range for floats
		const glm::vec3 p = glm::vec3(reader->point.coordinates[0], reader->point.coordinates[1],
				reader->point.coordinates[2]) - min_pt - diagonal * 0.5f;

		const uint16_t *rgba = reader->point.get_rgb();
		glm::vec3 c;
		if (has_color){
			c = glm::vec3(rgba[0] * inv_max_color, rgba[1] * inv_max_color, rgba[2] * inv_max_color);
			c.x = srgb_to_linear(c.x);
			c.y = srgb_to_linear(c.y);
			c.z = srgb_to_linear(c.z);
		} else {
			c = glm::vec3(1.0);
		}
		pcl::PointXYZRGB pclpt(c.x * 255.0, c.y * 255.0, c.z * 255.0);
		pclpt.x = p.x;
		pclpt.y = p.y;
		pclpt.z = p.z;
		cloud->push_back(pclpt);
	}
	reader->close();
	delete reader;

	std::cout << "Read " << cloud->size() << " points from " << argv[1] << "\n"
		<< "Discarded " << num_noise << " noise classified points\n"
		<< "Translated bounds to " << glm::to_string(diagonal * -0.5f)
		<< ", " << glm::to_string(max_pt - min_pt - diagonal * 0.5f)
		<< "\n";

	// Compute the average distance between neighboring points
	float avg_neighbor_dist = 0.0;
	{
		pcl::KdTreeFLANN<pcl::PointXYZRGB> tree;
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
			}
			k_sqr_dists.clear();
			neighbors.clear();
		}
	}
	avg_neighbor_dist /= cloud->size();
	std::cout << "Average neighbor distance: " << avg_neighbor_dist << "\n";

	pcl::PointCloud<pcl::Normal>::Ptr normals(new pcl::PointCloud<pcl::Normal>());
	pcl::search::KdTree<pcl::PointXYZRGB>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZRGB>());
	pcl::NormalEstimation<pcl::PointXYZRGB, pcl::Normal> ne;
	ne.setInputCloud(cloud);
	ne.setSearchMethod(tree);
	ne.setRadiusSearch(avg_neighbor_dist * 5.0);
	ne.setViewPoint(0.0, 0.0, diagonal.z * 10.0);
	ne.compute(*normals);

	std::vector<Surfel> surfels;
	surfels.reserve(cloud->size());
	for (size_t i = 0; i < cloud->size(); ++i) {
		Surfel s;
		const pcl::PointXYZRGB &pclpt = (*cloud)[i];
		s.x = pclpt.x;
		s.y = pclpt.y;
		s.z = pclpt.z;

		s.nx = (*normals)[i].normal_x;
		s.ny = (*normals)[i].normal_y;
		s.nz = (*normals)[i].normal_z;
		if (std::isnan(s.nx) || std::isnan(s.ny) || std::isnan(s.nz)) {
			continue;
		}

		const uint32_t rgb = *reinterpret_cast<const int*>(&pclpt.rgb);
		s.r = ((rgb >> 16) & 0x0000ff) / 255.0;
		s.g = ((rgb >> 8)  & 0x0000ff) / 255.0;
		s.b = (rgb & 0x0000ff) / 255.0;

		s.radius = avg_neighbor_dist * 2.5;
		surfels.push_back(s);
	}
	std::cout << "Writing surfel dataset with " << surfels.size() << " surfels\n";
	write_raw_surfels_v2(argv[2], surfels);

	return 0;
}

LIDAR_CLASSIFICATION classify_point(uint8_t class_attrib) {
	switch (class_attrib){
		case 0: return CREATED;
		case 1: return UNCLASSIFIED;
		case 2: return GROUND;
		case 3: return LOW_VEGETATION;
		case 4: return MEDIUM_VEGETATION;
		case 5: return HIGH_VEGETATION;
		case 6: return BUILDING;
		case 7: return NOISE;
		case 8: return MODEL_KEY_POINT;
		case 9: return WATER;
		case 10: return RESERVED;
		case 11: return RESERVED;
		case 12: return OVERLAP_POINT;
		default: return RESERVED;
	}
}


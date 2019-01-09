cmake_minimum_required(VERSION 3.5)
project(tools)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake/")

find_package(glm REQUIRED)
include_directories(${GLM_INCLUDE_DIRS})
add_library(rsf rsf_file.cpp kd_tree.cpp
	streaming_kd_tree.cpp streaming_rsf_file.cpp)
set_target_properties(rsf PROPERTIES
	CXX_STANDARD 14
	CXX_STANDARD_REQUIRED ON)

add_executable(rsf_updater rsf_updater.cpp)
target_link_libraries(rsf_updater rsf)
set_target_properties(rsf_updater PROPERTIES
	CXX_STANDARD 14
	CXX_STANDARD_REQUIRED ON)

add_executable(rsf_v1_to_streaming rsf_v1_to_streaming.cpp)
target_link_libraries(rsf_v1_to_streaming rsf)
set_target_properties(rsf_v1_to_streaming PROPERTIES
	CXX_STANDARD 14
	CXX_STANDARD_REQUIRED ON)

# Build SFL converter for Pointshop3D files
find_package(sfl)
if (SFL_FOUND)
	add_executable(sfl_converter sfl_converter.cpp)
	target_link_libraries(sfl_converter sfl rsf)
	set_target_properties(sfl_converter PROPERTIES
		CXX_STANDARD 14
		CXX_STANDARD_REQUIRED ON)
endif()

find_package(PCL)
find_package(LASTools)
if (${PCL_FOUND} AND ${LASTOOLS_FOUND})
	find_package(OpenMP REQUIRED)
	add_executable(pcl_converter pcl_converter.cpp)
	target_link_libraries(pcl_converter rsf
		OpenMP::OpenMP_CXX ${PCL_LIBRARIES} ${LASTOOLS_LIBRARIES})
	set_target_properties(pcl_converter PROPERTIES
		CXX_STANDARD 14
		CXX_STANDARD_REQUIRED ON)
	target_include_directories(pcl_converter PUBLIC
		$<BUILD_INTERFACE:${PCL_INCLUDE_DIRS}>
		$<BUILD_INTERFACE:${LASTOOLS_INCLUDE_DIRS}>)
endif()


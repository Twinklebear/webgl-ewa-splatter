cmake_minimum_required(VERSION 3.5)
project(tools)

add_library(rsf rsf_file.cpp)

# Build SFL converter for Pointshop3D files
find_package(sfl)
if (SFL_FOUND)
	add_executable(sfl_converter sfl_converter.cpp)
	target_link_libraries(sfl_converter sfl rsf)
	set_target_properties(sfl_converter PROPERTIES
		CXX_STANDARD 14
		CXX_STANDARD_REQUIRED ON)
endif()

#add_executable(qsplat_converter qsplat_converter.cpp)
#target_link_libraries(qsplat_converter rsf)
#set_target_properties(qsplat_converter PROPERTIES
#	CXX_STANDARD 14
#	CXX_STANDARD_REQUIRED ON)


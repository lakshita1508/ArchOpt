// JSON <-> engine data structure conversion.
#pragma once
#include "json.hpp"
#include "optimizer.hpp"

namespace archopt {

Problem problemFromJson(const Json& j);               // throws std::runtime_error on invalid input
Options optionsFromJson(const Json& j);
std::vector<Room> placementFromJson(const Json& layoutRooms, const Problem& p);  // overlays x/y/width/height by room name

Json layoutToJson(const Layout& L, const Problem& p, bool withCirculation);
Json circulationToJson(const CirculationReport& c);
Json resultToJson(const OptimizationResult& r, const Problem& p);

RelType relTypeFromString(const std::string& s);
std::string relTypeToString(RelType t);

}  // namespace archopt

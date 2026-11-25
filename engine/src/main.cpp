// archopt_engine CLI
//   archopt_engine optimize <input.json> <output.json>   generate optimised layouts
//   archopt_engine analyze  <input.json> <output.json>   validate + score + circulation of a given placement
//   archopt_engine version
// Use "-" for stdin / stdout. Always writes valid JSON; exit code 0 on success, 2 on invalid input.
#include <fstream>
#include <iostream>
#include <iterator>
#include <sstream>

#include "archopt/io.hpp"

using namespace archopt;

static std::string readAll(const std::string& path) {
    if (path == "-") return std::string(std::istreambuf_iterator<char>(std::cin), {});
    std::ifstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error("Cannot open input file: " + path);
    return std::string(std::istreambuf_iterator<char>(f), {});
}

static void writeAll(const std::string& path, const std::string& text) {
    if (path == "-") { std::cout << text << std::endl; return; }
    std::ofstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error("Cannot open output file: " + path);
    f << text;
}

int main(int argc, char** argv) {
    if (argc >= 2 && std::string(argv[1]) == "version") {
        std::cout << "archopt_engine 1.0.0 (C++20)" << std::endl;
        return 0;
    }
    if (argc < 4) {
        std::cerr << "usage: archopt_engine <optimize|analyze> <input.json|-> <output.json|->\n";
        return 2;
    }
    std::string cmd = argv[1], out = argv[3];
    try {
        Json in = Json::parse(readAll(argv[2]));
        Problem p = problemFromJson(in);
        if (cmd == "optimize") {
            Options o = optionsFromJson(in);
            OptimizationResult r = optimize(p, o);
            writeAll(out, resultToJson(r, p).dump());
            return 0;
        }
        if (cmd == "analyze") {
            Problem q = p;
            std::vector<Room> rooms = placementFromJson(in["layout"]["rooms"], q);
            // project rooms missing from the layout are reported by the validator below
            Json res = Json::object();
            Layout L = evaluate(q, rooms, true);
            for (const Room& pr : q.rooms) {
                bool present = false;
                for (const Room& r : rooms) if (r.name == pr.name) present = true;
                if (!present) {
                    L.checks.push_back({"missing_space", "hard", "failed", pr.name, "Required space is missing from the layout."});
                    L.metrics.violations++;
                    L.metrics.feasible = false;
                }
            }
            Json lj = layoutToJson(L, q, true);
            lj.set("status", "success");
            writeAll(out, lj.dump());
            return 0;
        }
        throw std::runtime_error("Unknown command: " + cmd);
    } catch (const std::exception& e) {
        Json err = Json::object();
        err.set("status", "invalid_input");
        Json reasons = Json::array();
        reasons.push(std::string(e.what()));
        err.set("reasons", reasons);
        err.set("layouts", Json::array());
        try { writeAll(out, err.dump()); } catch (...) {}
        std::cerr << "archopt_engine error: " << e.what() << std::endl;
        return 2;
    }
}

// Minimal self-contained JSON value / parser / serializer (no external dependency).
#pragma once
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace archopt {

class Json {
public:
    enum class Type { Null, Bool, Num, Str, Arr, Obj };
    Json() = default;
    Json(bool b) : type_(Type::Bool), b_(b) {}
    Json(int n) : type_(Type::Num), n_(n) {}
    Json(size_t n) : type_(Type::Num), n_(static_cast<double>(n)) {}
    Json(long long n) : type_(Type::Num), n_(static_cast<double>(n)) {}
    Json(double n) : type_(Type::Num), n_(n) {}
    Json(const char* s) : type_(Type::Str), s_(s) {}
    Json(std::string s) : type_(Type::Str), s_(std::move(s)) {}
    static Json array() { Json j; j.type_ = Type::Arr; return j; }
    static Json object() { Json j; j.type_ = Type::Obj; return j; }

    Type type() const { return type_; }
    bool isNull() const { return type_ == Type::Null; }
    bool isObject() const { return type_ == Type::Obj; }
    bool isArray() const { return type_ == Type::Arr; }
    bool isNumber() const { return type_ == Type::Num; }
    bool isString() const { return type_ == Type::Str; }

    double num(double def = 0) const { return type_ == Type::Num ? n_ : (type_ == Type::Bool ? (b_ ? 1 : 0) : def); }
    bool boolean(bool def = false) const { return type_ == Type::Bool ? b_ : (type_ == Type::Num ? n_ != 0 : def); }
    const std::string& str() const { static const std::string e; return type_ == Type::Str ? s_ : e; }
    std::string str(const std::string& def) const { return type_ == Type::Str ? s_ : def; }

    const std::vector<Json>& items() const { return a_; }
    const std::vector<std::pair<std::string, Json>>& members() const { return o_; }

    bool has(const std::string& k) const { return find(k) != nullptr; }
    const Json& operator[](const std::string& k) const {
        static const Json nullJson;
        const Json* p = find(k);
        return p ? *p : nullJson;
    }
    Json& set(const std::string& k, Json v) {
        if (type_ != Type::Obj) { type_ = Type::Obj; o_.clear(); }
        for (auto& kv : o_) if (kv.first == k) { kv.second = std::move(v); return kv.second; }
        o_.emplace_back(k, std::move(v));
        return o_.back().second;
    }
    Json& push(Json v) {
        if (type_ != Type::Arr) { type_ = Type::Arr; a_.clear(); }
        a_.push_back(std::move(v));
        return a_.back();
    }
    size_t size() const { return type_ == Type::Arr ? a_.size() : o_.size(); }

    std::string dump(int indent = -1) const { std::string out; write(out, indent, 0); return out; }

    static Json parse(const std::string& text) {
        size_t i = 0;
        Json v = parseValue(text, i);
        skipWs(text, i);
        if (i != text.size()) throw std::runtime_error("JSON: trailing characters");
        return v;
    }

private:
    Type type_ = Type::Null;
    bool b_ = false;
    double n_ = 0;
    std::string s_;
    std::vector<Json> a_;
    std::vector<std::pair<std::string, Json>> o_;

    const Json* find(const std::string& k) const {
        if (type_ != Type::Obj) return nullptr;
        for (auto& kv : o_) if (kv.first == k) return &kv.second;
        return nullptr;
    }

    static void skipWs(const std::string& t, size_t& i) {
        while (i < t.size() && (t[i] == ' ' || t[i] == '\n' || t[i] == '\r' || t[i] == '\t')) ++i;
    }
    static void fail(const std::string& m, size_t i) { throw std::runtime_error("JSON parse error at " + std::to_string(i) + ": " + m); }

    static std::string parseString(const std::string& t, size_t& i) {
        if (t[i] != '"') fail("expected string", i);
        ++i;
        std::string out;
        while (i < t.size() && t[i] != '"') {
            char c = t[i++];
            if (c == '\\') {
                if (i >= t.size()) fail("bad escape", i);
                char e = t[i++];
                switch (e) {
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u': {
                        if (i + 4 > t.size()) fail("bad unicode escape", i);
                        unsigned cp = std::stoul(t.substr(i, 4), nullptr, 16);
                        i += 4;
                        if (cp < 0x80) out += static_cast<char>(cp);
                        else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
                        else { out += static_cast<char>(0xE0 | (cp >> 12)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
                        break;
                    }
                    default: out += e;
                }
            } else out += c;
        }
        if (i >= t.size()) fail("unterminated string", i);
        ++i;
        return out;
    }

    static Json parseValue(const std::string& t, size_t& i) {
        skipWs(t, i);
        if (i >= t.size()) fail("unexpected end", i);
        char c = t[i];
        if (c == '{') {
            Json o = object(); ++i; skipWs(t, i);
            if (t[i] == '}') { ++i; return o; }
            while (true) {
                skipWs(t, i);
                std::string k = parseString(t, i);
                skipWs(t, i);
                if (t[i] != ':') fail("expected ':'", i);
                ++i;
                o.set(k, parseValue(t, i));
                skipWs(t, i);
                if (t[i] == ',') { ++i; continue; }
                if (t[i] == '}') { ++i; break; }
                fail("expected ',' or '}'", i);
            }
            return o;
        }
        if (c == '[') {
            Json a = array(); ++i; skipWs(t, i);
            if (t[i] == ']') { ++i; return a; }
            while (true) {
                a.push(parseValue(t, i));
                skipWs(t, i);
                if (t[i] == ',') { ++i; continue; }
                if (t[i] == ']') { ++i; break; }
                fail("expected ',' or ']'", i);
            }
            return a;
        }
        if (c == '"') return Json(parseString(t, i));
        if (t.compare(i, 4, "true") == 0) { i += 4; return Json(true); }
        if (t.compare(i, 5, "false") == 0) { i += 5; return Json(false); }
        if (t.compare(i, 4, "null") == 0) { i += 4; return Json(); }
        size_t used = 0;
        double d = 0;
        try { d = std::stod(t.substr(i, 40), &used); } catch (...) { fail("invalid token", i); }
        i += used;
        return Json(d);
    }

    static void escape(std::string& out, const std::string& s) {
        out += '"';
        for (unsigned char c : s) {
            switch (c) {
                case '"': out += "\\\""; break;
                case '\\': out += "\\\\"; break;
                case '\n': out += "\\n"; break;
                case '\r': out += "\\r"; break;
                case '\t': out += "\\t"; break;
                default:
                    if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); out += b; }
                    else out += static_cast<char>(c);
            }
        }
        out += '"';
    }

    static std::string fmtNum(double v) {
        if (!std::isfinite(v)) return "null";
        char b[64];
        if (std::floor(v) == v && std::fabs(v) < 1e15) { std::snprintf(b, sizeof b, "%.0f", v); return b; }
        std::snprintf(b, sizeof b, "%.4f", v);
        std::string s = b;
        while (!s.empty() && s.back() == '0') s.pop_back();
        if (!s.empty() && s.back() == '.') s.pop_back();
        if (s == "-0") s = "0";
        return s;
    }

    void write(std::string& out, int indent, int depth) const {
        auto nl = [&](int d) { if (indent >= 0) { out += '\n'; out.append(static_cast<size_t>(d * indent), ' '); } };
        switch (type_) {
            case Type::Null: out += "null"; break;
            case Type::Bool: out += b_ ? "true" : "false"; break;
            case Type::Num: out += fmtNum(n_); break;
            case Type::Str: escape(out, s_); break;
            case Type::Arr:
                out += '[';
                for (size_t k = 0; k < a_.size(); ++k) { if (k) out += ','; nl(depth + 1); a_[k].write(out, indent, depth + 1); }
                if (!a_.empty()) nl(depth);
                out += ']';
                break;
            case Type::Obj:
                out += '{';
                for (size_t k = 0; k < o_.size(); ++k) {
                    if (k) out += ',';
                    nl(depth + 1);
                    escape(out, o_[k].first);
                    out += indent >= 0 ? ": " : ":";
                    o_[k].second.write(out, indent, depth + 1);
                }
                if (!o_.empty()) nl(depth);
                out += '}';
                break;
        }
    }
};

}  // namespace archopt

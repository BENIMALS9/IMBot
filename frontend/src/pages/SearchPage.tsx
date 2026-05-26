import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { searchApi, imagesApi } from "@/lib/api";
import { Search, ChevronDown } from "lucide-react";
import type { ImageItem, BrowseState } from "@/types";

const TYPE_COLORS: Record<string, string> = {
  "分类": "bg-blue-50 text-blue-600 border border-blue-200",
  "热词": "bg-amber-50 text-amber-600 border border-amber-200",
  "文件名": "bg-gray-50 text-gray-600 border border-gray-200",
  "相机": "bg-green-50 text-green-600 border border-green-200",
  "人物": "bg-purple-50 text-purple-600 border border-purple-200",
};

const SCOPE_TYPE_MAP: Record<string, string[]> = {
  "all": [],
  "name": ["文件名"],
  "person": ["人物"],
  "camera": ["相机"],
  "description": ["热词", "分类"],
  "location": ["地点"],
};

const SCOPE_OPTIONS = [
  { value: "all", label: "全部字段", placeholder: "搜索图片描述、文件名、地点、相机..." },
  { value: "name", label: "文件名", placeholder: "输入文件名关键词..." },
  { value: "person", label: "人物", placeholder: "输入人物姓名..." },
  { value: "camera", label: "相机/镜头", placeholder: "输入相机或镜头型号..." },
  { value: "description", label: "AI 描述", placeholder: "输入描述关键词..." },
  { value: "location", label: "地点", placeholder: "输入地点名称..." },
];

type Suggestion = { label: string; type: string };

export function SearchPage() {
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [scope, setScope] = useState("all");
  const [showScope, setShowScope] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<HTMLDivElement>(null);

  // Debounce input for autocomplete
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Close autocomplete on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) {
        setShowScope(false);
      }
      if (acRef.current && !acRef.current.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Default suggestions (no query)
  const { data: defaultSuggestions } = useQuery({
    queryKey: ["search-suggestions"],
    queryFn: () => searchApi.suggestions(),
    staleTime: 60000,
  });

  // Autocomplete suggestions (with query)
  const { data: acData } = useQuery({
    queryKey: ["search-suggestions", debouncedQ],
    queryFn: () => searchApi.suggestions({ q: debouncedQ }),
    enabled: debouncedQ.length >= 1,
    staleTime: 10000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["search", searchTerm, scope],
    queryFn: () => searchApi.search({ q: searchTerm, scope, page_size: 50 }),
    enabled: searchTerm.length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchTerm(query.trim());
      setShowAutocomplete(false);
    }
  };

  const handleSuggestionClick = useCallback((label: string) => {
    setQuery(label);
    setSearchTerm(label);
    setShowAutocomplete(false);
    inputRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value.trim().length >= 1) {
      setShowAutocomplete(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowAutocomplete(false);
    }
  };

  const currentScope = SCOPE_OPTIONS.find((s) => s.value === scope) ?? SCOPE_OPTIONS[0];

  // Determine which suggestions to show, filtered by current scope
  const allowedTypes = SCOPE_TYPE_MAP[scope] ?? [];
  const suggestions: Suggestion[] = (debouncedQ && acData?.data
    ? (acData.data as Suggestion[])
    : (!debouncedQ && defaultSuggestions?.data ? (defaultSuggestions.data as Suggestion[]) : [])
  ).filter(s => allowedTypes.length === 0 || allowedTypes.includes(s.type));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">搜索</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        {/* Scope dropdown */}
        <div className="relative" ref={scopeRef}>
          <button
            type="button"
            onClick={() => setShowScope(!showScope)}
            className="h-full px-3 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white hover:bg-gray-50 flex items-center gap-1.5 min-w-[100px]"
          >
            <span className="text-xs text-gray-400">范围:</span>
            {currentScope.label}
            <ChevronDown size={14} className="text-gray-400" />
          </button>
          {showScope && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[140px]">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setScope(opt.value); setShowScope(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${
                    scope === opt.value ? "text-blue-600 font-medium bg-blue-50" : "text-gray-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (query.trim().length >= 1 || suggestions.length > 0) setShowAutocomplete(true); }}
            placeholder={currentScope.placeholder}
            autoComplete="off"
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Autocomplete dropdown */}
          {showAutocomplete && suggestions.length > 0 && (
            <div
              ref={acRef}
              className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-80 overflow-y-auto py-2"
            >
              {suggestions.map((s, i) => (
                <button
                  key={`${s.type}-${s.label}-${i}`}
                  type="button"
                  onClick={() => handleSuggestionClick(s.label)}
                  className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors"
                >
                  <span className={`px-1.5 py-0.5 rounded text-xs ${TYPE_COLORS[s.type] || "bg-gray-50 text-gray-500"}`}>
                    {s.type}
                  </span>
                  <span className="text-gray-700">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium"
        >
          搜索
        </button>
      </form>

      {/* Default suggestions (when no query and no search) */}
      {!searchTerm && !debouncedQ && suggestions.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">搜索建议</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(s.label)}
                className={`px-3 py-1 rounded-full text-xs cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS[s.type] || "bg-gray-50 text-gray-500"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <p className="text-gray-400 text-center py-8">搜索中...</p>}

      {data && (
        <div>
          <p className="text-sm text-gray-400 mb-3">
            找到 {data.data.total} 个结果
          </p>
          {data.data.total === 0 ? (
            <p className="text-gray-400 text-center py-12">未找到匹配的图片</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {(data.data.items ?? []).map((img: ImageItem, idx: number) => (
                <Link
                  key={img.id}
                  to={`/images/${img.id}`}
                  state={{
                    imageIds: (data.data.items ?? []).map((i) => i.id),
                    currentIndex: idx,
                    contextTitle: `搜索: ${searchTerm}`,
                    returnUrl: location.pathname + location.search,
                  } satisfies BrowseState}
                  className="group"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={imagesApi.thumbnailUrl(img.id)}
                      alt={img.original_name ?? ""}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  </div>
                  <div className="mt-1">
                    <p className="text-xs text-gray-600 line-clamp-1">{img.caption_ai || img.original_name}</p>
                    {img.date_taken && (
                      <p className="text-xs text-gray-400">{new Date(img.date_taken).toLocaleDateString("zh-CN")}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

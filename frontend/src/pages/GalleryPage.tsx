import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { imagesApi, categoriesApi } from "@/lib/api";
import { Trash2, CheckSquare, X } from "lucide-react";
import type { ImageItem, CategoryNode, BrowseState } from "@/types";

export function GalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const location = useLocation();
  const queryClient = useQueryClient();

  // ---- Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filters: Record<string, any> = {};
  const personId = searchParams.get("person_id");
  const folderId = searchParams.get("folder_id");
  const categorySlug = searchParams.get("category_slug");
  const sort = searchParams.get("sort");
  if (personId) filters.person_id = personId;
  if (folderId) filters.folder_id = folderId;
  if (categorySlug) filters.category_slug = categorySlug;
  if (sort) filters.sort = sort;

  useEffect(() => {
    setPage(1);
  }, [personId, folderId, categorySlug, sort]);

  const { data, isLoading } = useQuery({
    queryKey: ["images", { page, ...filters }],
    queryFn: () => imagesApi.list({ page, page_size: 50, ...filters }),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"], queryFn: () => categoriesApi.list(),
  });

  // ---- Batch delete
  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await imagesApi.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
      setSelectedIds(new Set());
      setSelectMode(false);
    },
  });

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 张图片？删除后无法恢复。`)) return;
    batchDeleteMutation.mutate(Array.from(selectedIds));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    const ids = (data?.data.items ?? []).map((i) => i.id);
    setSelectedIds(new Set(ids));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const totalPages = data ? Math.ceil(data.data.total / data.data.page_size) : 0;
  const currentItems: ImageItem[] = data?.data.items ?? [];
  const allSelected = currentItems.length > 0 && currentItems.every((i) => selectedIds.has(i.id));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">图片库</h1>
          {selectMode && (
            <span className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              已选 {selectedIds.size} 张
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <button
                onClick={allSelected ? deselectAll : selectAll}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {allSelected ? "取消全选" : "全选本页"}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={14} />
                删除选中 ({selectedIds.size})
              </button>
              <button
                onClick={exitSelectMode}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <X size={14} /> 取消
              </button>
            </>
          ) : (
            <>
              <select
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                value={searchParams.get("category_slug") ?? ""}
                onChange={(e) => {
                  const p = new URLSearchParams(searchParams);
                  if (e.target.value) p.set("category_slug", e.target.value);
                  else p.delete("category_slug");
                  setSearchParams(p);
                }}
              >
                <option value="">全部分类</option>
                {flattenCategories(categories?.data ?? []).map((cat) => (
                  <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
              <select
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                value={searchParams.get("sort") ?? "date_taken"}
                onChange={(e) => {
                  const p = new URLSearchParams(searchParams);
                  if (e.target.value !== "date_taken") p.set("sort", e.target.value);
                  else p.delete("sort");
                  setSearchParams(p);
                }}
              >
                <option value="date_taken">按拍摄时间</option>
                <option value="created_at">按上传时间</option>
                <option value="filename">按文件名</option>
              </select>
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600"
              >
                <CheckSquare size={14} /> 多选
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {currentItems.map((img: ImageItem, idx: number) => {
              const isSelected = selectedIds.has(img.id);

              return (
                <div key={img.id} className="group relative">
                  {selectMode ? (
                    // Select mode: click toggles selection
                    <div
                      onClick={() => toggleSelect(img.id)}
                      className="cursor-pointer"
                    >
                      <Thumbnail
                        img={img}
                        selected={isSelected}
                      />
                    </div>
                  ) : (
                    // Normal mode: click navigates
                    <Link
                      to={`/images/${img.id}`}
                      state={{
                        imageIds: currentItems.map((i) => i.id),
                        currentIndex: idx,
                        contextTitle: "全部图片",
                        returnUrl: location.pathname + location.search,
                      } satisfies BrowseState}
                    >
                      <Thumbnail img={img} />
                    </Link>
                  )}

                  {/* Delete button — only in normal mode */}
                  {!selectMode && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm("确定删除这张图片？")) {
                          imagesApi.delete(img.id).then(() => {
                            queryClient.invalidateQueries({ queryKey: ["images"] });
                          });
                        }
                      }}
                      className="absolute top-1 right-1 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      title="删除"
                    >
                      <Trash2 size={13} className="text-white" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 text-sm border rounded-lg disabled:opacity-30"
            >
              上一页
            </button>
            <span className="text-sm text-gray-500">
              {page} / {totalPages} (共 {data?.data.total ?? 0} 张)
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 text-sm border rounded-lg disabled:opacity-30"
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Thumbnail sub-component (shared between select and normal mode)
function Thumbnail({ img, selected }: { img: ImageItem; selected?: boolean }) {
  return (
    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative">
      <img
        src={imagesApi.thumbnailUrl(img.id)}
        alt={img.original_name ?? ""}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        loading="lazy"
      />

      {/* Selection checkbox */}
      {selected !== undefined && (
        <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          selected
            ? "bg-blue-500 border-blue-500"
            : "border-white/70 bg-black/20 group-hover:border-white"
        }`}>
          {selected && (
            <svg viewBox="0 0 24 24" className="w-3 h-3 text-white fill-current">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
        </div>
      )}

      {/* Caption overlay */}
      {img.caption_ai && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-white line-clamp-2">{img.caption_ai}</p>
        </div>
      )}

      {/* Selected overlay */}
      {selected && (
        <div className="absolute inset-0 ring-2 ring-blue-500 ring-inset rounded-lg" />
      )}
    </div>
  );
}

function flattenCategories(nodes: CategoryNode[]): { name: string; slug: string; level: number }[] {
  let result: { name: string; slug: string; level: number }[] = [];
  for (const node of nodes) {
    result.push({ name: "　".repeat(node.level - 1) + node.name, slug: node.slug, level: node.level });
    result = result.concat(flattenCategories(node.children));
  }
  return result;
}

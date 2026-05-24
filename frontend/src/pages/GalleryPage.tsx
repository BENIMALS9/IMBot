import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { imagesApi, categoriesApi } from "@/lib/api";
import { Trash2 } from "lucide-react";
import type { ImageItem, CategoryNode } from "@/types";

export function GalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

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

  const totalPages = data ? Math.ceil(data.data.total / data.data.page_size) : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">图片库</h1>
        <div className="flex gap-2">
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
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {(data?.data.items ?? []).map((img: ImageItem) => (
              <div key={img.id} className="group relative">
                <Link to={`/images/${img.id}`}>
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={imagesApi.thumbnailUrl(img.id)}
                      alt={img.original_name ?? ""}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                    {img.caption_ai && (
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white line-clamp-2">{img.caption_ai}</p>
                      </div>
                    )}
                  </div>
                </Link>
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
              </div>
            ))}
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

function flattenCategories(nodes: CategoryNode[]): { name: string; slug: string; level: number }[] {
  let result: { name: string; slug: string; level: number }[] = [];
  for (const node of nodes) {
    result.push({ name: "　".repeat(node.level - 1) + node.name, slug: node.slug, level: node.level });
    result = result.concat(flattenCategories(node.children));
  }
  return result;
}

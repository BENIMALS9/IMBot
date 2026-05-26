import { useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { personsApi, imagesApi } from "@/lib/api";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import type { ImageItem, BrowseState } from "@/types";

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["person-images", id, page],
    queryFn: () => personsApi.getImages(id!, { page, page_size: 50 }),
    enabled: !!id,
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => personsApi.update(id!, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["person-images", id] }),
  });

  const person = data?.data?.person;
  const images: (ImageItem & { face_bbox?: { x: number; y: number; w: number; h: number }; confidence?: number })[] = data?.data?.images ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50) || 0;

  if (isLoading) {
    return <div className="p-6 text-center text-gray-400">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/persons" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100">
              <img
                src={personsApi.faceThumbnailUrl(id!)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-800">{person?.name ?? "未命名"}</h1>
                <button
                  onClick={() => {
                    const name = prompt("修改姓名：", person?.name === "未命名" ? "" : person?.name ?? "");
                    if (name) renameMutation.mutate(name);
                  }}
                  className="p-1 text-gray-400 hover:text-blue-500"
                  title="编辑姓名"
                >
                  <Pencil size={14} />
                </button>
              </div>
              <p className="text-sm text-gray-400">{person?.image_count ?? 0} 张照片</p>
            </div>
          </div>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无照片</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {images.map((img, idx: number) => (
              <div key={img.id} className="group relative">
                <Link
                  to={`/images/${img.id}`}
                  state={{
                    imageIds: images.map((i) => i.id),
                    currentIndex: idx,
                    contextTitle: person?.name ?? "人物",
                    returnUrl: location.pathname + location.search,
                  } satisfies BrowseState}
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={imagesApi.thumbnailUrl(img.id)}
                      alt={img.original_name ?? ""}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  </div>
                  {img.caption_ai && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs text-white line-clamp-2">{img.caption_ai}</p>
                    </div>
                  )}
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm("确定删除这张图片？")) {
                      imagesApi.delete((img as any).id).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["person-images", id] });
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 text-sm border rounded-lg disabled:opacity-30"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">
                {page} / {totalPages} (共 {total} 张)
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-4 py-2 text-sm border rounded-lg disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

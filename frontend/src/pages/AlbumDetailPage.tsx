import { useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { albumsApi, imagesApi } from "@/lib/api";
import { ArrowLeft, Plus, X, Check, Pencil, Trash2 } from "lucide-react";
import type { ImageItem, BrowseState } from "@/types";

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [galleryPage, setGalleryPage] = useState(1);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["album", id, page],
    queryFn: () => albumsApi.get(id!, { page, page_size: 50 }),
    enabled: !!id,
  });

  const { data: allImages } = useQuery({
    queryKey: ["images", "all", galleryPage],
    queryFn: () => imagesApi.list({ page: galleryPage, page_size: 100 }),
    enabled: showAddModal,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) => albumsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["album", id] });
      queryClient.invalidateQueries({ queryKey: ["albums"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (imageId: string) => albumsApi.removeImage(id!, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["album", id] });
      queryClient.invalidateQueries({ queryKey: ["albums"] });
    },
  });

  const addMutation = useMutation({
    mutationFn: (imageIds: string[]) => albumsApi.addImages(id!, imageIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["album", id] });
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setShowAddModal(false);
      setSelectedIds(new Set());
    },
  });

  const album = data?.data.album;
  const images: ImageItem[] = data?.data.images ?? [];
  const total = data?.data.total ?? 0;
  const totalPages = Math.ceil(total / data?.data.page_size) || 0;
  const pageSize = data?.data.page_size ?? 50;

  const toggleSelect = (imageId: string) => {
    const next = new Set(selectedIds);
    if (next.has(imageId)) next.delete(imageId);
    else next.add(imageId);
    setSelectedIds(next);
  };

  if (isLoading) {
    return <div className="p-6 text-center text-gray-400">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/albums" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editName.trim()) updateMutation.mutate({ name: editName.trim() });
                  setEditingName(false);
                }}
                className="flex items-center gap-1"
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-2xl font-bold text-gray-800 bg-white border-b-2 border-blue-500 outline-none w-full max-w-xs"
                />
                <button type="submit" className="p-1 text-green-500"><Check size={16} /></button>
                <button type="button" onClick={() => setEditingName(false)} className="p-1 text-gray-400"><X size={16} /></button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-800">{album?.name}</h1>
                <button
                  onClick={() => { setEditName(album?.name ?? ""); setEditingName(true); }}
                  className="p-1 text-gray-400 hover:text-blue-500"
                  title="编辑名称"
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
            {editingDesc ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateMutation.mutate({ description: editDesc.trim() || "" });
                  setEditingDesc(false);
                }}
                className="flex items-center gap-1 mt-1"
              >
                <input
                  autoFocus
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="添加描述..."
                  className="text-sm text-gray-500 bg-white border-b-2 border-blue-500 outline-none w-full max-w-xs"
                />
                <button type="submit" className="p-1 text-green-500"><Check size={14} /></button>
                <button type="button" onClick={() => setEditingDesc(false)} className="p-1 text-gray-400"><X size={14} /></button>
              </form>
            ) : (
              <div className="flex items-center gap-1">
                <p className="text-sm text-gray-400">{album?.description || "无描述"}</p>
                <button
                  onClick={() => { setEditDesc(album?.description ?? ""); setEditingDesc(true); }}
                  className="p-0.5 text-gray-400 hover:text-blue-500"
                  title="编辑描述"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
          </div>
          {album?.is_smart && (
            <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">智能</span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus size={16} /> 添加图片
        </button>
      </div>

      {/* Image grid */}
      {images.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>相册为空</p>
          <p className="text-sm mt-1">点击"添加图片"选择要加入的图片</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {images.map((img: ImageItem, idx: number) => (
              <div key={img.id} className="group relative">
                <Link
                  to={`/images/${img.id}`}
                  state={{
                    imageIds: images.map((i) => i.id),
                    currentIndex: idx,
                    contextTitle: album?.name ?? "相册",
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
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm("确定删除这张图片？删除后无法恢复。")) {
                      imagesApi.delete(img.id).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["album", id] });
                        queryClient.invalidateQueries({ queryKey: ["albums"] });
                      });
                    }
                  }}
                  className="absolute top-1 right-1 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  title="删除"
                >
                  <Trash2 size={13} className="text-white" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("从相册中移除？")) removeMutation.mutate(img.id);
                  }}
                  className="absolute top-1 right-8 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="移除"
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
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

      {/* Add Images Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-[90vw] max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">选择图片添加到相册</h2>
              <button onClick={() => { setShowAddModal(false); setSelectedIds(new Set()); }}>
                <X size={20} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {selectedIds.size > 0 && (
                <div className="sticky top-0 z-10 mb-3 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-blue-700">
                    已选择 {selectedIds.size} 张图片
                  </span>
                  <button
                    onClick={() => addMutation.mutate(Array.from(selectedIds))}
                    disabled={addMutation.isPending}
                    className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    <Check size={14} /> 添加
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {(allImages?.data.items ?? []).map((img: ImageItem) => (
                  <div
                    key={img.id}
                    onClick={() => toggleSelect(img.id)}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedIds.has(img.id) ? "border-blue-500" : "border-transparent hover:border-gray-300"
                    }`}
                  >
                    <div className="aspect-square bg-gray-100">
                      <img
                        src={imagesApi.thumbnailUrl(img.id)}
                        alt={img.original_name ?? ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    {selectedIds.has(img.id) && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Gallery pagination inside modal */}
            {allImages && allImages.data.total > 100 && (
              <div className="flex items-center justify-center gap-3 p-3 border-t">
                <button
                  onClick={() => setGalleryPage((p) => Math.max(1, p - 1))}
                  disabled={galleryPage <= 1}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-30"
                >
                  上一页
                </button>
                <span className="text-sm text-gray-400">
                  {galleryPage} / {Math.ceil(allImages.data.total / 100)}
                </span>
                <button
                  onClick={() => setGalleryPage((p) => p + 1)}
                  disabled={galleryPage >= Math.ceil(allImages.data.total / 100)}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

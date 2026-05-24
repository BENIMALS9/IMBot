import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { imagesApi, categoriesApi } from "@/lib/api";
import { ArrowLeft, Trash2, Plus, X, ChevronDown, RefreshCw } from "lucide-react";

function flattenCategoryOptions(nodes: any[], depth: number = 0): { id: string; name: string; depth: number; slug: string }[] {
  let result: { id: string; name: string; depth: number; slug: string }[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth, slug: node.slug });
    if (node.children) {
      result = result.concat(flattenCategoryOptions(node.children, depth + 1));
    }
  }
  return result;
}

export function ImageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCatPicker, setShowCatPicker] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["image", id],
    queryFn: () => imagesApi.get(id!),
    enabled: !!id,
  });

  const { data: catTree } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.list(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => imagesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image", id] });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: () => imagesApi.reprocess(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image", id] });
    },
  });

  const handleDelete = async () => {
    if (!confirm("确定删除这张图片？删除后无法恢复。")) return;
    try {
      await imagesApi.delete(id!);
      queryClient.invalidateQueries({ queryKey: ["images"] });
      navigate(-1);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleRemoveCategory = (catId: string) => {
    const currentIds = (img.categories || []).map((c: any) => c.id);
    updateMutation.mutate({ category_ids: currentIds.filter((id: string) => id !== catId) });
  };

  const handleAddCategory = (catId: string) => {
    const currentIds = (img.categories || []).map((c: any) => c.id);
    if (currentIds.includes(catId)) return;
    updateMutation.mutate({ category_ids: [...currentIds, catId] });
    setShowCatPicker(false);
  };

  if (isLoading) return <div className="p-6 text-gray-400">加载中...</div>;
  if (!data) return <div className="p-6 text-gray-400">图片未找到</div>;

  const img = data.data;
  const catOptions = flattenCategoryOptions(catTree?.data ?? []);
  const assignedIds = new Set((img.categories || []).map((c: any) => c.id));
  const availableCats = catOptions.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} /> 返回
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 size={15} /> 删除
        </button>
      </div>
      <div className="flex gap-6">
      {/* Image viewer */}
      <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-xl min-h-[70vh]">
        <img
          src={imagesApi.originalUrl(id!)}
          alt={img.original_name}
          className="max-w-full max-h-[70vh] object-contain rounded-lg"
        />
      </div>

      {/* Info panel */}
      <div className="w-80 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800">{img.original_name || img.filename}</h2>
          <p className="text-sm text-gray-400">{img.width} x {img.height} · {formatSize(img.file_size)}</p>
        </div>

        {/* AI processing status */}
        {img.processing_status && img.processing_status !== "done" && (
          <div className={`rounded-lg p-2.5 text-xs ${
            img.processing_status === "error" || img.processing_status === "timeout"
              ? "bg-red-50 border border-red-200"
              : "bg-blue-50"
          }`}>
            {img.processing_status === "pending" && (
              <p className="text-blue-600">处理排队中...</p>
            )}
            {img.processing_status === "captioning" && (
              <p className="text-blue-600">正在生成 AI 描述与分类...</p>
            )}
            {img.processing_status === "faces" && (
              <p className="text-blue-600">正在检测人脸...</p>
            )}
            {(img.processing_status === "error" || img.processing_status === "timeout") && (
              <div>
                <p className="text-red-600 mb-1.5">
                  {img.processing_status === "timeout" ? "处理超时" : "处理失败"}
                </p>
                <button
                  onClick={() => reprocessMutation.mutate()}
                  disabled={reprocessMutation.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={11} className={reprocessMutation.isPending ? "animate-spin" : ""} />
                  重试
                </button>
              </div>
            )}
          </div>
        )}

        {img.date_taken && (
          <InfoBlock label="拍摄时间" value={new Date(img.date_taken).toLocaleString("zh-CN")} />
        )}
        {img.camera_model && <InfoBlock label="相机" value={img.camera_model} />}
        {img.location_name && <InfoBlock label="地点" value={img.location_name} />}

        {/* Editable categories */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">分类</h3>
          <div className="flex flex-wrap gap-1">
            {(img.categories || []).map((c: any) => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs group">
                {c.name}
                <button
                  onClick={() => handleRemoveCategory(c.id)}
                  className="p-0.5 rounded-full hover:bg-blue-200 transition-colors"
                  title="移除此分类"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {/* Add category button + dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowCatPicker(!showCatPicker)}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 border border-dashed border-gray-300 text-gray-400 rounded-full text-xs hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Plus size={10} /> 添加
              </button>
              {showCatPicker && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCatPicker(false)} />
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[160px]">
                    {availableCats.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-2">无可用分类</p>
                    ) : (
                      availableCats.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleAddCategory(c.id)}
                          className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-blue-50 transition-colors"
                          style={{ paddingLeft: 12 + c.depth * 16 }}
                        >
                          {c.depth > 0 ? "└ " : ""}{c.name}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {(img.categories || []).length === 0 && !showCatPicker && (
            <p className="text-xs text-gray-400">暂无分类，点击「添加」选择</p>
          )}
        </div>

        {img.persons?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">人物</h3>
            <div className="flex flex-wrap gap-1">
              {img.persons.map((p: any) => (
                <span key={p.id} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">
                  {p.name || "未命名"}
                </span>
              ))}
            </div>
          </div>
        )}

        {img.caption_ai && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">AI 描述</h3>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">{img.caption_ai}</p>
          </div>
        )}

        {img.user_notes && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">备注</h3>
            <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded-lg">{img.user_notes}</p>
          </div>
        )}

        {img.exif_raw && (
          <details>
            <summary className="text-sm text-gray-400 cursor-pointer">EXIF 详情</summary>
            <pre className="mt-1 text-xs text-gray-500 max-h-40 overflow-auto bg-gray-50 p-2 rounded-lg">
              {JSON.stringify(img.exif_raw, null, 2)}
            </pre>
          </details>
        )}
      </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

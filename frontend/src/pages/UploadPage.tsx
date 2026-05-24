import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { imagesApi, foldersApi, albumsApi } from "@/lib/api";
import { Upload, FolderOpen, Album, Clock, CheckCircle, Loader2, XCircle, Trash2, Sparkles, ScanFace } from "lucide-react";
import type { RecentUpload } from "@/types";

const STATUS_MAP: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  captioning: { label: "AI 描述中", icon: Loader2, color: "text-blue-500" },
  faces: { label: "人脸识别中", icon: Loader2, color: "text-purple-500" },
  done: { label: "已完成", icon: CheckCircle, color: "text-green-500" },
  error: { label: "失败", icon: XCircle, color: "text-red-500" },
};

function getPendingStatus(uploads: RecentUpload[]): { label: string; icon: typeof Clock; color: string } {
  const hasActive = uploads.some((u) => u.processing_status === "captioning" || u.processing_status === "faces");
  return hasActive
    ? { label: "排队中", icon: Clock, color: "text-gray-400" }
    : { label: "等待中", icon: Clock, color: "text-amber-500" };
}

export function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ uploaded: number; image_ids: string[] } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState("");
  const [historyLimit, setHistoryLimit] = useState(20);
  const [enableAICaption, setEnableAICaption] = useState(true);
  const [enableFaceRecognition, setEnableFaceRecognition] = useState(true);
  const queryClient = useQueryClient();

  const { data: folders } = useQuery({
    queryKey: ["folders"], queryFn: () => foldersApi.list(),
  });

  const { data: albumsData } = useQuery({
    queryKey: ["albums"], queryFn: () => albumsApi.list(),
  });

  const { data: recentUploads } = useQuery({
    queryKey: ["recent-uploads", historyLimit],
    queryFn: () => imagesApi.recent(historyLimit),
    refetchInterval: 5000,
  });

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;

    setUploading(true);
    setProgress(0);
    setResult(null);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    if (selectedFolder) formData.append("folder_id", selectedFolder);
    if (selectedAlbum) formData.append("album_id", selectedAlbum);
    formData.append("enable_ai_caption", String(enableAICaption));
    formData.append("enable_face_recognition", String(enableFaceRecognition));

    try {
      const res = await imagesApi.upload(formData, setProgress);
      setResult(res.data);
      queryClient.invalidateQueries({ queryKey: ["recent-uploads"] });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [selectedFolder, selectedAlbum, enableAICaption, enableFaceRecognition, queryClient]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDelete = async (imageId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定要删除这张图片吗？删除后无法恢复。")) return;
    try {
      await imagesApi.delete(imageId);
      queryClient.invalidateQueries({ queryKey: ["recent-uploads"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const uploads = (recentUploads?.data ?? []) as RecentUpload[];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">上传图片</h1>

      <div className="flex items-center gap-3">
        <FolderOpen size={18} className="text-gray-400" />
        <select
          value={selectedFolder}
          onChange={(e) => setSelectedFolder(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">默认文件夹</option>
          {flattenFoldersWithDepth(folders?.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {"   ".repeat(f.depth)}
              {f.depth > 0 ? "└ " : ""}{f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <Album size={18} className="text-gray-400" />
        <select
          value={selectedAlbum}
          onChange={(e) => setSelectedAlbum(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">不加入相册</option>
          {(albumsData?.data ?? []).map((a: { id: string; name: string }) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <Sparkles size={16} className={enableAICaption ? "text-blue-500" : "text-gray-300"} />
          <span className="text-sm text-gray-600">AI 描述</span>
          <button
            type="button"
            role="switch"
            aria-checked={enableAICaption}
            onClick={() => setEnableAICaption(!enableAICaption)}
            className={`relative w-9 h-5 rounded-full transition-colors ${enableAICaption ? "bg-blue-600" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enableAICaption ? "left-4" : "left-0.5"}`} />
          </button>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <ScanFace size={16} className={enableFaceRecognition ? "text-purple-500" : "text-gray-300"} />
          <span className="text-sm text-gray-600">人脸识别</span>
          <button
            type="button"
            role="switch"
            aria-checked={enableFaceRecognition}
            onClick={() => setEnableFaceRecognition(!enableFaceRecognition)}
            className={`relative w-9 h-5 rounded-full transition-colors ${enableFaceRecognition ? "bg-blue-600" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enableFaceRecognition ? "left-4" : "left-0.5"}`} />
          </button>
        </label>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          uploading
            ? "border-blue-300 bg-blue-50"
            : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
        }`}
      >
        <Upload size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 mb-2">
          {uploading ? "上传中..." : "拖拽图片文件或文件夹到此处"}
        </p>
        {uploading && (
          <div className="w-64 mx-auto mt-4">
            <div className="h-2 bg-gray-200 rounded-full">
              <div
                className="h-2 bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-400 mt-1">{progress}%</p>
          </div>
        )}
        {!uploading && (
          <label className="inline-block mt-2 px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
            选择文件
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (!files.length) return;
                const dt = new DataTransfer();
                files.forEach((f) => dt.items.add(f));
                const event = { preventDefault: () => {}, dataTransfer: dt } as unknown as React.DragEvent;
                handleDrop(event);
              }}
            />
          </label>
        )}
      </div>

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 font-medium">上传完成</p>
          <p className="text-sm text-green-600">共上传 {result.uploaded} 张图片，AI 正在后台处理...</p>
        </div>
      )}

      {/* Upload History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">上传历史</h2>
          <select
            value={historyLimit}
            onChange={(e) => setHistoryLimit(Number(e.target.value))}
            className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-500"
          >
            <option value={20}>最近 20 张</option>
            <option value={30}>最近 30 张</option>
            <option value={50}>最近 50 张</option>
          </select>
        </div>

        {uploads.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">暂无上传记录</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">预览</th>
                  <th className="px-4 py-2 font-medium">文件名</th>
                  <th className="px-4 py-2 font-medium">AI 状态</th>
                  <th className="px-4 py-2 font-medium">上传时间</th>
                  <th className="px-4 py-2 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((img) => {
                  const isPending = img.processing_status === "pending" || !img.processing_status;
                  const st = isPending
                    ? getPendingStatus(uploads)
                    : (STATUS_MAP[img.processing_status] ?? getPendingStatus(uploads));
                  const StatusIcon = st.icon;
                  return (
                    <tr key={img.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="w-10 h-10 rounded bg-gray-100 overflow-hidden">
                          {img.thumbnail_path && (
                            <img
                              src={imagesApi.thumbnailUrl(img.id)}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-gray-700 truncate block max-w-[200px]">
                          {img.original_name || img.filename}
                        </span>
                        {img.caption_ai && (
                          <span className="text-xs text-gray-400 truncate block max-w-[200px]">
                            {img.caption_ai}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon size={14} className={`${st.color} ${img.processing_status === "captioning" || img.processing_status === "faces" ? "animate-spin" : ""}`} />
                          <span className={st.color}>{st.label}</span>
                        </div>
                        {img.tasks?.some((t) => t.status === "error") && (
                          <span className="text-xs text-red-400">
                            {img.tasks.find((t) => t.status === "error")?.error_message?.slice(0, 60)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {img.created_at ? new Date(img.created_at).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={(e) => handleDelete(img.id, e)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function flattenFoldersWithDepth(
  nodes: any[],
  depth: number = 0,
): { id: string; name: string; depth: number }[] {
  let result: { id: string; name: string; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children) {
      result = result.concat(flattenFoldersWithDepth(node.children, depth + 1));
    }
  }
  return result;
}

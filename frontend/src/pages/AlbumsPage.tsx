import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { albumsApi } from "@/lib/api";
import { Album, Plus, Trash2, Image } from "lucide-react";
import type { AlbumItem } from "@/types";

export function AlbumsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: albums } = useQuery({
    queryKey: ["albums"], queryFn: () => albumsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, any>) => albumsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => albumsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["albums"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">相册</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus size={16} /> 新建相册
        </button>
      </div>

      {showCreate && (
        <div className="p-4 bg-white rounded-xl border border-gray-200 space-y-3">
          <input
            type="text" placeholder="相册名称" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            type="text" placeholder="描述（可选）" value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate({ name: newName, description: newDesc })}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm"
            >
              创建
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-1.5 border rounded-lg text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(albums?.data ?? []).map((album: AlbumItem) => (
          <Link
            key={album.id}
            to={`/albums/${album.id}`}
            className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm group hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <Album size={24} className="text-blue-500 mb-2" />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm("删除此相册？")) deleteMutation.mutate(album.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <h3 className="font-medium text-gray-800">{album.name}</h3>
            {album.description && (
              <p className="text-sm text-gray-400 mt-1 line-clamp-2">{album.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Image size={12} />
                <span>{album.image_count ?? 0} 张</span>
              </div>
              {album.is_smart && (
                <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">智能</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

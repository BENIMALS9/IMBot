import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { personsApi } from "@/lib/api";
import { Link } from "react-router-dom";
import { User, Trash2 } from "lucide-react";
import type { PersonItem } from "@/types";

export function PersonsPage() {
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [mergeMsg, setMergeMsg] = useState("");

  const { data: persons } = useQuery({
    queryKey: ["persons"], queryFn: () => personsApi.list(),
  });

  const { data: unknowns } = useQuery({
    queryKey: ["persons-unknown"], queryFn: () => personsApi.unknown(),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => personsApi.update(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      queryClient.invalidateQueries({ queryKey: ["persons-unknown"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => personsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      queryClient.invalidateQueries({ queryKey: ["persons-unknown"] });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      personsApi.update(to, { merge_from_id: from }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      queryClient.invalidateQueries({ queryKey: ["persons-unknown"] });
      setMergeMsg("合并成功");
      setTimeout(() => setMergeMsg(""), 2000);
    },
  });

  const handleRename = (person: PersonItem) => {
    const name = prompt("输入人物姓名：", person.name === "未命名" ? "" : person.name);
    if (name) renameMutation.mutate({ id: person.id, name });
  };

  const handleDelete = (person: PersonItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`确定删除人物「${person.name}」及其所有关联？此操作不可恢复。`)) {
      deleteMutation.mutate(person.id);
    }
  };

  const onDragStart = (id: string) => {
    setDragId(id);
    setDropTarget(null);
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragId && dragId !== id) {
      setDropTarget(id);
    }
  };

  const onDragLeave = () => {
    setDropTarget(null);
  };

  const onDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      mergeMutation.mutate({ from: dragId, to: targetId });
    }
    setDragId(null);
    setDropTarget(null);
  };

  const renderPersonCard = (p: PersonItem, isUnknown: boolean) => (
    <div
      key={p.id}
      className={`text-center group relative rounded-lg transition-all ${
        dragId === p.id ? "opacity-40 scale-95" : ""
      } ${dropTarget === p.id ? "ring-2 ring-blue-400 bg-blue-50 scale-105" : ""}`}
      draggable
      onDragStart={() => onDragStart(p.id)}
      onDragOver={(e) => onDragOver(e, p.id)}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(p.id)}
      onDragEnd={() => { setDragId(null); setDropTarget(null); }}
      title="拖拽到另一个人物头像上即可合并"
    >
      <Link to={`/persons/${p.id}`}>
        <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-gray-100 mb-2">
          {p.face_thumbnail ? (
            <img src={personsApi.faceThumbnailUrl(p.id)} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <User size={40} className="w-full h-full p-4 text-gray-300" />
          )}
        </div>
        <p className="text-sm font-medium text-gray-700">{p.name}</p>
        <p className="text-xs text-gray-400">{p.image_count} 张照片</p>
      </Link>
      {isUnknown && (
        <button
          onClick={(e) => { e.preventDefault(); handleRename(p); }}
          className="text-sm text-blue-600 hover:underline mt-1"
        >
          标注姓名
        </button>
      )}
      <button
        onClick={(e) => handleDelete(p, e)}
        className="absolute top-0 right-0 p-1 bg-red-50 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600"
        title="删除人物"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">人物</h1>
        {mergeMsg && (
          <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">{mergeMsg}</span>
        )}
      </div>

      {dragId && (
        <p className="text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
          拖拽中... 将当前人物拖到目标人物头像上即可合并（被拖拽人物的照片会归入目标人物）
        </p>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">已识别人物</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {(persons?.data?.length ?? 0) > 0 ? (
            (persons!.data as PersonItem[]).map((p) => renderPersonCard(p, false))
          ) : (
            <p className="text-gray-400 col-span-full text-center py-8">暂无识别人物，上传含有人脸的照片后将自动识别</p>
          )}
        </div>
      </section>

      {(unknowns?.data ?? []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">待标注</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {(unknowns?.data ?? []).map((p: any) => renderPersonCard(p, true))}
          </div>
        </section>
      )}
    </div>
  );
}

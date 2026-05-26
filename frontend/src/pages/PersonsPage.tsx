import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { personsApi } from "@/lib/api";
import { Link } from "react-router-dom";
import { User, Trash2, CheckSquare, X } from "lucide-react";
import type { PersonItem } from "@/types";

export function PersonsPage() {
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [mergeMsg, setMergeMsg] = useState("");

  // ---- Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // ---- Batch merge
  const batchMergeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const target = ids[0];
      for (let i = 1; i < ids.length; i++) {
        await personsApi.update(target, { merge_from_id: ids[i] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      queryClient.invalidateQueries({ queryKey: ["persons-unknown"] });
      setSelectedIds(new Set());
      setMergeMsg("批量合并成功");
      setTimeout(() => setMergeMsg(""), 2000);
    },
  });

  // ---- Batch delete
  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await personsApi.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      queryClient.invalidateQueries({ queryKey: ["persons-unknown"] });
      setSelectedIds(new Set());
    },
  });

  // ---- Multi-select helpers
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAllVisible = (list: PersonItem[]) => {
    setSelectedIds(new Set(list.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchMerge = () => {
    const ids = Array.from(selectedIds);
    if (ids.length < 2) return;
    const targetPerson = [...allPersons, ...allUnknowns].find((p) => p.id === ids[0]);
    const targetName = targetPerson?.name ?? "";
    if (!confirm(`将 ${ids.length - 1} 个人物合并到「${targetName}」？合并后不可恢复。`)) return;
    batchMergeMutation.mutate(ids);
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个人物及其所有关联？删除后不可恢复。`)) return;
    batchDeleteMutation.mutate(Array.from(selectedIds));
  };

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

  const allPersons: PersonItem[] = (persons?.data ?? []) as PersonItem[];
  const allUnknowns: any[] = unknowns?.data ?? [];
  const allPersonsSelected = allPersons.length > 0 && allPersons.every((p) => selectedIds.has(p.id));

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
      onDrop={() => onDrop(p.id)}
      onDragEnd={() => { setDragId(null); setDropTarget(null); }}
      title="拖拽到另一个人物头像上即可合并"
    >
      <Link to={`/persons/${p.id}`}>
        <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-gray-100 mb-2">
          {p.face_thumbnail ? (
            <img src={personsApi.faceThumbnailUrl(p.id)} alt={p.name} className="w-full h-full object-cover" draggable={false} />
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

  // Select-mode card (modal only) — click toggles selection, no Link, no delete
  const renderSelectCard = (p: PersonItem) => {
    const isSelected = selectedIds.has(p.id);
    return (
      <div
        key={p.id}
        onClick={() => toggleSelect(p.id)}
        className={`text-center group relative rounded-lg transition-all cursor-pointer ${
          isSelected ? "ring-2 ring-blue-500" : ""
        }`}
      >
        <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-gray-100 mb-2">
          {p.face_thumbnail ? (
            <img src={personsApi.faceThumbnailUrl(p.id)} alt={p.name} className="w-full h-full object-cover" draggable={false} />
          ) : (
            <User size={40} className="w-full h-full p-4 text-gray-300" />
          )}
        </div>
        <p className="text-sm font-medium text-gray-700">{p.name}</p>
        <p className="text-xs text-gray-400">{p.image_count} 张照片</p>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* ---- Multi-select modal ---- */}
      {selectMode && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-8"
             onClick={exitSelectMode}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-800">批量操作</h2>
                <span className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  已选 {selectedIds.size} 人
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (allPersonsSelected) deselectAll();
                    else selectAllVisible(allPersons);
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {allPersonsSelected ? "取消全选" : "全选"}
                </button>
                <button
                  onClick={handleBatchMerge}
                  disabled={selectedIds.size < 2 || batchMergeMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40"
                >
                  合并选中 ({selectedIds.size})
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
              </div>
            </div>
            {/* Modal body — persons grid */}
            <div className="p-6 overflow-y-auto">
              {(allPersons.length > 0) ? (
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
                  {allPersons.map((p) => renderSelectCard(p))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-12">暂无识别人物</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Normal page content ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">人物</h1>
          {mergeMsg && (
            <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">{mergeMsg}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600"
          >
            <CheckSquare size={14} /> 多选
          </button>
        </div>
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

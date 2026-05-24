import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { foldersApi } from "@/lib/api";
import {
  FolderOpen, ChevronRight, ChevronDown, Plus,
  Trash2, Pencil, Image, Check, X,
} from "lucide-react";
import type { FolderNode } from "@/types";

export function FoldersPage() {
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: tree } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.list(),
  });

  const createMut = useMutation({
    mutationFn: (data: { name: string; parent_id?: string }) => foldersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setShowCreate(false);
      setNewName("");
      setNewParentId("");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string }) =>
      foldersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => foldersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const data: { name: string; parent_id?: string } = { name: newName.trim() };
    if (newParentId) data.parent_id = newParentId;
    createMut.mutate(data);
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleSaveEdit = (id: string) => {
    if (editName.trim()) {
      updateMut.mutate({ id, name: editName.trim() });
    } else {
      setEditingId(null);
    }
  };

  const handleDelete = (node: FolderNode) => {
    const msg = `确定删除文件夹「${node.name}」及其所有子文件夹和图片？此操作不可恢复。`;
    if (confirm(msg)) {
      deleteMut.mutate(node.id);
    }
  };

  const folders = (tree?.data ?? []) as FolderNode[];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">文件夹</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          新建文件夹
        </button>
      </div>

      {showCreate && (
        <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
          <input
            placeholder="文件夹名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
            autoFocus
          />
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          >
            <option value="">无 (根目录)</option>
            {flattenFoldersWithDepth(folders).map((f) => (
              <option key={f.id} value={f.id}>
                {"   ".repeat(f.depth)}
                {f.depth > 0 ? "└ " : ""}{f.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              创建
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(""); setNewParentId(""); }}
              className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {folders.length === 0 ? (
        <p className="text-gray-400 text-center py-12">
          暂无文件夹，点击「新建文件夹」创建第一个文件夹
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl">
          {folders.map((node) => (
            <FolderTreeItem
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
              editingId={editingId}
              editName={editName}
              onStartEdit={handleStartEdit}
              onEditChange={setEditName}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderTreeItem({
  node, depth, expandedIds, onToggle,
  editingId, editName, onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onDelete,
}: {
  node: FolderNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  editingId: string | null;
  editName: string;
  onStartEdit: (id: string, name: string) => void;
  onEditChange: (v: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (node: FolderNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isEditing = editingId === node.id;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 group border-b border-gray-50"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        <button
          onClick={() => onToggle(node.id)}
          className={`p-0.5 rounded hover:bg-gray-200 ${hasChildren ? "" : "invisible"}`}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <FolderOpen size={16} className="text-amber-500 flex-shrink-0" />

        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              value={editName}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit(node.id);
                if (e.key === "Escape") onCancelEdit();
              }}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-sm border border-blue-300 rounded outline-none focus:border-blue-400"
              autoFocus
            />
            <button onClick={() => onSaveEdit(node.id)} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
              <Check size={14} />
            </button>
            <button onClick={onCancelEdit} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded">
              <X size={14} />
            </button>
          </div>
        ) : (
          <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{node.name}</span>
        )}

        <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
          <Image size={11} />
          {node.image_count}
        </span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onStartEdit(node.id, node.name)}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="重命名"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onDelete(node)}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              editingId={editingId}
              editName={editName}
              onStartEdit={onStartEdit}
              onEditChange={onEditChange}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function flattenFoldersWithDepth(
  nodes: FolderNode[],
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

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { imagesApi, categoriesApi } from "@/lib/api";
import {
  ArrowLeft, Trash2, Plus, X, RefreshCw,
  ChevronLeft, ChevronRight, Play, Pause,
  Maximize,
} from "lucide-react";
import type { BrowseState } from "@/types";

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
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showCatPicker, setShowCatPicker] = useState(false);

  // ---- Browse context
  const browse = (location.state as BrowseState) ?? null;
  const imageIds: string[] = browse?.imageIds ?? [];
  const currentIndex: number = browse?.currentIndex ?? -1;
  const hasPrev = currentIndex > 0;
  const hasNext = imageIds.length > 0 && currentIndex < imageIds.length - 1;
  const totalInContext = imageIds.length;

  // ---- Slideshow state
  const [slideshow, setSlideshow] = useState(false);
  const [slideshowSpeed, setSlideshowSpeed] = useState(5);
  const [customSpeed, setCustomSpeed] = useState("");
  const [slideshowMode, setSlideshowMode] = useState<"sequential" | "random">("sequential");

  // ---- Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const effectiveSpeed = customSpeed ? Number(customSpeed) : slideshowSpeed;

  // ---- Data
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["image", id] }),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => imagesApi.reprocess(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["image", id] }),
  });

  // ---- Prefetch adjacent
  useEffect(() => {
    if (hasPrev) {
      queryClient.prefetchQuery({
        queryKey: ["image", imageIds[currentIndex - 1]],
        queryFn: () => imagesApi.get(imageIds[currentIndex - 1]),
        staleTime: 30000,
      });
    }
    if (hasNext) {
      queryClient.prefetchQuery({
        queryKey: ["image", imageIds[currentIndex + 1]],
        queryFn: () => imagesApi.get(imageIds[currentIndex + 1]),
        staleTime: 30000,
      });
    }
  }, [currentIndex, imageIds, hasPrev, hasNext, queryClient]);

  // ---- Navigate
  const goBack = () => {
    if (browse?.returnUrl) navigate(browse.returnUrl);
    else navigate(-1);
  };

  const navigateTo = useCallback(
    (newIndex: number) => {
      const state: BrowseState = {
        imageIds,
        currentIndex: newIndex,
        contextTitle: browse?.contextTitle ?? "",
        returnUrl: browse?.returnUrl ?? "",
      };
      navigate(`/images/${imageIds[newIndex]}`, { state, replace: true });
    },
    [navigate, imageIds, browse],
  );

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      setSlideshow(false);
      navigateTo(currentIndex - 1);
    }
  }, [hasPrev, currentIndex, navigateTo]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setSlideshow(false);
      navigateTo(currentIndex + 1);
    }
  }, [hasNext, currentIndex, navigateTo]);

  // ---- Overlay show/hide
  const showOverlayTemp = useCallback(() => {
    setShowOverlay(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowOverlay(false), 3000);
  }, []);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // ---- Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goToPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goToNext(); }
      else if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); setSlideshow((s) => !s); }
      else if (e.key === "Escape") { setIsFullscreen(false); }
      else if (e.key === "f" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setIsFullscreen((f) => !f); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToPrev, goToNext]);

  // ---- Slideshow timer
  useEffect(() => {
    if (!slideshow || !browse) return;

    const advance = () => {
      if (slideshowMode === "random") {
        if (imageIds.length <= 1) return;
        let next: number;
        do {
          next = Math.floor(Math.random() * imageIds.length);
        } while (next === currentIndex && imageIds.length > 1);
        navigateTo(next);
      } else {
        if (currentIndex >= imageIds.length - 1) {
          navigateTo(0);
        } else {
          navigateTo(currentIndex + 1);
        }
      }
    };

    const timer = setInterval(advance, effectiveSpeed * 1000);
    return () => clearInterval(timer);
  }, [slideshow, effectiveSpeed, slideshowMode, currentIndex, imageIds, browse, navigateTo]);

  // ---- Delete
  const handleDelete = async () => {
    if (!confirm("确定删除这张图片？删除后无法恢复。")) return;
    try {
      await imagesApi.delete(id!);
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["person-images"] });
      queryClient.invalidateQueries({ queryKey: ["album"] });
      if (hasNext) navigateTo(currentIndex + 1);
      else if (hasPrev) navigateTo(currentIndex - 1);
      else goBack();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleRemoveCategory = (catId: string) => {
    const currentIds = (img.categories || []).map((c: any) => c.id);
    updateMutation.mutate({ category_ids: currentIds.filter((cid: string) => cid !== catId) });
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

  // ---- Slideshow control bar (shared)
  const slideshowBar = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setSlideshow(!slideshow)}
        className={`p-1.5 rounded-full transition-colors ${
          slideshow ? "text-blue-400 hover:text-blue-300" : "text-white/80 hover:text-white"
        }`}
        title={slideshow ? "暂停" : "幻灯片播放"}
      >
        {slideshow ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <select
        value={customSpeed ? "custom" : slideshowSpeed}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") { setCustomSpeed("5"); }
          else { setCustomSpeed(""); setSlideshowSpeed(Number(v)); }
        }}
        className="bg-transparent text-white/80 text-xs border border-white/20 rounded px-1.5 py-0.5 outline-none cursor-pointer [&>option]:text-gray-800"
      >
        <option value={3}>3秒</option>
        <option value={5}>5秒</option>
        <option value={10}>10秒</option>
        <option value={15}>15秒</option>
        <option value="custom">自定义</option>
      </select>

      {customSpeed && (
        <input
          type="number"
          min={1}
          max={300}
          value={customSpeed}
          onChange={(e) => setCustomSpeed(e.target.value)}
          className="w-12 bg-white/10 text-white text-xs border border-white/20 rounded px-1 py-0.5 outline-none focus:border-white/40"
          placeholder="秒"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <button
        onClick={() => setSlideshowMode((m) => (m === "sequential" ? "random" : "sequential"))}
        className={`text-xs px-1.5 py-0.5 rounded-full transition-colors ${
          slideshowMode === "random"
            ? "text-purple-300 bg-purple-500/20"
            : "text-white/60 hover:text-white"
        }`}
        title={slideshowMode === "sequential" ? "顺序播放" : "随机播放"}
      >
        {slideshowMode === "sequential" ? "顺序" : "随机"}
      </button>
    </div>
  );

  // ---- Fullscreen lightbox
  if (isFullscreen) {
    return (
      <div
        ref={viewerRef}
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-8"
        onMouseMove={showOverlayTemp}
        onClick={() => setIsFullscreen(false)}
      >
        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); }}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          title="退出全屏 (Esc)"
        >
          <X size={24} />
        </button>

        {/* Position indicator */}
        {totalInContext > 0 && (
          <span className="absolute top-4 left-4 text-white/40 text-sm z-10">
            {currentIndex + 1} / {totalInContext}
          </span>
        )}

        {/* Nav arrows */}
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); goToPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white/80 hover:bg-white/25 hover:text-white transition-colors"
            title="上一张 (←)"
          >
            <ChevronLeft size={36} />
          </button>
        )}
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); goToNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white/80 hover:bg-white/25 hover:text-white transition-colors"
            title="下一张 (→)"
          >
            <ChevronRight size={36} />
          </button>
        )}

        {/* Image */}
        <img
          src={imagesApi.originalUrl(id!)}
          alt={img.original_name}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Bottom overlay controls — appear on mouse move */}
        {browse && totalInContext > 1 && (
          <div
            className={`absolute bottom-0 left-0 right-0 p-6 flex justify-center transition-opacity duration-300 ${
              showOverlay || slideshow ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <div
              className="bg-black/50 backdrop-blur rounded-full px-4 py-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              {slideshowBar}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Normal view
  return (
    <div className="p-6 space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="flex items-center gap-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} /> 返回
          </button>
          {totalInContext > 0 && (
            <span className="text-sm text-gray-400">
              {currentIndex + 1} / {totalInContext}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="全屏 (F)"
          >
            <Maximize size={15} /> 全屏
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={15} /> 删除
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Image viewer */}
        <div className="flex-1 flex flex-col gap-3">
          <div
            ref={viewerRef}
            className="flex-1 flex items-center justify-center bg-gray-100 rounded-xl min-h-[60vh] relative group/img cursor-pointer"
            onClick={() => setIsFullscreen(true)}
          >
            {/* Prev */}
            {hasPrev && (
              <button
                onClick={(e) => { e.stopPropagation(); goToPrev(); }}
                className="absolute left-3 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity"
                title="上一张 (←)"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            <img
              src={imagesApi.originalUrl(id!)}
              alt={img.original_name}
              className="max-w-full max-h-[65vh] object-contain rounded-lg"
            />

            {/* Next */}
            {hasNext && (
              <button
                onClick={(e) => { e.stopPropagation(); goToNext(); }}
                className="absolute right-3 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity"
                title="下一张 (→)"
              >
                <ChevronRight size={28} />
              </button>
            )}

            {/* Fullscreen hint */}
            <div className="absolute top-3 right-3 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <Maximize size={16} className="text-gray-400" />
            </div>
          </div>

          {/* Slideshow controls below image */}
          {browse && totalInContext > 1 && (
            <div className="flex items-center justify-center">
              <div className="inline-flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2 border border-gray-100">
                <button
                  onClick={() => setSlideshow(!slideshow)}
                  className={`p-1 rounded-full transition-colors ${
                    slideshow ? "text-blue-600 bg-blue-50" : "text-gray-500 hover:text-gray-700"
                  }`}
                  title={slideshow ? "暂停" : "幻灯片播放"}
                >
                  {slideshow ? <Pause size={16} /> : <Play size={16} />}
                </button>

                <select
                  value={customSpeed ? "custom" : slideshowSpeed}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "custom") { setCustomSpeed("5"); }
                    else { setCustomSpeed(""); setSlideshowSpeed(Number(v)); }
                  }}
                  className="bg-transparent text-gray-500 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                >
                  <option value={3}>3秒</option>
                  <option value={5}>5秒</option>
                  <option value={10}>10秒</option>
                  <option value={15}>15秒</option>
                  <option value="custom">自定义</option>
                </select>

                {customSpeed && (
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={customSpeed}
                    onChange={(e) => setCustomSpeed(e.target.value)}
                    className="w-14 bg-white text-gray-600 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400"
                    placeholder="秒"
                  />
                )}

                <span className="text-gray-300">|</span>

                <button
                  onClick={() => setSlideshowMode((m) => (m === "sequential" ? "random" : "sequential"))}
                  className={`text-xs px-1.5 py-0.5 rounded-full transition-colors ${
                    slideshowMode === "random"
                      ? "text-purple-600 bg-purple-50"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                  title={slideshowMode === "sequential" ? "顺序" : "随机"}
                >
                  {slideshowMode === "sequential" ? "顺序" : "随机"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="w-80 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800">{img.original_name || img.filename}</h2>
            <p className="text-sm text-gray-400">{img.width} x {img.height} · {formatSize(img.file_size)}</p>
          </div>

          {img.processing_status && img.processing_status !== "done" && (
            <div className={`rounded-lg p-2.5 text-xs ${
              img.processing_status === "error" || img.processing_status === "timeout"
                ? "bg-red-50 border border-red-200"
                : "bg-blue-50"
            }`}>
              {img.processing_status === "pending" && (
                <p className="text-blue-600">处理排队中...</p>
              )}
              {img.processing_status === "processing" && (
                <p className="text-blue-600 animate-pulse">AI 处理中...</p>
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

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">分类</h3>
            <div className="flex flex-wrap gap-1">
              {(img.categories || []).map((c: any) => (
                <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs group/cat">
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

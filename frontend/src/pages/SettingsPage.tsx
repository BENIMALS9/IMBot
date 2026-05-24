import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["status"], queryFn: () => adminApi.status(),
  });

  const seedMutation = useMutation({
    mutationFn: () => adminApi.seedCategories(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const s = status?.data ?? {};

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800">设置</h1>

      {/* System Status */}
      <section className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-700">系统状态</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <StatusRow label="VLM 引擎" value={s.vlm_provider ?? "-"} />
          <StatusRow label="CLIP 模型" value={s.clip_model ?? "-"} />
          <StatusRow label="场景分类" value={s.enable_classification ? "开启" : "关闭"} />
          <StatusRow label="物体检测" value={s.enable_object_detection ? "开启" : "关闭"} />
          <StatusRow label="人脸识别" value={s.enable_face_recognition ? "开启" : "关闭"} />
          <StatusRow label="VLM 描述" value={s.enable_vlm_caption ? "开启" : "关闭"} />
        </div>
      </section>

      {/* Category Management */}
      <section className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-700">分类管理</h2>
        <p className="text-sm text-gray-500">
          如果分类数据缺失或需要重置，可以重新生成默认分类体系。
        </p>
        <button
          onClick={() => seedMutation.mutate()}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          生成默认分类
        </button>
      </section>

      {/* Face Recognition Settings */}
      <section className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-700">人脸识别隐私</h2>
        <p className="text-sm text-gray-500">
          所有人脸数据仅存储在本地数据库中，不对外传输。你可以随时关闭人脸识别或清除数据。
        </p>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm">
            清除所有人脸数据
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-400">{label}</p>
      <p className="text-gray-700 font-medium">{value}</p>
    </div>
  );
}

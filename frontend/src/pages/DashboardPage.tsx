import { useQuery } from "@tanstack/react-query";
import { imagesApi, adminApi, foldersApi, personsApi } from "@/lib/api";
import { Image, FolderOpen, User, HardDrive } from "lucide-react";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const { data: images } = useQuery({
    queryKey: ["images", { page: 1, page_size: 12 }],
    queryFn: () => imagesApi.list({ page: 1, page_size: 12 }),
  });

  const { data: folders } = useQuery({
    queryKey: ["folders"], queryFn: () => foldersApi.list(),
  });

  const { data: persons } = useQuery({
    queryKey: ["persons"], queryFn: () => personsApi.list(),
  });

  const { data: status } = useQuery({
    queryKey: ["status"], queryFn: () => adminApi.status(),
  });

  const stats = [
    { label: "图片总数", value: images?.data.total ?? "-", icon: Image, color: "blue" },
    { label: "文件夹", value: (folders?.data as any[])?.length ?? "-", icon: FolderOpen, color: "green" },
    { label: "人物", value: (persons?.data as any[])?.length ?? "-", icon: User, color: "purple" },
    { label: "VLM 引擎", value: status?.data?.vlm_provider ?? "-", icon: HardDrive, color: "orange" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${color}-50`}>
                <Icon size={20} className={`text-${color}-600`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent images */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">最近上传</h2>
        <div className="grid grid-cols-6 gap-3">
          {images?.data?.items?.map((img: any) => (
            <Link key={img.id} to={`/images/${img.id}`} className="group">
              <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={imagesApi.thumbnailUrl(img.id)}
                  alt={img.original_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

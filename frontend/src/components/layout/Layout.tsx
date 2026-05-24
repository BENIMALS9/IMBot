import { useState, useRef } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { authApi } from "@/lib/api";
import {
  LayoutDashboard, Image, FolderOpen, User, Album,
  Search, Settings, Upload, LogOut, Camera
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "仪表盘" },
  { to: "/gallery", icon: Image, label: "全部图片" },
  { to: "/folders", icon: FolderOpen, label: "文件夹" },
  { to: "/persons", icon: User, label: "人物" },
  { to: "/albums", icon: Album, label: "相册" },
  { to: "/search", icon: Search, label: "搜索" },
  { to: "/upload", icon: Upload, label: "上传" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function Layout() {
  const { logout, user, checkAuth } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: "", email: "", password: "" });
  const [profileMsg, setProfileMsg] = useState("");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await authApi.uploadAvatar(file);
      await checkAuth();
    } catch {
      // ignore
    }
  };

  const handleProfileUpdate = async () => {
    try {
      const data: Record<string, string> = {};
      if (profileForm.username.trim()) data.username = profileForm.username.trim();
      if (profileForm.email.trim()) data.email = profileForm.email.trim();
      if (profileForm.password.trim()) data.password = profileForm.password.trim();
      if (Object.keys(data).length === 0) return;
      await authApi.updateProfile(data);
      await checkAuth();
      setProfileMsg("更新成功");
      setProfileForm({ username: "", email: "", password: "" });
    } catch (err: any) {
      setProfileMsg(err?.response?.data?.detail ?? "更新失败");
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo + Brand */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <LogoIcon />
            <div>
              <h1 className="text-lg font-bold text-gray-800 leading-tight">ImageDB</h1>
              <p className="text-[10px] text-gray-400 leading-tight">智能相册管理系统</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Profile edit panel */}
        {showProfile && (
          <div className="px-3 pb-2">
            <div className="space-y-2">
              <input
                placeholder="用户名"
                value={profileForm.username}
                onChange={(e) => setProfileForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              />
              <input
                placeholder="邮箱"
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              />
              <input
                type="password"
                placeholder="新密码（留空不修改）"
                value={profileForm.password}
                onChange={(e) => setProfileForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={handleProfileUpdate}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  保存
                </button>
                {profileMsg && (
                  <span className={`text-xs ${profileMsg === "更新成功" ? "text-green-600" : "text-red-500"}`}>
                    {profileMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* User info + logout at bottom */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => {
              setProfileForm({ username: user?.username ?? "", email: user?.email ?? "", password: "" });
              setProfileMsg("");
              setShowProfile(!showProfile);
            }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
          >
            <button
              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer border-0 p-0"
              onClick={(e) => { e.stopPropagation(); avatarInputRef.current?.click(); }}
              title="点击更换头像"
            >
              {user?.avatar_path ? (
                <img src={authApi.avatarUrl()} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera size={14} className="text-white" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{user?.username ?? "用户"}</p>
              <p className="text-[10px] text-gray-400 truncate">{user?.email || "未设置邮箱"}</p>
            </div>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <div className="px-2 pb-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <LogOut size={18} /> 退出登录
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function LogoIcon() {
  const [imgError, setImgError] = useState(false);

  if (!imgError) {
    return (
      <img
        src="/logo.png"
        alt="Logo"
        width={36}
        height={36}
        className="rounded"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad1" x1="0" y1="0" x2="28" y2="28">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="logoGrad2" x1="28" y1="0" x2="0" y2="28">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="18" height="18" rx="4" fill="url(#logoGrad1)" opacity="0.9" />
      <rect x="10" y="10" width="16" height="16" rx="4" fill="url(#logoGrad2)" opacity="0.85" />
      <circle cx="20" cy="8" r="3" fill="#C4B5FD" opacity="0.6" />
      <line x1="5" y1="10" x2="15" y2="10" stroke="white" strokeWidth="0.6" opacity="0.5" />
      <line x1="10" y1="5" x2="10" y2="15" stroke="white" strokeWidth="0.6" opacity="0.5" />
      <line x1="15" y1="17" x2="23" y2="17" stroke="white" strokeWidth="0.6" opacity="0.4" />
      <line x1="17" y1="15" x2="17" y2="23" stroke="white" strokeWidth="0.6" opacity="0.4" />
    </svg>
  );
}
